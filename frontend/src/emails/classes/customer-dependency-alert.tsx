/**
 * 03 · CUSTOMER DEPENDENCY ALERT — to the subscriber who pays for the watch.
 *
 * Deliberately different from class 01. Class 01 is a service notification
 * about a measurement; this one is a notification about *their* monitored
 * dependency, and it carries what to do about it. It therefore leads with
 * remediation and demotes the attribution ledger below the operational facts.
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
} from '../primitives';
import { DEFAULTS, stamp, stateFor, STATE_WORD, type AttributionLedger, type BaseProps, type ObservationWindow, type Provenance } from '../contracts';

export interface CustomerDependencyAlertProps extends BaseProps {
  dependencyName: string;
  endpoint: string;
  vendorName: string;
  ledger: AttributionLedger;
  window: ObservationWindow;
  provenance: Provenance;
  /** Concrete next step for the reader. Never generic. */
  remediation: string;
  /** Minutes until the next scheduled probe. */
  nextProbeSeconds?: number;
  /** Section toggles. All default to shown; omitting a section renumbers
      the rest automatically. */
  showMeasurement?: boolean;
  showConclusion?: boolean;
  showAction?: boolean;
  showSignoff?: boolean;
}

export const CustomerDependencyAlert: React.FC<CustomerDependencyAlertProps> = ({
  recipientName = 'there',
  organisationName,
  dependencyName,
  endpoint,
  vendorName,
  ledger,
  window,
  provenance,
  remediation,
  nextProbeSeconds,
  showMeasurement,
  showConclusion,
  showAction,
  showSignoff,
  dashboardUrl = DEFAULTS.dashboardUrl,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
  preferencesUrl = DEFAULTS.preferencesUrl,
}) => {
  const sec = sectionIndexer();
  const state = stateFor(ledger.classification);
  const word = STATE_WORD[state];
  const windowMinutes = Math.max(1, Math.round(window.count * (window.intervalSeconds / 60)));

  return (
    <Doc
      previewText={`${dependencyName} (${vendorName}) is ${word.toLowerCase()}. ${window.count} consecutive failures over ${windowMinutes} min. Next step: ${remediation.slice(0, 60)}`}
      masthead={<Masthead classification={`Your dependency · ${word}`} />}
    >
      <ClassificationBanner state={state}>
        {word} · {vendorName} · monitored for {organisationName}
      </ClassificationBanner>

      <Lede>{dependencyName} is {word.toLowerCase()}</Lede>

      <Paragraph>
        {recipientName}, we have confirmed{' '}
        <strong>{window.confirmThreshold} consecutive failures</strong> against{' '}
        <strong>{dependencyName}</strong> over {windowMinutes} minutes. This is
        the alert your plan is configured to send.
      </Paragraph>

      <SectionHeading index={sec.next()} title="What to do" />
      <Paragraph>{remediation}</Paragraph>

      <Advisory state={state}>
        {state === 'down' ? (
          <>
            Our classification is <strong>{ledger.classification.replace(/_/g, ' ')}</strong>{' '}
            with confidence {ledger.score.toFixed(2)}/100. That points at{' '}
            {vendorName} rather than your configuration — but it is a
            probabilistic attribution from one observation point, so confirm
            against your own telemetry before changing anything.
          </>
        ) : state === 'degraded' ? (
          <>
            The failure pattern is <strong>not</strong> cleanly separable into a
            vendor fault. Expect intermittent behaviour rather than a hard
            outage, and treat a partial degradation as a monitoring gap on your
            side as much as theirs.
          </>
        ) : (
          <>
            We could not determine whose fault this is from what was observed.
            That is a real result, not a failed check: the honest answer is
            recorded rather than guessed at.
          </>
        )}
      </Advisory>

      {showAction !== false && (
        <Action href={`${dashboardUrl}/dependencies`}>Open dependency detail</Action>
      )}

      {showMeasurement !== false && (
        <>
          <SectionHeading index={sec.next()} title="Measurement" />
          <DataRegister
        caption="Observation record"
        rows={[
          { label: 'Dependency', value: dependencyName },
          { label: 'Vendor', value: vendorName },
          { label: 'Endpoint', value: endpoint, mono: true },
          {
            label: 'Window',
            value: `${stamp(window.startedAt)} → ${stamp(window.endedAt)}`,
            mono: true,
          },
          { label: 'Observations', value: `${window.count} @ ${window.intervalSeconds}s` },
          {
            label: 'Next probe',
            value:
              nextProbeSeconds === undefined
                ? 'scheduled'
                : `in ${Math.round(nextProbeSeconds / 60)} min`,
            mono: true,
          },
          { label: 'Classification', value: ledger.classification.replace(/_/g, ' '), tone: state },
          { label: 'Confidence', value: `${ledger.score.toFixed(2)} / 100`, mono: true },
          {
            label: 'Verification',
            value: provenance.verificationId ?? provenance.verificationUrl,
            mono: true,
          },
        ]}
      />
        </>
      )}

      {showConclusion !== false && (
        <>
          <SectionHeading index={sec.next()} title="How this was concluded" />
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
        </>
      )}


      {showSignoff !== false && <Signoff role="Reliastra Monitoring" />}
      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`You receive this because alert rules you configured for ${organisationName} match this dependency. Change which events reach this address at any time.`}
        verification={{
          label: 'Verify this measurement',
          href: provenance.verificationUrl,
          id: provenance.verificationId,
        }}
        methodologyVersion={`${provenance.methodologyVersion} / attribution ${provenance.attributionVersion ?? 'v1.1'}`}
        replyTo={supportEmail}
        address={address}
        unsubscribe={{ label: 'This alert rule is active.', href: preferencesUrl }}
        legalNote={`${window.count} observations from one location over ${windowMinutes} minutes. A dropped probe is recorded as dropped, never interpolated. This message reports an observation; it does not assign legal fault for any outage.`}
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
