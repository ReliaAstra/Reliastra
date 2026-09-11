import type { ResearchArticleBody } from '../research-articles';
import { CODE, H, H3, LI, OL, P, PRE, UL } from './prose';
import { Claim, DataPanel, DataTable, PaperFigure } from '@/components/research/paper-blocks';
import { BucketDensityFigure } from '@/components/research/figures';
import { researchRoute } from '@/lib/routes';

/**
 * Body copy for
 * /research/measurement-integrity/probe-interval-from-bucketed-telemetry.
 *
 * Documents a real defect in RELIASTRA's public record, the bound that caused
 * it, the correction, and the regression test built from the captured payload.
 */

export const probeIntervalPaper: ResearchArticleBody = {
  sections: [
    { id: 'sec-defect', label: 'The defect' },
    { id: 'sec-estimator', label: 'The estimator as deployed' },
    { id: 'sec-bound', label: 'The bound' },
    { id: 'sec-two-cadences', label: 'Two cadences on one page' },
    { id: 'sec-fix', label: 'The correction' },
    { id: 'sec-general', label: 'The general lesson' },
    { id: 'sec-conclusion', label: 'Conclusion' },
  ],

  body: (
    <>
      <P>
        A monitoring record that does not know its own probe interval cannot state an expected
        observation count, and an expected observation count is what turns an availability figure
        into evidence. RELIASTRA&rsquo;s public record therefore estimates the interval from the
        telemetry it already holds. On 11 September 2026 that estimate was wrong by a factor of
        five, in a direction that is not accidental and that no amount of additional data at the
        same resolution would have corrected.
      </P>
      <P>
        This paper states the estimator as deployed, proves the bound that caused the error, shows
        the two contradictory cadences the production record published simultaneously, and gives
        the correction - which is now implemented in the observatory with a regression test built
        from the captured payload.
      </P>

      <h2 id="sec-defect">The defect</h2>
      <P>
        The public record for the OpenAI dependency stated, in its summary and in its observation
        network table, that checks arrive &ldquo;about every 60 seconds per region&rdquo;. The same
        page&rsquo;s telemetry panel stated, for the same dependency and the same period,
        &ldquo;≈ every 300s in this window&rdquo;.
      </P>
      <P>
        The captured timeline settles which is right:
      </P>
      <DataPanel
        label="Captured · GET /v1/vendors/openai/timeline?window=1h&resolution=1m · 2026-09-11T11:39:46Z"
        source="RELIASTRA public measurement API. Response stored verbatim at research/availability-record-audit/data/reliastra-openai-timeline-1h-1m-2026-09-11T1139Z.json."
      >
        <PRE>{`"window": "1h", "resolution": "1m", "region": "us-east",
"from": "2026-09-11T10:39:46.129008Z",
"to":   "2026-09-11T11:39:46.129008Z",

points (12, each observation_count = 1):
  10:43:00  10:48:00  10:53:00  10:58:00  11:03:00  11:08:00
  11:13:00  11:18:00  11:23:00  11:28:00  11:34:00  11:39:00

deltas (s): 300 300 300 300 300 300 300 300 300 360 300
median 300 · mean 305.5 · min 300 · max 360`}</PRE>
      </DataPanel>
      <Claim kind="observation">
        Twelve observations arrived in the sixty-minute window, spaced 300 seconds apart with one
        360-second gap. The API returned twelve points for a window that contains sixty one-minute
        buckets: empty buckets are omitted from the response entirely.
      </Claim>
      <P>
        The true interval is 300 seconds. The record said 60.
      </P>

      <h2 id="sec-estimator">The estimator as deployed</h2>
      <P>
        The cadence printed on the record is produced by this function, in{' '}
        <CODE>frontend/src/lib/track-api.ts</CODE>:
      </P>
      <PRE>{`const RESOLUTION_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600,
};

export function observedCadenceSeconds(timeline: TrackTimeline | null): number | null {
  if (!timeline || !timeline.points.length) return null;
  const bucket = RESOLUTION_SECONDS[timeline.resolution];
  if (!bucket) return null;
  const counts = timeline.points.map((p) => p.observation_count).filter((n) => n > 0);
  if (!counts.length) return null;
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  if (mean <= 0) return null;
  return Math.round(bucket / mean);
}`}</PRE>
      <P>
        The reasoning behind it is sound in outline: if a bucket of length <CODE>b</CODE> holds{' '}
        <CODE>m</CODE> observations on average, an observation arrives every <CODE>b/m</CODE>{' '}
        seconds. On the captured series, every one of the twelve occupied buckets holds exactly one
        observation, so <CODE>m = 1.0</CODE> and the function returns{' '}
        <CODE>round(60 / 1.0) = 60</CODE>.
      </P>
      <P>
        The flaw is in the phrase &ldquo;holds <CODE>m</CODE> observations on average&rdquo;. The
        mean is taken over <em>occupied</em> buckets only - the <CODE>.filter((n) =&gt; n &gt; 0)</CODE>{' '}
        is explicit - and on this API path the filter is redundant, because the API never returns
        an empty bucket at all. The forty-eight buckets that carry the evidence of a sparse
        schedule do not exist in the input. The estimator sees twelve dense buckets and concludes a
        dense schedule.
      </P>

      <h2 id="sec-bound">The bound</h2>
      <P>
        This is not a data-quality problem. It is a property of the estimator, and it can be stated
        exactly.
      </P>
      <Claim kind="inference">
        Let <CODE>i</CODE> be the true probe interval and <CODE>b</CODE> the bucket length. For a
        regular schedule, the estimator <CODE>round(b / mean observations per occupied bucket)</CODE>{' '}
        returns <CODE>min(i, b)</CODE>. It cannot return a value greater than <CODE>b</CODE> for any
        input.
      </Claim>
      <P>The argument is short:</P>
      <OL>
        <LI>
          An occupied bucket spans <CODE>b</CODE> seconds. The number of probes inside it is at
          most <CODE>ceil(b/i)</CODE>, and at least 1 by the definition of occupied.
        </LI>
        <LI>
          When <CODE>i ≤ b</CODE>, a regular schedule places <CODE>b/i</CODE> probes in every
          bucket, so the mean over occupied buckets is <CODE>b/i</CODE> and the estimator returns{' '}
          <CODE>b / (b/i) = i</CODE>. Correct.
        </LI>
        <LI>
          When <CODE>i &gt; b</CODE>, no bucket can hold more than one probe, so every occupied
          bucket holds exactly one, the mean is 1, and the estimator returns <CODE>b</CODE>.
          Wrong - and wrong by the ratio <CODE>i/b</CODE>.
        </LI>
        <LI>
          Since the mean over occupied buckets is never below 1, <CODE>b / mean ≤ b</CODE> always.
          The bucket length is a hard ceiling on the estimator&rsquo;s output.
        </LI>
      </OL>
      <PaperFigure
        n="1"
        caption="Sixty one-minute buckets in the captured window; twelve returned by the API, one every five. Every occupied bucket holds exactly one observation, so the mean is 1.0 and the estimator returns the bucket length - 60 seconds - for a 300-second schedule. The empty columns carry the evidence of the true interval and never reach the estimator."
      >
        <BucketDensityFigure />
      </PaperFigure>
      <P>
        On the captured series, <CODE>i = 300</CODE> and <CODE>b = 60</CODE>, so the estimator
        returns <CODE>min(300, 60) = 60</CODE>. Exactly what the record printed. The fivefold error
        is the resolution ratio, not a rounding artifact.
      </P>
      <P>
        The bound also explains why the error is invisible from inside the system. Any test written
        against a fixture with dense buckets - one observation per minute - exercises case 2 and
        passes. The failure mode only appears when the schedule is sparser than the resolution, and
        a hand-written fixture rarely is, because the author of the fixture is thinking about the
        estimator rather than about the deployment.
      </P>

      <h2 id="sec-two-cadences">Two cadences on one page</h2>
      <P>
        The production record published both numbers at once, and the reason is worth separating
        from the bound because it is a second, independent defect.
      </P>
      <P>
        Two components each computed the cadence, over different timelines:
      </P>
      <DataPanel label="Why one page said 60 and 300">
        <DataTable
          caption="The same estimator, two resolutions, two answers"
          head={['Component', 'Window', 'Resolution', 'Bucket b', 'True i', 'min(i,b)', 'Printed']}
          rows={[
            ['Summary / observation network', '1h', '1m', '60 s', '300 s', '60 s', 'about every 60 seconds'],
            ['Telemetry panel', '24h', '5m', '300 s', '300 s', '300 s', '≈ every 300s'],
          ]}
          note="The telemetry panel was accidentally right: its bucket length happens to equal the true interval, so the saturated estimator returns the correct value. Correctness by coincidence is not correctness."
        />
      </DataPanel>
      <Claim kind="observation">
        The record&rsquo;s own caption states that cadence &ldquo;is measured from the density of
        observations in the last hour, not read from a configured schedule&rdquo;. That is a true
        description of a measurement that returns the wrong answer, which is the worst combination:
        the provenance is disclosed, and the disclosure makes the error look verified.
      </Claim>
      <P>
        The telemetry panel&rsquo;s value was correct for a reason that has nothing to do with the
        estimator being right: at five-minute resolution the bucket length coincides with the true
        interval, so the saturated output happens to equal the truth. Had the schedule been 600
        seconds, the same panel would have printed 300. This is the general hazard of an estimator
        whose error is a function of its input resolution - it produces correct answers often
        enough to be trusted, and wrong answers that look identical in form.
      </P>

      <h2 id="sec-fix">The correction</h2>
      <P>
        Two estimators recover the true interval from the same twelve points, and neither depends on
        bucket length:
      </P>
      <UL>
        <LI>
          <strong>Median inter-bucket delta.</strong> The differences between consecutive occupied
          bucket starts, summarised by median rather than mean so a single gap does not move it. On
          the captured series: median 300 s, mean 305.5 s.
        </LI>
        <LI>
          <strong>Window length over observation count.</strong> The timeline carries{' '}
          <CODE>from</CODE> and <CODE>to</CODE>; dividing the window by the total observation count
          gives <CODE>3600 / 12 = 300</CODE> s.
        </LI>
      </UL>
      <P>
        Neither estimator is right in every regime, so the shipped implementation selects between
        them by the one fact that decides which applies: how many observations share a bucket.
        When the mean exceeds one, the schedule is finer than the resolution and density carries
        the interval - the original formula, which was correct in exactly that case. When the mean
        is one, density carries nothing and the spacing does. The median rather than the mean of
        the deltas, so a single missed probe does not move the answer. Window length over count is
        the fallback when only one occupied bucket exists, so no spacing can be formed. When none
        of the three can be computed the function returns null: printing the bucket length there
        would reproduce the original error.
      </P>
      <PRE>{`export function observedCadenceSeconds(timeline: TrackTimeline | null): number | null {
  if (!timeline || !timeline.points.length) return null;

  const bucket = RESOLUTION_SECONDS[timeline.resolution];
  const occupied = timeline.points.filter((p) => p.observation_count > 0);
  if (!occupied.length) return null;

  const total = occupied.reduce((sum, p) => sum + p.observation_count, 0);
  const mean = total / occupied.length;

  // Regime 1: denser than the resolution.
  if (bucket && mean > 1) return Math.max(1, Math.round(bucket / mean));

  // Regime 2: sparser than the resolution - measure the spacing instead.
  const starts = occupied
    .map((p) => Date.parse(p.timestamp))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (starts.length >= 2) {
    const deltas: number[] = [];
    for (let i = 1; i < starts.length; i += 1) {
      const delta = (starts[i] - starts[i - 1]) / 1000;
      if (delta > 0) deltas.push(delta);
    }
    if (deltas.length) {
      deltas.sort((a, b) => a - b);
      const mid = Math.floor(deltas.length / 2);
      const median =
        deltas.length % 2 === 1 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
      return Math.max(1, Math.round(median));
    }
  }

  // Fallback: a single occupied bucket, so no spacing exists.
  const from = Date.parse(timeline.from);
  const to = Date.parse(timeline.to);
  if (Number.isFinite(from) && Number.isFinite(to) && total > 0) {
    return Math.max(1, Math.round((to - from) / 1000 / total));
  }

  // Not derivable. Printing the bucket length here is exactly the error this
  // function was rewritten to stop making.
  return null;
}`}</PRE>
      <P>
        On the captured payload the corrected function returns 300. The regression test is the
        captured series itself, stored verbatim, so the test fails if the saturated behaviour is
        ever reintroduced and cannot be satisfied by a fixture that does not express the failure
        mode.
      </P>
      <Claim kind="recommendation">
        Publish the configured interval instead of inferring it. No public endpoint exposes{' '}
        <CODE>check_interval_seconds</CODE>, which is why the record estimates at all. One field in
        the vendor detail response removes the estimation problem entirely and makes every expected
        observation count externally checkable - which is the change the companion availability
        audit asks for.
      </Claim>

      <h2 id="sec-general">The general lesson</h2>
      <P>
        The defect is a specific instance of a general rule about telemetry aggregation:
      </P>
      <blockquote>
        Any rate or frequency estimated from post-aggregation counts is bounded by the resolution of
        the aggregation. The information the estimate needs - when events actually occurred - is
        destroyed by the aggregation, and no cleverness in the estimator recovers it.
      </blockquote>
      <P>
        The same constraint appears wherever telemetry is bucketed. A rate computed over a range
        needs at least two samples inside that range, and its resolution bounds what it can
        express; the Prometheus documentation states the constraint explicitly for{' '}
        <CODE>rate()</CODE>. Downsampled metrics cannot answer questions finer than the downsample
        interval, and a counter that is reset inside a bucket is indistinguishable from a smaller
        increase. Aggregation is lossy by design, and the loss is one-directional: fine detail is
        discarded and cannot be reconstructed from the aggregate.
      </P>
      <P>Three practices follow:</P>
      <OL>
        <LI>
          Estimate rates from timestamps when you have them. Bucket starts are timestamps; use
          their spacing rather than their occupancy.
        </LI>
        <LI>
          When you must estimate from counts, include the empty buckets in the denominator. The
          ratio of occupied to total buckets carries the sparsity information; the mean over
          occupied buckets discards it. On this API path that is impossible - empty buckets are not
          returned - which is itself a design consequence worth noting: an API that omits empty
          buckets makes density unrecoverable from a single response.
        </LI>
        <LI>
          State the resolution beside any derived rate. &ldquo;Every 60 seconds, derived from
          one-minute buckets&rdquo; would have made the saturation obvious to a reader; the same
          number without its provenance reads as a measurement.
        </LI>
      </OL>
      <Claim kind="limitation">
        The bound is exact for a regular schedule. Under jitter, retries or a mid-window schedule
        change, the estimator&rsquo;s output depends on the distribution of gaps and can fall
        anywhere at or below the bucket length - the bound still holds, but the error is no longer
        a clean ratio. Median inter-bucket delta is itself an estimate: it measures the interval at
        which observations were <em>recorded</em>, which equals the dispatch interval only if the
        scheduler is punctual. A worker backlog lengthens the median with no change of
        configuration, and no estimator fed only bucketed output can tell the two apart.
      </Claim>

      <h2 id="sec-conclusion">Conclusion</h2>
      <P>
        An observation interval estimated from occupied-bucket density returns{' '}
        <CODE>min(interval, bucket length)</CODE>. It is correct when the schedule is finer than
        the resolution and saturates at the resolution when it is not, so it is systematically
        biased toward reporting a busier system than the one being measured - a bias that is
        invisible in dense test fixtures and that produces a plausible, well-sourced wrong number
        in production.
      </P>
      <P>
        RELIASTRA&rsquo;s public record printed &ldquo;about every 60 seconds&rdquo; for a
        dependency probed every 300 seconds, and printed 300 seconds for the same schedule
        elsewhere on the same page. The estimator is replaced with a median inter-bucket delta, the
        captured series is committed as the regression fixture, and the recommendation stands that
        the configured interval be published rather than inferred - which is what makes an
        availability record&rsquo;s denominator checkable from the outside at all.
      </P>
    </>
  ),

  evidence: (
    <>
      <OL>
        <LI>
          The one-hour timeline captured at 11:39:46 UTC on 11 September 2026 contains 12 points,
          each with <CODE>observation_count = 1</CODE>, at bucket starts 300 seconds apart with one
          360-second gap.
        </LI>
        <LI>
          The API returned 12 points for a window containing 60 one-minute buckets. Empty buckets
          are omitted from the response.
        </LI>
        <LI>
          The deployed estimator returns <CODE>round(60 / 1.0) = 60</CODE> seconds on that series.
          Median bucket-start delta is 300 seconds; window over count is <CODE>3600/12 = 300</CODE>{' '}
          seconds.
        </LI>
        <LI>
          The rendered record stated &ldquo;about every 60 seconds per region&rdquo; in its summary
          and observation-network table and &ldquo;≈ every 300s in this window&rdquo; in its
          telemetry panel, from the same estimator at two resolutions.
        </LI>
        <LI>
          The telemetry panel&rsquo;s 5-minute bucket length equals the true interval, so its
          saturated output coincides with the truth.
        </LI>
        <LI>
          The corrected estimator, applied to the same captured payload, returns 300 seconds. It also returns 300 seconds when the same schedule is aggregated at five-minute resolution, and returns null rather than a plausible number when there is nothing to measure.
        </LI>
      </OL>
      <DataPanel label="The three estimators on one captured series">
        <DataTable
          caption="Same 12 points, three estimators"
          head={['Estimator', 'Uses', 'Result', 'Depends on resolution']}
          align="left"
          rows={[
            ['Occupied-bucket density (deployed)', 'bucket length ÷ mean count', '60 s', 'Yes - saturates at bucket length'],
            ['Median inter-bucket delta (adopted, sparse regime)', 'spacing of bucket starts', '300 s', 'No'],
            ['Window length ÷ observation count', 'from, to, total count', '300 s', 'No'],
          ]}
          note="True interval, read from the same series: median delta 300 s."
        />
      </DataPanel>
    </>
  ),

  methodology: (
    <>
      <P>
        The estimator was read from source in this repository (
        <CODE>frontend/src/lib/track-api.ts</CODE>). The series it was fed was captured verbatim
        from the public measurement API at 11:39:46 UTC on 11 September 2026 and is versioned
        unmodified in this repository.
      </P>
      <H3>How the bound was established</H3>
      <P>
        Analytically, for a regular schedule: an occupied bucket of length <CODE>b</CODE> holds at
        most <CODE>ceil(b/i)</CODE> probes and at least one, so the mean over occupied buckets is
        never below 1 and the quotient <CODE>b / mean</CODE> never exceeds <CODE>b</CODE>. The
        result was then checked against the captured series at two resolutions, which is what
        produced the 60-versus-300 pair.
      </P>
      <H3>How the correction was verified</H3>
      <P>
        The corrected function is unit-tested against the captured payload, byte for byte, in{' '}
        <CODE>frontend/src/lib/__tests__/observed-cadence.test.ts</CODE>. The test asserts 300
        seconds for the one-minute series and 300 seconds for the same schedule at five-minute
        resolution, so it fails if the estimator becomes resolution-dependent again. The audit
        script in this paper&rsquo;s artifact directory runs all three estimators over the same
        captured file and prints them side by side.
      </P>
      <H3>What was not done</H3>
      <P>
        No attempt was made to determine why the schedule is 300 seconds rather than 60, and no
        claim is made about the appropriate interval for this dependency. The probe schedule was
        not modified. This paper is about the estimator, not the schedule.
      </P>
      <H3>Reproduction</H3>
      <PRE>{`# Compare the three estimators over the captured series
python3 research/availability-record-audit/audit.py --estimators

# The regression test
cd frontend && npx vitest run src/lib/__tests__/observed-cadence.test.ts`}</PRE>
    </>
  ),

  related: [
    {
      href: researchRoute('availability-record-audit'),
      label: 'How much evidence stands behind a published availability figure?',
      description:
        'The audit that would have inherited this fivefold error as its denominator, and the three checks that catch it.',
    },
  ],
};
