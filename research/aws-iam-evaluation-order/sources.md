# Sources

Every source cited by
[AWS IAM policy evaluation logic: identity vs resource](https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order).
All were read on **13 September 2026 (UTC)** unless the verification column says
otherwise.

The verification column states how each source was reached, because the
difference matters and a bibliography that hides it is not a bibliography:

| Mark | Meaning |
|---|---|
| **FETCHED** | The document was retrieved in full and read on the access date |
| **LINK-VERIFIED** | The URL appears as a link inside an AWS document that was fetched; the target page was not read in full for this paper |
| **SEARCH-RESOLVED** | The document was reached through a search index that returned its content; the URL resolved and the quoted text was read there |
| **REPORTED** | Not reached directly. The claim it carries is attributed in the paper to a third party that did reach it, and is labelled as a report at the point of use |

Nothing marked REPORTED is presented in the paper as an AWS-confirmed fact.

---

## AWS primary documentation

| # | Source | URL | Verification | Claim it carries |
|---|---|---|---|---|
| 1 | Policy evaluation logic — IAM User Guide | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html | FETCHED | Union of identity-based and resource-based permissions inside one account; intersection with a permissions boundary; intersection of identity-based policy, boundary and SCP |
| 2 | How AWS enforcement code logic evaluates requests to allow or deny access | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic_policy-eval-denyallow.html | FETCHED | The stage order used throughout the paper; implicit deny and the root-user exception; `RCPFullAWSAccess` being auto-attached and non-detachable; the principal-type branch of the resource-based stage; the session-policy bullets, including the one this paper reports as unsettled |
| 3 | Cross-account policy evaluation logic | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html | FETCHED | Trusted and trusting accounts; two evaluations; allowed only if both return Allow; RAM policy fragments can affect evaluation |
| 4 | Permissions boundaries for IAM entities | https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | FETCHED | Effective permissions with boundaries, by principal form (IAM user ARN, IAM role ARN, role session ARN, federated user ARN, federating user ARN); the `NotPrincipal` + `Deny` warning and the recommended `ArnNotEquals` on `aws:PrincipalArn` |
| 5 | AWS JSON policy elements: Principal | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html | LINK-VERIFIED (from #2) | The ARN forms distinguished in Table 2: role, assumed-role session, federated user session |
| 6 | Cross account resource access in IAM | https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies-cross-account-resource-access.html | LINK-VERIFIED (from #2) | Role trust policies and KMS key policies as exceptions to the union rule |
| 7 | AWS JSON policy elements: NotPrincipal | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notprincipal.html | LINK-VERIFIED (from #4) | The element AWS recommends replacing when a Deny must exclude named principals |
| 8 | Resource control policies — Organizations User Guide | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html | LINK-VERIFIED (from #3) | RCPs attach on the resource side of the account where they are applied |
| 9 | Service control policies — Organizations User Guide | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html | LINK-VERIFIED (from #3) | SCPs attach on the principal side; they filter and never grant |
| 10 | Key policies — KMS Developer Guide | https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html | LINK-VERIFIED (from #2) | The key policy is authoritative for a customer managed key |

## Verification routes

| # | Source | URL | Verification | Claim it carries |
|---|---|---|---|---|
| 11 | `SimulateCustomPolicy` — IAM API Reference | https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html | SEARCH-RESOLVED | Quoted in the paper: the simulator evaluates identity-based policies and SCPs including their condition keys and resource scoping; *"Simulation of resource-based policies isn't supported for IAM roles"*; results can differ from the live environment |
| 12 | `SimulatePrincipalPolicy` — IAM API Reference | https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulatePrincipalPolicy.html | REPORTED | The request-shaped route (principal, actions, resources, context entries) and the `PolicyExclusionList` parameter added in July 2026. Attribute surface corroborated by #19 and #20 rather than read directly here |
| 13 | `check-no-new-access` — AWS CLI Command Reference | https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/check-no-new-access.html | SEARCH-RESOLVED | Two policy documents and a policy type in; `PASS`/`FAIL` with `message` and `reasons` out; no request context is an input |
| 14 | `DecodeAuthorizationMessage` — STS API Reference | https://docs.aws.amazon.com/STS/latest/APIReference/API_DecodeAuthorizationMessage.html | FETCHED | Documented contents of a decoded message: explicit deny versus absent allow, principal, action, resource, condition key values. Only certain operations return one; decoding requires `sts:DecodeAuthorizationMessage`; the message is encoded because it can contain privileged information |
| 15 | CloudTrail `userIdentity` element | https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-user-identity.html | SEARCH-RESOLVED | Principal type, ARN, account and session context — `sessionIssuer`, `attributes.mfaAuthenticated`, `creationDate`, `sourceIdentity` — as recorded per call |

## Peer-reviewed work

| # | Source | Identifier | Verification | Claim it carries |
|---|---|---|---|---|
| 16 | Backes, Bolignano, Cook, Dodge, Gacek, Luckow, Rungta, Tkachuk, Varming — *Semantic-based Automated Reasoning for AWS Access Policies using SMT*, FMCAD 2018 | DOI 10.23919/FMCAD.2018.8602994 · https://ieeexplore.ieee.org/document/8602994 | SEARCH-RESOLVED | Formalisation of the AWS policy language; the Zelkova analysis tool; SMT encoding over strings, regular expressions, bit vectors and integer comparison; the problem is PSPACE-complete and the engine is invoked many millions of times daily |
| 17 | Backes et al. — *Stratified Abstraction of Access Control Policies*, CAV 2020, LNCS 12224, pp. 165–176 | DOI 10.1007/978-3-030-53288-8_9 · https://link.springer.com/chapter/10.1007/978-3-030-53288-8_9 | SEARCH-RESOLVED | Stratified predicate abstraction; sound and precise findings; deployed as the engine powering IAM Access Analyzer, with the account as the zone of trust |
| 18 | *A Billion SMT Queries a Day (Invited Paper)*, TACAS 2022 | DOI 10.1007/978-3-031-13185-1_1 · https://link.springer.com/chapter/10.1007/978-3-031-13185-1_1 | SEARCH-RESOLVED | Scaling from roughly a thousand SMT invocations a day to a billion over five years; a synchronous Zelkova call when a policy is attached or updated, to determine whether it grants unrestricted public access |

## Standards

| # | Source | Identifier | Verification | Claim it carries |
|---|---|---|---|---|
| 19 | NIST SP 800-207, *Zero Trust Architecture* | DOI 10.6028/NIST.SP.800-207 · https://csrc.nist.gov/pubs/sp/800/207/final | LINK-VERIFIED (carried from the corpus record for `ai-api-trust-boundary`, same publisher and identifier) | Per-request authorisation; no resource trusted by virtue of its location |

## Third-party reports

These are cited because they report changes and defects that AWS documentation
had not, at the access date, absorbed. Each is labelled as a report in the paper.

| # | Source | URL | Verification | Claim it carries |
|---|---|---|---|---|
| 20 | aws-cli issue #10314 — *iam simulate-principal-policy and simulate-custom-policy ignore `--resource-policy` for `sts:Assume*` actions*, filed 15 May 2026 | https://github.com/aws/aws-cli/issues/10314 | SEARCH-RESOLVED | A trust policy passed as a resource policy is parsed and structurally validated, then discarded before evaluation for `sts:Assume*` actions; the reporter recommends Access Analyzer `check-no-new-access` / `check-access-not-granted` as the supported alternative. **Not confirmed by AWS** |
| 21 | Classmethod DevelopersIO — *[Update] IAM Policy Simulator has migrated to the IAM console*, 2 August 2026 | https://dev.classmethod.jp/en/articles/iam-policy-simulator-iam-console-update/ | SEARCH-RESOLVED | The July 2026 migration of the simulator into the IAM console; retirement of the standalone `policysim.aws.amazon.com` site; SCP condition and custom SCP hierarchy support via API; the new `PolicyExclusionList` parameter |
| 22 | AWS What's New announcement of the simulator console migration, July 2026 | https://aws.amazon.com/about-aws/whats-new/2026/07/iam-policy-simulator-iam-console/ | **REPORTED — not reached** | Cited only as the primary announcement that #21 reports on. This URL was not fetched for the paper; a revision that fetches it should replace #21 with it as the primary citation |

## RELIASTRA records

| # | Source | URL | Verification | Claim it carries |
|---|---|---|---|---|
| 23 | The RELIASTRA research agenda | https://reliastra.com/research/reliastra-research-agenda | FETCHED (corpus index read; page is in this repository's route table) | The editorial standard this paper is written against, including what RELIASTRA refuses to publish |
| 24 | The trust boundary of an AI API dependency | https://reliastra.com/research/cloud-security/ai-api-trust-boundary | FETCHED (read in this repository, `frontend/src/content/research/ai-api-trust-boundary.tsx`) | The same trust boundary in a different plane |
| 25 | How RELIASTRA measures vendor reliability | https://reliastra.com/research/how-reliastra-measures-vendor-reliability | FETCHED (read in this repository, `frontend/src/content/research-articles.tsx`) | The attribution discipline the paper compares IAM denial attribution to |

---

## Re-verification

Sources 1–4 and 14 are the load-bearing ones: the stage order, the
principal-type branch, the cross-account conjunction, the `NotPrincipal`
interaction and the contents of a decoded message all come from those five
documents. If a revision of this paper is prepared, read those five first.

AWS documents changes without notice and changed the simulator surface in July
2026. A claim verified against a later revision than the one recorded here
requires `updatedAt` on the paper record and a plain-language `revisionNote`
explaining what moved.
