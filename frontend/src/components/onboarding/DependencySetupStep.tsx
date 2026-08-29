'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { useAppStore } from '@/stores/app-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { RsButton } from '@/components/dashboard/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/dashboard/api';
import { getPlan } from '@/lib/dashboard/plans';

type Preset = { id: string; name: string; url: string; note: string };

const PRESETS: Preset[] = [
  { id: 'stripe', name: 'Stripe', url: 'https://api.stripe.com/health', note: 'Payment provider — high blast radius' },
  { id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1/models', note: 'AI platform — availability matters' },
  { id: 'github', name: 'GitHub', url: 'https://api.github.com', note: 'Source & auth — critical path' },
  { id: 'auth0', name: 'Auth0', url: 'https://auth0.com', note: 'Identity — login dependency' },
  { id: 'twilio', name: 'Twilio', url: 'https://api.twilio.com', note: 'Messaging — user-facing' },
  { id: 'supabase', name: 'Supabase', url: 'https://supabase.com', note: 'Database / auth' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://www.cloudflareflare.com/cdn-cgi/trace', note: 'Edge / CDN' },
  { id: 'vercel', name: 'Vercel', url: 'https://vercel.com', note: 'Hosting / edge' },
  { id: 'aws', name: 'AWS', url: 'https://health.aws.amazon.com/health/status', note: 'Cloud health' },
];

const field =
  'flex h-9 w-full rounded-[10px] border border-rs-border-subtle bg-rs-input px-3 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)]';

export function DependencySetupStep({ onCreated }: { onCreated: (id: string) => void }) {
  const plan = useAppStore((s) => s.plan);
  const { setFirstDependency, markComplete } = useOnboardingStore();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [preset, setPreset] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [method, setMethod] = useState<'GET' | 'HEAD' | 'POST'>('GET');
  const [interval, setInterval] = useState(60);
  const [timeout, setTimeoutSec] = useState(10);
  const [regions, setRegions] = useState<string[]>(['us-east', 'eu-west']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const limit = getPlan(plan?.effective_plan ?? plan?.plan).dependencies;

  useEffect(() => {
    analytics.dependencySetupStarted();
  }, []);

  function applyPreset(p: Preset) {
    setPreset(p.id);
    setName(p.name);
    setUrl(p.url);
    setError(null);
  }

  async function handleCreate() {
    setError(null);
    if (!name.trim() || !url.trim()) {
      setError('Name and endpoint URL are required.');
      return;
    }
    try {
      new URL(url);
    } catch {
      setError('Enter a valid absolute URL (including https://).');
      return;
    }
    setLoading(true);
    try {
      const body = {
        name: name.trim(),
        endpoint_url: url.trim(),
        method: method as 'GET' | 'HEAD' | 'POST',
        expected_status_codes: [200],
        timeout_seconds: timeout,
        check_interval_seconds: interval,
        regions,
        alert_threshold_ms: null,
        is_active: true,
      };
      const dep = await api.createDependency(body as any);
      setFirstDependency(dep.id);
      markComplete('dependency');
      analytics.dependencyCreated({ provider: preset ?? 'custom', interval, regions: regions.length });
      onCreated(dep.id);
    } catch (e: any) {
      const msg = e?.message || 'Could not create dependency. Check the URL and try again.';
      // handle limit
      if (/limit/i.test(msg)) {
        setError(`Plan limit reached (${limit}). Upgrade to add more, or remove a dependency first.`);
      } else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="mb-6">
        <p className="rs-eyebrow">Step 2 · First dependency</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text">
          Connect your first critical dependency.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-rs-text-secondary">
          We&apos;re about to start building your independent reliability evidence. Pick a preset or paste any HTTPS endpoint you depend on.  <span className="font-medium text-rs-text">Recommended settings are applied automatically</span> — you can adjust them later.
        </p>
      </div>

      {/* Presets — provider suggestions, not integrations */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="rs-label">Quick presets</span>
          <span className="rs-mono text-[11px] text-rs-text-tertiary">Pick one or paste your own</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                'rounded-[10px] border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                preset === p.id
                  ? 'border-rs-brand bg-rs-brand-subtle'
                  : 'border-rs-border-subtle bg-rs-base hover:border-rs-border'
              )}
            >
              <span className="text-sm font-medium text-rs-text">{p.name}</span>
              <span className="mt-1 block truncate font-mono text-[11px] text-rs-text-tertiary">{p.url}</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-rs-text-tertiary">{p.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="rs-label mb-1.5 block">Dependency name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Stripe API" aria-label="Dependency name" />
        </label>
        <label className="block">
          <span className="rs-label mb-1.5 block">Endpoint URL</span>
          <input className={cn(field, 'font-mono')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/health" aria-label="Endpoint URL" />
          <span className="rs-input-helper">Must be a reachable HTTPS URL. Private/internal hosts are blocked for security.</span>
        </label>

        {/* Recommended configuration summary */}
        <div className="rounded-[10px] border border-rs-border-subtle bg-rs-base px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-rs-text">Recommended configuration</span>
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-rs-brand hover:underline"
              aria-expanded={advanced}
            >
              {advanced ? 'Hide' : 'Advanced configuration'} <ChevronDown size={14} className={cn('transition-transform', advanced && 'rotate-180')} />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            {[
              ['Method', method],
              ['Expected', '200'],
              ['Timeout', `${timeout}s`],
              ['Interval', `${interval}s`],
              ['Regions', regions.join(' · ')],
              ['Alert threshold', 'Recommended'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-rs-border-subtle bg-rs-elevated px-3 py-2">
                <div className="rs-mono text-[11px] uppercase tracking-[0.05em] text-rs-text-tertiary">{k}</div>
                <div className="mt-1 font-mono text-sm text-rs-text">{v}</div>
              </div>
            ))}
          </dl>

          {advanced && (
            <div className="mt-4 grid gap-4 border-t border-rs-border-subtle pt-4 sm:grid-cols-2">
              <label className="block">
                <span className="rs-label mb-1.5 block">Method</span>
                <select value={method} onChange={(e) => setMethod(e.target.value as any)} className={field}>
                  <option value="GET">GET</option>
                  <option value="HEAD">HEAD</option>
                  <option value="POST">POST</option>
                </select>
              </label>
              <label className="block">
                <span className="rs-label mb-1.5 block">Check interval (seconds)</span>
                <input type="number" min={5} className={cn(field, 'font-mono')} value={interval} onChange={(e) => setInterval(Number(e.target.value) || 60)} />
                <span className="rs-input-helper">Pro minimum is 15s; Free minimum is 60s.</span>
              </label>
              <label className="block">
                <span className="rs-label mb-1.5 block">Timeout</span>
                <input type="number" min={5} max={30} className={cn(field, 'font-mono')} value={timeout} onChange={(e) => setTimeoutSec(Number(e.target.value) || 10)} />
              </label>
              <div>
                <span className="rs-label mb-1.5 block">Regions</span>
                <div className="flex flex-wrap gap-2">
                  {['us-east', 'us-west', 'eu-west', 'ap-south'].map((r) => (
                    <label key={r} className="inline-flex items-center gap-2 rounded-full border border-rs-border-subtle px-3 py-1.5 text-xs">
                      <input type="checkbox" checked={regions.includes(r)} onChange={() => setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))} className="h-3.5 w-3.5 accent-[var(--rs-brand)]" />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-[10px] border border-rs-down/25 bg-rs-down-bg px-4 py-3 text-[13px] text-rs-down">
            {error}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-rs-border-subtle pt-5">
        <p className="hidden text-xs text-rs-text-tertiary sm:block">
          Monitoring starts on the next tick — typically within 60 seconds.
        </p>
        <RsButton onClick={handleCreate} disabled={loading} aria-busy={loading}>
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Creating…
            </>
          ) : (
            <>Create and validate</>
          )}
        </RsButton>
      </div>

      <p className="mt-4 text-center text-xs text-rs-text-tertiary">
        <a href="/dependencies" className="inline-flex items-center gap-1 hover:text-rs-text">
          I&apos;ll add this later <ExternalLink size={12} />
        </a>
      </p>
    </div>
  );
}
