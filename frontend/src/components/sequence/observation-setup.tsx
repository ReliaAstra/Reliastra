'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/dashboard/api';
import { useAlertConfigs, useDependencies } from '@/lib/dashboard/queries';
import { analytics } from '@/lib/analytics';
import {
  EMPTY_DRAFT,
  useOnboardingStore,
  type SequenceStageId,
} from '@/stores/onboarding-store';
import { formatUtc, timeAgo } from '@/lib/dashboard/format';
import { OBSERVATION_POINT_LABEL } from '@/lib/product-contract';
import { getPlan } from '@/lib/dashboard/plans';
import {
  OptionButton,
  ReviewRow,
  SequenceShell,
  StageActions,
  StageBlock,
  StageHead,
  type Stage,
} from './shell';
import { State } from '@/components/console/primitives';
import { cn } from '@/lib/utils';
import type { CheckResult } from '@/lib/dashboard/types';

/* ═══════════════════════════════════════════════════════════════════════════
   ESTABLISH YOUR OBSERVATION ENVIRONMENT

   Four stages and an activation surface. The user is not "setting up an app":
   they are configuring an observation system, and every screen is written and
   composed as configuration: real constraints, a review of the
   exact request RELIASTRA is about to start issuing, and then the first
   measurement it takes.

   Everything offered here is something the backend actually supports:
   a single observation point, three methods, an interval
   floor that comes from the organization's own plan, and a suggestion list
   built from the public dependency records RELIASTRA already observes.
   ═══════════════════════════════════════════════════════════════════════════ */

const STAGES: Stage[] = [
  { id: 'environment', index: '01', label: 'Environment' },
  { id: 'dependency', index: '02', label: 'Dependency' },
  { id: 'observation', index: '03', label: 'Observation' },
  { id: 'confirm', index: '04', label: 'Confirm' },
];


const INTERVALS = [15, 30, 60, 120, 300, 600, 1800];

