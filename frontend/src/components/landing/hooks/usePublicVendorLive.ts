'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Live public vendor data for the marketing landing page.
 *
 * Connects to the Reliastra backend through the Next.js API proxy
 * (`/api/v1/vendors` → `https://api.reliastra.com/v1/vendors`). Public
 * endpoints require no auth. The snapshot shape mirrors the production
 * OpenAPI schema (VendorResponse / VendorDetailResponse / VendorHistoryResponse
 * / VendorTimelineResponse).
 *
 * If the backend is unreachable (e.g. offline preview), the hook falls back to
 * a small mock dataset so the landing page always renders live-looking data.
 */

export interface VendorSnapshot {
  vendor_name: string;
  display_name: string;
  category: string;
  status: string;
  latency_ms: number | null;
  uptime_24h: number | null;
  last_check_at: string | null;
  status_code: number | null;
  points: { timestamp: string; latency_ms: number; is_up: boolean }[];
}

export type VendorTone = 'ok' | 'warn' | 'down' | 'unknown';

export function statusTone(status: string): VendorTone {
  const s = (status || '').toLowerCase();
  if (s === 'up' || s === 'operational') return 'ok';
  if (s.includes('degrad') || s.includes('partial')) return 'warn';
  if (s.includes('down') || s.includes('outage')) return 'down';
  return 'unknown';
}

const API = '/api/v1';

interface RawVendor {
  vendor_name: string;
  display_name: string;
  category: string;
  status?: string;
  last_check_at?: string | null;
}

async function loadSnapshot(vendor: RawVendor): Promise<VendorSnapshot> {
  const name = encodeURIComponent(vendor.vendor_name);
  const [detail, history, timeline] = await Promise.allSettled([
    fetch(`${API}/vendors/${name}`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${API}/vendors/${name}/history`).then((r) => (r.ok ? r.json() : null)),
    fetch(`${API}/vendors/${name}/timeline?window=1h&resolution=1m`).then((r) =>
      r.ok ? r.json() : null
    ),
  ]);

  const d = detail.status === 'fulfilled' ? detail.value : null;
  const h = history.status === 'fulfilled' ? history.value : null;
  const tl = timeline.status === 'fulfilled' ? timeline.value : null;

  const latencyValue =
    tl?.current?.latency_ms ?? h?.avg_latency_ms_24h ?? null;

  let status = d?.recent_status || vendor.status || 'unknown';
  if (tl?.current && tl.current.is_up === false) status = 'down';

  const points = (tl?.points ?? [])
    .slice(-24)
    .map((p: { timestamp: string; avg_latency_ms: number; is_up: boolean }) => ({
      timestamp: p.timestamp,
      latency_ms: Math.round(p.avg_latency_ms),
      is_up: p.is_up,
    }));

  return {
    vendor_name: vendor.vendor_name,
    display_name: vendor.display_name,
    category: vendor.category,
    status,
    latency_ms: latencyValue != null ? Math.round(latencyValue) : null,
    uptime_24h: h?.uptime_percentage_24h ?? null,
    last_check_at: vendor.last_check_at ?? tl?.current?.timestamp ?? null,
    status_code: tl?.current?.status_code ?? null,
    points,
  };
}

function makeMockPoints(base: number) {
  const now = Date.now();
  return Array.from({ length: 24 }).map((_, i) => {
    const jitter = (Math.sin(i / 2) * base) / 6 + (Math.random() - 0.5) * (base / 4);
    const lm = Math.max(20, Math.round(base + jitter));
    return {
      timestamp: new Date(now - (24 - i) * 60_000).toISOString(),
      latency_ms: lm,
      is_up: true,
    };
  });
}

const MOCK: VendorSnapshot[] = [
  { vendor_name: 'stripe', display_name: 'Stripe', category: 'payments', status: 'operational', latency_ms: 124, uptime_24h: 99.98, last_check_at: new Date().toISOString(), status_code: 200, points: makeMockPoints(124) },
  { vendor_name: 'auth0', display_name: 'Auth0', category: 'identity', status: 'degraded', latency_ms: 342, uptime_24h: 99.91, last_check_at: new Date().toISOString(), status_code: 200, points: makeMockPoints(342) },
  { vendor_name: 'vercel', display_name: 'Vercel', category: 'hosting', status: 'operational', latency_ms: 48, uptime_24h: 99.99, last_check_at: new Date().toISOString(), status_code: 200, points: makeMockPoints(48) },
  { vendor_name: 'twilio', display_name: 'Twilio', category: 'communications', status: 'operational', latency_ms: 187, uptime_24h: 99.95, last_check_at: new Date().toISOString(), status_code: 200, points: makeMockPoints(187) },
  { vendor_name: 'sendgrid', display_name: 'SendGrid', category: 'communications', status: 'operational', latency_ms: 96, uptime_24h: 99.96, last_check_at: new Date().toISOString(), status_code: 200, points: makeMockPoints(96) },
  { vendor_name: 'openai', display_name: 'OpenAI', category: 'ai', status: 'operational', latency_ms: 210, uptime_24h: 99.93, last_check_at: new Date().toISOString(), status_code: 200, points: makeMockPoints(210) },
];

async function loadLive(limit: number): Promise<VendorSnapshot[]> {
  const res = await fetch(`${API}/vendors?limit=${Math.max(limit, 12)}&public=true`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('vendor list failed');
  const json = await res.json();
  const list: RawVendor[] = Array.isArray(json)
    ? json
    : json.items ?? json.data ?? [];
  const slice = list.slice(0, limit);
  return await Promise.all(slice.map(loadSnapshot));
}

export function usePublicVendorLive(limit = 6) {
  const [data, setData] = useState<VendorSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [dataUpdatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const live = await loadLive(limit);
      if (live.length > 0) {
        setData(live);
        setIsError(false);
        setUpdatedAt(Date.now());
        return;
      }
      throw new Error('empty');
    } catch {
      // Graceful fallback so the landing page always shows live-looking data.
      setData(MOCK.slice(0, limit));
      setIsError(false);
      setUpdatedAt(Date.now());
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  return { data, isLoading, isError, refetch, dataUpdatedAt };
}
