'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import {
  useAllApplications,
  useClients,
  useCreateApplication,
  useCreateClient,
  useDependencies,
  useUpdateDependency,
} from '@/lib/dashboard/queries';
import { applicationIndex, unassignedDependencies } from '@/lib/agency/portfolio';
import { AgencyUnavailable } from '@/components/agency/parts';
import {
  OptionButton,
  ReviewRow,
  SequenceShell,
  StageActions,
  StageBlock,
  StageHead,
  type Stage,
} from './shell';

/**
 * CLIENT ENVIRONMENT CONFIGURATION SEQUENCE
 *
 * The agency equivalent of the observation sequence, and deliberately the same
 * shell: establishing a client environment is the same kind of act as
 * establishing an observation environment, so it should not look like a
 * different product.
 *
 * Three stages, each backed by a real endpoint:
 *   01 CLIENT      POST /v1/clients
 *   02 APPLICATION POST /v1/clients/{id}/applications
 *   03 MONITORS    PATCH /v1/dependencies/{id} { application_id }
 *
 * Nothing is invented: an agency operator can only attach monitors that
 * already exist in the organization, because that is the only way a monitor
 * can join a client in this data model.
 */

const STAGES: Stage[] = [
  { id: 'client', index: '01', label: 'Client' },
  { id: 'application', index: '02', label: 'Application' },
  { id: 'monitors', index: '03', label: 'Monitors' },
];

type StageId = 'client' | 'application' | 'monitors' | 'done';

