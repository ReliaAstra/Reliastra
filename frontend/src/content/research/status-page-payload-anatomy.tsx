import type { ResearchArticleBody } from '../research-articles';
import { CODE, H, H3, LI, OL, P, PRE, UL } from './prose';
import { Claim, DataPanel, DataTable, PaperFigure } from '@/components/research/paper-blocks';
import { StatusPayloadFigure } from '@/components/research/figures';

/**
 * Body copy for /research/ai-infrastructure/status-page-payload-anatomy.
 *
 * Built on one captured payload, read once, at one timestamp. Every count and
 * timestamp below is read from that payload, which is versioned unmodified in
 * this repository.
 */

export const statusPagePayloadAnatomy: ResearchArticleBody = {
  sections: [
    { id: 'sec-payload', label: 'The payload' },
    { id: 'sec-taxonomy', label: 'What it carries: taxonomy' },
    { id: 'sec-declaration', label: 'What it carries: declaration' },
    { id: 'sec-history', label: 'What it carries: history' },
    { id: 'sec-evidence', label: 'As incident evidence' },
    { id: 'sec-conclusion', label: 'Conclusion' },
  ],

  body: (
    <>
      <P>
        A vendor status page is routinely treated as incident evidence, and the treatment is
        usually dismissive in both directions at once: teams say the page is worthless because it
        is written by the counterparty, and then quote it in an incident review as though it
        established a timeline. Both positions skip the useful question, which is structural: what
        does the payload actually contain, and what class of claim can each part support?
      </P>
      <P>
        On 11 September 2026 RELIASTRA read the machine-readable summary payload behind
        OpenAI&rsquo;s status site. This paper takes that one payload apart.
      </P>

      <h2 id="sec-payload">The payload</h2>
      <P>
        One unauthenticated HTTPS GET, captured verbatim:
      </P>
      <PRE>{`GET https://status.openai.com/api/v2/summary.json
    →  2026-09-11T≈11:36Z

{
  "page": {
    "id": "01JMDK9XYNY6RXSED6SDWW50WY",
    "name": "OpenAI",
    "url": "https://status.openai.com/",
    "updated_at": "2026-07-09T19:25:56Z"
  },
  "status": {
    "description": "All Systems Operational",
    "indicator": "none"
  },
  "components": [ /* 25 entries, all "operational",
                     all updated_at 2026-07-09T19:25:56Z */ ]
}`}</PRE>
      <DataPanel
        label="Captured · summary.json · 2026-09-11 ≈11:36 UTC"
        source="OpenAI status site, machine-readable summary endpoint. Response versioned unmodified at research/availability-record-audit/data/openai-statuspage-summary-2026-09-11T1136Z.json."
      >
        <DataTable
          caption="Structural summary of the captured payload"
          align="left"
          head={['Property', 'Value']}
          rows={[
            ['Aggregate indicator', 'none'],
            ['Aggregate description', 'All Systems Operational'],
            ['Components returned', '25'],
            ['Components operational', '25'],
            ['Components degraded or down', '0'],
            ['page.updated_at', '2026-07-09T19:25:56Z'],
            ['Distinct component updated_at values', '1 (identical to page.updated_at)'],
            ['Newest component created_at', '2026-07-09T19:25:56Z ("Sites")'],
            ['Elapsed since page.updated_at at read time', '63 days 16 hours'],
            ['Incident records in this payload', 'none - not part of this endpoint'],
          ]}
          note="Every value in this table is read from the captured response. Nothing is inferred; the inferences follow in the sections below and are labelled."
        />
      </DataPanel>

      <PaperFigure
        n="1"
        caption="One payload, three evidence classes. The taxonomy is genuinely useful and is the part most integrations ignore. The current declaration is a single unqualified claim about the whole page and carries no interval. The history is absent from this endpoint entirely - which means a consumer that polls only the summary receives a state and no record of how long that state has held."
      >
        <StatusPayloadFigure />
      </PaperFigure>

      <h2 id="sec-taxonomy">What it carries: taxonomy</h2>
      <P>
        The twenty-five components are, in the order the payload returns them:
      </P>
      <PRE>{`Images            Login              Audio             Files
FedRAMP           Sora               Ads API           Fine-tuning
Realtime          Search             Compliance API    Agent
Deep Research     Codex Web          Connectors/Apps   Codex in ChatGPT Desktop
Codex API         Batch              Embeddings        Moderations
VS Code extension Sites              File uploads      Voice mode
ChatGPT Atlas`}</PRE>
      <Claim kind="inference">
        This list is a provider-authored service inventory. It states which services the provider
        considers separately reportable, which is precisely the granularity an availability record
        needs and almost never has. No outside observer would infer &ldquo;Codex API&rdquo;,
        &ldquo;Compliance API&rdquo; or &ldquo;Connectors/Apps&rdquo; as distinct reportable
        units; the provider has declared them.
      </Claim>
      <P>
        The value is structural rather than temporal. A monitoring system that wants to compare its
        own observations against a vendor&rsquo;s decomposition of itself can harvest this list -
        it is the closest thing to a public service map most providers publish. It changes over
        time, and the change is itself informative: components are added as services are launched,
        which makes the component list a rough chronology of the provider&rsquo;s product surface.
      </P>
      <P>
        Note what is <em>not</em> in the list. There is no component named for the inference API as
        such, no regional breakdown, and no mapping from component to endpoint. An engineer cannot
        take this taxonomy and derive a probe target from it. It tells you what the provider
        reports on; it does not tell you what to measure.
      </P>

      <h2 id="sec-declaration">What it carries: declaration</h2>
      <P>
        The aggregate indicator is one value over the whole page. At the time of the read it was{' '}
        <CODE>none</CODE>, described as &ldquo;All Systems Operational&rdquo;.
      </P>
      <P>
        The relationship between the indicator and the components is the part that is easy to
        misread. A single indicator over twenty-five components cannot express a partial failure: if
        one component is degraded, the indicator moves to <CODE>minor</CODE> or{' '}
        <CODE>major</CODE> for the whole page, and a consumer reading only the indicator learns that
        <em>something</em> is wrong without learning what. Conversely, an indicator of{' '}
        <CODE>none</CODE> is a claim about all twenty-five components jointly.
      </P>
      <Claim kind="observation">
        At the moment of the read, all twenty-five components carried the status{' '}
        <CODE>operational</CODE> and the aggregate indicator was <CODE>none</CODE>. The declaration
        and the components agree. That agreement is the payload&rsquo;s internal consistency check,
        and it is worth performing: a page whose indicator disagrees with its component list is
        telling you something about the operator, not about the service.
      </Claim>
      <P>
        What the declaration does not carry is an interval. The indicator asserts a present state
        and says nothing about how long that state has held. The only temporal hint is{' '}
        <CODE>updated_at</CODE>, and its semantics are the subject of the next section.
      </P>

      <h2 id="sec-history">What it carries: history</h2>
      <P>
        Nothing. The summary payload contains no incident records, no uptime history and no record
        of previous states. Those live on separate endpoints in the same API family.
      </P>
      <P>
        This matters because of how integrations are usually built. The summary endpoint is the one
        a poller calls: it is small, it is cacheable, and it answers the question &ldquo;is
        anything wrong right now&rdquo;. A consumer that polls only the summary accumulates a time
        series of current states, and that series has a resolution equal to the polling interval -
        which means a state change that occurred and was resolved between two polls is invisible to
        it permanently.
      </P>
      <Claim kind="inference">
        The <CODE>updated_at</CODE> timestamp on the page and on all twenty-five components is
        identical: <CODE>2026-07-09T19:25:56Z</CODE>, which is 63 days and 16 hours before the
        read. The newest component in the list, &ldquo;Sites&rdquo;, carries the same value as its{' '}
        <CODE>created_at</CODE>, so the most recent change to the page was the addition of a
        component rather than a change of status. The timestamp is therefore consistent with
        sixty-three days without a declared component status change.
      </Claim>
      <Claim kind="limitation">
        That is an inference from correlation, not a documented guarantee. The host does not publish
        a contract that every status change advances <CODE>updated_at</CODE>. What is observed is
        that the timestamp coincides with a component creation and has not moved since; what cannot
        be established from one read is whether it moves on every status transition, or how quickly.
        A single read cannot establish a rate of change at all.
      </Claim>

      <h2 id="sec-evidence">As incident evidence</h2>
      <P>
        Sorting the payload&rsquo;s contents by what they can support:
      </P>
      <DataPanel label="What each part of the payload can support">
        <DataTable
          caption="Evidence classes in one status payload"
          align="left"
          head={['Part', 'Can support', 'Cannot support']}
          rows={[
            ['Component taxonomy', 'A service inventory; what the provider treats as separately reportable', 'A measurement of any of those services'],
            ['Aggregate indicator', 'A point-in-time declaration by the provider about the whole page', 'A duration, a start time, or a per-service state'],
            ['Component statuses', 'Per-service declared state at read time', 'Anything about the interval since the last change'],
            ['updated_at', 'A lower bound on how long the current declared state has held, if the semantics hold', 'Proof that no undeclared degradation occurred'],
            ['(absent) history', '—', 'Any timeline. It is not in this payload.'],
          ]}
        />
      </DataPanel>
      <P>
        The practical consequence for incident work is that a status page is a{' '}
        <strong>declaration record</strong>, not a <strong>measurement record</strong>. It answers
        &ldquo;what did the vendor say, and when&rdquo;. It does not answer &ldquo;what happened,
        and when did it start&rdquo;. Those are different questions with different authors, and an
        incident timeline built from declarations inherits the declarer&rsquo;s latency, scoping
        and discretion.
      </P>
      <P>
        That is not an argument for ignoring status pages. It is an argument for keeping the two
        record types separate and reconciling them on a shared timeline rather than merging them.
        The disagreement between them is usually the most informative part: a declaration that
        moved at 14:05 against an independent measurement that began failing at 13:52 tells you
        something about detection latency that neither record contains alone.
      </P>
      <Claim kind="observation">
        RELIASTRA observes <CODE>https://status.openai.com</CODE> as a dependency and does not
        ingest, mirror or reconcile the payload it serves. The two records are kept separate by
        design, and the public record says so on the page rather than in a footnote.
      </Claim>

      <h2 id="sec-conclusion">Conclusion</h2>
      <P>
        A hosted status-page summary payload carries three things of very different evidentiary
        weight. Its taxonomy is a provider-authored service inventory and is the most useful part
        for an outside observer. Its aggregate indicator is a single unqualified claim about the
        whole page, with no interval attached. Its history is absent.
      </P>
      <P>
        The payload captured on 11 September 2026 declared all twenty-five components operational
        under an indicator of <CODE>none</CODE>, with a last-change timestamp 63 days and 16 hours
        old that coincides with the creation of the newest component. Nothing in that contradicts a
        stable service. What it does establish is that a status payload asserts a present state
        without asserting when that state was established - and that a consumer polling only the
        summary endpoint will never learn the difference.
      </P>
      <P>
        Treat the taxonomy as data, the indicator as a declaration, and the timestamps as a lower
        bound rather than a measurement. Poll the history endpoint if you need a timeline, store
        the raw payload rather than your reading of it, and keep the declaration record and the
        measurement record on the same timeline without merging them into one figure.
      </P>
    </>
  ),

  evidence: (
    <>
      <OL>
        <LI>
          The summary payload returned 25 components and one aggregate indicator,{' '}
          <CODE>none</CODE> / &ldquo;All Systems Operational&rdquo;.
        </LI>
        <LI>
          All 25 components carried the status <CODE>operational</CODE>.
        </LI>
        <LI>
          <CODE>page.updated_at</CODE> and the <CODE>updated_at</CODE> of all 25 components were
          identical: <CODE>2026-07-09T19:25:56Z</CODE>.
        </LI>
        <LI>
          The newest component, &ldquo;Sites&rdquo;, carries <CODE>created_at</CODE> equal to that
          same timestamp, so the most recent page change was a component addition.
        </LI>
        <LI>
          The read occurred at approximately 11:36 UTC on 11 September 2026 - 63 days and 16 hours
          after that timestamp.
        </LI>
        <LI>
          The payload contained no incident records and no uptime history. Those are not part of
          this endpoint.
        </LI>
      </OL>
      <P>
        The complete response, including all 25 components with their identifiers, positions,
        statuses and timestamps, is versioned at{' '}
        <CODE>research/availability-record-audit/data/openai-statuspage-summary-2026-09-11T1136Z.json</CODE>.
      </P>
    </>
  ),

  methodology: (
    <>
      <P>
        A single unauthenticated HTTPS GET of the status site&rsquo;s machine-readable summary
        endpoint, issued on 11 September 2026 at approximately 11:36 UTC. The response body was
        stored unmodified.
      </P>
      <H3>Analysis performed</H3>
      <UL>
        <LI>Component count and status distribution.</LI>
        <LI>
          Timestamp distribution: distinct values of <CODE>updated_at</CODE> across the page and
          all components.
        </LI>
        <LI>
          Comparison of each component&rsquo;s <CODE>updated_at</CODE> against its{' '}
          <CODE>created_at</CODE>, to distinguish a status change from a component addition.
        </LI>
        <LI>Elapsed time between the page timestamp and the read.</LI>
      </UL>
      <H3>What was not done</H3>
      <P>
        The payload was read once. No polling series was collected, so nothing here establishes how
        often the payload changes. The history and incidents endpoints were not read, so no claim is
        made about what they contain for this page. No independent probe was issued against any of
        the twenty-five components; this paper analyses a declaration, it does not measure a
        service.
      </P>
    </>
  ),

  related: [],
};
