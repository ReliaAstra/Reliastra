/**
 * The HTTP layer.
 *
 * Two properties matter more than convenience here:
 *
 *  1. **A failure is an error, not an empty result.** The API returns
 *     `{"items": []}` for "you have no dependencies" and 401 for "your token
 *     expired". A CLI that prints an empty table for both teaches its user to
 *     distrust it, so status codes are mapped onto typed errors and non-2xx
 *     responses never reach a renderer.
 *  2. **A 401 on an access token is retried once with the refresh token**, and
 *     the rotated pair is persisted. Short access-token lifetimes are normal;
 *     forcing a re-login every fifteen minutes is not.
 */

import { writeConfig } from './config.mjs';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'api_error', body = null, requestId = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.requestId = requestId;
  }
}

export class AuthError extends ApiError {
  constructor(message, options = {}) {
    super(message, { code: 'auth_required', status: options.status ?? 401, ...options });
    this.name = 'AuthError';
  }
}

export class NetworkError extends ApiError {
  constructor(message, options = {}) {
    super(message, { code: 'network_error', ...options });
    this.name = 'NetworkError';
  }
}

/** Human-readable message for a FastAPI error body, whatever shape it took. */
function detailFrom(body, status) {
  if (!body) return `request failed with status ${status}`;
  if (typeof body === 'string') return body;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    // Pydantic validation errors: "endpoint_url: must start with http://"
    return body.detail
      .map((d) => {
        const where = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body').join('.') : '';
        return where ? `${where}: ${d.msg}` : d.msg;
      })
      .join('; ');
  }
  if (typeof body.error === 'string') return body.error;
  if (typeof body.message === 'string') return body.message;
  return `request failed with status ${status}`;
}

export class Client {
  /**
   * @param {object} options
   * @param {string} options.apiUrl   Base URL, no trailing slash.
   * @param {string|null} options.token  Bearer token, or null for unauthenticated calls.
   * @param {string} [options.env]    RELIASTRA_CONFIG override for tests.
   * @param {boolean} [options.persist] Whether a rotated token pair is written back.
   */
  constructor({ apiUrl, token = null, env = process.env, persist = true }) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.token = token;
    this.env = env;
    this.persist = persist;
    this.refreshToken = null;
  }

  /** Absolute URL for a path, tolerating a base URL that already carries /v1. */
  url(path) {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `${this.apiUrl}${clean}`;
  }

  headers(extra = {}) {
    const headers = { accept: 'application/json', ...extra };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return headers;
  }

  async request(path, { method = 'GET', body, query, headers = {}, retryOnAuth = true } = {}) {
    let url = this.url(path);
    if (query && Object.keys(query).length) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        params.set(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: this.headers({
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers,
        }),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      throw new NetworkError(
        `could not reach ${this.apiUrl} (${cause?.cause?.code ?? cause?.message ?? 'network error'})`,
      );
    }

    const requestId = response.headers.get('x-request-id');
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (response.ok) return { data: parsed, response };

    // One refresh attempt. A second 401 means the refresh token is dead too and
    // the operator must log in again - retrying a third time would only hide it.
    if (response.status === 401 && retryOnAuth && this.refreshToken) {
      const rotated = await this.refresh();
      if (rotated) return this.request(path, { method, body, query, headers, retryOnAuth: false });
    }

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(detailFrom(parsed, response.status), {
        status: response.status,
        body: parsed,
        requestId,
      });
    }
    throw new ApiError(detailFrom(parsed, response.status), {
      status: response.status,
      body: parsed,
      requestId,
    });
  }

  get(path, options = {}) {
    return this.request(path, { ...options, method: 'GET' });
  }

  post(path, body, options = {}) {
    return this.request(path, { ...options, method: 'POST', body });
  }

  patch(path, body, options = {}) {
    return this.request(path, { ...options, method: 'PATCH', body });
  }

  remove(path, options = {}) {
    return this.request(path, { ...options, method: 'DELETE' });
  }

  /** Exchange the refresh token, persist the rotated pair, or return false. */
  async refresh() {
    if (!this.refreshToken) return false;
    let response;
    try {
      response = await fetch(this.url('/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
    } catch {
      return false;
    }
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    if (!data?.access_token) return false;
    this.token = data.access_token;
    if (data.refresh_token) this.refreshToken = data.refresh_token;
    if (this.persist) {
      writeConfig(
        {
          api_url: this.apiUrl,
          access_token: data.access_token,
          refresh_token: this.refreshToken ?? undefined,
        },
        this.env,
      );
    }
    return true;
  }

  /** Fetch the raw bytes of a stored artifact (the evidence PDF). */
  async download(path) {
    const url = this.url(path);
    let response;
    try {
      response = await fetch(url, { headers: this.headers() });
    } catch (cause) {
      throw new NetworkError(`could not reach ${this.apiUrl} (${cause?.message ?? 'network error'})`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let parsed = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep text */
      }
      if (response.status === 401 || response.status === 403) {
        throw new AuthError(detailFrom(parsed, response.status), { status: response.status, body: parsed });
      }
      throw new ApiError(detailFrom(parsed, response.status), { status: response.status, body: parsed });
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
