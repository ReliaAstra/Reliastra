'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Globe,
  Layers,
  Link2,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/dashboard/api';
import { useAppStore } from '@/stores/app-store';
import { effectivePlan } from '@/lib/dashboard/plans';
import { RsButton } from '@/components/dashboard/ui/button';
import { cn } from '@/lib/utils';

const fieldClass =
  'flex h-10 w-full rounded-xl border border-rs-border-subtle bg-rs-input px-3.5 text-sm text-rs-text placeholder:text-rs-text-tertiary outline-none transition-[border-color,box-shadow] duration-150 focus:border-rs-brand focus:ring-[3px] focus:ring-[rgb(37_99_235_/_0.20)] dark:focus:ring-[rgb(59_130_246_/_0.20)]';

type Step = 'welcome' | 'client' | 'application' | 'dependency' | 'proof';

export function AgencyOnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const plan = useAppStore((s) => s.plan);
  const setSelectedClient = useAppStore((s) => s.setSelectedClient);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const currentPlan = effectivePlan(plan);
  const agencyEnabled = currentPlan.id === 'enterprise';

  const [step, setStep] = useState<Step>('welcome');

  // Step 1: Client state
  const [clientName, setClientName] = useState('');
  const [clientDesc, setClientDesc] = useState('');
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [createdClientName, setCreatedClientName] = useState('');

  // Step 2: Application state
  const [appName, setAppName] = useState('');
  const [appDesc, setAppDesc] = useState('');
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);
  const [createdAppName, setCreatedAppName] = useState('');

  // Step 3: Dependency state
  const [depName, setDepName] = useState('');
  const [depUrl, setDepUrl] = useState('');
  const [depMethod, setDepMethod] = useState<'GET' | 'HEAD' | 'POST'>('GET');
  const [depInterval, setDepInterval] = useState(60);
  const [depThreshold, setDepThreshold] = useState(500);
  const [depRegions, setDepRegions] = useState<string[]>(['us-east', 'eu-west']);

  // Mutations
  const createClientMut = useMutation({
    mutationFn: () =>
      api.createClient({
        name: clientName.trim(),
        description: clientDesc.trim() || undefined,
      }),
    onSuccess: (client) => {
      setCreatedClientId(client.id);
      setCreatedClientName(client.name);
      setSelectedClient(client.id);
      queryClient.invalidateQueries({ queryKey: ['agency', 'clients'] });
      queryClient.invalidateQueries({ queryKey: ['agency', 'portfolio'] });
      toast.success(`Client "${client.name}" created`);
      setStep('application');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not create client workspace');
    },
  });

  const createAppMut = useMutation({
    mutationFn: () => {
      if (!createdClientId) throw new Error('Client must be created first');
      return api.createApplication(createdClientId, {
        name: appName.trim(),
        description: appDesc.trim() || undefined,
      });
    },
    onSuccess: (app) => {
      setCreatedAppId(app.id);
      setCreatedAppName(app.name);
      queryClient.invalidateQueries({
        queryKey: ['agency', 'clients', createdClientId, 'applications'],
      });
      toast.success(`Application "${app.name}" added`);
      setStep('dependency');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not create application');
    },
  });

  const createDepMut = useMutation({
    mutationFn: () =>
      api.createDependency({
        name: depName.trim() || `${createdAppName} Health Check`,
        endpoint_url: depUrl.trim(),
        method: depMethod,
        expected_status_codes: [200],
        timeout_seconds: 10,
        check_interval_seconds: depInterval,
        regions: depRegions,
        alert_threshold_ms: depThreshold,
        is_active: true,
        application_id: createdAppId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['agency', 'portfolio'] });
      toast.success('Dependency connected and monitoring started');
      setStep('proof');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not connect dependency');
    },
  });

  if (!agencyEnabled) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-8 text-center sm:p-12">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rs-brand-subtle text-rs-brand">
            <Lock size={26} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-rs-text sm:text-3xl">
            Agency Workspaces
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-rs-text-secondary">
            Manage multi-client infrastructure, isolate environments, generate verified
            SLA reports, and share white-label portals from one single workspace.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <RsButton onClick={() => openUpgrade('agency')}>
              <Sparkles size={16} />
              Upgrade to Enterprise
            </RsButton>
            <RsButton variant="secondary" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </RsButton>
          </div>
        </div>
      </div>
    );
  }

  const stepsList: { id: Step; label: string; number: number }[] = [
    { id: 'client', label: 'Client Workspace', number: 1 },
    { id: 'application', label: 'Application', number: 2 },
    { id: 'dependency', label: 'Dependencies', number: 3 },
    { id: 'proof', label: 'Proof & Evidence', number: 4 },
  ];

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-8">
      {/* Navigation & Progress */}
      <div className="mb-8">
        <button
          type="button"
          onClick={() => {
            if (step === 'welcome') router.push('/clients');
            else if (step === 'client') setStep('welcome');
            else if (step === 'application') setStep('client');
            else if (step === 'dependency') setStep('application');
            else if (step === 'proof') setStep('dependency');
          }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-rs-text-tertiary transition-colors hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        >
          <ArrowLeft size={14} />
          <span>{step === 'welcome' ? 'Back to Command Center' : 'Previous step'}</span>
        </button>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rs-brand-subtle px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-rs-brand">
                AGENCY ONBOARDING
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-rs-text sm:text-3xl">
              {step === 'welcome' && 'Multi-Client Reliability Architecture'}
              {step === 'client' && 'Step 1: Create your first client workspace'}
              {step === 'application' && 'Step 2: Add an application for this client'}
              {step === 'dependency' && 'Step 3: Connect external dependencies'}
              {step === 'proof' && 'Step 4: Continuous proof & SLA evidence'}
            </h1>
          </div>
        </div>

        {step !== 'welcome' && (
          <div className="mt-6 flex items-center justify-between border-y border-rs-border-subtle py-3">
            {stepsList.map((s, idx) => {
              const isActive = s.id === step;
              const isPast =
                (step === 'application' && idx === 0) ||
                (step === 'dependency' && idx <= 1) ||
                (step === 'proof' && idx <= 2);

              return (
                <div key={s.id} className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                      isPast
                        ? 'bg-rs-up text-white'
                        : isActive
                          ? 'bg-rs-brand text-white ring-4 ring-rs-brand/20'
                          : 'bg-rs-hover text-rs-text-tertiary'
                    )}
                  >
                    {isPast ? <Check size={12} strokeWidth={3} /> : s.number}
                  </div>
                  <span
                    className={cn(
                      'hidden text-xs font-medium sm:inline',
                      isActive ? 'text-rs-text' : 'text-rs-text-tertiary'
                    )}
                  >
                    {s.label}
                  </span>
                  {idx < stepsList.length - 1 && (
                    <ChevronRight size={14} className="mx-2 hidden text-rs-border sm:inline" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SCREEN 0: WELCOME & MENTAL MODEL ── */}
      {step === 'welcome' && (
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-9 shadow-sm">
          <p className="text-base font-semibold text-rs-brand">
            Manage reliability across every client from one workspace.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-rs-text-secondary">
            RELIASTRA is built for agencies and MSPs that manage critical systems for multiple
            companies. We provide independent multi-region observation, clear attribution when
            third-party services fail, and verifiable SLA evidence you can share with clients.
          </p>

          <div className="my-8 rounded-xl border border-rs-border-subtle bg-rs-base p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-rs-text-tertiary">
              The Agency Hierarchy
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rs-brand/10 text-rs-brand">
                  <Building2 size={18} />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-rs-text">1. Client</h3>
                <p className="mt-1 text-xs text-rs-text-tertiary">
                  The organization whose infrastructure your agency operates.
                </p>
              </div>

              <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                  <Layers size={18} />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-rs-text">2. Application</h3>
                <p className="mt-1 text-xs text-rs-text-tertiary">
                  A specific system or service for that client (e.g. Customer Portal).
                </p>
              </div>

              <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Link2 size={18} />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-rs-text">3. Dependency</h3>
                <p className="mt-1 text-xs text-rs-text-tertiary">
                  Third-party APIs, auth, or endpoints the application relies on.
                </p>
              </div>

              <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rs-up/10 text-rs-up">
                  <ShieldCheck size={18} />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-rs-text">4. SLA Evidence</h3>
                <p className="mt-1 text-xs text-rs-text-tertiary">
                  Verifiable proof and client-facing SLA reports generated automatically.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-rs-border-subtle pt-6">
            <span className="text-xs text-rs-text-tertiary">Setup takes ~3 minutes</span>
            <RsButton onClick={() => setStep('client')} className="px-5 py-2.5">
              <span>Start Agency Setup</span>
              <ArrowRight size={16} />
            </RsButton>
          </div>
        </div>
      )}

      {/* ── STEP 1: CREATE CLIENT ── */}
      {step === 'client' && (
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-9">
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-rs-text">Who is this client?</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-rs-text-secondary">
              A client represents an isolated workspace for a company whose infrastructure your agency
              manages. Dependencies and applications assigned here roll up into a private SLA view.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (clientName.trim()) createClientMut.mutate();
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="rs-label mb-1.5 block text-xs">
                Client Company Name <span className="text-rs-brand">*</span>
              </label>
              <input
                type="text"
                className={fieldClass}
                placeholder="e.g. Acme Logistics, Pinnacle Retail, Horizon Health"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                maxLength={150}
                autoFocus
              />
            </div>

            <div>
              <label className="rs-label mb-1.5 block text-xs">Description (Optional)</label>
              <input
                type="text"
                className={fieldClass}
                placeholder="e.g. Enterprise e-commerce infrastructure and payment pipeline"
                value={clientDesc}
                onChange={(e) => setClientDesc(e.target.value)}
                maxLength={300}
              />
            </div>

            <div className="flex items-center justify-between border-t border-rs-border-subtle pt-6">
              <span className="text-xs text-rs-text-tertiary">
                Only collects necessary identifiers. No clutter.
              </span>
              <RsButton
                type="submit"
                disabled={!clientName.trim() || createClientMut.isPending}
                className="px-5"
              >
                {createClientMut.isPending ? 'Creating…' : 'Continue to Application'}
                <ArrowRight size={16} />
              </RsButton>
            </div>
          </form>
        </div>
      )}

      {/* ── STEP 2: ADD APPLICATION ── */}
      {step === 'application' && (
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-9">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rs-brand">
              <Building2 size={14} />
              <span>Client: {createdClientName}</span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-rs-text">
              What application or service do you manage for {createdClientName}?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-rs-text-secondary">
              Applications represent the specific systems or services you operate for this client.
            </p>
          </div>

          <div className="my-5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs leading-relaxed text-rs-text-secondary">
            <strong className="text-rs-text">Distinction:</strong>{' '}
            <span className="text-rs-brand font-medium">{createdClientName}</span> is the client.{' '}
            <span className="text-blue-500 font-medium">Customer Portal</span> or{' '}
            <span className="text-blue-500 font-medium">Payments API</span> is the application.
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (appName.trim()) createAppMut.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="rs-label mb-1.5 block text-xs">
                Application Name <span className="text-rs-brand">*</span>
              </label>
              <input
                type="text"
                className={fieldClass}
                placeholder="e.g. Customer Portal, Checkout Service, Core API"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                maxLength={150}
                autoFocus
              />
            </div>

            <div>
              <label className="rs-label mb-1.5 block text-xs">Description (Optional)</label>
              <input
                type="text"
                className={fieldClass}
                placeholder="e.g. Primary consumer web application and checkout pipeline"
                value={appDesc}
                onChange={(e) => setAppDesc(e.target.value)}
                maxLength={300}
              />
            </div>

            <div className="flex items-center justify-between border-t border-rs-border-subtle pt-6">
              <span className="text-xs text-rs-text-tertiary">
                You can add more applications at any time.
              </span>
              <RsButton
                type="submit"
                disabled={!appName.trim() || createAppMut.isPending}
                className="px-5"
              >
                {createAppMut.isPending ? 'Saving…' : 'Continue to Dependencies'}
                <ArrowRight size={16} />
              </RsButton>
            </div>
          </form>
        </div>
      )}

      {/* ── STEP 3: CONNECT DEPENDENCY ── */}
      {step === 'dependency' && (
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-9">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rs-brand">
              <Layers size={14} />
              <span>
                {createdClientName} → {createdAppName}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-rs-text">
              Connect external dependency to {createdAppName}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-rs-text-secondary">
              Track the external services this application relies on so RELIASTRA can identify
              where reliability issues originate and confirm uptime from multiple global regions.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (depUrl.trim()) createDepMut.mutate();
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="rs-label mb-1.5 block text-xs">Dependency Name</label>
              <input
                type="text"
                className={fieldClass}
                placeholder={`e.g. ${createdAppName} Health Check, Stripe Gateway, Auth0 API`}
                value={depName}
                onChange={(e) => setDepName(e.target.value)}
                maxLength={150}
              />
            </div>

            <div>
              <label className="rs-label mb-1.5 block text-xs">
                Endpoint URL <span className="text-rs-brand">*</span>
              </label>
              <input
                type="url"
                className={cn(fieldClass, 'font-mono text-xs')}
                placeholder="https://api.example.com/health"
                value={depUrl}
                onChange={(e) => setDepUrl(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="rs-label mb-1.5 block text-xs">Check Interval</label>
                <select
                  value={depInterval}
                  onChange={(e) => setDepInterval(Number(e.target.value))}
                  className={fieldClass}
                >
                  <option value={15}>15 seconds (High frequency)</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>1 minute (Standard)</option>
                  <option value={300}>5 minutes</option>
                </select>
              </div>

              <div>
                <label className="rs-label mb-1.5 block text-xs">Latency Alert Threshold</label>
                <div className="relative">
                  <input
                    type="number"
                    className={cn(fieldClass, 'font-mono pr-10')}
                    value={depThreshold}
                    onChange={(e) => setDepThreshold(Number(e.target.value))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-rs-text-tertiary">
                    ms
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="rs-label mb-1.5 block text-xs">Monitored Regions</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'us-east', label: 'US East' },
                  { id: 'us-west', label: 'US West' },
                  { id: 'eu-west', label: 'EU West' },
                  { id: 'ap-south', label: 'AP Southeast' },
                ].map((r) => {
                  const selected = depRegions.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setDepRegions((prev) =>
                          selected
                            ? prev.length > 1
                              ? prev.filter((x) => x !== r.id)
                              : prev
                            : [...prev, r.id]
                        );
                      }}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus',
                        selected
                          ? 'border-rs-brand bg-rs-brand-subtle text-rs-brand'
                          : 'border-rs-border-subtle bg-rs-base text-rs-text-secondary hover:border-rs-border'
                      )}
                    >
                      <Globe size={12} />
                      <span>{r.label}</span>
                      {selected && <Check size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-rs-border-subtle pt-6">
              <span className="text-xs text-rs-text-tertiary">
                Independent quorum verification enabled automatically.
              </span>
              <RsButton
                type="submit"
                disabled={!depUrl.trim() || createDepMut.isPending}
                className="px-5"
              >
                {createDepMut.isPending ? 'Connecting…' : 'Start Monitoring & Prove'}
                <ArrowRight size={16} />
              </RsButton>
            </div>
          </form>
        </div>
      )}

      {/* ── STEP 4: PROOF & EVIDENCE OUTCOME ── */}
      {step === 'proof' && (
        <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-9">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rs-up/10 text-rs-up">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-rs-text sm:text-2xl">
              Workspace configured for {createdClientName}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-rs-text-secondary">
              RELIASTRA is now actively collecting independent reliability signals. When outages or
              degradations occur, timestamped evidence reports and client-facing SLA metrics are
              generated automatically.
            </p>
          </div>

          <div className="my-8 space-y-3 rounded-xl border border-rs-border-subtle bg-rs-base p-5">
            <div className="flex items-center justify-between border-b border-rs-border-subtle pb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-rs-text-tertiary">
                Configured Architecture
              </span>
              <span className="rounded-full bg-rs-up/10 px-2.5 py-0.5 text-[11px] font-semibold text-rs-up">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-rs-text-secondary">Client Workspace</span>
              <span className="font-medium text-rs-text">{createdClientName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-rs-text-secondary">Managed Application</span>
              <span className="font-medium text-rs-text">{createdAppName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-rs-text-secondary">Connected Dependency</span>
              <span className="font-mono text-xs text-rs-text">{depUrl}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-rs-text-secondary">Observation Status</span>
              <span className="text-xs font-medium text-rs-up">Checking from {depRegions.length} regions</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-rs-border-subtle pt-6">
            <RsButton
              variant="secondary"
              onClick={() => router.push('/clients')}
              className="w-full sm:w-auto"
            >
              Agency Command Center
            </RsButton>
            <RsButton
              onClick={() => {
                if (createdClientId) router.push(`/clients/${createdClientId}`);
                else router.push('/clients');
              }}
              className="w-full sm:w-auto px-6 py-2.5"
            >
              <span>Open {createdClientName} Workspace</span>
              <ArrowRight size={16} />
            </RsButton>
          </div>
        </div>
      )}
    </div>
  );
}
