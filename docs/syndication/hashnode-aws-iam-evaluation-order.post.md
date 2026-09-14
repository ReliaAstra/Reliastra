> **Originally published as a RELIASTRA Research paper:** [AWS IAM policy evaluation logic: identity vs resource](https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order). This post is the practitioner's cut of that paper - same findings, less apparatus. Where the two ever disagree, the paper is canonical.

## The loop is hiding the procedure from you

I learned IAM the way most people do: write a policy, make the call, read the `AccessDenied`, widen the policy, repeat until green. The method works, which is why it survives. It also conceals the one thing that matters: a single deterministic procedure runs on every request, across seven classes of policy, and the outcome is decided before any of your iteration reaches it.

Policies written that way are not wrong. They are unaudited - nobody ever wrote down which stage of the procedure produced the behaviour being observed.

## Seven stages, three jobs

AWS publishes the order. Inside one account, after authentication and resolving the applicable policy set:

1. **Explicit Deny** - scanned across *every* applicable policy type. A match ends the request.
2. **Resource control policies (RCP)** - Organizations, attached on the resource side.
3. **Service control policies (SCP)** - Organizations, attached on the principal side.
4. **Resource-based policies** - bucket policies, key policies, queue policies, trust policies.
5. **Identity-based policies** - what is attached to the user, group or role.
6. **Permissions boundary** - the ceiling on that principal.
7. **Session policies** - the ceiling on this session.

Only stages 4 and 5 can grant anything. An `Allow` you write into an SCP, an RCP, a boundary or a session policy is inert: it removes an organisational objection to a permission that still has to be granted somewhere else. And only stage 1 overrides; stages 2, 3, 6 and 7 cap.

![Figure 1 - the seven stages of AWS single-account policy evaluation, each labelled with its algebraic role](./figures/syndication/fig-1-evaluation-pipeline.png)

*One stage short-circuits, four stages cap, two stages grant. The dashed lane is the account root user, which never enters the procedure at all - the single documented exception to implicit deny.*

That is three jobs, not seven rules: one **short-circuit**, four **ceilings**, two **grants**. Most production surprises I have debugged in this area are a misassignment of a class to a job - usually the belief that a ceiling grants, or that a grant caps.

## The same-account union, and the design it ruins

Inside one account, identity-based and resource-based grants combine by **union**: if either allows the action, AWS allows it. Which kills a design nearly every team ships:

> broad role policy + tight bucket policy = narrowed effective permissions

No. The union keeps the broad `Allow` exactly as it was; the bucket policy added nothing the identity policy did not already grant. If you want to reduce effective permissions inside one account you need a ceiling - permissions boundary, SCP, RCP - or an explicit `Deny`. Those four are the only mechanisms that subtract.

```go
// The documented single-account procedure, condensed.
// Stage and statement travel with the verdict on purpose.

func Evaluate(ctx RequestContext) Decision {
    if ctx.Principal.IsAccountRoot() {
        return Decision{Allowed: true, Stage: StageDefault}
    }
    p := ctx.ApplicablePolicies()

    // 1 - deny evaluation, across every applicable policy type.
    if s := p.FirstMatchingDeny(ctx); s != nil {
        return Decision{false, StageDeny, s.Sid, true}
    }
    // 2, 3 - ceilings on the resource side, then the principal side.
    if ctx.OrgHasRCPs() && !p.RCPs().AnyAllow(ctx) {
        return Decision{false, StageRCP, "", false}
    }
    if ctx.OrgHasSCPs() && !p.SCPs().AnyAllow(ctx) {
        return Decision{false, StageSCP, "", false}
    }
    // 4 - resource-based. The branch depends on the principal form named.
    if g := p.ResourceBased().GrantFor(ctx.Principal); g != nil {
        if g.DirectToSession() || g.ToIAMUserArn() || g.WildcardPrincipalArn() {
            return Decision{true, StageResource, g.Sid, false}
        }
        // A grant naming a role ARN must also survive the ceilings below.
    }
    // 5 - identity-based; absence here is an implicit deny.
    i := p.IdentityBased().FirstAllow(ctx)
    if i == nil {
        return Decision{false, StageIdentity, "", false}
    }
    // 6, 7 - ceilings on the identity grant, then on the session grant.
    if b := ctx.PermissionsBoundary(); b != nil && !b.Allows(ctx) {
        return Decision{false, StageBoundary, "", false}
    }
    if ctx.Principal.IsSession() && !ctx.SessionPolicyAllows(ctx) {
        return Decision{false, StageSession, "", false}
    }
    return Decision{true, StageSession, i.Sid, false}
}
```

The return type is the point. A procedure that returns only Allow or Deny cannot answer the question you actually have at 02:00, which is not *was it allowed* but *what decided it*. Carrying the stage and the statement id costs nothing and is the difference between an audit trail and a shrug.

