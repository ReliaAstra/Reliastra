/**
 * The MCP server catalog, stated once.
 *
 * The feature page (`/integrations/mcp`) and the docs guide (`/docs/mcp`)
 * both render from here, and `lib/__tests__/mcp-catalog.test.ts` asserts
 * these names match the tool registration in `backend/mcp_server/tools/`.
 * A renamed tool breaks the test instead of silently leaving the site
 * advertising a name the server does not answer to.
 */

export type McpTool = {
  /** Exact `name=` the server registers. Renames must land here too. */
  name: string;
  /** One line: what it does. */
  blurb: string;
  /** True when the call needs a Reliastra API key. */
  needsKey: boolean;
  /** True when the call can change state. Only two tools qualify. */
  writes: boolean;
};

export type McpToolGroup = {
  title: string;
  intro: string;
  tools: McpTool[];
};

export const MCP_TOOL_GROUPS: McpToolGroup[] = [
  {
    title: 'Discovery',
    intro: 'Start here. Works without any credential.',
    tools: [
      {
        name: 'reliastra_get_capabilities',
        blurb: 'The verified capability registry, filtered to your credential.',
        needsKey: false,
        writes: false,
      },
    ],
  },
  {
    title: 'Observatory',
    intro: 'The public vendor catalog. No credential needed.',
    tools: [
      {
        name: 'reliastra_search_observatory',
        blurb: 'Search listed vendors by name or category.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_get_provider',
        blurb: 'One vendor: detail, endpoints, recent status.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_get_provider_metrics',
        blurb: 'Per-window availability and latency aggregates.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_get_provider_timeline',
        blurb: 'Observation time series for a window.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_get_pipeline_health',
        blurb: 'Whether the measurement pipeline itself is healthy.',
        needsKey: false,
        writes: false,
      },
    ],
  },
  {
    title: 'Incidents and evidence',
    intro: 'Observed incidents and independent verification. No credential needed.',
    tools: [
      {
        name: 'reliastra_search_incidents',
        blurb: 'Filterable search over observed vendor incidents.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_get_public_incident',
        blurb: 'One incident: detail plus its evidence descriptor.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_get_incident_evidence',
        blurb: 'The frozen evidence document for a public incident.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_verify_evidence',
        blurb: 'Independent verdict on a record. Counts only when verified is exactly true.',
        needsKey: false,
        writes: false,
      },
    ],
  },
  {
    title: 'Workspace',
    intro: "The caller's own account. API key required; never another account's data.",
    tools: [
      {
        name: 'reliastra_list_dependencies',
        blurb: 'Monitored dependencies on this account.',
        needsKey: true,
        writes: false,
      },
      {
        name: 'reliastra_get_dependency_observations',
        blurb: 'Recent observations for one dependency.',
        needsKey: true,
        writes: false,
      },
      {
        name: 'reliastra_list_workspace_incidents',
        blurb: 'Incidents on this account.',
        needsKey: true,
        writes: false,
      },
      {
        name: 'reliastra_get_evidence_report',
        blurb: 'One evidence report with its verification id.',
        needsKey: true,
        writes: false,
      },
    ],
  },
  {
    title: 'Analysis and planning',
    intro: 'Local reasoning over caller-supplied input. No credential needed; never modifies anything.',
    tools: [
      {
        name: 'reliastra_analyze_dependencies',
        blurb: 'Match an inventory against the catalog. Returns gaps — or that Reliastra adds no value.',
        needsKey: false,
        writes: false,
      },
      {
        name: 'reliastra_plan_integration',
        blurb: 'A concrete REST, CLI, or GitHub Action plan where justified, or no-use-case where not.',
        needsKey: false,
        writes: false,
      },
    ],
  },
  {
    title: 'Writes',
    intro: 'Two narrowly scoped mutations. API key with write scope required; never retried; audit-logged.',
    tools: [
      {
        name: 'reliastra_register_dependency',
        blurb: 'Monitor a new HTTP endpoint. Never accepts stored headers.',
        needsKey: true,
        writes: true,
      },
      {
        name: 'reliastra_trigger_check',
        blurb: 'One immediate diagnostic check. Not a second scheduler.',
        needsKey: true,
        writes: true,
      },
    ],
  },
];

/** Every tool name, flat. The contract test diffs this against the backend. */
export const MCP_TOOL_NAMES: string[] = MCP_TOOL_GROUPS.flatMap((g) =>
  g.tools.map((t) => t.name)
);

export const MCP_RESOURCES = [
  { uri: 'reliastra://capabilities', blurb: 'The capability registry as data.' },
  { uri: 'reliastra://methodology', blurb: 'Detection, attribution and evidence rules.' },
  { uri: 'reliastra://limitations', blurb: 'What the evidence does not establish.' },
  { uri: 'reliastra://integration-guide', blurb: 'Verified endpoints, scopes, CLI commands and client configuration.' },
  { uri: 'reliastra://observatory/{provider}', blurb: 'One vendor record as data.' },
];

export const MCP_PROMPTS = [
  { name: 'reliastra_workflow_assess_observability', blurb: 'Evaluate what an architecture observes today.' },
  { name: 'reliastra_workflow_investigate_failure', blurb: 'Work a suspected dependency failure from evidence.' },
  { name: 'reliastra_workflow_evaluate_fit', blurb: 'Decide whether Reliastra earns a place — either answer allowed.' },
  { name: 'reliastra_workflow_plan_integration', blurb: 'Turn a justified use case into build steps.' },
];

export const MCP_TRANSPORTS = {
  stdio: {
    command: 'python -m mcp_server --transport stdio',
    credential: 'RELIASTRA_API_KEY in the environment (optional; public tools work without it)',
  },
  remote: {
    /** Served by the API origin; keep in sync via EXTERNAL_LINKS at render sites. */
    path: '/mcp',
    credential: 'Authorization: Bearer <rel_...> on every request (always required)',
  },
};
