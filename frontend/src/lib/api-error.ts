/**
 * Normalizes RELIASTRA API errors.
 *
 * The backend answers every failure with
 * `{ error: { code, message, details: [{ field, issue }] } }`. Call sites used
 * to do `data.error || 'Signup failed'`, which hands an *object* to
 * `new Error(...)` and renders as "[object Object]" - so real, actionable
 * messages (and the machine-readable codes the OTP flow keys off) were lost.
 */

export type ApiErrorDetail = { field?: string; issue?: string };

export type ApiError = {
  /** HTTP status of the response. */
  status: number;
  /** Backend error code, e.g. `CONFLICT`, `VALIDATION_ERROR`. */
  code: string;
  /** Human-readable message, safe to show to the user. */
  message: string;
  /** Machine-readable issue strings, e.g. `EMAIL_NOT_VERIFIED`. */
  issues: string[];
};

/** True when the failure is the email-verification hard gate. */
export function isEmailNotVerified(error: ApiError): boolean {
  return error.issues.includes('EMAIL_NOT_VERIFIED');
}

export async function readApiError(
  res: Response,
  fallback = 'Something went wrong. Please try again.'
): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (HTML error page, empty 404, ...). Fall through.
  }

  const envelope =
    body && typeof body === 'object' && 'error' in body
      ? (body as { error: unknown }).error
      : null;

  // A 5xx body is never user copy: it may be a proxy page, a traceback
  // fragment or an internal reason. Keep the code (callers key off it) but
  // always show the caller's generic sentence.
  const internal = res.status >= 500;

  if (envelope && typeof envelope === 'object') {
    const e = envelope as {
      code?: string;
      message?: string;
      details?: ApiErrorDetail[];
    };
    return {
      status: res.status,
      code: e.code || 'UNKNOWN',
      message: !internal && e.message ? e.message : fallback,
      issues: Array.isArray(e.details)
        ? e.details.map((d) => d?.issue ?? '').filter(Boolean)
        : [],
    };
  }

  // Some proxies answer with a bare `{ error: "text" }`. That text is not
  // written for a visitor, so it is never shown.
  if (typeof envelope === 'string') {
    return { status: res.status, code: 'UNKNOWN', message: fallback, issues: [] };
  }

  return { status: res.status, code: 'UNKNOWN', message: fallback, issues: [] };
}
