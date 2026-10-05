/**
 * 01 · DEPENDENCY FAILURE — to the operator whose dependency just failed.
 *
 * The message has one job: tell the reader which dependency broke, whether the
 * fault is theirs or a third party's, and give them the artefact that settles
 * the question later. Everything else is subordinate.
 */

import * as React from 'react';

import {
  Action,
  Advisory,
  ClassificationBanner,
  DataRegister,
  Doc,
  Footer,
  Hairline,
  Lede,
  Masthead,
  Paragraph,
  SectionHeading,
  sectionIndexer,
  Signoff,
  SignalLedger,
  StateTag,
} from '../primitives';
import { color } from '../tokens';
import {
  DEFAULTS,
  stamp,
  stateFor,
  STATE_WORD,
  type AttributionLedger,
  type BaseProps,
  type ObservationWindow,
  type Provenance,
} from '../contracts';

export interface DependencyFailureProps extends BaseProps {
  dependencyName: string;
  endpoint: string;
  vendorName: string;
  ledger: AttributionLedger;
  window: ObservationWindow;
  provenance: Provenance;
  /** Rendered when the incident has since resolved. */
  resolvedAt?: string;
}

export const DependencyFailure: React.FC<DependencyFailureProps> = ({
  recipientName = 'there',
  organisationName,
  dependencyName,
  endpoint,
  vendorName,
  ledger,
  window,
  provenance,
  resolvedAt,
  dashboardUrl = DEFAULTS.dashboardUrl,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
  preferencesUrl = DEFAULTS.preferencesUrl,
}) => {
  const sec = sectionIndexer();
  const state = stateFor(ledger.classification);
  const word = STATE_WORD[state];

  return (
    <Doc
      previewText={`${word}: ${dependencyName} at ${vendorName}. Confidence ${ledger.score.toFixed(2)}/100. Signed evidence attached.`}
      masthead={<Masthead classification="Incident notification" />}
    >
      {/* The banner carries the state word and nothing else. The classification
          is the same fact in the engine's own vocabulary, and printing both
          invites the reader to wonder which one is authoritative. It appears
          once, in the ledger below. */}
      <ClassificationBanner state={state}>
        {word} · {vendorName}
      </ClassificationBanner>

      <Lede>
        {dependencyName} is {word.toLowerCase()} at {vendorName}
      </Lede>

      <Paragraph>
        Hello {recipientName}, our observation point has been unable to reach{' '}
        <strong>{dependencyName}</strong> since{' '}
        <strong>{stamp(window.startedAt)}</strong>. This is an independent
        measurement taken from outside your infrastructure — it is not your
        monitoring telling you that your application broke.
      </Paragraph>

      {resolvedAt ? (
        <Advisory state="up">
          <strong>Resolved.</strong> {dependencyName} responded successfully
          again at {stamp(resolvedAt)} after{' '}
          {window.count - 1} consecutive confirmed failures. The full
          observation history is retained and remains verifiable below.
        </Advisory>
      ) : null}

      <SectionHeading index={sec.next()} title="Attribution" />
      <SignalLedger
        signals={ledger.signals.map((signal) => ({
          name: signal.name,
          weight: WEIGHTS[signal.name],
          score: signal.score,
          contributes: !(CORROBORATION.includes(signal.name) && signal.score === 0),
        }))}
        score={ledger.score}
        ceiling={ledger.ceiling}
        classification={ledger.classification}
      />

      <SectionHeading index={sec.next()} title="Observation record" />
      <DataRegister
        caption="Independent observation · single point"
        rows={[
          { label: 'Dependency', value: dependencyName },
          { label: 'Vendor', value: vendorName },
          { label: 'Endpoint', value: endpoint, mono: true },
          {
            label: 'Window',
            value: `${stamp(window.startedAt)} → ${stamp(window.endedAt)}`,
            mono: true,
          },
          {
            label: 'Observations',
            value: `${window.count} @ ${window.intervalSeconds}s`,
          },
          {
            label: 'Confirmed by',
            value: `${window.confirmThreshold} consecutive failures`,
          },
          {
            label: 'Dropped probes',
            value:
              window.droppedProbes === undefined
                ? 'none'
                : `${window.droppedProbes} recorded`,
            tone: window.droppedProbes ? 'degraded' : undefined,
          },
        ]}
      />

      <SectionHeading index={sec.next()} title="Artefact" />
      <Paragraph muted>
        The signed evidence document for this incident is available to you. It
        contains the full observation series, the attribution breakdown and the
        checksums below. It can be verified by anyone, without an account.
      </Paragraph>

      <Action href={`${provenance.verificationUrl}`}>
        Verify this incident
      </Action>


      <Signoff role="Reliastra Operations" />
      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`You receive this because ${organisationName} monitors ${dependencyName} and you are a member of its workspace. This is a service notification about a measurement we took, not a marketing message.`}
        verification={{
          label: 'Public verification · no account required',
          href: provenance.verificationUrl,
          id: provenance.verificationId,
        }}
        methodologyVersion={`${provenance.methodologyVersion}${provenance.attributionVersion ? ` / attribution ${provenance.attributionVersion}` : ''}`}
        replyTo={supportEmail}
        address={address}
        unsubscribe={{ label: 'Incident alerts are on.', href: preferencesUrl }}
        legalNote={`Document SHA-256 ${provenance.documentChecksum}${
          provenance.dataHash ? ` · payload SHA-256 ${provenance.dataHash}` : ''
        }${
          provenance.signed
            ? ` · ${provenance.signatureAlg ?? 'Ed25519'} signature attached`
            : ' · this deployment issues unsigned artefacts'
        }. This observation was taken from one location. It establishes that the endpoint failed from here; it does not establish the vendor's internal cause, and it is not a substitute for your own observability.`}
      />    </Doc>
  );
};

const WEIGHTS: Record<string, number> = {
  temporal: 0.2,
  endpoint_overlap: 0.25,
  latency_correlation: 0.25,
  error_pattern: 0.15,
  infrastructure_baseline: 0.15,
};

const CORROBORATION = ['temporal', 'endpoint_overlap'];
