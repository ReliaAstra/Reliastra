import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  ArrowLink,
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import { AUTH_ROUTES, DOCS_ROUTES, EXTERNAL_LINKS, PUBLIC_ROUTES } from '@/lib/routes';
import { SITE_URL, breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';
import {
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_TOOL_GROUPS,
  MCP_TOOL_NAMES,
} from '@/lib/mcp-catalog';

export const metadata: Metadata = buildMetadata({
  title: 'MCP server',
  description:
    'Let a compatible AI coding agent use Reliastra: 18 tools over stdio or Streamable HTTP — observatory reads, incident evidence, workspace access and two safe writes, authenticated with a scoped API key.',
  path: PUBLIC_ROUTES.integrationsMcp,
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Product', href: PUBLIC_ROUTES.product },
  { name: 'MCP server', href: PUBLIC_ROUTES.integrationsMcp },
];

const REMOTE_URL = `${EXTERNAL_LINKS.api}/mcp`;

const STDIO_SNIPPET = `pip install -r backend/requirements-mcp.txt
RELIASTRA_API_KEY=rel_... python -m mcp_server --transport stdio`;

const CLIENT_SNIPPET = `{
  "mcpServers": {
    "reliastra": {
      "command": "python",
      "args": ["-m", "mcp_server", "--transport", "stdio"],
      "cwd": "/path/to/Reliastra/backend",
      "env": { "RELIASTRA_API_KEY": "rel_..." }
    },
    "reliastra-remote": {
      "url": "${REMOTE_URL}",
      "headers": { "Authorization": "Bearer rel_..." }
    }
  }
}`;

/**
 * The MCP feature page.
 *
 * One honest proposition: Reliastra usable by compatible AI agents. Every
 * number and name on this page comes from the implementation - the tool list
 * renders from `lib/mcp-catalog.ts`, which a test diffs against the server
 * registration, and the transports, auth model and limits match
 * `backend/mcp_server/` and `/docs/mcp`. No client is claimed that was not
 * tested; no discovery outcome is promised.
 */
export default function McpPage() {
  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, path: c.href }))),
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            '@id': canonicalUrl(PUBLIC_ROUTES.integrationsMcp),
            name: 'RELIASTRA MCP server',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Any MCP-compatible client',
            description:
              'Programmatic access to external dependency evidence for AI coding agents: 18 tools over stdio or Streamable HTTP, authenticated with a scoped API key.',
            publisher: { '@id': `${SITE_URL}/#organization` },
            offers: {
              '@type': 'Offer',
              price: '9',
              priceCurrency: 'USD',
            },
          },
        ]}
      />

      <header className="relative overflow-hidden border-b border-[var(--ob-line)] bg-black">
        <div aria-hidden className="ob-scene-media">
          <img
            src="/media/scene-data-hall.webp"
            srcSet="/media/scene-data-hall-sm.webp 1366w, /media/scene-data-hall.webp 1672w"
            sizes="100vw"
            alt=""
            loading="eager"
            decoding="async"
            style={{ objectPosition: '68% 50%' }}
          />
          <div className="ob-scene-scrim" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.88),transparent_45%)]" />
        </div>
        <Container className="relative z-[1] flex min-h-[78vh] flex-col justify-end pb-16 pt-36 md:pb-20">
          <Breadcrumb items={crumbs} className="mb-9" />
          <Eyebrow>Integrations</Eyebrow>
          <h1 className="ob-display mt-6 max-w-[12ch]">
            Reliastra, usable by your agent.
          </h1>
          <p className="ob-lede mt-7 max-w-[54ch]">
            An MCP server with 18 tools over stdio or Streamable HTTP: the
            public observatory, incident evidence, workspace reads, dependency
            analysis, and two safe writes — authenticated with a scoped API
            key, verified live at {REMOTE_URL}.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href={DOCS_ROUTES.mcp} className="ob-btn ob-btn-primary">
              Read the MCP docs
            </Link>
            <Link href={PUBLIC_ROUTES.observatory} className="ob-btn ob-btn-outline">
              See the public data first
            </Link>
          </div>
        </Container>
      </header>

      {/* ── What it is ── */}
      <Section tone="void" divider={false} aria-labelledby="what-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <div className="flex flex-col gap-6">
              <Eyebrow>What it is</Eyebrow>
              <h2 id="what-title" className="ob-h2 max-w-[18ch]">
                Evidence your agent can call, not copy it reads.
              </h2>
              <p className="ob-body">
                An AI coding agent can inspect an architecture, find the
                external dependencies, and ask what the evidence says — through
                tool calls, not scraped prose. The server is an HTTP client of
                the canonical API: every answer carries its source, its
                methodology version, and its limits.
              </p>
              <p className="ob-body">
                It makes Reliastra usable by a compatible agent. It does not
                make agents discover Reliastra on their own, and an honest
                evaluation can conclude Reliastra adds no value — the analysis
                tool is built to return exactly that verdict.
              </p>
            </div>
            <div className="flex flex-col gap-6">
              <Eyebrow>Transports</Eyebrow>
              <div className="flex flex-col gap-px border border-[var(--ob-line)] bg-[var(--ob-line)]">
                <div className="flex flex-col gap-3 bg-[var(--ob-base)] p-7">
                  <p className="ob-mono text-[12.5px] text-[var(--ob-text)]">stdio</p>
                  <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                    Run <span className="ob-mono text-[13px]">python -m mcp_server --transport stdio</span> from
                    a backend checkout. Credential from <span className="ob-mono text-[13px]">RELIASTRA_API_KEY</span>;
                    without one only public tools answer. For a local agent that spawns the process.
                  </p>
                </div>
                <div className="flex flex-col gap-3 bg-[var(--ob-base)] p-7">
                  <p className="ob-mono text-[12.5px] text-[var(--ob-text)]">{REMOTE_URL}</p>
                  <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                    Streamable HTTP, live in production. Authentication is required on every
                    request: <span className="ob-mono text-[13px]">Authorization: Bearer rel_...</span>.
                    No anonymous access exists on this transport.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Quickstart ── */}
      <Section tone="void" aria-labelledby="start-title">
        <Container>
          <div className="flex flex-col gap-6 pb-12">
            <Eyebrow>Quickstart</Eyebrow>
            <h2 id="start-title" className="ob-scene-title max-w-[16ch]">
              Connected in three moves.
            </h2>
          </div>
          <ol className="grid gap-px border border-[var(--ob-line)] bg-[var(--ob-line)] md:grid-cols-3">
            <li className="flex flex-col gap-4 bg-[var(--ob-base)] p-7">
              <span className="ob-label ob-label-strong">01</span>
              <h3 className="ob-h3">Get a key</h3>
              <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                Create one with <span className="ob-mono text-[13px]">reliastra keys create &lt;name&gt;</span> or
                in the console under settings. Reads need read scopes; the two writes need write scope.
              </p>
            </li>
            <li className="flex flex-col gap-4 bg-[var(--ob-base)] p-7">
              <span className="ob-label ob-label-strong">02</span>
              <h3 className="ob-h3">Run the server</h3>
              <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                Locally over stdio, or point the client at the remote URL. The server needs
                no database: it calls the same API the console does.
              </p>
              <CodeBlock lang="bash" code={STDIO_SNIPPET} />
            </li>
            <li className="flex flex-col gap-4 bg-[var(--ob-base)] p-7">
              <span className="ob-label ob-label-strong">03</span>
              <h3 className="ob-h3">Call one tool</h3>
              <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                <span className="ob-mono text-[13px]">reliastra_get_capabilities</span> needs no
                credential and proves transport, auth and server in one call.
              </p>
              <ArrowLink href={DOCS_ROUTES.mcp}>Full setup in the docs</ArrowLink>
            </li>
          </ol>
          <div className="mt-10">
            <p className="ob-label mb-4">Example client configuration (shape, paths are yours)</p>
            <CodeBlock lang="json" code={CLIENT_SNIPPET} />
            <p className="ob-small mt-4 max-w-[68ch]">
              Only the official Python SDK client has been exercised against this server
              (protocol 2025-11-25 negotiated). Other MCP-compatible clients speak the same
              standard surface but have not been tested — verify before depending on one.
            </p>
          </div>
        </Container>
      </Section>

      {/* ── Tools ── */}
      <Section tone="void" aria-labelledby="tools-title">
        <Container>
          <div className="flex flex-col gap-6 pb-12">
            <Eyebrow>{MCP_TOOL_NAMES.length} tools</Eyebrow>
            <h2 id="tools-title" className="ob-scene-title max-w-[16ch]">
              Everything the server answers to.
            </h2>
            <p className="ob-lede max-w-[58ch]">
              Read-only unless marked (write). API key required where marked (key).
              Every tool returns a uniform result with its source endpoint — failures
              are typed errors, never empty successes.
            </p>
          </div>
          <div className="grid gap-px border border-[var(--ob-line)] bg-[var(--ob-line)] md:grid-cols-2 xl:grid-cols-3">
            {MCP_TOOL_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-4 bg-[var(--ob-base)] p-7">
                <h3 className="ob-h3">{group.title}</h3>
                <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-4)]">{group.intro}</p>
                <ul className="flex flex-col">
                  {group.tools.map((tool) => (
                    <li key={tool.name} className="border-t border-[var(--ob-line)] py-3">
                      <p className="ob-mono text-[12.5px] text-[var(--ob-text)]">
                        {tool.name}
                        {tool.needsKey && <span className="text-[var(--ob-text-4)]"> · key</span>}
                        {tool.writes && <span className="text-[var(--ob-text-4)]"> · writes</span>}
                      </p>
                      <p className="mt-1 text-[13px] leading-[1.6] text-[var(--ob-text-3)]">{tool.blurb}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="ob-label mb-4">Resources</p>
              <ul className="flex flex-col">
                {MCP_RESOURCES.map((r) => (
                  <li key={r.uri} className="border-t border-[var(--ob-line)] py-3">
                    <p className="ob-mono text-[12.5px] text-[var(--ob-text)]">{r.uri}</p>
                    <p className="mt-1 text-[13px] leading-[1.6] text-[var(--ob-text-3)]">{r.blurb}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="ob-label mb-4">Prompts</p>
              <ul className="flex flex-col">
                {MCP_PROMPTS.map((p) => (
                  <li key={p.name} className="border-t border-[var(--ob-line)] py-3">
                    <p className="ob-mono text-[12.5px] text-[var(--ob-text)]">{p.name}</p>
                    <p className="mt-1 text-[13px] leading-[1.6] text-[var(--ob-text-3)]">{p.blurb}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Limits ── */}
      <Section tone="void" aria-labelledby="limits-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <div className="flex flex-col gap-6">
              <Eyebrow>Limits</Eyebrow>
              <h2 id="limits-title" className="ob-h2 max-w-[18ch]">
                What the evidence does not establish.
              </h2>
            </div>
            <ul className="flex flex-col gap-5">
              {[
                'Vendor-level evidence never proves a specific application request failed.',
                'Correlation is never presented as causation; scores below 50 are often unknown, a valid result.',
                'One observation point (us-east). No regional quorum is claimed.',
                'The analysis tools reason only over caller-supplied input plus the public catalog.',
                'Only two tools write, both need write scope, both are audit-logged and never retried.',
              ].map((item) => (
                <li key={item} className="border-t border-[var(--ob-line)] pt-5 text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-14 flex flex-col gap-3 sm:flex-row">
            <Link href={DOCS_ROUTES.mcp} className="ob-btn ob-btn-primary">
              Read the MCP docs
            </Link>
            <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-outline">
              Get an API key
            </Link>
          </div>
          <p className="ob-small mt-8 max-w-[68ch]">
            Source and operator documentation live with the implementation in{' '}
            <a href={`${EXTERNAL_LINKS.github}/tree/main/backend/mcp_server`} target="_blank" rel="noopener noreferrer" className="ob-link">
              backend/mcp_server
            </a>
            . Methodology, pricing and trial terms are the same everywhere on this site.
          </p>
        </Container>
      </Section>
    </SiteShell>
  );
}
