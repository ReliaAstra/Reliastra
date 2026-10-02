import { SITE_URL } from '@/lib/seo';
import { RESEARCH_AUTHORS } from './authors';

/**
 * Public projects linked from the maintainer profile and discovery files.
 *
 * Every entry here is a repository whose source is actually present and
 * readable. Two repositories that previously appeared in this list have been
 * removed:
 *
 *   - `cloud-identity-security-engineering` - 18 `.go` files, all zero bytes.
 *     The repository contains a README and an empty directory scaffold.
 *   - `aws-iam-attack-paths` - no Go source at all; it is Markdown, JSON and
 *     one HTML page.
 *
 * Both are attributed elsewhere as Go engines. They are not Go engines, and a
 * visitor who opens them finds an empty skeleton, which is worse on an evidence
 * product than never listing them. Forks of upstream projects are also excluded:
 * they are not original work and a link implies authorship that does not exist.
 *
 * The list is deliberately short. Each entry is one the maintainer can defend
 * by opening the repository, which is the only test that has ever mattered on
 * this surface.
 */
export const MAINTAINER_PUBLIC_WORK = [
  {
    name: 'chimera',
    href: 'https://github.com/EmmanuelAdesina/chimera',
    body: 'A closed-loop causal reasoning engine for offensive security work: observe, model, hypothesise, interrogate, test, update, decide, remember. Python, no third-party runtime dependencies, 30 test modules covering the loop.',
  },
  {
    name: 'headershield',
    href: 'https://github.com/EmmanuelAdesina/headershield',
    body: 'A security-header audit tool that follows redirects, classifies each missing header by the risk it actually introduces, and reports HIGH, MEDIUM or LOW confidence per finding rather than a single score.',
  },
  {
    name: 'CloudVitals',
    href: 'https://github.com/EmmanuelAdesina/CloudVitals',
    body: 'A Go cloud-security scanner that checks public storage exposure, open security groups, unencrypted volumes, root MFA and audit-log coverage, and prints only what is misconfigured.',
  },
  {
    name: 'go-systems-lab',
    href: 'https://github.com/EmmanuelAdesina/go-systems-lab',
    body: 'Systems software built in public to keep Go sharp: TCP behaviour, log analysis and the networking internals worth reading the source for.',
  },
] as const;

/**
 * A shared, factual profile for both language-model discovery documents.
 * Descriptions come from the declared author record and the About page's
 * curated public-work list, so those surfaces do not drift independently.
 */
export function maintainerDiscoveryMarkdown(): string {
  const author = RESEARCH_AUTHORS[0];
  const work = MAINTAINER_PUBLIC_WORK.map(
    ({ name, href, body }) => `- ${name}: ${body} ${href}`
  ).join('\n');

  return `## Founder and engineer

Role: ${author.role}.

${author.bio}

At RELIASTRA, he leads engineering of external-service observation, incident confirmation, attribution methods, and verifiable evidence records. The current public deployment uses one observation point; its region labels identify the worker and do not establish independent origins or quorum.

Selected public work:

${work}

Profile: ${SITE_URL}/about
Research: ${SITE_URL}/research`;
}
