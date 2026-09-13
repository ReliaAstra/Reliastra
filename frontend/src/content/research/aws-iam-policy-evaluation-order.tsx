import type { ResearchArticleBody } from '../research-articles';
import { CODE, H3, LI, OL, P, PRE, UL } from './prose';
import { Claim, DataPanel, DataTable, PaperFigure } from '@/components/research/paper-blocks';
import {
  IamAttributionPathFigure,
  IamEvaluationPipelineFigure,
  IamPolicyAlgebraFigure,
  IamTighteningFallacyFigure,
  IamVerificationGapFigure,
} from '@/components/research/figures';
import { PUBLIC_ROUTES, researchRoute } from '@/lib/routes';

/**
 * Body copy for /research/cloud-security/aws-iam-policy-evaluation-order.
 *
 * An architecture analysis. Nothing here was measured: no request was issued to
 * AWS, no simulator response was captured, no policy was evaluated in an
 * account. Every finding is either cited from AWS's own specification and
 * labelled `sourced`, or argued from that specification and labelled
 * `reasoned`. Where AWS's documentation does not settle a question, the paper
 * says so instead of choosing a side - and one such place is reported as a
 * finding rather than smoothed over.
 *
 * The three pseudocode blocks are a specification of documented behaviour, not
 * a transcript of AWS enforcement code, which is not public. There is no
 * implementation of them in this repository.
 *
 * Deliberately absent from this body: a limitations list and a recommendations
 * list. The template renders both from the corpus record - as "Limitations" and
 * as "Practical architecture implications" - immediately after the body.
 * Restating them here would print the same six items twice on one page.
 */

