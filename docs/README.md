# Docs index

Living documentation is at the top level; point-in-time audits and session logs live in `archive/`.

## Living docs

| Path | Purpose |
|------|---------|
| [ROADMAP.md](ROADMAP.md) | Engineering roadmap, single source of truth for sequencing |
| [checks-operating-model.md](checks-operating-model.md) | Runtime contract for checks: Postgres+Redis+Cerely, health, verification |
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md) | System overview: frontend, API, workers, storage |
| [architecture/ADMIN_CONTROL_PLANE_API.md](architecture/ADMIN_CONTROL_PLANE_API.md) | Admin control plane API contract |
| [design/UI-SPEC.md](design/UI-SPEC.md) | Design system contract, tokens rs-*, source of truth globals.css |
| [email/architecture.md](email/architecture.md) | Email architecture (Resend outbound, ImprovMX inbound) |
| [operations/architecture.md](operations/architecture.md) | Ops architecture |
| [operations/billing-notifications-probes.md](operations/billing-notifications-probes.md) | Billing, notifications, probes ops notes |
| [operations/ci-cd.md](operations/ci-cd.md) | CI/CD pipeline |
| [operations/database.md](operations/database.md) | Database (Supabase Postgres) |
| [operations/deployment.md](operations/deployment.md) | Deployment model (frontend standalone, backend GHCR) |
| [operations/disaster-recovery.md](operations/disaster-recovery.md) | DR plan |
| [operations/incident-evidence-lifecycle.md](operations/incident-evidence-lifecycle.md) | Evidence lifecycle |
| [operations/incident-response.md](operations/incident-response.md) | Incident response |
| [operations/observability.md](operations/observability.md) | Observability |
| [operations/production-access.md](operations/production-access.md) | Production access |
| [operations/rollback.md](operations/rollback.md) | Rollback procedure |
| [engineering/discussion-starters.md](engineering/discussion-starters.md) | Four initial engineering questions pending Discussions enablement |
| [engineering/github-setup.md](engineering/github-setup.md) | GitHub setup |
| [engineering/prompt-fix-public-dependency-index.md](engineering/prompt-fix-public-dependency-index.md) | Prompt for fixing public dependency index |
| [redesign/route-inventory.md](redesign/route-inventory.md) | Public site route inventory (phase 1) |
| [redesign/console-inventory.md](redesign/console-inventory.md) | Console route inventory (phase 2) |
| [redesign/observatory-inventory.md](redesign/observatory-inventory.md) | Observatory inventory (phase 3) |
| [redesign/agency-onboarding-inventory.md](redesign/agency-onboarding-inventory.md) | Agency portfolio/onboarding IA (phase 4) |
| [redesign/developer-first-refurbishment.md](redesign/developer-first-refurbishment.md) | Developer-first product definition, B2B unmount stage 1 |
| [redesign/console-ux-audit-2026-09.md](redesign/console-ux-audit-2026-09.md) | Console UX audit at 390/768/1440 light/dark, worst-first billing→support |
| [redesign/seo-pillar-ai-infrastructure.md](redesign/seo-pillar-ai-infrastructure.md) | SEO pillar AI infrastructure |
| [redesign/stage2-removal-ledger.md](redesign/stage2-removal-ledger.md) | Dormant B2B modules/tables/routes awaiting deletion (stage 2) |
| [research/aws-iam-policy-evaluation-order-paper.md](research/aws-iam-policy-evaluation-order-paper.md) | Research paper AWS IAM evaluation order |
| [syndication/](syndication/) | Syndication drafts (Hashnode) |

## Archive (point-in-time)

| Path | Purpose | Date |
|------|---------|------|
| [archive/frontend-audit-report.md](archive/frontend-audit-report.md) | Frontend audit report |
| [archive/checks-phase2-engineering-report.md](archive/checks-phase2-engineering-report.md) | Checks phase 2 engineering report |
| [archive/commercial-billing-rebuild.md](archive/commercial-billing-rebuild.md) | Commercial billing rebuild notes |
| [archive/signin-session-audit.md](archive/signin-session-audit.md) | Sign-in session audit |
| [archive/partner-payouts-notifications-support.md](archive/partner-payouts-notifications-support.md) | Partner payouts/notifications/support audit |
| [archive/public-dependency-index-seo-llm-audit.md](archive/public-dependency-index-seo-llm-audit.md) | Public dependency index SEO/LLM audit |
| [archive/email-architecture.md](archive/email-architecture.md) | Email architecture snapshot (superseded by email/architecture.md) |
| [archive/improvmx-setup.md](archive/improvmx-setup.md) | ImprovMX setup (snapshot, canonical at email/improvmx-setup.md) |
| [archive/resend-webhook.md](archive/resend-webhook.md) | Resend webhook notes |
| [archive/diagnostics/2026-09-05-footer-links-session-logout-checks.md](archive/diagnostics/2026-09-05-footer-links-session-logout-checks.md) | Session log |
| [archive/diagnostics/2026-09-21-docs-namespace-served-by-api.md](archive/diagnostics/2026-09-21-docs-namespace-served-by-api.md) | Session log |

## Notes

- `frontend/src/app/docs` routes are generated from `frontend/src/lib/docs/corpus.ts` and `frontend/src/app/docs/[slug]/page.tsx`. Verify that corpus matches reality before adding a guide.
- `bun.lock` removed — npm only (`package-lock.json`). See `frontend/README` or root README for install.
- `sharp` upgraded to `0.35.4` — breaking, verified via `next build` passing. See `frontend/next.config.ts` for image config.