export function ObservationSetupSequence() {
  const router = useRouter();
  const store = useOnboardingStore();
  const org = useAppStore((s) => s.org);
  const plan = useAppStore((s) => s.plan);
  const deps = useDependencies();

  // Headers never touch the store - see the note in the sequence store.
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    store.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    analytics.onboardingStarted({ step: store.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stage = store.current;
  const draft = store.draft;
  const planRecord = getPlan(plan?.effective_plan ?? plan?.plan);
  const minInterval = plan?.min_check_interval_seconds ?? 300;

  function go(next: SequenceStageId) {
    store.setCurrent(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function exit() {
    analytics.onboardingAbandoned({ step: stage });
    router.push('/dashboard');
  }

  async function activate() {
    setCreateError(null);
    setCreating(true);
    try {
      const headerMap = headers.reduce<Record<string, string>>((acc, h) => {
        if (h.key.trim()) acc[h.key.trim()] = h.value;
        return acc;
      }, {});
      const dependency = await api.createDependency({
        name: draft.name.trim(),
        endpoint_url: draft.endpointUrl.trim(),
        method: draft.method,
        expected_status_codes: draft.expectedStatusCodes,
        timeout_seconds: draft.timeoutSeconds,
        check_interval_seconds: draft.checkIntervalSeconds,
        regions: draft.regions,
        alert_threshold_ms: draft.alertThresholdMs,
        is_active: true,
        ...(Object.keys(headerMap).length ? { headers: headerMap } : {}),
      });
      store.setFirstDependency(dependency.id);
      store.markComplete('confirm');
      analytics.dependencyCreated({
        provider: draft.sourceVendor ?? 'custom',
        interval: draft.checkIntervalSeconds,
        regions: draft.regions.length,
      });
      go('active');
    } catch (err) {
      setCreateError(readableError(err));
    } finally {
      setCreating(false);
    }
  }

  /* ── Activation surface ───────────────────────────────────────────────── */

  if (stage === 'active') {
    return (
      <SequenceShell
        eyebrow="Observation environment"
        stages={STAGES}
        currentStage="confirm"
        completed={STAGES.map((s) => s.id)}
        onExit={() => router.push('/dashboard')}
        exitLabel="Open console"
      >
        <ActivationSurface
          dependencyId={store.firstDependencyId}
          name={draft.name || 'your dependency'}
          onDone={() => {
            store.markComplete('active');
            store.dismiss();
            router.push('/dashboard');
          }}
        />
      </SequenceShell>
    );
  }

  return (
    <SequenceShell
      eyebrow="Observation environment configuration"
      stages={STAGES}
      currentStage={stage}
      completed={store.completedStages}
      onExit={exit}
      exitLabel="Exit to console"
    >
      {/* ── 01 ENVIRONMENT ────────────────────────────────────────────── */}
      {stage === 'environment' && (
        <>
          <StageHead
            index="01 · Environment"
            title="Set up your first monitor"
            body={
              <>
                Independent checks of the external services{' '}
                {org?.name ?? 'your organization'} depends on. This pass configures one
                dependency.
              </>
            }
          />

          <StageBlock
            title="Environment"
            hint="From your organization record. Plan limits apply."
          >
            <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <EnvFact label="Organization" value={org?.name ?? 'unknown'} />
              <EnvFact label="Plan" value={planRecord.name} />
              <EnvFact
                label="Monitor allowance"
                value={
                  plan?.max_dependencies == null
                    ? 'unlimited'
                    : `${deps.data?.length ?? 0} of ${plan.max_dependencies}`
                }
              />
              <EnvFact
                label="Minimum interval"
                value={`${minInterval}s`}
                sub="Fastest cadence your plan permits"
              />
            </dl>
          </StageBlock>

          <StageBlock
            title="What you depend on"
            hint="Orders the suggestions in the next stage. Stored with your setup state only."
          >
            <div className="grid gap-6 lg:grid-cols-3">
              <ChoiceGroup
                legend="Organization type"
                value={store.context.orgType}
                onChange={(v) => store.setContext({ orgType: v as never })}
                options={[
                  ['saas', 'SaaS / software'],
                  ['fintech', 'Fintech'],
                  ['ecommerce', 'E-commerce'],
                  ['agency', 'Agency'],
                  ['platform', 'Infrastructure / platform'],
                  ['other', 'Other'],
                ]}
              />
              <ChoiceGroup
                legend="What you need evidence for"
                value={store.context.concern}
                onChange={(v) => store.setContext({ concern: v as never })}
                options={[
                  ['availability', 'Availability'],
                  ['visibility', 'Third-party visibility'],
                  ['evidence', 'Incident evidence'],
                  ['accountability', 'Vendor accountability'],
                  ['sla', 'SLA claims'],
                  ['api', 'API reliability'],
                ]}
              />
              <ChoiceGroup
                legend="Critical external services"
                value={store.context.scale}
                onChange={(v) => store.setContext({ scale: v as never })}
                options={[
                  ['1-5', '1–5'],
                  ['6-20', '6–20'],
                  ['21-50', '21–50'],
                  ['50+', '50 or more'],
                ]}
              />
            </div>
          </StageBlock>

          <StageActions note="Nothing is created yet.">
            <button
              type="button"
              className="obc-btn obc-btn-primary"
              onClick={() => {
                store.markComplete('environment');
                go('dependency');
              }}
            >
              Continue
            </button>
          </StageActions>
        </>
      )}

      {/* ── 02 DEPENDENCY ─────────────────────────────────────────────── */}
      {stage === 'dependency' && (
        <DependencyStage
          draft={draft}
          setDraft={store.setDraft}
          onBack={() => go('environment')}
          onNext={() => {
            store.markComplete('dependency');
            go('observation');
          }}
        />
      )}

      {/* ── 03 OBSERVATION ────────────────────────────────────────────── */}
      {stage === 'observation' && (
        <>
          <StageHead
            index="03 · Observation"
            title="Configure how it is observed"
            body="Each setting changes the request issued and how its response is judged. Defaults are what the API applies."
          />

          <StageBlock
            title="Cadence and tolerance"
            hint={`Plan minimum: ${minInterval} seconds.`}
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="obc-field-label" htmlFor="interval">
                  Observation interval
                </label>
                <select
                  id="interval"
                  className="obc-input"
                  value={draft.checkIntervalSeconds}
                  onChange={(e) =>
                    store.setDraft({ checkIntervalSeconds: Number(e.target.value) })
                  }
                >
                  {INTERVALS.filter((i) => i >= minInterval).map((i) => (
                    <option key={i} value={i}>
                      every {i < 60 ? `${i}s` : `${i / 60} min`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="obc-field-label" htmlFor="timeout">
                  Request timeout
                </label>
                <select
                  id="timeout"
                  className="obc-input"
                  value={draft.timeoutSeconds}
                  onChange={(e) => store.setDraft({ timeoutSeconds: Number(e.target.value) })}
                >
                  {[5, 10, 15, 30, 60].map((t) => (
                    <option key={t} value={t}>
                      {t}s
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="obc-field-label" htmlFor="threshold">
                  Latency alert threshold
                </label>
                <input
                  id="threshold"
                  className="obc-input"
                  inputMode="numeric"
                  placeholder="none"
                  value={draft.alertThresholdMs ?? ''}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, ''));
                    store.setDraft({ alertThresholdMs: n > 0 ? n : null });
                  }}
                />
                <p className="mt-1.5 text-[11px] text-[var(--obc-text-4)]">
                  Milliseconds. Leave empty to record latency without alerting on it.
                </p>
              </div>
            </div>
          </StageBlock>

          <StageBlock
            title="Request"
            hint="A response is judged successful when its status code is in the expected list and no transport error occurred."
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="obc-field-label" htmlFor="method">
                  Method
                </label>
                <select
                  id="method"
                  className="obc-input"
                  value={draft.method}
                  onChange={(e) =>
                    store.setDraft({ method: e.target.value as 'GET' | 'HEAD' | 'POST' })
                  }
                >
                  <option value="GET">GET</option>
                  <option value="HEAD">HEAD</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="obc-field-label" htmlFor="codes">
                  Expected status codes
                </label>
                <input
                  id="codes"
                  className="obc-input font-[family-name:var(--ob-font-mono)]"
                  value={draft.expectedStatusCodes.join(', ')}
                  onChange={(e) => {
                    const codes = e.target.value
                      .split(',')
                      .map((c) => Number(c.trim()))
                      .filter((c) => Number.isFinite(c) && c >= 100 && c <= 599);
                    store.setDraft({ expectedStatusCodes: codes.length ? codes : [200] });
                  }}
                />
              </div>
            </div>
          </StageBlock>

          <HeadersBlock headers={headers} setHeaders={setHeaders} />

          <StageActions
            note="Nothing is created until you confirm."
            back={{ label: 'Back', onClick: () => go('dependency') }}
          >
            <button
              type="button"
              className="obc-btn obc-btn-primary"
              disabled={!draft.regions.length}
              onClick={() => {
                store.markComplete('observation');
                go('confirm');
              }}
            >
              Review
            </button>
          </StageActions>
        </>
      )}

      {/* ── 04 CONFIRM ────────────────────────────────────────────────── */}
      {stage === 'confirm' && (
        <>
          <StageHead
            index="04 · Confirm"
            title="Observation configuration"
            body="What will be observed, how often, and from where. Nothing has been created yet."
          />

          <dl className="mt-8">
            <ReviewRow label="Dependency" mono={false}>
              {draft.name || <span className="text-[var(--obc-text-4)]">not set</span>}
            </ReviewRow>
            <ReviewRow label="Endpoint">{draft.endpointUrl}</ReviewRow>
            <ReviewRow label="Method">{draft.method}</ReviewRow>
            <ReviewRow label="Expected status">{draft.expectedStatusCodes.join(', ')}</ReviewRow>
            <ReviewRow label="Observation point" mono={false}>
              {OBSERVATION_POINT_LABEL}
            </ReviewRow>
            <ReviewRow label="Interval">
              every {draft.checkIntervalSeconds}s
            </ReviewRow>
            <ReviewRow label="Timeout">{draft.timeoutSeconds}s</ReviewRow>
            <ReviewRow label="Latency alert">
              {draft.alertThresholdMs ? (
                `${draft.alertThresholdMs} ms`
              ) : (
                <span className="text-[var(--obc-text-4)]">not configured</span>
              )}
            </ReviewRow>
            <ReviewRow label="Authentication">
              {headers.length ? (
                `${headers.length} header${headers.length === 1 ? '' : 's'} configured. Encrypted at rest, never returned by the API`
              ) : (
                <span className="text-[var(--obc-text-4)]">not configured</span>
              )}
            </ReviewRow>
            <ReviewRow label="Incident rule" mono={false}>
              An incident opens when the detector confirms a sustained failure against this
              endpoint.
            </ReviewRow>
          </dl>

          {createError && (
            <p role="alert" className="mt-5 border border-[var(--obc-crit)]/35 bg-[var(--obc-crit-wash)] px-4 py-3 text-[12.5px] text-[#E58C85]">
              {createError}
            </p>
          )}

          <StageActions
            note="Creates the monitor and schedules the first check. Every value can be changed later."
            back={{ label: 'Back', onClick: () => go('observation') }}
          >
            <button
              type="button"
              className="obc-btn obc-btn-primary"
              onClick={activate}
              disabled={creating || !draft.endpointUrl || !draft.name}
            >
              {creating ? 'Creating…' : 'Start monitoring'}
            </button>
          </StageActions>
        </>
      )}
    </SequenceShell>
  );
}

/* ── Stage 02 ────────────────────────────────────────────────────────────── */

interface VendorSuggestion {
  vendor_name: string;
  display_name: string;
  category: string;
}

/**
 * Dependency selection.
 *
 * The suggestion list is the public dependency catalog RELIASTRA already
 * observes (`/v1/vendors`), not a hardcoded list of logos: selecting one
 * fetches that record and prefills the endpoint RELIASTRA itself observes.
 * If the catalog cannot be read the stage still works - manual entry is the
 * primary path, not the fallback.
 */
function DependencyStage({
  draft,
  setDraft,
  onBack,
  onNext,
}: {
  draft: ReturnType<typeof useOnboardingStore.getState>['draft'];
  setDraft: (d: Partial<typeof EMPTY_DRAFT>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [suggestions, setSuggestions] = useState<VendorSuggestion[] | null>(null);
  const [loadingVendor, setLoadingVendor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/vendors?limit=12', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setSuggestions(items);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(vendor: VendorSuggestion) {
    setLoadingVendor(vendor.vendor_name);
    setError(null);
    try {
      const res = await fetch(`/api/v1/vendors/${encodeURIComponent(vendor.vendor_name)}`, {
        headers: { accept: 'application/json' },
      });
      const detail = res.ok ? await res.json() : null;
      const endpoint = detail?.endpoints?.[0]?.endpoint_url ?? '';
      setDraft({
        name: vendor.display_name,
        endpointUrl: endpoint,
        sourceVendor: vendor.vendor_name,
      });
      if (!endpoint) {
        setError(
          'RELIASTRA observes this service publicly but did not return an endpoint for it. Enter the endpoint your product calls.'
        );
      }
    } catch {
      setError('The public record for that service could not be read. Enter the endpoint manually.');
    } finally {
      setLoadingVendor(null);
    }
  }

  const valid = draft.name.trim().length > 0 && isHttpUrl(draft.endpointUrl);

  return (
    <>
      <StageHead
        index="02 · Dependency"
        title="What infrastructure do you depend on?"
        body="The external service and the endpoint your product calls. Any endpoint that answers without side effects works."
      />

      {suggestions === null ? (
        <StageBlock title="Services RELIASTRA already observes">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="obc-skel h-[46px]" />
            ))}
          </div>
        </StageBlock>
      ) : suggestions.length > 0 ? (
        <StageBlock
          title="Services RELIASTRA already observes"
          hint="Prefills the endpoint from the public record. You still create your own monitor."
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((v) => (
              <OptionButton
                key={v.vendor_name}
                selected={draft.sourceVendor === v.vendor_name}
                disabled={loadingVendor === v.vendor_name}
                title={v.display_name}
                meta={
                  loadingVendor === v.vendor_name
                    ? 'loading endpoint…'
                    : v.category.replace(/[-_]/g, ' ')
                }
                onClick={() => pick(v)}
              />
            ))}
          </div>
        </StageBlock>
      ) : null}

      <StageBlock
        title="Dependency"
        hint="Both fields are required. The endpoint must be absolute and reachable from the public internet."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <label className="obc-field-label" htmlFor="dep-name">
              Service name
            </label>
            <input
              id="dep-name"
              className="obc-input"
              value={draft.name}
              maxLength={150}
              placeholder="Payments provider"
              onChange={(e) => setDraft({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="obc-field-label" htmlFor="dep-endpoint">
              Endpoint
            </label>
            <input
              id="dep-endpoint"
              className="obc-input font-[family-name:var(--ob-font-mono)]"
              value={draft.endpointUrl}
              placeholder="https://api.example.com/health"
              onChange={(e) => setDraft({ endpointUrl: e.target.value, sourceVendor: null })}
              aria-invalid={draft.endpointUrl.length > 0 && !isHttpUrl(draft.endpointUrl)}
            />
            {draft.endpointUrl.length > 0 && !isHttpUrl(draft.endpointUrl) && (
              <p className="mt-1.5 text-[11.5px] text-[#E58C85]">
                Enter an absolute URL beginning with http:// or https://
              </p>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-3 text-[12px] text-[#E3BE7A]" role="status">
            {error}
          </p>
        )}
      </StageBlock>

      <StageActions
        note="Next: interval and success criteria."
        back={{ label: 'Back', onClick: onBack }}
      >
        <button
          type="button"
          className="obc-btn obc-btn-primary"
          disabled={!valid}
          onClick={onNext}
        >
          Continue
        </button>
      </StageActions>
    </>
  );
}

/* ── Headers ─────────────────────────────────────────────────────────────── */

/**
 * Optional authentication. Progressive disclosure: closed by default, because
 * most observed endpoints are public and an empty credentials form on the
 * first-run screen suggests otherwise.
 */
function HeadersBlock({
  headers,
  setHeaders,
}: {
  headers: Array<{ key: string; value: string }>;
  setHeaders: (h: Array<{ key: string; value: string }>) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <StageBlock
        title="Authentication"
        hint="Only needed when the endpoint refuses anonymous requests."
      >
        <button type="button" className="obc-btn obc-btn-sm" onClick={() => setOpen(true)}>
          Add request headers
        </button>
      </StageBlock>
    );
  }

  return (
    <StageBlock
      title="Authentication"
      hint="Values are encrypted at rest and never returned by the API. Cookie, Host, Connection and proxy headers are rejected."
    >
      <div className="space-y-2">
        {headers.map((h, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]">
            <input
              className="obc-input font-[family-name:var(--ob-font-mono)]"
              placeholder="Authorization"
              aria-label={`Header ${i + 1} name`}
              value={h.key}
              onChange={(e) =>
                setHeaders(headers.map((x, j) => (i === j ? { ...x, key: e.target.value } : x)))
              }
            />
            <input
              className="obc-input font-[family-name:var(--ob-font-mono)]"
              placeholder="Bearer …"
              aria-label={`Header ${i + 1} value`}
              type="password"
              value={h.value}
              onChange={(e) =>
                setHeaders(headers.map((x, j) => (i === j ? { ...x, value: e.target.value } : x)))
              }
            />
            <button
              type="button"
              className="obc-btn"
              onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="obc-btn obc-btn-sm"
          onClick={() => setHeaders([...headers, { key: '', value: '' }])}
        >
          Add header
        </button>
      </div>
    </StageBlock>
  );
}

/* ── Activation ──────────────────────────────────────────────────────────── */

/**
 * The activation surface.
 *
 * Infrastructure coming online, not a celebration: the monitor exists, the
 * first observation is pending, and the moment a real result lands it is
 * printed with its latency and status code. Nothing here is
 * simulated - while the scheduler has not run yet, the surface says so.
 */
function ActivationSurface({
  dependencyId,
  name,
  onDone,
}: {
  dependencyId: string | null;
  name: string;
  onDone: () => void;
}) {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const alerts = useAlertConfigs();

  useEffect(() => {
    if (!dependencyId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const rows = (await api.dependencyResults(dependencyId)) as CheckResult[];
        if (cancelled) return;
        if (rows?.length) {
          setResults(rows.slice(0, 6));
          return;
        }
      } catch {
        /* keep waiting - a missing result is not an error yet */
      }
      if (!cancelled) timer = setTimeout(poll, 5000);
    };

    poll();
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [dependencyId]);

  const first = results?.[0] ?? null;

  return (
    <>
      <StageHead
        index={first ? 'Observation active' : 'Observation initialising'}
        title={first ? `${name} is under observation` : `${name} is being brought online`}
        body={
          first
            ? 'Collecting observations. Each result is a real request from the RELIASTRA observation point, stored with its timestamp.'
            : 'The monitor is scheduled. The first measurement appears when the scheduler reaches it.'
        }
      />

      <StageBlock
        title="First observation"
        hint={
          first
            ? 'The most recent results from the RELIASTRA observation point.'
            : `Waiting for the first measurement. ${elapsed}s elapsed.`
        }
      >
        {first ? (
          <div className="border border-[var(--obc-line)]">
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_160px] gap-4 border-b border-[var(--obc-line)] px-3 py-2 sm:grid">
              {['Result', 'Latency', 'Status', 'Observed (UTC)'].map((h) => (
                <span key={h} className="obc-label">
                  {h}
                </span>
              ))}
            </div>
            {results!.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-2 gap-2 border-b border-[var(--obc-line)] px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_120px_120px_160px] sm:items-center sm:gap-4"
              >
                <State status={r.is_up ? 'operational' : 'down'} />
                <span className="font-[family-name:var(--ob-font-mono)] text-[12.5px] tabular-nums text-[var(--obc-text-2)]">
                  {r.latency_ms ? (
                    <>
                      {Math.round(r.latency_ms)}
                      <span className="obc-unit">ms</span>
                    </>
                  ) : (
                    <span className="text-[var(--obc-text-4)]">no data</span>
                  )}
                </span>
                <span className="font-[family-name:var(--ob-font-mono)] text-[12.5px] tabular-nums text-[var(--obc-text-2)]">
                  {r.status_code ?? <span className="text-[var(--obc-text-4)]">none</span>}
                </span>
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-3)]">
                  {formatUtc(r.executed_at, 'dd MMM HH:mm:ss')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-[var(--obc-line)] px-4 py-6">
            <p className="obc-label text-[var(--obc-signal)]">Observation initialising</p>
            <p className="mt-2 max-w-[64ch] text-[12.5px] leading-[1.65] text-[var(--obc-text-2)]">
              The first result appears here without a reload. You can leave this page; the
              monitor is already running.
            </p>
          </div>
        )}
      </StageBlock>

      <StageBlock
        title="Where observations become evidence"
        hint="Nothing further is required. These are the surfaces this monitor now feeds."
      >
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            {
              href: dependencyId ? `/dependencies/${dependencyId}` : '/dependencies',
              label: 'Dependency record',
              body: 'Every observation, latency history and configuration for this monitor.',
            },
            {
              href: '/incidents',
              label: 'Incidents',
              body: 'Opened when the detector confirms a sustained failure against a monitor.',
            },
            {
              href: '/evidence',
              label: 'Evidence records',
              body: 'The signed artifact generated from a confirmed incident.',
            },
          ].map((item) => (
            <li key={item.href} className="border border-[var(--obc-line)] p-3">
              <Link href={item.href} className="text-[13px] text-[var(--obc-text)] hover:text-[var(--obc-signal)]">
                {item.label}
              </Link>
              <p className="mt-1.5 text-[11.5px] leading-[1.6] text-[var(--obc-text-4)]">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </StageBlock>

      <AlertBlock hasEmail={Boolean(alerts.data?.some((c) => c.channel_type === 'email'))} onSaved={() => alerts.refetch()} />

      <StageActions note="The monitor keeps running whether or not this page is open.">
        <button type="button" className="obc-btn obc-btn-primary" onClick={onDone}>
          Open console
        </button>
      </StageActions>
    </>
  );
}

function AlertBlock({ hasEmail, onSaved }: { hasEmail: boolean; onSaved: () => void }) {
  const user = useAppStore((s) => s.user);
  const [email, setEmail] = useState(user?.email ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (hasEmail) {
    return (
      <StageBlock title="Notification" hint="Email alerts are already configured for this organization.">
        <p className="text-[12.5px] text-[var(--obc-text-2)]">
          Incident notifications go to your configured channels. Manage them in{' '}
          <Link href="/settings" className="obc-link">
            settings
          </Link>
          .
        </p>
      </StageBlock>
    );
  }

  return (
    <StageBlock
      title="Notification"
      hint="Optional. Without a channel, incidents are recorded in the console only."
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="sm:w-[320px]">
          <label className="obc-field-label" htmlFor="alert-email">
            Email for incident alerts
          </label>
          <input
            id="alert-email"
            className="obc-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="obc-btn"
          disabled={state === 'saving' || !email}
          onClick={async () => {
            setState('saving');
            setError(null);
            try {
              await api.createAlertConfig({
                channel_type: 'email',
                config: { email },
                is_active: true,
              });
              analytics.alertsEnabled({ channel: 'email', source: 'onboarding' });
              onSaved();
              setState('idle');
            } catch {
              setError('That channel could not be saved. You can add it later in settings.');
              setState('error');
            }
          }}
        >
          {state === 'saving' ? 'Saving…' : 'Enable email alerts'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#E58C85]">
          {error}
        </p>
      )}
    </StageBlock>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function EnvFact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="obc-label">{label}</p>
      <p className="mt-1.5 truncate font-[family-name:var(--ob-font-mono)] text-[13px] tabular-nums text-[var(--obc-text)]">
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-[var(--obc-text-4)]">{sub}</p>}
    </div>
  );
}

function ChoiceGroup({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="obc-label mb-2.5">{legend}</legend>
      <div className="flex flex-col gap-1.5">
        {options.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(value === id ? '' : id)}
            className={cn(
              'flex h-8 items-center border px-2.5 text-left text-[12.5px] transition-colors',
              value === id
                ? 'border-[var(--obc-signal)] bg-[var(--obc-signal-wash)] text-[var(--obc-text)]'
                : 'border-[var(--obc-line-2)] text-[var(--obc-text-2)] hover:border-[var(--obc-line-3)]'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Backend errors are mapped to something a customer can act on. The raw
 * message is never rendered: it can carry internal detail, and "422
 * Unprocessable Entity" is not an instruction.
 */
function readableError(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/limit/i.test(message))
    return 'Your plan\u2019s monitor allowance is already in use. Remove a monitor or change plan, then try again.';
  if (/duplicate|already exists/i.test(message))
    return 'A monitor for this endpoint already exists in your organization.';
  if (/region/i.test(message))
    return 'The observation point was rejected. Reload this step and try again.';
  if (/url|endpoint/i.test(message))
    return 'The endpoint was rejected. It must be an absolute http:// or https:// URL that resolves publicly.';
  if (/header/i.test(message))
    return 'A request header was rejected. Cookie, Host, Connection and proxy headers are not permitted.';
  if (/permission|forbidden|403/i.test(message))
    return 'Your role cannot create monitors in this organization. An administrator can complete this step.';
  if (/401|session/i.test(message))
    return 'Your session expired before the monitor was created. Sign in again and the configuration will be waiting.';
  return 'The monitor could not be created. Check the configuration above and try again.';
}

export { timeAgo };
