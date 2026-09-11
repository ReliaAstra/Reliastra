import type { ResearchArticleBody } from '../research-articles';
import { CODE, H, H3, LI, OL, P, PRE, UL } from './prose';
import { Claim, DataPanel, DataTable, PaperFigure } from '@/components/research/paper-blocks';
import { DenominatorFigure } from '@/components/research/figures';
import { researchRoute } from '@/lib/routes';

/**
 * Body copy for /research/measurement-integrity/availability-record-audit.
 *
 * Every figure in here comes from a response captured on 11 September 2026 and
 * versioned under `research/availability-record-audit/data/`. Where a number is
 * computed rather than read, the computation is shown. Nothing is rounded up to
 * make a point.
 */

export const availabilityRecordAudit: ResearchArticleBody = {
  sections: [
    { id: 'sec-question', label: 'The question' },
    { id: 'sec-record', label: 'The record as published' },
    { id: 'sec-check-1', label: 'Check 1 · window monotonicity' },
    { id: 'sec-check-2', label: 'Check 2 · history depth' },
    { id: 'sec-check-3', label: 'Check 3 · observation density' },
    { id: 'sec-why-100', label: 'Why availability still reads 100%' },
    { id: 'sec-analysis', label: 'Analysis' },
    { id: 'sec-implications', label: 'Security & infrastructure implications' },
    { id: 'sec-conclusion', label: 'Conclusion' },
  ],

  body: (
    <>
      <h2 id="sec-question">The question</h2>
      <P>
        An availability figure is a ratio. The numerator is the observations that succeeded; the
        denominator is the observations that exist. Almost every published availability record
        prints the ratio and suppresses the denominator, which means a reader cannot distinguish
        a figure computed from 25,920 observations from one computed from 595. Both render as
        &ldquo;100.00% over 90 days&rdquo;.
      </P>
      <P>
        This paper asks whether a reader can recover the denominator from the record alone. It
        answers that question by auditing RELIASTRA&rsquo;s own public availability record for the
        OpenAI dependency, on 11 September 2026, using only the public measurement API and the
        rendered page. The audit is deliberately aimed inward. A monitoring vendor that cannot
        find the thin places in its own published record has no business selling the record, and
        the three checks below were written to be run by anyone against any availability record -
        including the one their own monitoring supplier publishes.
      </P>
      <Claim kind="fact">
        RELIASTRA read <CODE>GET /v1/vendors/openai/metrics</CODE>,{' '}
        <CODE>GET /v1/vendors/openai</CODE>, <CODE>GET /v1/vendors?limit=100</CODE> and{' '}
        <CODE>GET /v1/vendors/openai/timeline?window=1h&amp;resolution=1m</CODE> on 11 September
        2026 between 11:34 and 11:39 UTC. All four responses are versioned verbatim in this
        repository.
      </Claim>

      <h2 id="sec-record">The record as published</h2>
      <P>
        The public record for this dependency states, on the rendered page, that RELIASTRA issues
        requests to the vendor&rsquo;s public endpoints from <CODE>us-east</CODE> about every 60
        seconds per region, stores every response with its latency, status code and timestamp, and
        publishes availability over six windows. At the time of the audit the page reported
        availability of 100.00% in every window, from one hour to ninety days, and no public
        incident records.
      </P>
      <P>
        The measurement API returned the aggregates behind those figures:
      </P>
      <DataPanel
        label="Captured · GET /v1/vendors/openai/metrics · 11 September 2026 ≈11:34 UTC"
        source="RELIASTRA public measurement API, unauthenticated. Response stored verbatim at research/availability-record-audit/data/reliastra-openai-metrics-2026-09-11T1134Z.json."
      >
        <DataTable
          caption="Six-window aggregate exactly as returned by the API"
          head={['Window', 'Observations', 'Availability', 'Mean latency', 'p95 latency']}
          rows={[
            ['1 hour', '12', '100.0%', '624.00 ms', '798.31 ms'],
            ['6 hours', '69', '100.0%', '613.48 ms', '849.98 ms'],
            ['24 hours', '277', '100.0%', '599.65 ms', '895.41 ms'],
            ['7 days', '595', '100.0%', '570.67 ms', '840.33 ms'],
            ['30 days', '595', '100.0%', '570.67 ms', '840.33 ms'],
            ['90 days', '595', '100.0%', '570.67 ms', '840.33 ms'],
          ]}
          note="The 30-day and 90-day rows are not similar to the 7-day row. They are identical in all four fields, to the centisecond on the 95th percentile."
        />
      </DataPanel>
      <P>
        The vendor detail record supplies the observation topology, which matters because a single
        origin bounds everything the record can claim:
      </P>
      <PRE>{`GET /v1/vendors/openai      →  2026-09-11T11:39:38Z

{
  "vendor_name": "openai",
  "category": "ai",
  "created_at": "2026-08-15T22:23:10.909964Z",
  "last_check_at": "2026-09-11T11:39:38.006808Z",
  "endpoints": [
    {
      "endpoint_url": "https://status.openai.com",
      "regions": ["us-east"],
      "health_status": "operational",
      "is_active": true
    }
  ]
}`}</PRE>
      <P>
        One endpoint, one region, and a record created on 15 August 2026 - 26 days and 13 hours
        before this read. That creation date is the fixed point the rest of the audit measures
        against.
      </P>

      <h2 id="sec-check-1">Check 1 · window monotonicity</h2>
      <P>
        The six windows are nested. One hour is a subset of six hours, which is a subset of
        twenty-four hours, and so on to ninety days. Observation counts over nested windows must
        therefore be monotonically non-decreasing, and they should be strictly increasing whenever
        the dependency was probed during the additional time. The API&rsquo;s own source defines
        the windows as <CODE>1h, 6h, 24h, 7d = 168h, 30d = 720h, 90d = 2160h</CODE>, so the
        nesting is a property of the implementation rather than an assumption.
      </P>
      <Claim kind="observation">
        The counts are 12, 69, 277, 595, 595, 595. Monotonicity holds. Strict increase holds up to
        seven days and then stops: the 30-day and 90-day windows contain exactly as many
        observations as the 7-day window.
      </Claim>
      <P>
        A flat count is not by itself proof of an empty window - a dependency that was not probed
        for three months would also produce a flat count. The stronger signal is that the
        aggregates are identical, not merely equal in count. Mean latency is 570.67 ms in all
        three windows. The 95th percentile is 840.33 ms in all three.
      </P>
      <Claim kind="inference">
        Two different observation sets of 595 samples drawn from a latency distribution with a
        mean near 570 ms and a p95 near 840 ms will not, in general, share a mean and a p95 to two
        decimal places. Identical aggregates across three nested windows are evidence that the
        three windows are aggregating one identical set of observations - that is, the store holds
        no observation older than the oldest one inside the 7-day window.
      </Claim>
      <P>
        The check generalises. For any availability API that exposes more than one window,
        compare the aggregates rather than the counts: <CODE>count(W₁) = count(W₂)</CODE> is
        suspicious, <CODE>count, mean and p95 all equal across W₁ and W₂</CODE> is close to
        conclusive, because it removes the coincidence that a different sample could have the same
        size.
      </P>

      <h2 id="sec-check-2">Check 2 · history depth</h2>
      <P>
        If the store holds <CODE>n</CODE> observations taken at a fixed interval{' '}
        <CODE>i</CODE>, those observations span approximately <CODE>n × i</CODE> seconds. The
        interval is not published on any public endpoint - a gap this paper returns to below - but
        it is declared in the measurement system&rsquo;s own source, where{' '}
        <CODE>check_interval_seconds</CODE> defaults to <CODE>300</CODE> and the public one-hour
        timeline corroborates it.
      </P>
      <DataPanel
        label="Captured · GET /v1/vendors/openai/timeline?window=1h&resolution=1m · 11:39:46 UTC"
        source="RELIASTRA public measurement API. Twelve one-minute buckets returned, each with observation_count = 1."
      >
        <PRE>{`bucket starts:  10:43  10:48  10:53  10:58  11:03  11:08  11:13
                11:18  11:23  11:28  11:34  11:39      (UTC, 11 Sep 2026)

deltas:         300    300    300    300    300    300
                300    300    300    360    300         seconds

min 300   median 300   mean 305.5   max 360`}</PRE>
      </DataPanel>
      <P>
        The interval is 300 seconds. Applying it to the deepest window:
      </P>
      <PRE>{`595 observations × 300 s  =  178,500 s
                          =  49.58 hours
                          =  2.07 days`}</PRE>
      <Claim kind="inference">
        The observation history behind the published 30-day and 90-day availability figures covers
        approximately 2.1 days. The record has been configured for 26.5 days. The rendered page
        nonetheless presents the figure as a 90-day measurement.
      </Claim>
      <P>
        That inference can be checked against an independent quantity. If the store holds a
        contiguous 49.6-hour history, the 24-hour window should contain the most recent
        observations and the remainder should sit in the 24-to-49.6-hour band:
      </P>
      <PRE>{`595 total − 277 in the last 24 h   =  318 observations
318 observations over 25.6 h       =  290 s apart`}</PRE>
      <P>
        290 seconds against a configured interval of 300 seconds. The two figures are consistent,
        which means the &ldquo;contiguous 2.1-day history&rdquo; model explains both the 24-hour
        count and the 7-day count with a single parameter. That is what makes it worth stating as
        an inference rather than a guess.
      </P>

      <h2 id="sec-check-3">Check 3 · observation density</h2>
      <P>
        Density is the ratio of observations that exist to observations that should exist:
      </P>
      <PRE>{`density(window) = total_observations / (window_seconds / interval)`}</PRE>
      <P>
        A healthy record with deep history has a flat density across windows - slightly below 1.0,
        because probes are occasionally missed. A record whose history is shallower than its
        longest window has a density that falls as the window grows, because the denominator keeps
        expanding into time for which no observations exist.
      </P>
      <DataPanel label="Derived · expected versus observed observations at a 300-second interval">
        <DataTable
          caption="Density per window, computed from the captured aggregates"
          head={['Window', 'Expected', 'Observed', 'Density', 'Missing']}
          rows={[
            ['1 hour', '12', '12', '100.0%', '0'],
            ['6 hours', '72', '69', '95.8%', '3'],
            ['24 hours', '288', '277', '96.2%', '11'],
            ['7 days', '2,016', '595', '29.5%', '1,421'],
            ['30 days', '8,640', '595', '6.9%', '8,045'],
            ['90 days', '25,920', '595', '2.3%', '25,325'],
          ]}
          note="Expected counts assume the configured 300-second interval held for the whole window. The script takes the interval as an argument so a different deployment can be audited without editing it."
        />
      </DataPanel>
      <PaperFigure
        n="1"
        caption="The 90-day availability figure is computed over the filled segment - 595 observations, 2.3% of the window's implied sample - but is labelled with the full window. Density falls monotonically from the 24-hour window outward, which is the signature of shallow history rather than of a failing endpoint: an endpoint that was failing would depress availability, not observation count."
      >
        <DenominatorFigure />
      </PaperFigure>
      <Claim kind="observation">
        Density is flat and near-complete for the recent windows - 100.0% at one hour, 95.8% at six
        hours, 96.2% at twenty-four hours - and then collapses to 29.5% at seven days, 6.9% at
        thirty days and 2.3% at ninety days.
      </Claim>
      <P>
        The shape matters. A measurement system that is failing produces a density deficit that is
        roughly uniform across windows, because the same scheduler is responsible for all of them.
        A measurement system with shallow history produces a deficit that grows with the window.
        The two failure modes have different causes and different fixes, and density is the
        cheapest signal that separates them.
      </P>

      <H>Why the record does not disclose this</H>
      <P>
        None of this is hidden by design. The API returns{' '}
        <CODE>total_observations</CODE> in every window, and the rendered page prints the
        observation count beside the availability figure - which is why this audit was possible
        from the outside. What the record does not do is compare the count to the window it is
        labelled with. The count is printed; the expectation is not. A reader who does not know
        the probe interval cannot compute the expected count, and the interval is not exposed on
        any public endpoint.
      </P>
      <P>
        Worse, the interval the record <em>does</em> state is wrong. The page reports that checks
        arrive about every 60 seconds. The captured timeline shows them arriving every 300 seconds.
        A reader who took the record at its word and computed an expected count for the 24-hour
        window would derive 1,440 rather than 288, conclude that the record was missing 81% of its
        observations, and be wrong by a factor of five. The companion paper{' '}
        <a href={researchRoute('probe-interval-from-bucketed-telemetry')}>
          Estimating probe interval from bucketed telemetry
        </a>{' '}
        establishes why the record printed 60 and gives the corrected estimator.
      </P>
      <Claim kind="limitation">
        This audit would have been wrong by a factor of five had it trusted the cadence the record
        states. It did not, because the interval was taken from the measurement system&rsquo;s
        source and cross-checked against bucket timestamps. A third party without access to that
        source would have no way to catch the error from the public record alone.
      </Claim>

      <h2 id="sec-why-100">Why availability still reads 100%</h2>
      <P>
        It is worth being precise about what this audit does <em>not</em> find. The availability
        figures are not wrong. The endpoint responded to every probe that was issued, in every
        window, with a status code and no transport error. Availability is defined as the share of
        observations that returned a status code with no transport error, and by that definition
        100.0% is the correct answer for each window.
      </P>
      <P>
        The finding is about the sample. A 100.0% figure over 595 observations is a strong
        measurement of those 595 observations and a weak measurement of a 90-day period. Nothing
        in the record distinguishes those two statements, and a reader - or a retrieval system
        quoting the page - has no way to know which one they are looking at.
      </P>
      <Claim kind="observation">
        This is the specific failure mode the audit exists to detect: a figure that is arithmetically
        correct and evidentially thin, published without the property that would let a reader tell.
      </Claim>

      <h2 id="sec-analysis">Analysis</h2>
      <P>
        Three distinct defects are visible, and they are worth separating because they have
        different owners.
      </P>
      <H3>Absent expectation</H3>
      <P>
        The record publishes an observation count but no expected count. The count is a raw number;
        the expectation is what turns it into evidence. Without the probe interval, a reader cannot
        tell whether 595 observations is a full 90 days or two days of history, and the interval is
        not on any public endpoint. This is a disclosure gap in the public API, and it is cheap to
        close: one field.
      </P>
      <H3>Window labels the data cannot honour</H3>
      <P>
        The API offers six windows because the aggregation supports six ranges, not because the
        store holds ninety days of observations. The rendered page then offers all six to a reader
        who has no way to know which of them the data can fill. A window selector that renders
        &ldquo;90 days&rdquo; over two days of history is a labelling defect: the UI is promising a
        property of the data that the data does not have.
      </P>
      <H3>A stated cadence that is not the measured one</H3>
      <P>
        The record states 60 seconds and measures 300. The cause is analysed in the companion
        paper; the consequence here is that the one number a reader would need to audit the record
        is the one number the record gets wrong. The two defects compound: an incorrect cadence
        makes an absent expectation unrecoverable, because the reader&rsquo;s best available
        substitute for the expectation is the cadence.
      </P>
      <Claim kind="inference">
        The three defects are independent but they fail together. Any one of them alone is
        survivable - a reader with the correct interval can reconstruct the expected count, and a
        reader who knows the history is shallow can discount the long windows. All three at once
        leave the record unauditable from the outside, which is precisely the property an
        independent availability record exists to have.
      </Claim>

      <H3>What the audit cannot distinguish</H3>
      <P>
        A 2.1-day history has at least three possible causes, and the public API does not
        distinguish them:
      </P>
      <UL>
        <LI>
          A retention job pruned older observations. RELIASTRA&rsquo;s published methodology states
          that observations are retained per plan and pruned by scheduled jobs, which is a
          legitimate design - but a pruned store should not offer a window longer than its
          retention.
        </LI>
        <LI>
          The scheduler or a worker was unavailable for most of the 26.5 days the record has
          existed. This would be an operational incident against the measurement system itself, and
          the density signal in Check 3 is exactly what would detect it.
        </LI>
        <LI>
          An aggregation cap limits the number of observations a window will return. This would be
          a defect in the aggregation rather than in the data.
        </LI>
      </UL>
      <P>
        All three produce identical public API output. Distinguishing them requires the operator&rsquo;s
        view - retention configuration, scheduler health, worker logs - which is why the
        recommendation below is that the record state its own history depth rather than leaving the
        reader to infer it.
      </P>

      <h2 id="sec-implications">Security &amp; infrastructure implications</h2>
      <P>
        An availability record is an evidentiary artifact. It is what an engineer brings to a
        vendor conversation about a service credit, what an incident reviewer reconstructs a
        timeline from, and increasingly what a retrieval system quotes when someone asks whether a
        dependency is reliable. Its evidentiary value is the product of its correctness and its
        disclosed provenance, and a record that is correct but under-described fails in the same
        place a record that is wrong fails: at the moment someone relies on it.
      </P>
      <P>
        Three consequences follow for anyone who consumes or produces availability data.
      </P>
      <H3>Availability is blind to the absence of measurement</H3>
      <P>
        A scheduler that stops produces no failed observations, so it produces no availability
        deficit. The record stays green while the evidence stops accumulating. Any monitoring
        system whose only health signal is availability will report healthy through a total failure
        of its own measurement pipeline. Density - observations against expectation - is the
        signal that detects it, and it must be computed from the configured interval, not from a
        cadence the record infers about itself.
      </P>
      <H3>Window length is a claim about retention</H3>
      <P>
        When a monitoring product offers a 90-day view, a customer reasonably reads that as
        &ldquo;we hold 90 days&rdquo;. If retention is shorter, every figure in the longer windows
        is a shorter-window figure wearing a longer label - and in a service-credit conversation
        that mislabelling is material, because the vendor&rsquo;s SLA period and the
        customer&rsquo;s evidence period no longer match. Window length should be derived from
        retention, or the record should state the depth it actually covers.
      </P>
      <H3>Telemetry integrity is a security property</H3>
      <P>
        Incident attribution depends on the completeness of the observation record as much as on
        its accuracy. An incomplete record does not merely miss failures; it makes absences
        ambiguous. When an availability record shows no failures in a window that also contains
        almost no observations, &ldquo;no failures were recorded&rdquo; and &ldquo;no measurements
        were taken&rdquo; become indistinguishable - and an attacker who can suppress measurements
        has achieved the same evidentiary effect as one who can falsify them, at lower cost and
        with less detectability. Publishing the denominator is what closes that ambiguity, which
        is why this is a security concern and not only a data-quality one.
      </P>

      <h2 id="sec-conclusion">Conclusion</h2>
      <P>
        A reader can recover the denominator of a published availability figure, but only if the
        record discloses enough to do it. The record audited here discloses its observation counts,
        which is more than most, and omits the probe interval and the history depth, which are the
        two facts that give the counts meaning. Three checks - window monotonicity across nested
        aggregates, history depth from count and interval, and expected-versus-observed density -
        are sufficient to expose the gap in every case where the interval is knowable, and to
        bound the uncertainty where it is not.
      </P>
      <P>
        Applied to RELIASTRA&rsquo;s own public record on 11 September 2026, those checks found
        that the 30-day and 90-day availability figures were computed over approximately 2.1 days
        of observations, that density fell from 96.2% at 24 hours to 2.3% at 90 days, and that the
        cadence the record states is five times shorter than the cadence it measures. Availability
        was 100.0% throughout and remains so; the finding is about the size of the sample, not the
        correctness of the ratio.
      </P>
      <P>
        The general result is the one worth keeping: <strong>an availability figure without its
        denominator, its window bounds and its probe interval is not evidence, it is a claim</strong>.
        Publishing those three alongside every percentage costs one field each and converts the
        claim into something a reader - or a machine - can check.
      </P>
    </>
  ),

  evidence: (
    <>
      <P>
        All observations below were read from public, unauthenticated endpoints on 11 September
        2026. Raw responses are versioned in this repository and the audit script re-derives every
        derived figure from those bytes.
      </P>
      <DataPanel
        label="Captured · GET /v1/vendors?limit=100 · ≈11:34 UTC"
        source="RELIASTRA public measurement API. The full tracked-vendor catalog at the time of the audit."
      >
        <DataTable
          caption="Every public dependency under observation at the time of the audit"
          head={['Vendor', 'Category', 'Recent status', 'Latency', 'Last check (UTC)']}
          rows={[
            ['auth0', 'auth', 'operational', '164.90 ms', '11:34:07'],
            ['cloudflare', 'cdn', 'operational', '82.26 ms', '11:34:05'],
            ['openai', 'ai', 'operational', '830.66 ms', '11:34:08'],
            ['stripe', 'payments', 'operational', '86.58 ms', '11:34:06'],
            ['twilio', 'communications', 'operational', '73.21 ms', '11:34:06'],
          ]}
          note="Five dependencies, one observation origin (us-east), all created 2026-08-15T22:23:10Z. The catalog is reproduced in full because the audit's scope claim depends on it: this is the entire public corpus, not a selection from it."
        />
      </DataPanel>
      <DataPanel label="Derived · the audit table">
        <DataTable
          caption="Everything Check 1 through Check 3 produce, in one table"
          head={['Window', 'Window seconds', 'Expected', 'Observed', 'Density', 'Availability']}
          align="right"
          rows={[
            ['1 hour', '3,600', '12', '12', '100.0%', '100.0%'],
            ['6 hours', '21,600', '72', '69', '95.8%', '100.0%'],
            ['24 hours', '86,400', '288', '277', '96.2%', '100.0%'],
            ['7 days', '604,800', '2,016', '595', '29.5%', '100.0%'],
            ['30 days', '2,592,000', '8,640', '595', '6.9%', '100.0%'],
            ['90 days', '7,776,000', '25,920', '595', '2.3%', '100.0%'],
          ]}
          note="Derived from the captured metrics response at an interval of 300 s. Reproduce with: python3 research/availability-record-audit/audit.py --interval 300"
        />
      </DataPanel>
      <OL>
        <LI>
          The vendor catalog contains five public dependencies, all reporting{' '}
          <CODE>operational</CODE>, all observed from <CODE>us-east</CODE>.
        </LI>
        <LI>
          The 30-day and 90-day windows return aggregates identical to the 7-day window in count,
          mean latency and 95th-percentile latency.
        </LI>
        <LI>
          The one-hour timeline returns 12 buckets at 300-second spacing, establishing the probe
          interval independently of any configuration claim.
        </LI>
        <LI>
          595 observations at 300 seconds span 49.6 hours; the 24-hour count of 277 implies 318
          observations over the remaining 25.6 hours, or 290 seconds apart - consistent with the
          same interval.
        </LI>
        <LI>
          Density falls from 100.0% at one hour to 2.3% at ninety days. Availability is 100.0% in
          every window.
        </LI>
        <LI>
          The rendered public record states a 60-second cadence. The captured timeline shows 300
          seconds.
        </LI>
      </OL>
    </>
  ),

  methodology: (
    <>
      <P>
        Six read-only HTTP GET requests were issued against public endpoints on 11 September 2026
        between 11:34 and 11:39 UTC. No authenticated endpoint was used, no request mutated state,
        and no customer data was accessed. Each response body was stored verbatim as returned.
      </P>
      <H3>Derivation rules</H3>
      <UL>
        <LI>
          <CODE>expected_observations = floor(window_seconds / interval)</CODE>, with{' '}
          <CODE>interval</CODE> taken from the measurement system&rsquo;s declared default of 300
          seconds and corroborated against bucket timestamps in the captured timeline. The interval
          is a script argument, not a constant, because a deployment may override it.
        </LI>
        <LI>
          <CODE>density = total_observations / expected_observations</CODE>, reported to one
          decimal place.
        </LI>
        <LI>
          <CODE>history_depth ≈ total_observations × interval</CODE>, reported in hours and days.
          This assumes a constant interval and is stated as an approximation throughout.
        </LI>
      </UL>
      <H3>What was not done</H3>
      <P>
        No attempt was made to load the endpoint, to probe it directly, or to compare RELIASTRA&rsquo;s
        observations against a second measurement source. The audit evaluates the record, not the
        dependency. No inference in this paper relies on data that is not versioned in this
        repository.
      </P>
      <H3>Reproduction</H3>
      <PRE>{`# Offline, against the captured payloads
python3 research/availability-record-audit/audit.py

# Live, against the public API
python3 research/availability-record-audit/audit.py \\
  --base https://api.reliastra.com/v1 \\
  --vendor openai \\
  --interval 300`}</PRE>
      <P>
        The script is stdlib-only and prints the audit table, the monotonicity verdict, the inferred
        history depth and the interval-estimator comparison. Its exit status is non-zero when a
        window fails the monotonicity or density checks, so it can be run as a continuous control
        rather than a one-off investigation.
      </P>
    </>
  ),

  related: [],
};
