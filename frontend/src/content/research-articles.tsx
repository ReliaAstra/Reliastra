import type { ReactNode } from 'react';
import { PUBLIC_ROUTES, researchRoute } from '@/lib/routes';
import type { RelatedLink } from '@/components/content/article-template';

/**
 * Body copy for `/research/[slug]`.
 *
 * Every claim here describes behaviour that exists in the codebase - check
 * scheduling, quorum rules, the SSRF policy, the check-state taxonomy, evidence
 * checksums and retention. Nothing is a projection, a benchmark or a statistic
 * we cannot reproduce. Where we do not have data we say so rather than
 * inventing a number, which is the standard the research agenda commits to.
 */

export type ResearchArticleBody = {
  body: ReactNode;
  evidence: ReactNode;
  methodology: ReactNode;
  related: RelatedLink[];
};

const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-4 leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">{children}</p>
);

const H = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-10 text-2xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
    {children}
  </h2>
);

const LI = ({ children }: { children: ReactNode }) => (
  <li className="leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">{children}</li>
);

export const RESEARCH_ARTICLE_BODIES: Record<string, ResearchArticleBody> = {
  'the-dependency-gap': {
    body: (
      <>
        <P>
          A monitoring system that watches only your own services has a blind
          spot shaped exactly like your dependency graph. When a checkout flow
          starts failing, the alert says the checkout is failing. It does not
          say whether the cause is your code, your database, or the payment
          provider three hops away whose status page currently reads
          &ldquo;all systems operational&rdquo;.
        </P>

        <H>Why the gap persists</H>
        <P>
          Most teams resolve this by opening two tabs during an incident: their
          own dashboards, and the vendor&rsquo;s status page. That comparison is
          weaker than it feels, for three reasons.
        </P>
        <ul className="mt-4 list-disc space-y-2 pl-6">
          <LI>
            A status page describes intent, not behaviour. It is updated by
            humans, after the fact, and it is scoped to the incidents the vendor
            has chosen to declare.
          </LI>
          <LI>
            Timing is approximate. An incident opened at 14:05 and closed at
            14:40 does not tell you when your requests started failing, or when
            they recovered.
          </LI>
          <LI>
            The record is not yours. When you ask for a service credit, the
            vendor&rsquo;s own page is the evidence - and it was written by the
            counterparty.
          </LI>
        </ul>

        <H>What closes it</H>
        <P>
          The gap closes when your own failure record and an independent record
          of the vendor&rsquo;s behaviour are kept on the same timeline. That is
          the product&rsquo;s whole premise: monitor the external dependency
          directly, from outside the vendor&rsquo;s control, and store the
          observations alongside your own incident history so the two can be
          compared at the minute level.
        </P>
        <P>
          RELIASTRA checks each configured endpoint on a fixed interval and
          writes every observation - latency, status code, regional origin and
          outcome - to a retained history. When your own incident window
          overlaps a period in which the dependency was independently observed
          failing, that overlap is a fact about two measured timelines rather
          than an inference from a status page.
        </P>

        <H>What this is not</H>
        <P>
          It is not proof of causation, and the product does not claim that. A
          dependency failing at the same time as your service is strong
          evidence for where to look first; it is not a substitute for looking.
          Credit decisions belong to the vendor and to your contract. What
          changes is the quality of the record you bring to that conversation.
        </P>
      </>
    ),
    evidence: (
      <ul className="list-disc space-y-2 pl-6 text-sm text-[#52525B] dark:text-[#A1A1AA]">
        <LI>
          Every observation is written with its regional origin, so a single
          region&rsquo;s network path cannot masquerade as a vendor-wide outage.
        </LI>
        <LI>
          Observations are retained per plan - from 24 hours on Free up to 90
          days on Pro, with custom retention on Enterprise - and pruned by
          scheduled jobs rather than kept indefinitely.
        </LI>
        <LI>
          Generated evidence reports are checksummed and bound to the
          organisation that produced them. A public verification reference
          confirms a report exists and matches its checksum without disclosing
          endpoints, headers or account details.
        </LI>
      </ul>
    ),
    methodology: (
      <P>
        This article describes the product&rsquo;s design rather than a study,
        so there is no sampling method to disclose. The measurement method
        behind the observations it refers to is documented separately in{' '}
        <a
          href={researchRoute('how-reliastra-measures-vendor-reliability')}
          className="text-[#0891B2] underline underline-offset-4 dark:text-[#22D3EE]"
        >
          How RELIASTRA measures vendor reliability
        </a>
        .
      </P>
    ),
    related: [
      {
        href: researchRoute('how-reliastra-measures-vendor-reliability'),
        label: 'How RELIASTRA measures vendor reliability',
        description: 'Regional origination, retries, quorum and the refusals.',
      },
      {
        href: researchRoute('reliastra-research-agenda'),
        label: 'The RELIASTRA research agenda',
        description: 'What we intend to publish, and what we will not.',
      },
      {
        href: PUBLIC_ROUTES.track,
        label: 'Track a vendor',
        description: 'Public, aggregated posture for vendors made public.',
      },
    ],
  },

  'how-reliastra-measures-vendor-reliability': {
    body: (
      <>
        <P>
          Every number RELIASTRA shows comes from an HTTP request that something
          made, at a recorded time, from a recorded place. This page describes
          how those requests are scheduled, how the results are interpreted, and
          - more importantly - the cases we deliberately refuse to call an
          outage.
        </P>

        <H>1. Checks are scheduled, not sampled on demand</H>
        <P>
          A single authoritative scheduler dispatches checks on a fixed interval
          per dependency. Each due dependency produces one independent task per
          configured region, published through a message broker and executed by
          a worker. Checks never run inside the API process that serves your
          dashboard, so a busy dashboard cannot delay a probe and a slow probe
          cannot block the API.
        </P>
        <P>
          If the scheduler, the broker or a worker is unavailable, checks simply
          do not run - and the system reports that. A missed probe is never
          backfilled with a synthesised result, because an observation that did
          not happen must never appear in a history you intend to rely on.
        </P>

        <H>2. Origins are separate and recorded</H>
        <P>
          Each region resolves and connects independently, and every stored
          result carries the region that produced it. Two regions disagreeing is
          information: it distinguishes a vendor-wide failure from a network
          path problem affecting one origin.
        </P>

        <H>3. Quorum, not a single failed request</H>
        <P>
          A single failed request is not an incident. Declaring one requires a
          quorum - failures observed across more than one region inside a short
          correlation window - and recovery likewise requires consecutive
          successful checks before a dependency is marked healthy again. The
          window and the region count are fixed, small integers rather than
          tunable dials, so the same evidence produces the same verdict
          everywhere.
        </P>

        <H>4. Targets are validated before they are probed</H>
        <P>
          Before any request leaves, the target address is resolved and checked
          against a security policy that rejects private, loopback, link-local
          and metadata addresses. A target that fails that check is recorded as
          blocked by security policy, and no request is sent.
        </P>
        <P>
          This matters for interpretation: a blocked target is a configuration
          problem on your side, and it is never reported as a vendor outage. The
          policy is not relaxed for convenience, including in development.
        </P>

        <H>5. Nine states, because &ldquo;no data&rdquo; is ambiguous</H>
        <P>
          An empty chart cannot tell you whether the vendor is down or whether
          we never ran the probe. Those are different facts with different
          owners, so each dependency carries an explicit state:
        </P>
        <ul className="mt-4 list-disc space-y-1 pl-6">
          <LI>
            <strong>Target problems</strong> - the probe reached the vendor and
            it failed, or was refused by the security policy.
          </LI>
          <LI>
            <strong>Infrastructure problems</strong> - dispatch failed, or the
            scheduler was not proven alive, so no probe could have run.
          </LI>
          <LI>
            <strong>Transitional</strong> - never checked, awaiting schedule,
            queued, or executing.
          </LI>
        </ul>
        <P>
          A timeout, a policy block, a worker outage and a dead scheduler are
          four distinct states, because they have four different causes and four
          different fixes.
        </P>
      </>
    ),
    evidence: (
      <ul className="list-disc space-y-2 pl-6 text-sm text-[#52525B] dark:text-[#A1A1AA]">
        <LI>
          Each stored result records its region, outcome, status code, latency
          and execution time.
        </LI>
        <LI>
          Dispatch failures are counted and logged with the dependency, region
          and failure reason, and the next scheduled attempt is left untouched
          so the check is retried rather than silently forgiven.
        </LI>
        <LI>
          Scheduler and worker liveness are published as time-limited
          heartbeats and surfaced through a health endpoint, so a pipeline that
          has stopped is reported as broken rather than presenting an empty
          history.
        </LI>
      </ul>
    ),
    methodology: (
      <>
        <P>
          Checks are HTTP requests made by RELIASTRA&rsquo;s own workers on a
          fixed interval. There is no sampling frame and no human annotation.
          Outcomes are determined by the response (or the absence of one)
          against the expectation configured for that dependency.
        </P>
        <P>
          Known limitations, stated plainly: our origins are a fixed, small set
          of regions, so we cannot distinguish a vendor-wide outage from one
          affecting a geography we do not observe from. We do not measure
          end-user experience, only server-to-server responses. And a
          dependency that requires authenticated access is checked with
          credentials you supply, which means a credential rotation can present
          as a target failure.
        </P>
      </>
    ),
    related: [
      {
        href: researchRoute('the-dependency-gap'),
        label: 'The Dependency Gap',
        description: 'Why vendor and self-inflicted outages look identical.',
      },
      {
        href: researchRoute('reliastra-research-agenda'),
        label: 'The RELIASTRA research agenda',
        description: 'Standards we hold our own data to.',
      },
    ],
  },

  'reliastra-research-agenda': {
    body: (
      <>
        <P>
          We publish research for one reason: a reliability record is only
          useful in a commercial argument if the other side can inspect how it
          was produced. This page states what we intend to publish, what we will
          not, and the rules we hold ourselves to.
        </P>

        <H>What we will publish</H>
        <ul className="mt-4 list-disc space-y-2 pl-6">
          <LI>
            <strong>Methodology.</strong> How checks are scheduled, origination,
            retries, quorum rules, and the failure taxonomy. This is the
            minimum required for anyone to evaluate our numbers, so it is
            published first and kept current.
          </LI>
          <LI>
            <strong>Aggregate reliability observations.</strong> Posture for
            vendors whose data has been made public, with the window and sample
            size stated alongside every figure.
          </LI>
          <LI>
            <strong>Negative results and corrections.</strong> When a
            measurement turns out to be wrong or misleading, the correction is
            published in place with the original claim still visible.
          </LI>
        </ul>

        <H>What we will not publish</H>
        <ul className="mt-4 list-disc space-y-2 pl-6">
          <LI>
            Anything that identifies a customer, their endpoints, or their
            configured checks. Public material shows aggregated posture only.
          </LI>
          <LI>
            Vendor rankings presented without their sample size, window and
            methodology. A number without those is marketing.
          </LI>
          <LI>
            Causal claims. We report correlated timelines and leave causation to
            the engineers reading them.
          </LI>
          <LI>
            Benchmarks we cannot reproduce from the method we published.
          </LI>
        </ul>

        <H>Standing rules</H>
        <ul className="mt-4 list-disc space-y-2 pl-6">
          <LI>
            Every published figure states its window, its origin set and how
            outcomes were classified.
          </LI>
          <LI>
            Where we lack the data to support a claim, we say so explicitly
            instead of estimating.
          </LI>
          <LI>
            Evidence reports remain the property of the organisation that
            generated them, and public verification confirms only that a report
            exists and matches its checksum.
          </LI>
        </ul>

        <H>Current status</H>
        <P>
          The methodology is published and complete for the check pipeline as it
          exists today. Aggregate vendor reporting is limited to vendors whose
          posture has been made public; we have not published a cross-vendor
          comparison, and we will not until the sample and window behind it can
          be stated honestly.
        </P>
      </>
    ),
    evidence: (
      <ul className="list-disc space-y-2 pl-6 text-sm text-[#52525B] dark:text-[#A1A1AA]">
        <LI>
          Published figures are derived from the same retained observation
          history that customers see in their own console - there is no separate
          analytics pipeline with different rules.
        </LI>
        <LI>
          Public Track pages show only aggregated posture for vendors that have
          been made public.
        </LI>
      </ul>
    ),
    methodology: (
      <P>
        This is a statement of editorial policy rather than a study, so there is
        no method to disclose. The measurement method behind any figure we
        publish is documented in{' '}
        <a
          href={researchRoute('how-reliastra-measures-vendor-reliability')}
          className="text-[#0891B2] underline underline-offset-4 dark:text-[#22D3EE]"
        >
          How RELIASTRA measures vendor reliability
        </a>
        .
      </P>
    ),
    related: [
      {
        href: researchRoute('how-reliastra-measures-vendor-reliability'),
        label: 'How RELIASTRA measures vendor reliability',
        description: 'The method any published figure must satisfy.',
      },
      {
        href: researchRoute('the-dependency-gap'),
        label: 'The Dependency Gap',
        description: 'The problem the research programme exists to address.',
      },
    ],
  },
};
