# AWS IAM policy evaluation order — paper artifact

Artifact directory for
[AWS IAM policy evaluation logic: identity vs resource](https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order),
published in the RELIASTRA research corpus on 13 September 2026 under the
**Cloud & AI infrastructure security** category.

## What this directory is

The paper is an **architecture analysis of a published specification**. It
measured nothing: no AWS account was used, no request was issued, no simulator
response was captured, and no policy was evaluated against a live control plane.
There is therefore no dataset here and no script that re-derives a number, and
this README does not claim one.

What this directory holds instead is the part of the work a reader needs in
order to check the paper:

| File | Contents |
|---|---|
| [`sources.md`](./sources.md) | Every source the paper cites, with the date it was read, the exact claim it supports, and how to re-verify it |
| [`figures/`](./figures/) | Index of the five published figures, where each is defined in the frontend, and how to export a standalone copy for syndication |
| [`LICENSE`](./LICENSE) | MIT for the material RELIASTRA authored. Cited third-party documentation and papers remain with their publishers |

## Research question

What is the exact decision procedure AWS executes when identity-based and
resource-based policies disagree, and which parts of that procedure can an
engineer verify before deployment rather than after a denial?

## Method

1. **Read the primary sources in full**, not summaries of them. The IAM User
   Guide pages on policy evaluation logic, on how the enforcement code allows or
   denies, on cross-account evaluation and on permissions boundaries; the
   Organizations User Guide pages on SCPs and RCPs; and the API and CLI
   references for each verification route. Access dates are recorded per source
   in [`sources.md`](./sources.md).
2. **Restate the procedure as an algebra** over policy classes, separating the
   one stage that short-circuits from the four that cap and the two that grant.
3. **Apply the algebra exhaustively** to enumerate the decision matrix in the
   paper (Table 3, rows `M-01` to `M-26`). Each row is a stated request context
   and the stage that decides it.
4. **Express the documented exceptions as predicates** that fire before the
   general procedure is allowed to conclude anything about a grant: role trust
   policies, KMS key policies, service-linked roles, the account root user,
   `NotPrincipal` with `Deny`, and `Bool` versus `BoolIfExists`.
5. **Compare verification routes by question shape** rather than by feature
   list, which is what exposes the gap in Table 4 and Figure 4.
6. **Report ambiguity instead of resolving it.** Two cases are left unsettled
   because AWS does not settle them, and both are named in the paper's
   limitations.

## Environment

There is no runtime environment. The work was performed against published
documentation on 13 September 2026. The frontend figures are React components
rendered to SVG on the server:

- `frontend/src/components/research/figures.tsx` — `IamEvaluationPipelineFigure`,
  `IamPolicyAlgebraFigure`, `IamTighteningFallacyFigure`,
  `IamVerificationGapFigure`, `IamAttributionPathFigure`
- `frontend/src/content/research/aws-iam-policy-evaluation-order.tsx` — the body
- `frontend/src/lib/research/corpus.ts` — the structured record the publication
  gate validates
- `frontend/src/lib/routes.ts` — the route record that makes the URL exist

## Results

The paper's findings are cited or reasoned, and each carries its basis in the
corpus record. In summary:

- Seven policy classes participate, in a fixed documented order, and only two
  can grant anything.
- Inside one account the granting classes combine by union, so a restrictive
  resource-based policy cannot tighten a permissive identity-based policy.
- Whether a resource-based Allow survives an implicit deny in a permissions
  boundary or a session policy is a function of the principal form the policy
  names — the distinction between a role ARN and a role session ARN decides it.
- The documented RCP-before-SCP order cannot change any verdict; the two
  commute.
- A cross-account request is two independent evaluations, and the union rule
  does not survive the trust boundary.
- No pre-deployment verification route evaluates all seven classes.
- The decoded authorization message distinguishes an explicit deny from an
  absent allow but does not name the deciding class; the CloudTrail principal
  type is the input that selects the branch, and it is usually read last.

## Limitations

The paper states six. The two that govern this directory:

- **Nothing was measured.** A reader who needs to know what a live account
  returned will not find it here. A revision that captures simulator responses
  verbatim for the rows of Table 3 would add a `data/` directory and promote the
  paper's evidence basis; that revision has not been made.
- **Two cases are unsettled** because AWS's documentation does not settle them:
  the ceiling behaviour of two principal forms, and the third bullet of the
  session-policy stage. Both are reported in the paper rather than resolved.

Per-service semantics, privilege escalation paths, VPC endpoint policies and
attribute-based access control as a design pattern are out of scope.

## Reproduction

There is nothing to execute. To re-check any claim in the paper:

1. Open the source listed against that claim in [`sources.md`](./sources.md).
2. Confirm the wording still says what the paper reports. AWS changed the
   simulator surface in July 2026 and changes documentation without notice; a
   claim verified against a later revision may need the paper's `updatedAt` and
   a revision note.
3. Re-derive any row of Table 3 by applying the stage order in Figure 1 to the
   row's request context. The rows are consequences of the procedure, not
   observations of it.

To re-render the paper locally:

```bash
cd frontend
npm ci
npm run dev
# http://localhost:3000/research/cloud-security/aws-iam-policy-evaluation-order
```

The publication gate that validates the paper's structured record:

```bash
cd frontend
npx vitest run src/lib/research/__tests__/corpus.test.ts src/seo/__tests__/seo.test.ts
```

## License

MIT for the material RELIASTRA authored — see [`LICENSE`](./LICENSE). Quoted
AWS documentation remains with Amazon Web Services; the cited academic papers
remain with IEEE and Springer.

## References

See [`sources.md`](./sources.md) for the full bibliography with access dates and
the claim each source supports.