export function ClientSetupSequence() {
  const router = useRouter();
  const org = useAppStore((s) => s.org);

  const [stage, setStage] = useState<StageId>('client');
  const [completed, setCompleted] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientDescription, setClientDescription] = useState('');
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [applicationName, setApplicationName] = useState('');
  const [attached, setAttached] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createClient = useCreateClient();
  const createApplication = useCreateApplication();
  const updateDependency = useUpdateDependency();

  const clients = useClients();
  const deps = useDependencies();
  const clientIds = useMemo(() => (clients.data ?? []).map((c) => c.id), [clients.data]);
  const allApplications = useAllApplications(clientIds);
  const index = useMemo(
    () => applicationIndex(allApplications.data ?? []),
    [allApplications.data]
  );
  const available = useMemo(
    () => unassignedDependencies(deps.data ?? [], index),
    [deps.data, index]
  );

  if (org && !org.has_agency_mode) {
    return (
      <div className="obc min-h-screen bg-[var(--obc-void)] px-[var(--obc-gutter)] py-10">
        <div className="mx-auto max-w-[900px]">
          <AgencyUnavailable />
        </div>
      </div>
    );
  }

  async function submitClient() {
    setError(null);
    if (!clientName.trim()) {
      setError('A client environment needs a name.');
      return;
    }
    setBusy(true);
    try {
      const client = await createClient.mutateAsync({
        name: clientName.trim(),
        description: clientDescription.trim() || undefined,
      });
      setClientId(client.id);
      setCompleted((c) => [...c, 'client']);
      setStage('application');
    } catch {
      setError(
        'The client environment could not be created. Creating clients requires an administrator role.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitApplication() {
    setError(null);
    if (!clientId) return;
    if (!applicationName.trim()) {
      setError('An application needs a name.');
      return;
    }
    setBusy(true);
    try {
      const application = await createApplication.mutateAsync({
        clientId,
        body: { name: applicationName.trim() },
      });
      setApplicationId(application.id);
      setCompleted((c) => [...c, 'application']);
      setStage('monitors');
    } catch {
      setError('The application could not be created. Try again, or add it from the client environment.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleAttach(dependencyId: string) {
    if (!applicationId) return;
    setError(null);
    try {
      await updateDependency.mutateAsync({
        id: dependencyId,
        body: { application_id: applicationId },
      });
      setAttached((a) => [...a, dependencyId]);
    } catch {
      setError('That monitor could not be attached. It may have been changed elsewhere.');
    }
  }

  return (
    <SequenceShell
      eyebrow="Client environment configuration"
      stages={STAGES}
      currentStage={stage === 'done' ? 'monitors' : stage}
      completed={completed}
      onExit={() => router.push('/clients')}
      exitLabel="Exit to agency operations"
    >
      {stage === 'client' && (
        <>
          <StageHead
            index="01 · Client"
            title="Establish a client environment"
            body={
              <>
                A client environment is an isolated view of the infrastructure you operate for one
                organization. Its applications, monitors, incidents and evidence roll up to it and
                to nothing else, which is what lets{' '}
                {org?.name ?? 'your agency'} answer &ldquo;which client needs attention&rdquo;
                without switching accounts.
              </>
            }
          />

          <StageBlock title="Client" hint="The name your team uses for this organization.">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <label className="obc-field-label" htmlFor="seq-client-name">
                  Client name
                </label>
                <input
                  id="seq-client-name"
                  className="obc-input"
                  value={clientName}
                  maxLength={150}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div>
                <label className="obc-field-label" htmlFor="seq-client-description">
                  Description (optional)
                </label>
                <input
                  id="seq-client-description"
                  className="obc-input"
                  value={clientDescription}
                  maxLength={500}
                  onChange={(e) => setClientDescription(e.target.value)}
                />
              </div>
            </div>
          </StageBlock>

          {error && (
            <p role="alert" className="text-[12.5px] text-[#E58C85]">
              {error}
            </p>
          )}

          <StageActions note="Creates the environment. Nothing is monitored until an application and its monitors are attached.">
            <button
              type="button"
              className="obc-btn obc-btn-primary"
              onClick={submitClient}
              disabled={busy}
            >
              {busy ? 'Creating…' : 'Create environment'}
            </button>
          </StageActions>
        </>
      )}

      {stage === 'application' && (
        <>
          <StageHead
            index="02 · Application"
            title={`What does ${clientName} run?`}
            body="An application is what monitors attach to: a product, a service, an environment. It links an incident to this client."
          />

          <StageBlock title="Application" hint="You can add more from the client environment afterwards.">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <label className="obc-field-label" htmlFor="seq-app-name">
                  Application name
                </label>
                <input
                  id="seq-app-name"
                  className="obc-input"
                  value={applicationName}
                  maxLength={150}
                  placeholder="Production"
                  onChange={(e) => setApplicationName(e.target.value)}
                />
              </div>
            </div>
          </StageBlock>

          {error && (
            <p role="alert" className="text-[12.5px] text-[#E58C85]">
              {error}
            </p>
          )}

          <StageActions
            note="Next: attach the monitors that serve this application."
            back={{ label: 'Back', onClick: () => setStage('client') }}
          >
            <button
              type="button"
              className="obc-btn obc-btn-primary"
              onClick={submitApplication}
              disabled={busy}
            >
              {busy ? 'Creating…' : 'Create application'}
            </button>
          </StageActions>
        </>
      )}

      {stage === 'monitors' && (
        <>
          <StageHead
            index="03 · Monitors"
            title="Attach the monitors this client depends on"
            body="Only monitors that are not already attached to another client are listed. Attaching moves the monitor into this environment; its observation history is unaffected."
          />

          <StageBlock
            title="Available monitors"
            hint={
              available.length
                ? 'Select each monitor that serves this application.'
                : 'Every monitor in your organization already belongs to a client environment.'
            }
          >
            {available.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {available.map((d) => (
                  <OptionButton
                    key={d.id}
                    selected={attached.includes(d.id)}
                    title={d.name}
                    meta={d.endpoint_url}
                    disabled={attached.includes(d.id)}
                    onClick={() => toggleAttach(d.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-[var(--obc-text-3)]">
                Add a dependency from{' '}
                <Link href="/dependencies" className="obc-link">
                  dependencies
                </Link>{' '}
                and assign it to this application, or continue and attach monitors later.
              </p>
            )}
          </StageBlock>

          {error && (
            <p role="alert" className="text-[12.5px] text-[#E58C85]">
              {error}
            </p>
          )}

          <StageActions
            note={`${attached.length} monitor${attached.length === 1 ? '' : 's'} attached. The rollup for this client begins with the next observation.`}
            back={{ label: 'Back', onClick: () => setStage('application') }}
          >
            <button
              type="button"
              className="obc-btn obc-btn-primary"
              onClick={() => setStage('done')}
            >
              Finish
            </button>
          </StageActions>
        </>
      )}

      {stage === 'done' && (
        <>
          <StageHead
            index="Environment ready"
            title={`${clientName} is under observation`}
            body="The environment exists and rolls up on the agency portfolio. Availability appears as soon as its monitors report."
          />
          <dl className="mt-8">
            <ReviewRow label="Client" mono={false}>
              {clientName}
            </ReviewRow>
            <ReviewRow label="Application" mono={false}>
              {applicationName}
            </ReviewRow>
            <ReviewRow label="Monitors attached">{attached.length}</ReviewRow>
            <ReviewRow label="Rollup" mono={false}>
              Availability, incidents and evidence for this client are computed from the monitors
              attached to its applications.
            </ReviewRow>
          </dl>
          <StageActions note="The portfolio updates on its next read.">
            <Link href="/clients" className="obc-btn">
              Agency operations
            </Link>
            <Link
              href={clientId ? `/clients/${clientId}` : '/clients'}
              className="obc-btn obc-btn-primary"
            >
              Open client environment
            </Link>
          </StageActions>
        </>
      )}
    </SequenceShell>
  );
}
