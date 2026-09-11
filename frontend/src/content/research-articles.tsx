import type { ReactNode } from 'react';
import { PUBLIC_ROUTES, SHARE_ROUTES, researchHubRoute, researchRoute } from '@/lib/routes';
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

/**
 * Semantic-only wrappers.
 *
 * These used to carry hard-coded colour and spacing classes, which meant the
 * article body could never be restyled without editing every paragraph of
 * every article. Typography now comes from the `.ob-prose` block in
 * globals.css, so the content file contains content and nothing else.
 */
const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;

const H = ({ children }: { children: ReactNode }) => <h2>{children}</h2>;

const LI = ({ children }: { children: ReactNode }) => <li>{children}</li>;

const CODE = ({ children }: { children: ReactNode }) => <code>{children}</code>;

const PRE = ({ children }: { children: ReactNode }) => (
  <pre>
    <code>{children}</code>
  </pre>
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
        <ul>
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
      <ul>
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

        <H>2. Origins are separate and recorded - and the deployed count is stated</H>
        <P>
          Each origin resolves and connects independently, and every stored
          result carries the origin that produced it. Two origins disagreeing
          is information: it distinguishes a vendor-wide failure from a network
          path problem affecting one route. What RELIASTRA will not do is
          present labels as independence: a region name on a result identifies
          the worker that produced it, and one worker running under two labels
          is one observation point wearing two names.
        </P>
        <P>
          The deployed reality is published alongside the rule: production
          currently probes from one observation origin, so public records state
          what a single origin can support, and corroboration across
          independent points is available to monitoring deployments that
          actually run more than one.
        </P>

        <H>3. Confirmation, not a single failed request</H>
        <P>
          A single failed request is never an incident. Under the shipped
          single-origin topology, an incident opens after the same observation
          point fails a fixed number of consecutive checks (the default is
          two), and recovers after a fixed run of successes. Where a genuine
          fleet of independent origins exists, the stronger rule applies: two
          or more distinct observation points must report failure inside the
          same 60-second window, and recovery must be seen across at least two
          of them. The window and the counts are fixed, small integers rather
          than tunable dials, so the same evidence produces the same verdict
          everywhere.
        </P>
        <P>
          One consequence is stated rather than glossed: the public endpoint
          observations behind the vendor pages are stored, but the public
          pipeline does not open incident records. A vendor page&rsquo;s empty
          incident list is therefore a precise fact about the published-incident
          channel - records that appear there are opened when the organisation
          monitoring the dependency releases the evidence - and never a claim
          that no outage occurred.
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
        <ul>
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
      <ul>
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
          against the expectation configured for that dependency: for the
          public vendor endpoints, an expected HTTP 200 received within a
          15-second deadline, following at most five redirect hops, each
          re-validated against the security policy. A record whose newest
          observation is older than fifteen minutes is marked stale rather
          than healthy.
        </P>
        <P>
          Known limitations, stated plainly: the public observatory probes from
          a single deployed origin, so it cannot distinguish a vendor-wide
          outage from a failure of the path to one geography, and it cannot
          corroborate recovery across regions it does not observe from. We do
          not measure end-user experience, only server-to-server responses.
          Endpoints are not proxies for companies: a status site answers for
          itself, and an API route answers for one route. And a dependency that
          requires authenticated access is checked with credentials you supply,
          which means a credential rotation can present as a target failure -
          one of the reasons the failure taxonomy records the error type rather
          than a boolean.
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

  'is-openai-down': {
    body: (
      <>
        <P>
          “Is OpenAI down?” looks like a yes-or-no question. As phrased, it has
          no yes-or-no answer, and most pages that return one are either lucky
          or dishonest. This article is about what a correct answer looks
          like: the question decomposition, the unit of evidence, what
          RELIASTRA’s public record for OpenAI does measure, what it
          deliberately does not, and a probe you can reproduce from your laptop
          in under a minute.
        </P>

        <H>The question is really five questions</H>
        <P>
          When an engineer types “OpenAI down,” at least five distinct claims
          are collapsed into four words:
        </P>
        <ul>
          <LI>
            Is the <strong>Chat Completions / Responses API</strong> accepting
            and completing requests?
          </LI>
          <LI>
            Is <strong>the model your application calls</strong> serving
            requests? A platform can be up for <CODE>gpt-*</CODE> traffic and
            unavailable for a specific model, a batch queue, or a realtime
            route.
          </LI>
          <LI>
            Is <strong>ChatGPT</strong>, the consumer product, working? It
            shares infrastructure with the API less than people assume, and its
            availability answers neither of the first two questions.
          </LI>
          <LI>
            Is <strong>platform.openai.com</strong> - the dashboard and key
            management - reachable? Outage response often dies here for the
            precise reason you need it.
          </LI>
          <LI>
            Is <strong>status.openai.com</strong>, the incident-reporting
            website, up and admitting something?
          </LI>
        </ul>
        <P>
          Any answer to “is OpenAI down” that does not name which of these it
          addresses is not wrong so much as unusable. An independent record has
          to be narrower than the search query, and then say so.
        </P>

        <H>The unit of evidence</H>
        <P>
          A checkable reliability statement is an atomic observation, not a
          colour. The smallest one RELIASTRA stores reads, in full:{' '}
          <strong>
            at 20:08:38 UTC, from region us-east, an HTTP GET to
            status.openai.com returned 200 in 553 ms
          </strong>
          . Everything on a vendor record - state words, availability
          percentages, latency quantiles, incident lists - is derived from
          observations shaped like that, by published rules, and nothing is
          interpolated between them.
        </P>
        <P>Three properties make an observation usable as evidence:</P>
        <ul>
          <LI>
            <strong>Subject.</strong> A named endpoint, not a brand. “OpenAI”
            is a company; companies are not up or down.
          </LI>
          <LI>
            <strong>Method.</strong> One GET, a 15-second deadline, at most
            five redirect hops (each re-validated against a security policy
            before it is followed), and success defined as the expected status
            code - 200 for these public records. A slow correct response is
            latency, not downtime; a fast 503 is not “up with issues,” it is a
            failed observation.
          </LI>
          <LI>
            <strong>Provenance.</strong> The observation is issued by RELIASTRA
            infrastructure, stored with its region and error type, and is
            timestamped in UTC. It cannot be edited after the fact from the
            public surface.
          </LI>
        </ul>

        <H>What RELIASTRA’s OpenAI record measures today</H>
        <P>
          The public observatory currently observes{' '}
          <CODE>https://status.openai.com</CODE> - OpenAI’s status site itself
          - from a single observation region, on the cadence published on the
          record page (measured, not assumed, because the configured interval
          is not exposed by any public endpoint). From that, the record can
          honestly answer:
        </P>
        <ul>
          <LI>
            <strong>Is OpenAI’s status site up?</strong> Yes/no, per
            observation, with latency, over any stored window.
          </LI>
          <LI>
            <strong>Was it reachable at a given minute?</strong> The
            observation series is retained and queryable, which is what turns
            “during the outage” into a window you can cite.
          </LI>
          <LI>
            <strong>
              Is RELIASTRA reading OpenAI’s self-reported status for this
              record?
            </strong>{' '}
            No. The probe measures the HTTP behaviour of the endpoint. The
            status text on the page is not parsed, ingested, mirrored or
            reconciled - which is exactly why the two records can disagree, and
            why both being readable is the point.
          </LI>
        </ul>
        <P>
          The record cannot honestly answer “is the OpenAI API down?” - yet.
          That answer requires probing the API surface itself, which means
          authenticated synthetic requests (a fixed completion call against a
          test key), per-route and per-model targets, and cost accounting for
          every probe. Those are real features of a dependency-monitoring
          product; on the public observatory they exist only where an endpoint
          is actually listed, and this page will not pre-promise coverage the
          probes have not earned. When API-level targets are added, they appear
          as their own records with their own windows - not as a green dot
          borrowed from the status site.
        </P>

        <H>Why one green dot is not “up”</H>
        <P>
          A single successful observation - even five - is weak evidence, and
          RELIASTRA treats it as such. Two failure classes have to be
          distinguished before any “up” is printed:
        </P>
        <ul>
          <LI>
            <strong>Target failure.</strong> The probe reached the endpoint and
            it failed: timeout, refused connection, unexpected status. This is
            evidence about the vendor.
          </LI>
          <LI>
            <strong>Infrastructure failure.</strong> The probe never ran or
            never left: scheduler stopped, broker down, worker dead, or the
            target was refused by the SSRF policy before any request was sent.
            This is evidence about the observer, and it is recorded as its own
            state so it can never masquerade as vendor downtime - or, in the
            inverse direction, so an empty chart is never shown as “all good.”
          </LI>
        </ul>
        <P>
          On the confirmation side, the deployed rule for a single observation
          point is persistence: consecutive failed checks from the same origin
          (the shipped default is two) before anything is called an incident,
          and consecutive successes to close it. Where genuinely independent
          origins exist, the stronger rule applies: two or more distinct
          observation points must agree inside the same 60-second window. The
          rule refuses to treat one machine reporting under two labels as two
          opinions, because that is precisely how “false positive” incidents
          are born.
        </P>
        <P>
          This is also why the public OpenAI record carries an explicit
          “not observed recently” state: when the newest observation crosses
          the API’s 15-minute staleness threshold, the record stops asserting
          health. Freshness is a precondition of the word “currently,” not a
          footnote under it.
        </P>

        <H>A reproduction you can run</H>
        <P>
          Everything the public record claims about the status endpoint, you
          can partly reproduce yourself. From one origin:
        </P>
        <PRE>{`# twenty one-second samples of status.openai.com
# prints: time  http_code  total_seconds
for i in $(seq 1 20); do
  curl -s -o /dev/null -w '%{time_total}s  HTTP %{http_code}\\n' \\
       --max-time 15 https://status.openai.com
  date -u +%H:%M:%S
  sleep 1
done`}</PRE>
        <P>
          You now have your own observation series with the same semantics as
          RELIASTRA’s - status code, latency, UTC time - which you can compare
          against the stored timeline on{' '}
          <a href={SHARE_ROUTES.trackVendor('openai')}>the OpenAI record</a>{' '}
          or the public API behind it:
        </P>
        <PRE>{`curl -s https://api.reliastra.com/v1/vendors/openai/timeline?window=24h | jq '.points[-5:]'`}</PRE>
        <P>
          Then move one sample to a second vantage point - a home connection,
          a phone hotspot, a VM in another region. The moment your two origins
          disagree, you have discovered the whole subfield of partial and
          regional outages that single-origin monitoring cannot see. The
          observation that any outside observer can make is about a path to an
          endpoint; “the service is down” is a statement about the endpoint’s
          reality from every path, and no number of paths you did not take
          proves it.
        </P>

        <H>What a justified verdict needs</H>
        <P>For “OpenAI API is down” to be a claim RELIASTRA could print, all of the following must exist:</P>
        <ul>
          <LI>
            An observation target that is the API surface - not the status
            site, not the dashboard - with the expected response defined.
          </LI>
          <LI>
            Two or more independent origins, or persistence of failure from
            one, per the published detection rules.
          </LI>
          <LI>
            The failure recorded against that target across consecutive
            checks, with error types distinguishing timeout, transport
            failure and unexpected status.
          </LI>
          <LI>
            A recovery window that closes the incident under the same rules.
          </LI>
        </ul>
        <P>
          Anything less is “an endpoint did not answer from here,” which is
          still useful - during an incident it is often the fastest available
          signal - but it must be stated at exactly that size. This record
          earns authority by refusing the next sentence.
        </P>
      </>
    ),
    evidence: (
      <ul>
        <LI>
          Every figure cited in this article (15-second deadline, five redirect
          hops, expected status 200, the two-check persistence rule, the
          60-second quorum window, the 15-minute staleness threshold) is the
          shipped configuration described in{' '}
          <a href={researchRoute('how-reliastra-measures-vendor-reliability')}>
            the measurement methodology
          </a>
          , and each is readable in the public record that applies it.
        </LI>
        <LI>
          The OpenAI record at{' '}
          <a href={SHARE_ROUTES.trackVendor('openai')}>/track/openai</a>{' '}
          shows the live observation series, the endpoint it applies to, and
          the region it comes from - including its current “no public incident
          records” state and what that absence does and does not mean.
        </LI>
        <LI>
          The curl recipe above measures the same target as the public record;
          comparing your series against the stored timeline is a complete,
          reproducible check of one of RELIASTRA’s claims from your own
          network.
        </LI>
      </ul>
    ),
    methodology: (
      <>
        <P>
          This article is an analysis of a measurement surface, not a study: it
          reports how observations are produced and what they can support. No
          statistics are quoted from third parties, and no incident is asserted
          from anyone’s status page - including the absence of one.
        </P>
        <P>
          Known limits of the claims above: the public record is endpoint-scoped
          and single-origin; the reproduction recipe measures your path, not
          RELIASTRA’s; and any statement about API-level availability beyond the
          listed endpoint is explicitly out of scope until such a target is
          under observation.
        </P>
      </>
    ),
    related: [
      {
        href: SHARE_ROUTES.trackVendor('openai'),
        label: 'OpenAI - live reliability record',
        description: 'The measured record this article describes.',
      },
      {
        href: researchRoute('how-reliastra-measures-vendor-reliability'),
        label: 'How RELIASTRA measures vendor reliability',
        description: 'Scheduling, detection rules and the refusal taxonomy.',
      },
      {
        href: researchRoute('ai-api-outage-evidence'),
        label: 'When an AI API misbehaves: an evidence playbook',
        description: 'What to capture when the answer is “partly down.”',
      },
      {
        href: PUBLIC_ROUTES.track,
        label: 'Public dependency index',
        description: 'Every measured provider, and which endpoint each row means.',
      },
    ],
  },

  'ai-api-outage-evidence': {
    body: (
      <>
        <P>
          An AI-provider incident rarely starts with a red dashboard. It starts
          with your error rate climbing at 0.4%, then 2%, then the queue, the
          cron job, and the support inbox. Somewhere in that first ten minutes
          is the entire difference between a postmortem that assigns cause and a
          postmortem that debates vibes. This playbook is the record you build
          while you are firefighting, so that a month later the window is still
          checkable - by your team, by the vendor, and by whoever reads the
          SLA conversation.
        </P>

        <H>Minutes 0-2: freeze the clock, not the traffic</H>
        <P>
          Before you restart anything, write down - in UTC, with seconds - the
          first error, the last known-good request, and the exact API surface
          involved (route, model, region, client version). Every one of those
          fields is trivial to record now and expensive to reconstruct later,
          and “we think it started around 14:00 our time” cannot be compared
          with anyone’s logs.
        </P>
        <ul>
          <LI>
            <strong>Keep one failing request verbatim</strong> - request id,
            status code, response body. Do not keep keys.
          </LI>
          <LI>
            <strong>Record the error shape distribution</strong>: timeouts,
            connection resets, HTTP 429 with retry-after, 5xx, and
            auth-style 4xx look identical in a stack trace and mean completely
            different things upstream. A credential that expired at a deploy
            window is not an outage; a 429 storm during a capacity event is.
          </LI>
          <LI>
            <strong>Note your own client behaviour</strong>: retry policy,
            concurrency, backoff state. An outage you amplified by hammering is
            still the vendor’s failure - with your contribution on top, and
            they will find it in their logs if you do not find it in yours
            first.
          </LI>
        </ul>

        <H>Minutes 2-10: triangulate with measurement, not vibes</H>
        <P>
          Three independent records exist by the time you look; the skill is
          reading them as three, not blending them into one mood:
        </P>
        <ul>
          <LI>
            <strong>Your telemetry</strong> - what your traffic experienced,
            from one origin set, biased by your routing.
          </LI>
          <LI>
            <strong>The vendor’s status reporting</strong> - written by the
            party whose reliability it describes, scoped to the incidents the
            vendor chose to declare, updated on their schedule. Treat an
            “all systems operational” as an absence of a declaration, not a
            measurement.
          </LI>
          <LI>
            <strong>An outside observation</strong> - what an observer with no
            stake saw of the endpoints it can see. For the providers currently
            in RELIASTRA’s public catalog, that endpoint is the vendor’s status
            site, so the honest reading is narrow and useful at once: a status
            site that stops answering during a widely-reported incident is an
            independent timestamp that something was wrong around the vendor; a
            status site that answers perfectly says nothing about whether the
            API was.
          </LI>
        </ul>
        <P>
          Timestamp each of the three against the same window. You are not
          looking for agreement; you are recording the pattern of
          disagreement, because that pattern is the evidence. “Vendor page
          silent + our errors spiking + measured endpoint healthy” and “all
          three dark at once” are different incidents with different follow-ups,
          and they are distinguishable only if someone wrote the times down.
        </P>

        <H>Correlation is a discipline, not a vibe</H>
        <P>
          When your incident window overlaps a dependency’s failure window, the
          overlap is a fact about two timelines; the causal story is a
          separate claim with separate requirements. The minimum for a
          defensible attribution: the dependency failure started before your
          impact, persisted while it lasted, ended when your recovery ended,
          and no alternative change (deploy, config, key rotation, traffic
          spike) covers the same window. RELIASTRA’s product rule - report
          correlated windows with a confidence level, never assert causation -
          exists because teams that assert more than that lose the argument
          eventually, usually in writing, usually with a counterparty.
        </P>

        <H>The record to keep</H>
        <P>A one-page incident record that survives contact with memory:</P>
        <ul>
          <LI>
            Window: first error UTC → recovery UTC, per error type (a partial
            outage has several).
          </LI>
          <LI>
            Surface: endpoint, route, model, region, client.
          </LI>
          <LI>
            Measurement: your error/latency series; the independent
            observations covering the window, with their source and cadence.
          </LI>
          <LI>
            Vendor statements: what their status page said and at what times -
            screenshotted, because status pages edit history.
          </LI>
          <LI>
            Actions and their timestamps, including your retries and failovers.
          </LI>
        </ul>
        <P>
          If the dependency failure and the vendor silence need to support a
          credit claim, the same structure is what an SLA conversation accepts:
          an independent, timestamped record of the window - not a Slack
          thread. That is the product function RELIASTRA automates: fixed-interval
          observations of the dependencies you name, per-region results stored
          as they happen, and a compiled, checksummed report for the window -
          so the record exists whether or not anyone remembered to look.
        </P>

        <H>What this playbook does not do</H>
        <P>
          It does not prove the vendor was at fault; it makes the question
          answerable. It does not tell you when to fail over - a partial
          regional failure can make a fallback provider worse, not better. And
          it does not survive the absence of data: if you did not record it and
          nothing measured it, the honest entry is “unknown,” which is exactly
          the failure mode the measurement exists to remove.
        </P>
      </>
    ),
    evidence: (
      <ul>
        <LI>
          The three-record triangulation (own telemetry, vendor status
          reporting, independent observation) is the operating model of{' '}
          <a href={PUBLIC_ROUTES.track}>the public observatory</a>; the public
          API and stored timelines cited in{' '}
          <a href={researchRoute('is-openai-down')}>the OpenAI article</a> are
          the same data customer monitoring gets, one trust layer out.
        </LI>
        <LI>
          The correlation rule quoted here - overlapping windows with
          confidence levels, causation explicitly refused - is{' '}
          <a href={PUBLIC_ROUTES.incidentEvidence}>the attribution design</a>,
          published so it can be checked.
        </LI>
        <LI>
          The record format above mirrors the fields of a compiled evidence
          report: dependency, window, per-region observations, methodology,
          checksum.
        </LI>
      </ul>
    ),
    methodology: (
      <>
        <P>
          This playbook describes procedure, not a study: no vendor incident is
          claimed, sampled, or dated here, and no external incident corpus is
          cited - deliberately, because a playbook that imported someone
          else’s incident counts would inherit their definitions. Where the
          article references RELIASTRA behaviour (correlation with confidence,
          checksummed reports), it is the shipped product behaviour described in
          the linked methodology and docs.
        </P>
        <P>
          Limits: the playbook assumes you can timestamp your own errors (if
          your logging is in local time with minute precision, fix that first -
          it is the cheapest reliability improvement available); and the
          public-infra comparison in the “record” section is only available for
          endpoints under observation.
        </P>
      </>
    ),
    related: [
      {
        href: researchRoute('is-openai-down'),
        label: '“Is OpenAI down?” - how to answer the question honestly',
        description: 'What an outside measurement can and cannot establish.',
      },
      {
        href: researchRoute('how-reliastra-measures-vendor-reliability'),
        label: 'How RELIASTRA measures vendor reliability',
        description: 'The rules behind the observations you cite.',
      },
      {
        href: PUBLIC_ROUTES.slaEvidence,
        label: 'SLA evidence',
        description: 'What a credit conversation accepts, and what it does not.',
      },
      {
        href: researchHubRoute('ai-infrastructure'),
        label: 'AI infrastructure hub',
        description: 'Live records for the providers this playbook covers.',
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
        <ul>
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
        <ul>
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
        <ul>
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
      <ul>
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