export const awsIamPolicyEvaluationOrder: ResearchArticleBody = {
  sections: [
    { id: 'sec-question', label: 'The question the method hides' },
    { id: 'sec-default', label: 'Default deny' },
    { id: 'sec-classes', label: 'Seven classes, three roles' },
    { id: 'sec-order', label: 'The documented order' },
    { id: 'sec-algebra', label: 'Short-circuit, ceiling, grant' },
    { id: 'sec-union', label: 'Same-account union' },
    { id: 'sec-principals', label: 'The principal-type branch' },
    { id: 'sec-cross', label: 'Cross-account: two verdicts' },
    { id: 'sec-matrix', label: 'The decision matrix' },
    { id: 'sec-exceptions', label: 'Where the union rule stops' },
    { id: 'sec-verification', label: 'The verification gap' },
    { id: 'sec-formal', label: 'A solved problem, at scale' },
    { id: 'sec-attribution', label: 'Attributing an AccessDenied' },
    { id: 'sec-nonhuman', label: 'Non-human identities' },
    { id: 'sec-scope', label: 'What this paper does not cover' },
    { id: 'sec-conclusion', label: 'Conclusion' },
  ],

  body: (
    <>
      <P>
        Most engineers learn IAM by writing a policy, making a call, reading an{' '}
        <CODE>AccessDenied</CODE>, and widening the policy until the call succeeds. The method
        works, which is why it survives, and it conceals the thing that matters: a single
        deterministic procedure runs on every request, across seven classes of policy, and the
        outcome is decided before any of your iteration reaches it. Policies authored iteratively
        are not wrong for that reason. They are unaudited, because nobody ever wrote down which
        stage of the procedure was responsible for the behaviour being observed.
      </P>
      <P>
        This paper states that procedure as an algebra rather than as a flowchart, enumerates the
        exceptions AWS documents but summaries omit, publishes the decision matrix that follows from
        both, and then asks the question practitioners rarely ask: given that the procedure is
        deterministic, what can actually be verified before deployment rather than after a denial?
        The answer is uncomfortable. No single pre-deployment route covers all seven policy classes,
        and the gap is not an oversight an engineer can close by reading more documentation.
      </P>
      <Claim kind="fact">
        This is an analysis of published documentation and peer-reviewed work. It measured nothing.
        No AWS account was used, no simulator response was captured, and no policy was evaluated
        against a live control plane. Every finding is cited or reasoned, and is labelled as one or
        the other in the record above.
      </Claim>

      <h2 id="sec-question">The question the iterative method hides</h2>
      <P>
        The question is narrow and operational: what exactly does AWS evaluate, in what order, and
        which parts of that evaluation can be checked before a request is made? It is not a question
        about how to write a good policy - least-privilege authoring is well covered elsewhere,
        including by AWS.
      </P>
      <P>
        The iterative method hides the answer because it only ever observes one output. A call either
        succeeds or it does not, and both outcomes are consistent with many internal paths. When it
        succeeds, the engineer cannot tell whether an identity-based Allow carried it or a bucket
        policy did; when it fails, the engineer cannot tell whether an explicit Deny stopped it at
        stage one or the absence of an Allow stopped it at stage five. Those are different facts with
        different owners and different fixes, and the API response is the same word.
      </P>
      <P>
        Treating the procedure as an object with named stages changes what can be said about a policy
        set. Instead of &ldquo;this role can read the bucket&rdquo;, the statement becomes
        &ldquo;this role&rsquo;s session is granted at stage four by a resource-based policy naming
        the role session ARN, and therefore is not capped by the permissions boundary attached to the
        role&rdquo;. The second sentence is auditable. The first is not, and it is the one that
        appears in review documents.
      </P>

      <h2 id="sec-default">Default deny, and the one principal outside it</h2>
      <P>
        AWS states the default in one line: by default all requests are implicitly denied, with the
        exception of the AWS account root user, which has full access. A request must be explicitly
        allowed by a policy or set of policies to succeed, and an explicit deny overrides an explicit
        allow. Two consequences follow that are usually collapsed into one another.
      </P>
      <UL>
        <LI>
          <strong>Implicit deny is not a statement.</strong> It is the absence of one. Nothing was
          evaluated against the request except the search for a matching Allow, and the search came
          up empty. A denial caused by an absent Allow is fixed by adding a grant; a denial caused by
          a matching Deny is fixed by narrowing a statement, and adding a grant changes nothing at
          all.
        </LI>
        <LI>
          <strong>The root user is the only principal for which the default is inverted.</strong>{' '}
          Every other principal - IAM user, IAM role, assumed-role session, federated session,
          service principal - begins denied. An architecture that relies on the root user for a
          recurring operation is relying on the one identity that no permissions boundary, no
          identity policy and no resource policy governs.
        </LI>
      </UL>
      <Claim kind="inference">
        Implicit deny is why a new IAM principal has no permissions at all, and it is also why the
        absence of an error is weak evidence: a principal that has never been granted anything fails
        closed. The safety of an unattached role is not the safety of a reviewed one.
      </Claim>

      <h2 id="sec-classes">Seven policy classes, three algebraic roles</h2>
      <P>
        The classes are usually listed as a taxonomy of attachment points. The more useful
        classification is by what each can do to the outcome, and there are only three roles. A class
        either <strong>short-circuits</strong> (it can end the request on a match),{' '}
        <strong>caps</strong> (it can only remove permission), or <strong>grants</strong> (it can add
        permission). Every production error in this domain is a misassignment of a class to a role -
        most often the belief that a capping class grants, or that a granting class caps.
      </P>
      <DataPanel label="Table 1 · The seven classes by algebraic role" source="AWS IAM User Guide, policy evaluation logic and permissions boundaries; AWS Organizations User Guide, SCPs and RCPs. Accessed 13 September 2026.">
        <DataTable
          caption="Policy classes that participate in an authorisation decision, by what each can do to the outcome"
          align="left"
          head={['Class', 'Attached to', 'Constrains', 'Role', 'Grants', 'Stage']}
          rows={[
            ['Explicit Deny', 'any policy type', 'the whole request', 'short-circuit', 'no', '1'],
            ['Resource control policy', 'OU or account, on the resource side', 'resources in that account', 'cap', 'no', '2'],
            ['Service control policy', 'OU or account, on the principal side', 'principals in that account', 'cap', 'no', '3'],
            ['Resource-based policy', 'the resource', 'who may act on it', 'grant', 'yes', '4'],
            ['Identity-based policy', 'IAM user, group or role', 'what the principal may do', 'grant', 'yes', '5'],
            ['Permissions boundary', 'IAM user or role', 'the identity-based grant', 'cap', 'no', '6'],
            ['Session policy', 'an STS session', 'the grant carried by that session', 'cap', 'no', '7'],
          ]}
          note="Stage numbers are the order in which AWS documents the classes being evaluated for a request inside one account. An explicit Deny is not a class of its own - it is a statement effect that can appear in any of the others - but it is evaluated first, across all of them, which is why it occupies stage 1."
        />
      </DataPanel>
      <P>
        Four of the seven cannot grant anything. An SCP that allows an action does not permit it; it
        removes the organisational objection to a permission that must still be granted somewhere
        else. The same holds for RCPs, permissions boundaries and session policies. Writing an Allow
        into a capping class is a common and entirely inert act.
      </P>

      <h2 id="sec-order">The documented order</h2>
      <P>
        AWS publishes the procedure as a summary of its enforcement logic. A request arrives, the
        principal is authenticated where authentication is required, the applicable policy set is
        resolved from the request context, and the classes are then evaluated in a fixed order.
        Figure 1 draws that order with each stage&rsquo;s algebraic role attached.
      </P>
      <PaperFigure
        n="1"
        caption="The single-account procedure, in the order AWS documents it. One stage short-circuits: a matching explicit Deny anywhere in the applicable policy set ends the request, and no later stage is reached. Four stages cap: an RCP, an SCP, a permissions boundary or a session policy that applies and does not allow produces a final Deny. Two stages grant: a resource-based policy and an identity-based policy. The dashed lane on the left is the account root user, which does not enter the procedure at all - it is the single documented exception to implicit deny. Both terminals are drawn, because the two denials are different facts: an explicit deny names a statement, an implicit deny names an absence."
      >
        <IamEvaluationPipelineFigure />
      </PaperFigure>
      <P>Two details of the order are load-bearing and are usually dropped from summaries.</P>
      <H3>Resource control policies are evaluated before service control policies</H3>
      <P>
        RCPs attach on the resource side and constrain what may be done to resources in the account
        where they are attached; SCPs attach on the principal side and constrain what the
        account&rsquo;s principals may do. AWS evaluates RCPs first. One consequence is documented
        alongside the order: when RCPs are enabled, an AWS managed policy named{' '}
        <CODE>RCPFullAWSAccess</CODE> is automatically created and attached to every entity in the
        organisation - the root, each OU and each account - and it cannot be detached. There is
        therefore always an Allow at stage two, and an RCP-enabled organisation does not fail closed
        by accident.
      </P>
      <H3>The order of the two ceilings does not change any outcome</H3>
      <P>
        Because an explicit Deny short-circuits the whole procedure, and because both RCPs and SCPs
        deny only when no applicable Allow exists, swapping stages two and three cannot change a
        verdict. The documented order is worth following for consistency with AWS&rsquo;s own
        description, and worth knowing that nothing depends on it.
      </P>
      <Claim kind="inference">
        The order is not a priority list. Only stage one has priority in the ordinary sense: it can
        override everything. Stages two through seven are a sequence of gates, and a gate that is not
        reached cannot be blamed for a denial - which is what makes attribution possible at all.
      </Claim>

      <h2 id="sec-algebra">Short-circuit, ceiling, grant</h2>
      <P>
        The three roles compose in a way that can be written down once and applied to any request.
        Inside one account the two granting classes combine by union; around that union sit the
        ceilings, each intersecting with it; across accounts the union is replaced by a conjunction of
        two independent verdicts. Figure 2 draws all three relations, and the pseudocode below is the
        same thing as a procedure.
      </P>
      <PaperFigure
        n="2"
        caption="Three relations, not one rule. Left: inside a single account the identity-based and resource-based grants form a union, so an Allow in either is sufficient. Centre: the ceilings are nested rings around that grant - RCP outermost, then SCP, then permissions boundary, then session policy - and each ring can only shrink the area inside it. Right: a cross-account request is two separate evaluations divided by a trust boundary, one in the trusted account holding the principal and one in the trusting account holding the resource, and the request is allowed only if both return Allow. The same policy text therefore means different things depending on which side of the boundary it sits."
      >
        <IamPolicyAlgebraFigure />
      </PaperFigure>
      <PRE>{`// A specification of the documented single-account procedure.
// Not a transcript of AWS enforcement code, which is not public.
// There is no implementation of this in the RELIASTRA repository.

type Decision struct {
    Allowed   bool
    Stage     Stage  // which stage produced the outcome
    Statement string // Sid of the statement that decided, when one did
    Explicit  bool   // a Deny matched; false means the deny was implicit
}

func Evaluate(ctx RequestContext) Decision {
    if ctx.Principal.IsAccountRoot() {
        return Decision{Allowed: true, Stage: StageDefault}
    }

    p := ctx.ApplicablePolicies() // SCP, RCP, resource, identity, boundary, session

    // Stage 1 - deny evaluation, across every applicable policy type.
    if s := p.FirstMatchingDeny(ctx); s != nil {
        return Decision{false, StageDeny, s.Sid, true}
    }

    // Stage 2 - Organizations RCPs, attached on the resource side.
    if ctx.OrgHasRCPs() && !p.RCPs().AnyAllow(ctx) {
        return Decision{false, StageRCP, "", false}
    }

    // Stage 3 - Organizations SCPs, attached on the principal side.
    if ctx.OrgHasSCPs() && !p.SCPs().AnyAllow(ctx) {
        return Decision{false, StageSCP, "", false}
    }

    // Stage 4 - resource-based policies. The branch depends on the principal
    // the request actually carries, not on the class the policy names.
    if g := p.ResourceBased().GrantFor(ctx.Principal); g != nil {
        if g.DirectToSession() || g.ToIAMUserArn() || g.WildcardPrincipalArn() {
            return Decision{true, StageResource, g.Sid, false}
        }
        // A grant naming a role ARN does not return here: it must also survive
        // the ceilings that follow. See Table 2.
    }

    // Stage 5 - identity-based policies.
    i := p.IdentityBased().FirstAllow(ctx)
    if i == nil {
        return Decision{false, StageIdentity, "", false} // implicit deny
    }

    // Stage 6 - permissions boundary: intersection with the identity grant.
    if b := ctx.PermissionsBoundary(); b != nil && !b.Allows(ctx) {
        return Decision{false, StageBoundary, "", false}
    }

    // Stage 7 - session policies: intersection with the session grant.
    if !ctx.Principal.IsSession() {
        return Decision{true, StageSession, i.Sid, false}
    }
    sp := ctx.SessionPolicy() // absent: AWS creates a default session policy
    if sp != nil && !sp.Allows(ctx) {
        return Decision{false, StageSession, "", false}
    }
    return Decision{true, StageSession, i.Sid, false}
}`}</PRE>
      <P>
        The return type is the point. A procedure returning only Allow or Deny cannot answer the
        question an engineer has at 02:00, which is not &ldquo;was it allowed&rdquo; but &ldquo;what
        decided it&rdquo;. Carrying the stage and the statement id costs nothing in the specification
        and is the difference between an audit trail and a shrug.
      </P>
      <H3>One place the published procedure does not read cleanly</H3>
      <P>
        Stage seven is documented as a short sequence of bullets. A session policy that is present and
        does not allow the action produces a Deny. The next bullet states that the code then checks
        whether the principal is a role session and, if it is, that the request is allowed. A third
        states that a session policy which is present and does allow the action produces an Allow.
        Read in order, the second bullet appears to grant a role session a request the first has
        already denied.
      </P>
      <Claim kind="limitation">
        This paper does not resolve that reading, and it is reported rather than smoothed over. AWS
        publishes the algorithm as a specification and does not publish the enforcement code, so the
        ambiguity cannot be settled from documentation alone. The charitable reading - that the middle
        bullet describes the case where no session policy was passed and a default one was created -
        is consistent with the surrounding text, but it is a reading. An engineer whose design depends
        on the behaviour of a role session against a non-allowing session policy should test it in an
        account rather than trust a paragraph.
      </Claim>

      <h2 id="sec-union">Same-account union, and the tightening fallacy</h2>
      <P>
        Can a resource-based policy allow access on its own? Inside a single account, yes: AWS
        evaluates the permissions granted by the identity-based and resource-based policies together
        and the result is the union of the two. If an action is allowed by an identity-based policy, a
        resource-based policy, or both, AWS allows the action, and an explicit deny in either
        overrides the allow. Across accounts the answer is no.
      </P>
      <P>
        The union rule has a corollary that designers routinely get backwards. Because the two
        granting classes combine by union, a restrictive resource-based policy cannot reduce what a
        permissive identity-based policy grants. The intended design - broad role policy, tight bucket
        policy, effective permissions narrowed - does not describe what the procedure does. The broad
        Allow survives.
      </P>
      <PaperFigure
        n="3"
        caption="The same two policies under two models. Left, the designer model: a broad identity-based Allow intersected with a restrictive bucket policy, producing narrowed effective permissions. Centre, the documented outcome: the two combine by union, so the broad Allow survives unchanged and the bucket policy has added nothing that the identity policy did not already grant. Right, the four mechanisms that do reduce effective permissions inside one account - a permissions boundary, a service control policy, a resource control policy, or an explicit Deny statement. Only the last of the four overrides; the other three cap."
      >
        <IamTighteningFallacyFigure />
      </PaperFigure>
      <Claim kind="fact">
        Inside one account a resource-based policy adds permission and never removes it. Removal
        requires a ceiling - permissions boundary, SCP, RCP - or an explicit Deny. A design that
        intends to constrain a principal by writing a restrictive policy on the resource has, inside a
        single account, written nothing at all.
      </Claim>
      <P>
        The same asymmetry explains a recurring incident pattern: a team finds that a role can read a
        bucket it should not, searches the identity policies, finds no grant, and concludes IAM is
        misconfigured. It is - the grant is in the bucket policy. The search was conducted in the
        class the team authors most often, and the union means the other class is equally sufficient.
      </P>

      <h2 id="sec-principals">The principal-type branch</h2>
      <P>
        The union rule is usually stated flatly: identity-based or resource-based, either is enough.
        AWS&rsquo;s own specification is more precise, and the precision matters, because whether a
        resource-based Allow survives an implicit deny in a permissions boundary or a session policy
        depends on which principal the policy names.
      </P>
      <P>
        Within the same account, a resource-based policy that grants permission directly to an IAM
        user ARN - not a federated session - is not limited by an implicit deny in an identity-based
        policy or a permissions boundary. A grant to an IAM role <em>session</em> ARN is granted
        directly to the assumed-role session, and permissions granted directly to a session are not
        limited by an implicit deny in an identity-based policy, a permissions boundary, or a session
        policy. A grant to an IAM role ARN, by contrast, <em>is</em> limited by an implicit deny in a
        permissions boundary or session policy - and the principal making the request is the role
        session, not the role.
      </P>
      <P>
        The distinction between the last two is one ARN format, and it decides whether a ceiling
        applies. A grant naming <CODE>arn:aws:iam::111122223333:role/examplerole</CODE> is capped by
        the boundary on that role. A grant naming{' '}
        <CODE>arn:aws:sts::111122223333:assumed-role/examplerole/sessionname</CODE> is not.
      </P>
      <DataPanel label="Table 2 · Whether a resource-based Allow survives an implicit deny, by principal form" source="AWS IAM User Guide, policy evaluation logic and permissions boundaries. Accessed 13 September 2026. Cells reading 'not stated' are cases the documentation does not address; they are listed in the paper's limitations.">
        <DataTable
          caption="A resource-based grant inside one account, by the principal form it names"
          align="left"
          head={['Principal named in the resource-based policy', 'Capped by identity-based implicit deny', 'Capped by permissions boundary', 'Capped by session policy']}
          rows={[
            ['IAM user ARN (not a federated session)', 'no', 'no', 'not applicable - not a session principal'],
            ['IAM role ARN', 'not stated for this form', 'yes', 'yes'],
            ['IAM role session ARN', 'no', 'no', 'no'],
            ['aws:PrincipalArn condition key with a wildcard Principal', 'only via an explicit deny', 'no', 'no'],
            ['STS federated user ARN (GetFederationToken)', 'no', 'no', 'no'],
            ['ARN of the IAM user who federated', 'not stated for this form', 'yes', 'yes'],
          ]}
          note="The wildcard row carries a documented condition: permissions boundaries and session policies do not limit permissions granted using the aws:PrincipalArn condition key with a wildcard in the Principal element, unless the identity-based policies contain an explicit deny. The federating-user row is the inverse of the federated-user row - granting to the ARN of the user who called GetFederationToken does subject the session to an implicit deny in a boundary or session policy."
        />
      </DataPanel>
      <Claim kind="inference">
        The interaction between resource-based policies and ceilings is not one rule but a function of
        the principal form the policy names. Summaries stating &ldquo;a permissions boundary limits
        identity-based policies only&rdquo; are incomplete in a way that produces real defects: the
        same bucket policy caps one role and not another, depending on whether it names the role or
        the role session.
      </Claim>
      <P>
        A documented footgun sits adjacent to this table. AWS warns against resource-based statements
        combining a <CODE>NotPrincipal</CODE> element with a <CODE>Deny</CODE> effect for principals
        that have a permissions boundary attached: such a statement always denies them regardless of
        the values listed in <CODE>NotPrincipal</CODE>, and the recommended construction is{' '}
        <CODE>ArnNotEquals</CODE> on <CODE>aws:PrincipalArn</CODE> instead. A Deny written to exclude
        a list of principals can therefore exclude everybody with a boundary - the population an
        organisation has deliberately chosen to govern.
      </P>

      <h2 id="sec-cross">Cross-account: two verdicts, one decision</h2>
      <P>
        Why does cross-account access need an Allow on both sides? Because AWS performs two
        evaluations rather than one. The account holding the principal is the trusted account; the
        account holding the resource is the trusting account. AWS evaluates the request in the trusted
        account against the identity-based policy and the policies that can limit it, and separately
        in the trusting account against the resource-based policy and its own limiters. The request is
        allowed only if both evaluations return Allow.
      </P>
      <P>
        The union rule does not survive the boundary. Inside one account either grant is sufficient;
        across accounts both are necessary. That change of connective is responsible for the most
        common cross-account failure sequence: the calling side is authored, tested in isolation,
        found correct, and the request still fails - because the trusting account has not been asked
        anything yet.
      </P>
      <UL>
        <LI>
          <strong>Two ceilings, not one.</strong> An SCP in the trusted account can stop the principal
          from making the call; an SCP or RCP in the trusting account can stop the resource from being
          touched. A request can be denied by an organisation the caller&rsquo;s team has no
          visibility into.
        </LI>
        <LI>
          <strong>The resource owner keeps the final word.</strong> The trusting account controls the{' '}
          <CODE>Principal</CODE> element, which is the design reason the pattern exists: a resource
          owner can grant access to an external principal without anyone editing that
          principal&rsquo;s identity policies.
        </LI>
        <LI>
          <strong>Role assumption is a different mechanism.</strong> A trust policy is a
          resource-based policy governing who may assume a role; after assumption, the session&rsquo;s
          access is defined by the role&rsquo;s identity-based policies. Cross-account access through
          a role is therefore one resource-based grant plus a second, single-account evaluation - not
          a standing cross-account grant on every resource.
        </LI>
        <LI>
          <strong>Other services participate.</strong> AWS notes that Resource Access Manager policy
          fragments can control which actions principals may perform on shared resources, so the
          applicable policy set is not limited to the classes in Table 1.
        </LI>
      </UL>
      <P>
        The trust boundary here is the same object RELIASTRA draws around a third-party API
        dependency, in a different plane: in{' '}
        <a href={researchRoute('ai-api-trust-boundary')}>
          the trust boundary of an AI API dependency
        </a>{' '}
        the question is what leaves a domain the consumer controls, and here it is what that domain
        will accept from outside. Both fail in the direction of an error message that names the wrong
        component.
      </P>

      <h2 id="sec-matrix">The decision matrix</h2>
      <P>
        The invariants and the principal-type branch generate a matrix. Table 3 enumerates it: every
        row is a request context, and the decision in each follows from the stage named beside it.
        Rows carry stable identifiers so a later revision can add cases without renumbering the ones
        already cited elsewhere.
      </P>
      <DataPanel label="Table 3 · Decision matrix, single-account and cross-account" source="Derived from the documented procedure in AWS IAM User Guide, policy evaluation logic, cross-account policy evaluation logic, and permissions boundaries. Accessed 13 September 2026. 'silent' means the policy class applies to the request and contains no matching Allow; 'none' means the class contains no statement for this action at all.">
        <DataTable
          caption="Twenty-six request contexts and the stage that decides each"
          align="left"
          head={['Row', 'Request context', 'Identity', 'Resource', 'Ceiling', 'Decision', 'Decided at']}
          rows={[
            ['M-01', 'same account · IAM user', 'Allow', 'none', 'none', 'ALLOW', 'stage 5'],
            ['M-02', 'same account · user ARN named in resource policy', 'none', 'Allow', 'none', 'ALLOW', 'stage 4'],
            ['M-03', 'same account · user ARN named, boundary attached', 'none', 'Allow', 'boundary silent', 'ALLOW', 'stage 4'],
            ['M-04', 'same account · role session ARN named', 'none', 'Allow', 'boundary + session silent', 'ALLOW', 'stage 4'],
            ['M-05', 'same account · role ARN named', 'none', 'Allow', 'boundary silent', 'DENY', 'stage 6'],
            ['M-06', 'same account · role ARN named, identity grants', 'Allow', 'Allow', 'boundary silent', 'DENY', 'stage 6'],
            ['M-07', 'same account · role session', 'Allow', 'none', 'boundary allows', 'ALLOW', 'stage 6'],
            ['M-08', 'same account · role session', 'Allow', 'none', 'boundary silent', 'DENY', 'stage 6'],
            ['M-09', 'same account · role session, session policy passed', 'Allow', 'none', 'session policy silent', 'DENY', 'stage 7'],
            ['M-10', 'same account · role session, no session policy passed', 'Allow', 'none', 'default session policy', 'ALLOW', 'stage 7'],
            ['M-11', 'same account · Deny matches in the identity policy', 'Allow + Deny', 'Allow', 'none', 'DENY', 'stage 1'],
            ['M-12', 'same account · Deny matches in the bucket policy', 'Allow', 'Deny', 'none', 'DENY', 'stage 1'],
            ['M-13', 'same account · SCP applies', 'Allow', 'none', 'SCP silent', 'DENY', 'stage 3'],
            ['M-14', 'same account · RCP applies', 'Allow', 'none', 'RCP silent', 'DENY', 'stage 2'],
            ['M-15', 'same account · RCPs enabled, only RCPFullAWSAccess attached', 'Allow', 'none', 'RCP allows', 'ALLOW', 'passes stage 2'],
            ['M-16', 'same account · nothing grants', 'none', 'none', 'none', 'DENY', 'stage 5, implicit'],
            ['M-17', 'same account · aws:PrincipalArn with wildcard Principal', 'Allow', 'Allow', 'boundary silent', 'ALLOW', 'stage 4 carve-out'],
            ['M-18', 'same account · Deny with NotPrincipal, principal has a boundary', 'Allow', 'Deny', 'none', 'DENY', 'stage 1'],
            ['M-19', 'same account · federated user ARN named', 'none', 'Allow', 'boundary silent', 'ALLOW', 'stage 4'],
            ['M-20', 'same account · federating user ARN named', 'none', 'Allow', 'boundary silent', 'DENY', 'stage 6'],
            ['M-21', 'cross-account · role in Account A, resource in Account B', 'Allow in A', 'Allow in B', 'none', 'ALLOW', 'both verdicts'],
            ['M-22', 'cross-account · trusting account grants nothing', 'Allow in A', 'none in B', 'none', 'DENY', 'trusting evaluation'],
            ['M-23', 'cross-account · trusted account grants nothing', 'none in A', 'Allow in B', 'none', 'DENY', 'trusted evaluation'],
            ['M-24', 'cross-account · SCP in the trusting account denies', 'Allow in A', 'Allow in B', 'SCP deny in B', 'DENY', 'stage 1 in B'],
            ['M-25', 'same account · sts:AssumeRole, trust policy silent', 'Allow sts:AssumeRole', 'trust policy silent', 'none', 'DENY', 'trust policy exception'],
            ['M-26', 'same account · kms:Decrypt, key policy silent', 'Allow kms:Decrypt', 'key policy silent', 'none', 'DENY', 'key policy exception'],
          ]}
          note="Rows M-03, M-04, M-17 and M-19 are the ones that contradict the flat statement of the union rule: a resource-based Allow that is not capped by a ceiling which does apply to the principal. Rows M-05, M-06, M-08, M-20 and M-26 are the ones that contradict the belief that a grant is a grant: the ceiling or the exception decides. Rows M-22 and M-23 are the two halves of the cross-account conjunction, and they produce the same error string."
        />
      </DataPanel>
      <P>
        The matrix is not a truth table over independent variables, and reading it as one is the
        mistake it exists to prevent. The principal form in the resource-based policy is not
        independent of the ceilings: it selects them. Two rows that look identical from the policy
        text - a role and a role session, both granted by the same bucket policy, both under the same
        boundary - decide differently, and nothing in the bucket policy distinguishes them.
      </P>

      <h2 id="sec-exceptions">Where the union rule stops</h2>
      <P>
        For most resources an explicit Allow in either an identity-based policy or a resource-based
        policy is sufficient. AWS documents the exceptions explicitly, and they are the cases that
        break the mental model built from S3.
      </P>
      <UL>
        <LI>
          <strong>IAM role trust policies must explicitly allow.</strong> A trust policy is a
          resource-based policy whose subject is the assumption itself. It grants nothing beyond{' '}
          <CODE>sts:AssumeRole</CODE> and its variants; what the resulting session can do is defined
          by the role&rsquo;s identity-based policies. An identity-based Allow for{' '}
          <CODE>sts:AssumeRole</CODE> with no corresponding trust policy statement is a denial, not a
          partial success.
        </LI>
        <LI>
          <strong>KMS key policies must explicitly allow.</strong> The key policy is the authoritative
          control for a customer managed key: an identity-based Allow for <CODE>kms:Decrypt</CODE>{' '}
          does nothing unless the key policy grants the principal or delegates to account IAM. The
          failure surfaces as a decryption error several hops from the key, which is why it is
          commonly misattributed to the calling service.
        </LI>
        <LI>
          <strong>Other services may require the same.</strong> AWS states that resource-based policies
          for services other than IAM and KMS may also require an explicit Allow within the same
          account, and refers the reader to the documentation for the specific service. The union rule
          is the general case, not a universal one, and the general case is the one that gets
          memorised.
        </LI>
        <LI>
          <strong>SCPs do not apply to every principal.</strong> Service-linked roles are outside SCP
          restrictions, because the service must be able to act on the account&rsquo;s behalf. An
          organisational guardrail is therefore not a complete statement about what can happen in an
          account.
        </LI>
        <LI>
          <strong>Condition operators change the meaning of a Deny.</strong> <CODE>Bool</CODE> treats
          a missing context key as no match; <CODE>BoolIfExists</CODE> treats a missing key as a
          match. A Deny intended to block unauthenticated sessions and written with <CODE>Bool</CODE>{' '}
          on <CODE>aws:MultiFactorAuthPresent</CODE> does not fire for a session where the key is
          absent - precisely the session the statement was written to stop.
        </LI>
      </UL>
      <PRE>{`// The exceptions, as predicates on the request. Each is evaluated before the
// general procedure is allowed to conclude anything about a grant.

func RequiresExplicitResourceAllow(ctx RequestContext) bool {
    switch {
    case ctx.ActionIs("sts:AssumeRole", "sts:AssumeRoleWithWebIdentity"):
        return true // the trust policy must name the principal
    case ctx.ServiceIs("kms"):
        return true // the key policy is authoritative, or delegates to account IAM
    default:
        return false // for most resources: identity OR resource is sufficient
    }
}

func OutsideImplicitDeny(ctx RequestContext) bool {
    return ctx.Principal.IsAccountRoot()
}

func OutsideCeilings(ctx RequestContext) bool {
    return ctx.Principal.IsServiceLinkedRole() // SCPs do not apply
}

// Documented interaction, not an inference: a Deny carrying NotPrincipal always
// denies an IAM principal that has a permissions boundary attached, whatever
// NotPrincipal lists. AWS recommends ArnNotEquals on aws:PrincipalArn instead.
func NotPrincipalDenyIsUnsafe(stmt Statement, pr Principal) bool {
    return stmt.Effect == Deny && stmt.HasNotPrincipal() && pr.HasPermissionsBoundary()
}

// Bool treats an absent context key as no match; BoolIfExists treats it as a
// match. A Deny guarding MFA written with Bool does not fire when the key is
// absent - the case it was written for.
func DenyFiresWhenKeyAbsent(op ConditionOperator) bool {
    return op == BoolIfExists
}`}</PRE>
      <P>
        AWS&rsquo;s policy validation guidelines constrain the language further in ways that interact
        with these exceptions: <CODE>NotAction</CODE> may appear only in Deny statements, and Allow
        statements in some managed contexts must be more specific than a bare service wildcard. The
        Deny-only restriction is not stylistic. It follows from the algebra: a ceiling expressed as
        &ldquo;everything except&rdquo; is a grant in disguise, and grants belong in the granting
        classes.
      </P>

      <h2 id="sec-verification">Can a policy change be verified before it is deployed?</h2>
      <P>
        Partly. Four routes exist and none is complete. The IAM Policy Simulator answers a
        request-shaped question - will this principal be allowed to perform this action on this
        resource - evaluating identity-based policies and SCPs including their condition keys and
        resource scoping. It does not accept session policies, it does not evaluate RCPs, and AWS
        states plainly that simulation of resource-based policies is not supported for IAM roles and
        that results can differ from the live environment.
      </P>
      <P>
        IAM Access Analyzer&rsquo;s custom policy checks answer a different question shape.{' '}
        <CODE>check-no-new-access</CODE> compares two policy documents and returns PASS or FAIL with
        reasons; <CODE>check-access-not-granted</CODE> checks that a specified access is not allowed
        by a policy document. Both take a policy type as input and neither takes a request context:
        no principal, no condition values, no ceiling. They are policy-diff checks - the right
        instrument in a pipeline gate, but unable to say whether a particular assumed-role session
        from a particular account may read a particular object.
      </P>
      <PaperFigure
        n="4"
        caption="Verification capability by policy class and route. The two cheap pre-deployment routes each leave at least one class unevaluated: the simulator does not accept session policies, does not evaluate RCPs, and does not simulate resource-based policies for IAM roles; the Access Analyzer checks take policy documents rather than request contexts, so no ceiling and no principal is in scope. The live API call evaluates every class, but only for the request actually issued, and it is the action itself. The decoded authorization message arrives after a denial and distinguishes an explicit deny from an absent allow without naming the class that decided. The line at the bottom is the finding: no single pre-deployment route covers all seven classes."
      >
        <IamVerificationGapFigure />
      </PaperFigure>
      <DataPanel label="Table 4 · What each verification route decides, and what it does not" source="AWS IAM API Reference, SimulatePrincipalPolicy and SimulateCustomPolicy; AWS CLI Reference, accessanalyzer check-no-new-access; AWS STS API Reference, DecodeAuthorizationMessage. Accessed 13 September 2026.">
        <DataTable
          caption="Four routes, by the question shape each can answer"
          align="left"
          head={['Route', 'Decides', 'Does not decide', 'Documented limit']}
          rows={[
            [
              'IAM Policy Simulator',
              'a specific action, on a specific resource, for a specific principal, including SCP condition keys and resource scoping',
              'RCPs, session policies, and resource-based policies where the principal is an IAM role',
              'AWS: simulation of resource-based policies is not supported for IAM roles; results can differ from the live environment',
            ],
            [
              'Access Analyzer custom policy check',
              'whether a policy document grants, or newly grants, a specified access',
              'the request context - no principal, no condition values, no ceilings',
              'inputs are two policy documents and a policy type; output is PASS or FAIL with reasons',
            ],
            [
              'Live API call',
              'the real decision, for every policy class',
              'anything beyond the one request issued',
              'the call is the action; it is auditable, and for write actions it is not reversible',
            ],
            [
              'sts:DecodeAuthorizationMessage',
              'explicit deny versus absent allow, plus principal, action, resource and condition key values',
              'which policy class decided',
              'only certain operations return an encoded message; decoding requires sts:DecodeAuthorizationMessage',
            ],
          ]}
          note="The two pre-deployment routes answer different question shapes, which is why neither substitutes for the other. A pipeline that runs only the simulator cannot gate a policy diff; a pipeline that runs only Access Analyzer cannot answer a support engineer's question about one principal."
        />
      </DataPanel>
      <P>
        The simulator&rsquo;s surface moved recently. In July 2026 AWS migrated it into the IAM
        console, retired the standalone simulator site, added SCP condition and custom SCP hierarchy
        support to the API, and added a policy-exclusion parameter so a caller can ask what would
        happen if a specific attached policy were removed. That parameter is the most useful of the
        three for this section&rsquo;s question: it is the closest thing to an authoritative answer to
        &ldquo;which of these policies is doing the work&rdquo;.
      </P>
      <P>
        A separate limitation is reported by a third party and is not confirmed by AWS. An open
        aws-cli issue filed in May 2026 states that <CODE>simulate-principal-policy</CODE> and{' '}
        <CODE>simulate-custom-policy</CODE> parse and structurally validate a role trust policy passed
        as a resource policy, then discard it before evaluation for <CODE>sts:Assume*</CODE> actions -
        so a CI gate built on simulator output cannot catch a trust-policy regression. The
        reporter&rsquo;s recommended alternative is the Access Analyzer checks. This paper records
        that report as a report.
      </P>
      <PRE>{`// Which route can decide this, before it is issued?

func PlanVerification(ctx RequestContext) []Route {
    var routes []Route

    // A policy-document question: does the new document grant what the old one did not?
    if ctx.Question == QuestionPolicyDiff {
        routes = append(routes, AccessAnalyzerCheckNoNewAccess) // PASS / FAIL + reasons
    }

    // A request question: will this principal be allowed, on this resource, now?
    if ctx.Question == QuestionRequestDecision {
        if ctx.HasRCPs() || ctx.HasSessionPolicy() || ctx.PrincipalIsIAMRole() {
            // Outside what the simulator evaluates. Only the control plane can decide.
            routes = append(routes, LiveCallInSandbox, CloudTrailAfterTheFact)
        } else {
            routes = append(routes, PolicySimulator, LiveCallInSandbox)
        }
    }

    // An attribution question: a denial already happened. Which class decided?
    if ctx.Question == QuestionWhyDenied {
        routes = append(routes,
            DecodeAuthorizationMessage, // explicit deny, or absent allow
            CloudTrailUserIdentity,     // which principal form made the request
            PolicyInventory,            // the statement, once the branch is known
        )
    }

    return routes // cheapest first; every route after the first is corroboration
}`}</PRE>
      <Claim kind="inference">
        The verification gap is structural rather than incidental. A simulator that accepted session
        policies and RCPs would still only answer for the request it was given, and a policy-diff
        checker that accepted a request context would no longer be a policy-diff checker. A control
        plane change therefore cannot be fully gated before deployment: the gate covers the classes
        the tooling evaluates, and the residue has to be handled by construction - narrow grants,
        ceilings rather than denials, and a sandbox account where the live call is cheap.
      </Claim>

      <h2 id="sec-formal">A solved problem, at a scale practitioners do not use</h2>
      <P>
        Deciding what a policy permits is not a lookup. AWS formalised its policy language and built
        an analysis tool, Zelkova, that encodes policy semantics into SMT formulas over the theories
        of strings, regular expressions, bit vectors and integer comparison; the published account
        describes the underlying problem as PSPACE-complete and the engine as invoked millions of
        times daily. A later paper describes scaling it from roughly a thousand SMT invocations a day
        to a billion over five years, with a synchronous call on policy attachment to determine
        whether a policy grants unrestricted public access. A third describes the abstraction that
        made the engine usable by people who will never write a specification: stratified predicate
        abstraction, deployed behind IAM Access Analyzer, which collapses equivalent concrete requests
        into findings that are sound - they include every request the policy would grant - and as
        precise as the abstraction allows.
      </P>
      <OL>
        <LI>
          The hard part has been solved and the solution is exposed as a service. &ldquo;Who can reach
          this resource&rdquo; is a question Access Analyzer answers by enumeration rather than by
          reading - a better instrument than manual review for exactly the error the union rule
          produces: a grant nobody intended, in a class nobody read.
        </LI>
        <LI>
          Symbolic analysis is why &ldquo;no new access&rdquo; is a checkable property. A diff-based
          gate is not a heuristic; it compares two policy semantics, and the PASS or FAIL it returns
          has a formal meaning.
        </LI>
        <LI>
          Manual review remains necessary for intent. An engine can prove what a policy grants. It
          cannot say whether granting it was the decision anyone meant to make, and the published work
          is explicit that the abstraction exists to make the answer reviewable by a human rather than
          to replace the review.
        </LI>
      </OL>

      <h2 id="sec-attribution">Attributing an AccessDenied to the class that decided it</h2>
      <P>
        Why does an AccessDenied arrive when the identity policy allows the action? Because the
        identity policy is one of seven classes, and the denial may have been produced by any of them
        - including two that live in an organisation&rsquo;s management account and one that lives on
        the resource. Attribution requires evidence about which stage decided, and the available
        evidence is uneven.
      </P>
      <PaperFigure
        n="5"
        caption="Four evidence sources, in the order they should be consulted, and what each yields. The error message text sometimes names the deciding layer, and its wording varies by service, so it is partial evidence. The decoded authorization message states whether the denial was an explicit deny or an absent allow, together with the principal, action, resource and condition key values, but it does not name the policy class. The CloudTrail userIdentity type is the discriminator that the rest of the analysis depends on: whether the request came from an IAM user, an assumed-role session, a federated user session or the account root user selects which branch of the resource-based rule applied, and therefore whether a permissions boundary or session policy could have capped it. Only once the branch is known does the account policy inventory identify the statement that matched."
      >
        <IamAttributionPathFigure />
      </PaperFigure>
      <P>
        The decoded message is the strongest available evidence and it is weaker than it is usually
        described. AWS documents its contents: whether the request was denied because of an explicit
        deny or because of the absence of an explicit allow, the principal, the requested action, the
        requested resource, and the values of condition keys in the context of the request. It does
        not document the deciding policy class among them. The message is encoded in the first place
        because it can contain privileged information the requester should not see, only certain
        operations return one at all, and decoding requires{' '}
        <CODE>sts:DecodeAuthorizationMessage</CODE> permission.
      </P>
      <P>
        The step usually skipped carries the most information. CloudTrail records the principal for
        every call, including its type, its ARN and - for temporary credentials - a session context
        carrying the issuing role and session attributes. That type is not metadata. It is the input
        to the principal-type branch in Table 2, and it determines whether the request was even
        eligible to be capped by the boundary or session policy the reviewer is about to spend an hour
        reading.
      </P>
      <Claim kind="recommendation">
        Read <CODE>userIdentity.type</CODE> before reading any policy. An <CODE>AssumedRole</CODE>{' '}
        principal whose bucket policy names the role session ARN was never subject to the boundary; an{' '}
        <CODE>AssumedRole</CODE> principal whose bucket policy names the role ARN was. The two
        investigations start in different files, and the CloudTrail record is the only place that says
        which one.
      </Claim>
      <P>
        This is the attribution problem RELIASTRA exists to solve for dependency failures, in a
        different plane: a failure observed at the application, caused in a control plane the
        application team does not own, with evidence spread across records written by different
        parties. The discipline is identical, and it is published in{' '}
        <a href={researchRoute('how-reliastra-measures-vendor-reliability')}>
          how RELIASTRA measures vendor reliability
        </a>
        .
      </P>

      <h2 id="sec-nonhuman">Non-human identities run the same procedure</h2>
      <P>
        Nothing in the seven stages distinguishes a human from a workload. A service-linked role, an
        assumed role in a CI pipeline, a federated session minted by <CODE>GetFederationToken</CODE>{' '}
        and an agent holding temporary credentials are all principals, evaluated by the same
        procedure. Two properties of that population change what the procedure means in practice.
      </P>
      <UL>
        <LI>
          <strong>Sessions outnumber identities.</strong> The principal making a request under an
          assumed role is the role session ARN, not the role ARN, and a resource-based policy granting
          to the session form bypasses ceilings that would have applied to the role form. A population
          of short-lived sessions is not a smaller version of a population of users: its grants are
          systematically less constrained by boundaries, unless the policies naming them are written
          against the role.
        </LI>
        <LI>
          <strong>Review cadence does not match grant cadence.</strong> An identity policy is reviewed
          when it changes; so is a resource-based policy. Neither review sees the interaction, because
          the interaction depends on the principal form at request time - chosen by whoever mints the
          session, usually in code, usually not in a document anyone reviews.
        </LI>
      </UL>
      <P>
        The zero-trust framing is the right one, and it is worth being precise about what it buys
        here. NIST SP 800-207 requires that no resource be trusted by virtue of its location and that
        every access be authorised per request. IAM satisfies the per-request half structurally: the
        procedure runs on every call and the default is deny. What it does not supply is a per-request
        statement of <em>why</em> the call was allowed. That has to be reconstructed from the policy
        inventory and the principal form.
      </P>

      <h2 id="sec-scope">What this paper does not cover</h2>
      <P>
        The scope is the single-account procedure and the cross-account conjunction as documented,
        with the verification and attribution consequences of both. The limitations section below
        states what this paper cannot establish. Four further subjects are outside it by choice:
      </P>
      <UL>
        <LI>
          <strong>Privilege escalation paths.</strong> Which identity actions compose into permissions
          a principal did not start with is a distinct subject with its own literature, and it
          presupposes the evaluation model rather than describing it.
        </LI>
        <LI>
          <strong>VPC endpoint policies</strong>, which add a further evaluation surface on the network
          path rather than on the principal or the resource.
        </LI>
        <LI>
          <strong>ABAC and tag-based authorisation as a design pattern.</strong> Condition keys appear
          here only where they change the evaluation - <CODE>aws:PrincipalArn</CODE>,{' '}
          <CODE>aws:MultiFactorAuthPresent</CODE>, and <CODE>Bool</CODE> versus{' '}
          <CODE>BoolIfExists</CODE>.
        </LI>
        <LI>
          <strong>Per-service enumeration.</strong> Which actions support resource-based policies, and
          how each service combines them with identity policies, is documented service by service.
          S3, KMS and IAM role trust policies appear as examples; no service catalogue is attempted.
        </LI>
      </UL>

      <h2 id="sec-conclusion">Conclusion</h2>
      <P>
        Every authorisation decision in AWS reduces to one procedure: an implicit deny as the default,
        an explicit deny that overrides everything, two granting classes that combine by union inside
        an account and by conjunction across accounts, and four ceilings that can only subtract.
        Stated that way, most production surprises are not mysteries but arithmetic - and the
        arithmetic depends on inputs, principally the form of the principal named in a resource-based
        policy, that are chosen in code and reviewed nowhere.
      </P>
      <P>
        The uncomfortable finding is the one about verification. The procedure is deterministic and
        AWS operates a formal engine against it at the scale of a billion queries a day, yet no route
        available to a practitioner before deployment evaluates all seven classes. The gap is closed
        by construction rather than by testing: narrow grants, ceilings instead of denials, a sandbox
        where the live call is the cheapest instrument, and an attribution habit that starts with the
        CloudTrail principal type. The six changes that follow from this model are listed in Practical
        architecture implications below, in the order they pay for themselves. Policies written this
        way will be evaluated by the same procedure for the life of the account, and - which is the
        actual point - a reader will be able to say which stage decided.
      </P>
    </>
  ),

  evidence: (
    <UL>
      <LI>
        Every statement about the evaluation order, the union rule, the cross-account conjunction, the
        principal-type branch and the documented exceptions is cited to an AWS primary source in the
        references below, each with the date it was read.
      </LI>
      <LI>
        The decision matrix (Table 3) is not a set of observations. Each row is derived by applying the
        documented procedure to a stated request context; the row identifiers are stable so a later
        revision can add cases without renumbering the ones already cited.
      </LI>
      <LI>
        The verification-capability matrix (Table 4 and Figure 4) is assembled from the AWS API and CLI
        references for each route, plus one third-party report that is labelled as a report and not as
        AWS-confirmed behaviour.
      </LI>
      <LI>
        The formal-methods section cites three peer-reviewed papers by their DOI: the Zelkova encoding
        of the AWS policy language into SMT, the stratified abstraction deployed as the engine behind
        IAM Access Analyzer, and the published account of scaling that engine to a billion SMT queries
        a day.
      </LI>
      <LI>
        What is absent is stated rather than filled in. No AWS account was used, no simulator response
        was captured, and no policy was evaluated against a live control plane. Where AWS does not
        document a case - the ceiling behaviour of two principal forms in Table 2, and the third bullet
        of the session-policy stage - the cell reads &ldquo;not stated&rdquo; and the ambiguity is
        carried into the limitations.
      </LI>
    </UL>
  ),

  methodology: (
    <>
      <P>
        This is an architecture analysis of a published specification, in four steps. First, the
        primary sources were read in full rather than summarised from secondary commentary: the IAM
        User Guide pages on policy evaluation logic, cross-account evaluation and permissions
        boundaries, the Organizations User Guide pages on SCPs and RCPs, and the API and CLI
        references for each verification route. Second, the documented procedure was restated as an
        algebra over policy classes, separating the stages that short-circuit from those that cap and
        those that grant. Third, the algebra was applied exhaustively to enumerate the request
        contexts in Table 3, and the exceptions AWS documents were expressed as predicates that fire
        before the general procedure concludes anything. Fourth, the verification routes were compared
        by question shape rather than by feature list, which is what exposes the gap in Figure 4.
      </P>
      <P>
        Every source was read on 13 September 2026 and carries that access date. Where a claim rests on
        a report by a third party rather than on AWS documentation - the May 2026 aws-cli issue about
        trust policies being discarded during simulation, and the July 2026 account of the
        simulator&rsquo;s migration into the IAM console - the paper says so at the point of use and in
        the reference note. The three pseudocode blocks specify documented behaviour; they are not a
        transcript of AWS enforcement code, which is not public, and no implementation of them exists
        in this repository.
      </P>
      <P>
        The standard this paper is written against, including what RELIASTRA refuses to publish, is
        the <a href={researchRoute('reliastra-research-agenda')}>RELIASTRA research agenda</a>.
      </P>
    </>
  ),

  related: [
    {
      href: researchRoute('ai-api-trust-boundary'),
      label: 'The trust boundary of an AI API dependency',
      description:
        'The same boundary in a different plane: what leaves a domain you control, rather than what it accepts from outside.',
    },
    {
      href: researchRoute('how-reliastra-measures-vendor-reliability'),
      label: 'How RELIASTRA measures vendor reliability',
      description: 'The attribution discipline applied to dependency failure, and its refusals.',
    },
    {
      href: researchRoute('reliastra-research-agenda'),
      label: 'The RELIASTRA research agenda',
      description: 'What the corpus intends to publish, and what it will not.',
    },
    {
      href: '/glossary/control-plane',
      label: 'Control plane',
      description: 'The definition, and why a control-plane failure presents as an application bug.',
    },
    {
      href: PUBLIC_ROUTES.track,
      label: 'Public dependency index',
      description: 'Independently measured records for the vendors made public.',
    },
  ],
};
