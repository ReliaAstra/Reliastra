# Problem and evidence

Link the issue and any design discussion. What concrete behavior or limitation
changes? Include a sanitized reproduction or counterexample where relevant.

## Design and scope

Explain the approach, alternatives, non-goals, and limitations. For attribution
or evidence work, distinguish measured facts from assumptions and state whether
the methodology or artifact contract changes.

## Validation

List exact commands and results. Include regressions and failure-path tests;
state what was not tested. For documentation-only changes, check source references,
links, commands, and issue-form YAML. Do not imply mock tests prove live operation.

## Compatibility, security, and operations

Describe API/client compatibility, migrations, configuration, worker/scheduler
effects, observability, deployment, and rollback as applicable. Address auth/scopes,
tenant isolation, SSRF/redirect behavior, input limits, and secret redaction for
changed boundaries. For replay/artifacts, explain auditability and reproducibility.
Mark non-applicable areas with a reason; do not paste credentials or private data.
