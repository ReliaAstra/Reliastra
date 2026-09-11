import type { ResearchArticleBody } from '../research-articles';
import { CODE, H, H3, LI, OL, P, PRE, UL } from './prose';
import { Claim, DataPanel, DataTable, PaperFigure } from '@/components/research/paper-blocks';
import {
  DependencyChainFigure,
  FailureCascadeFigure,
  TrustZoneFigure,
} from '@/components/research/figures';

/**
 * Body copy for /research/cloud-security/ai-api-trust-boundary.
 *
 * An architecture analysis. Every finding is reasoning from published
 * documentation and standard trust-boundary practice, except the observation
 * about which endpoint RELIASTRA actually observes, which is measured and is
 * labelled as such.
 */

export const aiApiTrustBoundary: ResearchArticleBody = {
  sections: [
    { id: 'sec-system', label: 'System context' },
    { id: 'sec-boundary', label: 'The boundary, drawn' },
    { id: 'sec-crosses', label: 'What crosses it' },
    { id: 'sec-failure', label: 'Failure model' },
    { id: 'sec-planes', label: 'Two planes, one vendor' },
    { id: 'sec-properties', label: 'Four properties that differ' },
    { id: 'sec-implications', label: 'Security implications' },
    { id: 'sec-conclusion', label: 'Conclusion' },
  ],

  body: (
    <>
      <P>
        The common framing is that calling a hosted model API is like calling any other third-party
        API, only with larger payloads and a different pricing unit. That framing is wrong in ways
        that matter architecturally. An AI API dependency moves different content across the
        boundary, through a path the consumer cannot observe, under a cost model that turns retry
        policy into a financial control. This paper draws the boundary as an architect would need
        it drawn, states what is enforceable where, and identifies what changes when the model is a
        network call.
      </P>
      <P>
        It is an architectural analysis, not an assessment. No provider&rsquo;s security posture is
        evaluated here, no vulnerability is reported, and no attack was performed. The one measured
        element is a fact about RELIASTRA&rsquo;s own observation record, and it is labelled as
        measured.
      </P>

      <h2 id="sec-system">System context</h2>
      <P>
        The reference architecture is the one most production systems converge on: an application
        that needs a completion, a client SDK or an AI gateway that holds the provider key, and a
        chain of infrastructure between the process and the model. Retrieval context, prior
        conversation turns and tool output are assembled into a prompt inside the application
        trust domain and then leave it.
      </P>
      <PaperFigure
        n="1"
        caption="Seven hops between an application and a served token. Everything left of the dashed line is inside the consumer's trust domain and is subject to its controls. Everything right of it belongs to the provider, and the final two hops - model routing and the serving plane - are not observable from the API boundary at all: the consumer sees a response, not the path that produced it."
      >
        <DependencyChainFigure />
      </PaperFigure>
      <P>
        Three of these hops deserve explicit mention because they are usually outside the
        application team&rsquo;s review scope and all three can observe prompt content:
      </P>
      <UL>
        <LI>
          <strong>DNS resolution.</strong> The provider hostname resolves through a resolver whose
          answer is cached, and the cached answer determines where the TLS session terminates. A
          consumer that has reviewed its application and its gateway has not thereby reviewed its
          resolver.
        </LI>
        <LI>
          <strong>The provider edge.</strong> Rate limiting, WAF rules and request inspection sit
          here, before routing. Its behaviour is observable only through the response codes it
          returns.
        </LI>
        <LI>
          <strong>The AI gateway.</strong> If it is managed rather than self-hosted, it holds the
          provider credential and sees every prompt. It is a third-party dependency in its own
          right and is frequently absent from the dependency inventory, because it was adopted as
          tooling rather than as a supplier.
        </LI>
      </UL>

      <h2 id="sec-boundary">The boundary, drawn</h2>
      <PaperFigure
        n="2"
        caption="Four zones from the application outward. The first is governed entirely by the consumer. The second is governed by the consumer if the gateway is self-hosted and by a vendor if it is managed - a distinction that is often undecided rather than decided. The third and fourth belong to the provider, and the fourth is not observable from the API boundary. Prompt content and retrieval context cross all four."
      >
        <TrustZoneFigure />
      </PaperFigure>
      <P>
        Zero-trust architecture requires that no zone be trusted by virtue of its location, and
        that every crossing carry an authorisation decision. Inside the mesh that is achievable:
        workload identity, mutual TLS and a policy decision point per hop. Across the provider
        boundary it is only partly achievable, and the part that is not has to be handled
        differently.
      </P>
      <Claim kind="inference">
        Mutual TLS and workload identity establish <em>who is calling</em>. They establish nothing
        about what the callee does with the payload, which model serves it, or where inference is
        executed. A TLS 1.3 handshake authenticates a host against a certificate; the application
        behind that host is outside what the protocol asserts. The consumer&rsquo;s enforceable
        controls at this boundary are therefore architectural and contractual - data minimisation,
        redaction before egress, provider pinning, an egress record - not cryptographic.
      </Claim>
      <P>
        That is not a criticism of the protocol. It is a statement about where a control has to
        live: a property that cannot be enforced by the transport has to be enforced by the
        architecture, or accepted as trust.
      </P>

      <h2 id="sec-crosses">What crosses the boundary</h2>
      <P>
        This is the difference that is most often underestimated. A payment API call carries a
        tokenised instrument and an amount. An auth API call carries a subject identifier and a
        scope. A model API call carries a prompt, and in a retrieval-augmented system the prompt is
        assembled from whatever the retrieval layer returned.
      </P>
      <DataPanel label="Payload comparison across three dependency classes">
        <DataTable
          caption="What leaves the trust domain, by dependency class"
          align="left"
          head={['Dependency class', 'Typical payload', 'Content determined by', 'Classifiable before egress']}
          rows={[
            ['Payment API', 'Tokenised instrument, amount, currency', 'The application', 'Yes - a fixed schema'],
            ['Auth API', 'Subject identifier, scopes, token', 'The application', 'Yes - a fixed schema'],
            ['Model API', 'Prompt, system message, retrieved documents, prior turns, tool output', 'The application and the retrieval index', 'Only if retrieval output is classified'],
          ]}
          note="The model API row is the one where the payload content is not fully known to the caller at the moment of the call, because part of it was selected by a retrieval step at request time."
        />
      </DataPanel>
      <Claim kind="observation">
        A prompt in a retrieval-augmented system is not a message the user typed. It is a
        composition: system instructions, retrieved chunks, prior turns, tool results and the
        user&rsquo;s input. Data-classification controls that assume the payload is authored by the
        application do not describe it.
      </Claim>
      <P>
        The practical consequence is that the classification boundary has to move upstream of the
        API call. Classifying the prompt at the point of egress is too late if the retrieval index
        already contains material nobody classified; the control has to sit on what may enter the
        index, or on what may be retrieved into a prompt, or both.
      </P>

      <h2 id="sec-failure">Failure model</h2>
      <P>
        The failure domains along the chain in Figure 1 fail independently, and the interesting
        property is how far a failure at the right-hand end propagates to the left.
      </P>
      <PaperFigure
        n="3"
        caption="Provider degradation becomes application degradation through retry amplification and shared workers. The final step is the one that misdirects an incident: the alert fires in code that never called the provider API, six hops from the cause. An architecture whose failure domains are not isolated converts a partial upstream problem into a full application outage, and produces an incident report that names the wrong component."
      >
        <FailureCascadeFigure />
      </PaperFigure>
      <P>
        Two steps in that cascade are specific to model APIs.
      </P>
      <H3>Timeouts are longer</H3>
      <P>
        A completion is generated token by token and can take tens of seconds. Conventional HTTP
        timeouts sized for a CRUD API will abort in-flight work that would have succeeded, and
        aborted work is usually retried - so a too-tight timeout converts latency into load. The
        timeout on a model call is a load-shaping control, not just an error-handling one.
      </P>
      <H3>Retries are spend</H3>
      <P>
        Each retry re-consumes tokens. An unbounded retry policy against a degraded provider does
        not merely fail slower; it multiplies cost and can exhaust quota, which converts a
        reliability incident into an authorisation failure across every consumer of the same key.
      </P>
      <Claim kind="inference">
        Retry policy against a model API is simultaneously a reliability control, a cost control and
        a quota control. Treating it as only the first is how a provider&rsquo;s partial degradation
        becomes the consumer&rsquo;s full outage with a large invoice attached.
      </Claim>

      <h2 id="sec-planes">Two planes, one vendor</h2>
      <P>
        There is a measured anchor for the claim that a provider is not one thing. RELIASTRA
        observes OpenAI as a dependency, and the observation target is worth stating exactly.
      </P>
      <PRE>{`GET /v1/vendors/openai      →  2026-09-11T11:39:38Z

"endpoints": [
  { "endpoint_url": "https://status.openai.com",
    "regions": ["us-east"],
    "health_status": "operational" }
]`}</PRE>
      <Claim kind="observation">
        The endpoint RELIASTRA observes for this vendor is <CODE>https://status.openai.com</CODE> -
        the provider&rsquo;s status site - observed from one region. It is not{' '}
        <CODE>https://api.openai.com</CODE>. The availability record for this dependency is
        evidence about the status site, and RELIASTRA&rsquo;s public record says so rather than
        letting the vendor name imply otherwise.
      </Claim>
      <P>
        That distinction is the whole point. The status site and the inference API are separate
        services with separate availability, separate failure domains and separate deployment
        paths. A status site can be reachable while inference is degraded, and the reverse is also
        possible. Any availability figure that treats &ldquo;the vendor&rdquo; as a single
        measurable object is measuring one of its planes and reporting on all of them.
      </P>
      <P>
        This is not a criticism of the provider. It is a statement about the observer: an outside
        measurement of a complex provider is always a measurement of the specific endpoints it
        probes, and the honest record names them. The status site&rsquo;s own component list makes
        the same point from inside - it enumerates two dozen separately reportable services, which
        is analysed in{' '}
        <a href="/research/ai-infrastructure/status-page-payload-anatomy">
          What a status-page payload actually asserts
        </a>
        .
      </P>

      <h2 id="sec-properties">Four properties that differ</h2>
      <P>
        Collapsing the analysis: an AI API dependency differs from a conventional SaaS API
        dependency in four respects, each with an architectural consequence.
      </P>
      <H3>1 · The payload is composed, not authored</H3>
      <P>
        Content is assembled at request time from a retrieval index the caller does not fully
        control. <em>Consequence:</em> classification must move upstream to the index and the
        retrieval step, and egress needs a redaction point rather than an assumption.
      </P>
      <H3>2 · Routing is inside the provider&rsquo;s trust domain</H3>
      <P>
        A request addressed to a model name is served by whatever the provider routes it to. Model
        version, serving tier and region are usually not pinnable by the consumer and are
        observable only to the extent the response metadata discloses them.{' '}
        <em>Consequence:</em> pin what the contract allows, record what the response reports, and
        treat a routing change as something detectable after the fact rather than preventable
        before it.
      </P>
      <H3>3 · Failure propagates through shared workers</H3>
      <P>
        Long-running calls hold connections and workers that unrelated features also need.{' '}
        <em>Consequence:</em> failure-domain isolation for model calls - separate pools, separate
        queues, separate budgets - is a reliability requirement with a security benefit, because it
        bounds the blast radius of a dependency the consumer does not control.
      </P>
      <H3>4 · The status plane is not the serving plane</H3>
      <P>
        They are separate services with separate availability. <em>Consequence:</em> monitor them
        separately, attribute them separately, and never merge them into one figure - a merged
        figure will misdirect an incident in whichever direction the merge was wrong.
      </P>

      <h2 id="sec-implications">Security implications</h2>
      <H3>Dependency reachability is attack surface</H3>
      <P>
        Every hop in Figure 1 is a point at which prompt content can be observed or altered. Most
        of them are outside the application team&rsquo;s review scope, and the dependency graph
        that reliability engineers maintain for failure analysis is the same graph a security
        reviewer needs for attack-surface analysis. Organisations that keep those as two separate
        artifacts end up with neither being complete.
      </P>
      <H3>Controls that cannot be enforced must be recorded</H3>
      <P>
        Where the consumer cannot enforce a property - which model served the request, where
        inference ran, what the provider retained - the remaining option is to make the boundary
        legible: a single named egress point, a logged and redacted record of what left the domain,
        and response metadata captured so a later change is at least detectable. An unenforceable
        contractual control plus an auditable egress record is materially stronger than an
        unenforceable contractual control alone.
      </P>
      <H3>Availability of the dependency is a security signal</H3>
      <P>
        Degradation of a model provider is a security event as well as a reliability event: it
        changes what fallback paths execute, which often means a less-reviewed code path handles
        production traffic. Teams that treat provider degradation as purely operational discover
        their fallback logic under load for the first time during the incident.
      </P>
      <Claim kind="limitation">
        This paper does not address model output integrity - prompt injection, retrieval poisoning,
        output filtering or tool-call abuse. Those are distinct subjects with distinct threat
        models, and conflating them with transport and boundary concerns produces analyses that are
        weak at both.
      </Claim>

      <h2 id="sec-conclusion">Conclusion</h2>
      <P>
        An AI API dependency is not a larger SaaS dependency. It moves composed, partly
        uncontrolled content across a boundary the consumer does not govern, through a routing
        layer it cannot observe, at a cost that makes retry policy a financial control, against a
        provider whose status plane and serving plane fail independently.
      </P>
      <P>
        The controls that follow are not exotic: draw the boundary before integration, classify
        upstream of the call, isolate the failure domain, bind retries to a budget, pin what the
        contract allows and record the rest, and monitor the status plane and the serving plane as
        the two separate dependencies they are. What makes them necessary is that the properties
        they address cannot be established by the transport, so they have to be established by the
        architecture - or accepted, explicitly, as trust.
      </P>
    </>
  ),

  evidence: (
    <>
      <P>
        This paper is an architectural analysis. The single measured observation it rests on is the
        observed endpoint of RELIASTRA&rsquo;s own OpenAI dependency record; everything else is
        reasoning from published documentation and standard trust-boundary practice, and is labelled
        as such in the key findings.
      </P>
      <DataPanel
        label="Captured · GET /v1/vendors/openai · 2026-09-11T11:39:38Z"
        source="RELIASTRA public measurement API, unauthenticated."
      >
        <DataTable
          caption="The observation topology of RELIASTRA's OpenAI record"
          align="left"
          head={['Field', 'Value']}
          rows={[
            ['Observed endpoint', 'https://status.openai.com'],
            ['Observation regions', 'us-east'],
            ['Health status', 'operational'],
            ['Endpoint active', 'true'],
            ['Record created', '2026-08-15T22:23:10Z'],
            ['Last observation', '2026-09-11T11:39:38Z'],
          ]}
          note="The record observes the provider's status plane from one origin. It is not a measurement of the inference API, and the public page states that scope explicitly."
        />
      </DataPanel>
      <OL>
        <LI>
          The observed endpoint for this vendor is <CODE>https://status.openai.com</CODE>, not the
          inference API - a single measured fact that separates the status plane from the serving
          plane.
        </LI>
        <LI>
          The record is observed from one region, which bounds what it can establish about a
          provider that operates many.
        </LI>
      </OL>
    </>
  ),

  methodology: (
    <>
      <P>
        Trust-boundary decomposition of a reference architecture. The method is the standard one:
        enumerate the zones, enumerate what crosses each boundary, state the authentication and
        authorisation that applies at each crossing, and separate the properties the consumer can
        verify from those it must trust.
      </P>
      <H3>Sources</H3>
      <UL>
        <LI>
          NIST SP 800-207 for the zero-trust vocabulary: trust boundaries, policy decision points,
          and the requirement that no zone be trusted by virtue of its location.
        </LI>
        <LI>
          RFC 8446 for what a TLS 1.3 handshake does establish about a peer, and the fact that it
          says nothing about the application behind it.
        </LI>
        <LI>
          Provider documentation for the request contract an application depends on, including the
          retry-after semantics that make backoff a quota control.
        </LI>
        <LI>
          The OWASP Top 10 for LLM Applications, referenced for scope only: this paper deliberately
          excludes model output integrity.
        </LI>
      </UL>
      <H3>What this method cannot produce</H3>
      <P>
        No finding here is an empirical measurement of provider behaviour. The paper can establish
        what a consumer is able to verify from the public API contract; it cannot establish what a
        provider does internally, and does not attempt to. Where it says a property is
        unobservable, that is a statement about the contract, not about the provider&rsquo;s
        instrumentation.
      </P>
    </>
  ),

  related: [],
};
