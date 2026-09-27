import { SITE_URL } from '@/lib/seo';
import { RESEARCH_AUTHORS } from './authors';

/** Public projects linked from the maintainer profile and discovery files. */
export const MAINTAINER_PUBLIC_WORK = [
  {
    name: 'cloud-identity-security-engineering',
    href: 'https://github.com/EmmanuelAdesina/cloud-identity-security-engineering',
    body: 'Research and Go tooling for AWS IAM and cloud identity, including the work informing published research on identity and access control.',
  },
  {
    name: 'aws-iam-attack-paths',
    href: 'https://github.com/EmmanuelAdesina/aws-iam-attack-paths',
    body: 'A threat-modelling project that represents AWS IAM policies as a trust graph and examines the access paths they permit.',
  },
  {
    name: 'headershield',
    href: 'https://github.com/EmmanuelAdesina/headershield',
    body: 'An audit tool that identifies missing HTTP security headers and explains the risks they may introduce.',
  },
  {
    name: 'CloudVitals',
    href: 'https://github.com/EmmanuelAdesina/CloudVitals',
    body: 'A cloud-security scanner that checks for common configuration risks without requiring an installed agent.',
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
