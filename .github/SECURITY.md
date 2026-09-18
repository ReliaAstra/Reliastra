# Reporting security problems

Do not disclose vulnerabilities in public issues, Discussions, or pull requests.
Use **[security@reliastra.com](mailto:security@reliastra.com)**, the project's existing security contact.
GitHub private vulnerability reporting was not enabled at the 2026-09-18 review;
do not rely on an unavailable GitHub reporting form.

Send a minimal, sanitized report with the affected revision/component, expected
security boundary, impact, and steps to reproduce in an environment you control.
Authentication/authorization failures, cross-tenant access, SSRF in probes or
adapters, leaked credentials, and misleading evidence-integrity guarantees are
particularly relevant to RELIASTRA.

Do not send credentials, customer datasets, private infrastructure details, or
unredacted logs. If more sensitive evidence is necessary, first ask the security
contact how to transfer it privately. Stop testing once impact is demonstrated;
do not probe other tenants, third-party services, or production systems without
authorization. Rotate any accidentally exposed credentials through the service
that issued them rather than posting their values in a report.

This document does not promise a response deadline, bounty, or supported-version
policy. Coordinate disclosure and remediation with the maintainers.