## The branch everyone misses

Whether a resource-based `Allow` survives a permissions boundary depends on the **form of the principal the policy names**:

| The resource-based policy names… | Capped by the role's boundary? |
| --- | --- |
| an IAM user ARN | no |
| an IAM **role** ARN | **yes** |
| an IAM **role session** ARN | no |
| `aws:PrincipalArn` with a wildcard `Principal` | only via an explicit deny |

One ARN format is the difference between "the boundary applies" and "the boundary never applied". The principal making the request is the role *session*, not the role - so a bucket policy naming the session ARN grants directly to the session, and grants made directly to a session are not capped by the role's boundary.

![Figure 3 - the same two policies under the designer model and under the documented outcome](./figures/syndication/fig-3-tightening-fallacy.png)

*Left, the design as intended: intersection. Centre, the documented outcome: union, and the broad Allow survives. Right, the four mechanisms that do reduce effective permissions inside one account.*

Cross-account, the union does not survive the boundary. AWS performs **two** evaluations - trusted account on the principal side, trusting account on the resource side - and the request is allowed only if both return Allow. Authoring the calling side and testing it in isolation proves nothing about the half you do not own.

## What you can verify before deployment (less than you think)

- **IAM Policy Simulator** answers request-shaped questions. It does not evaluate RCPs, does not accept session policies, and - in AWS's words - does not support simulation of resource-based policies for IAM roles.
- **Access Analyzer `check-no-new-access`** answers policy-diff questions: two documents in, PASS or FAIL with reasons out. No principal, no condition values, no ceilings in scope.
- **A live API call** answers everything, for exactly one request - and for write actions, the call *is* the action.
- **`sts:DecodeAuthorizationMessage`** arrives after a denial: explicit deny versus absent allow, plus principal, action, resource and condition values. It does not name the deciding policy class.

![Figure 4 - verification capability by policy class and route](./figures/syndication/fig-4-verification-gap.png)

*The two cheap pre-deployment routes each leave at least one class unevaluated. The bottom line is the finding: no single pre-deployment route covers all seven classes.*

So the gap is structural, not a documentation gap you can close by reading more. The two cheap tools answer different question shapes and neither substitutes for the other: a pipeline that runs only the simulator cannot gate a policy diff, and a pipeline that runs only Access Analyzer cannot answer a support engineer's question about one principal.

```go
// Route the question to the only tool that can answer it.

func PlanVerification(ctx RequestContext) []Route {
    switch ctx.Question {
    case QuestionPolicyDiff:
        return []Route{AccessAnalyzerCheckNoNewAccess}
    case QuestionRequestDecision:
        if ctx.HasRCPs() || ctx.HasSessionPolicy() || ctx.PrincipalIsIAMRole() {
            return []Route{LiveCallInSandbox, CloudTrailAfterTheFact}
        }
        return []Route{PolicySimulator, LiveCallInSandbox}
    case QuestionWhyDenied:
        return []Route{
            DecodeAuthorizationMessage, // explicit deny, or absent allow
            CloudTrailUserIdentity,     // which principal form made the request
            PolicyInventory,            // the statement, once the branch is known
        }
    }
    return nil
}
```

## Attributing a denial

When the identity policy allows the action and the call still fails, the denial came from one of seven classes - including two that live in your organisation's management account and one that lives on the resource. Start from the record, not the message:

1. **CloudTrail `userIdentity.type`** - `IAMUser`, `AssumedRole`, `FederatedUser`, root. This selects the branch of the table above, and therefore tells you whether a boundary or session policy could have capped the request at all.
2. **The decoded authorization message**, if the operation returned one: explicit deny versus absent allow.
3. **The policy inventory** - only once you know the branch.

Reading policies first is how an hour disappears into a permissions boundary that never applied to the principal that made the request.

## The part I did not do

I measured nothing for this. No AWS account was used, no simulator response was captured, no policy was evaluated against a live control plane. Everything above is cited to AWS's own specification or argued from it, and the two places where the documentation does not settle a question - whether a boundary caps a role-ARN grant against an identity-based implicit deny, and the third bullet of the session-policy stage - are reported in the paper as unsettled rather than resolved. If your design depends on either, test it in an account rather than trusting a paragraph. Mine or anyone else's.

The full paper carries the 26-row decision matrix, the verification matrix, fifteen named entities and twenty-five sources with access dates: [AWS IAM policy evaluation logic: identity vs resource](https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order). The figures, the bibliography and the reproduction notes ship with it as [artifacts of the paper](https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order#paper-artifacts): five exported SVGs with checksums, twenty-five sources with access dates, and the steps to re-check any row of the matrix against its primary source.
