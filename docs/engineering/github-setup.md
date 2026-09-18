# GitHub engineering setup follow-up

Status checked on 2026-09-18 for the canonical public repository
[`ReliaAstra/Reliastra`](https://github.com/ReliaAstra/Reliastra), default branch
`main`. The reference Frontend and Reliastra-backend repositories were not changed.

## Completed through the GitHub API

- Published the seven implementation issues below, after inspecting the actual
  API, CLI, probes, metrics, attribution engine, evidence path, tests, and existing
  issues. Prometheus and CLI requests extend existing capabilities.
- Created the 12 topic labels below and retained the existing `enhancement` label
  and other existing labels. No beginner-task or promotional labels were added.

## Permission/API limits

- **Discussions:** disabled. Updating `has_discussions` returned
  `403 Resource not accessible by integration`; no posts were created.
- **Categories:** the exposed GraphQL schema has no category-creation mutation.
  Configure the six categories through GitHub's repository UI after enabling
  Discussions. The [four complete drafts and category descriptions](discussion-starters.md)
  include duplicate checks and publication instructions.
- **Issue-label assignment:** label definitions were created, but GitHub omitted
  labels supplied during issue creation. Read-back showed empty label lists.
  Explicit CLI assignment and REST label-add/issue-update requests were denied
  with `Resource not accessible by integration`. These issues are **not yet
  labeled**; the table is the intended assignment, not a claim it succeeded.

## Maintainer completion checklist

1. Review and merge the contributor-documentation pull request from
   `arena/01a0b538-reliastra` into `main`; issue forms and the default README only
   become active after merge. No runtime or workflow changes are required by it.
2. Enable Discussions, reuse/rename the default categories, and publish the four
   drafts as described on the linked page. Do not substitute marketing posts or
   claim that draft files are live Discussions.
3. Apply the labels with an account/integration authorized to label issues:

| Issue | Intended labels |
| --- | --- |
| [#55 OpenTelemetry export](https://github.com/ReliaAstra/Reliastra/issues/55) | `enhancement`, `observability`, `opentelemetry` |
| [#56 Prometheus operational coverage](https://github.com/ReliaAstra/Reliastra/issues/56) | `enhancement`, `observability`, `prometheus` |
| [#57 CLI updates and exports](https://github.com/ReliaAstra/Reliastra/issues/57) | `enhancement`, `cli`, `api` |
| [#58 Incident replay](https://github.com/ReliaAstra/Reliastra/issues/58) | `enhancement`, `reliability`, `incident-management` |
| [#59 Independent probe region](https://github.com/ReliaAstra/Reliastra/issues/59) | `enhancement`, `infrastructure`, `observability` |
| [#60 Attribution explanation](https://github.com/ReliaAstra/Reliastra/issues/60) | `enhancement`, `attribution`, `ux` |
| [#61 Vendor adapter interface](https://github.com/ReliaAstra/Reliastra/issues/61) | `enhancement`, `architecture`, `integrations` |

```bash
gh issue edit 55 --repo ReliaAstra/Reliastra --add-label enhancement,observability,opentelemetry
gh issue edit 56 --repo ReliaAstra/Reliastra --add-label enhancement,observability,prometheus
gh issue edit 57 --repo ReliaAstra/Reliastra --add-label enhancement,cli,api
gh issue edit 58 --repo ReliaAstra/Reliastra --add-label enhancement,reliability,incident-management
gh issue edit 59 --repo ReliaAstra/Reliastra --add-label enhancement,infrastructure,observability
gh issue edit 60 --repo ReliaAstra/Reliastra --add-label enhancement,attribution,ux
gh issue edit 61 --repo ReliaAstra/Reliastra --add-label enhancement,architecture,integrations
```

After applying labels, read back each issue's labels rather than relying only on
command exit status. Replace issue draft links with the actual Discussion URLs.
Update pending notices in this file, the drafts, README, contributor guide,
roadmap, and engineering-proposal form; add a Discussions contact link to the
issue chooser. After merge, replace branch-based documentation links with `main`
links so they survive branch cleanup.

No credentials or new authentication tokens are needed in the repository or in
public threads to complete this checklist.
