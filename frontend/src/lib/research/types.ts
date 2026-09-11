/**
 * The research corpus model.
 *
 * This file exists to make the difference between a *paper* and a *blog post*
 * structural rather than editorial. A paper declares its question, its
 * abstract, its findings, the basis of each finding, its limitations and its
 * references before a single paragraph of prose is written - and the route
 * refuses to render a record that is missing any of them.
 *
 * The consequence is deliberate: you cannot add a page to `/research` by
 * writing prose. You add a page by declaring what it claims and what it is
 * allowed to claim, and the prose has to satisfy that declaration.
 */

/* ── Taxonomy ───────────────────────────────────────────────────────────── */

/**
 * Technical domains. These are the discovery axis on `/research`: an engineer
 * looking for work on control-plane failure should not have to read every
 * title to find it.
 */
export const RESEARCH_DOMAINS = [
  'AI infrastructure',
  'Cloud security',
  'Dependency security',
  'Distributed systems',
  'Incident engineering',
  'Measurement integrity',
  'Observability',
  'Reliability',
  'Zero trust',
] as const;
export type ResearchDomain = (typeof RESEARCH_DOMAINS)[number];

/**
 * What kind of document this is. The distinction matters to a reader: a
 * measurement can be re-run, an architecture analysis cannot.
 */
export const RESEARCH_TYPES = [
  'Measurement',
  'Methodology',
  'Architecture analysis',
  'Incident analysis',
  'Audit',
] as const;
export type ResearchType = (typeof RESEARCH_TYPES)[number];

/**
 * The epistemic basis of a claim. Every key finding carries one, because
 * "we measured it" and "we reason it must be so" are not the same sentence
 * and must never render identically.
 *
 * - `measured`  - RELIASTRA issued the request / read the response itself.
 * - `derived`   - arithmetic on a measurement RELIASTRA captured.
 * - `sourced`   - taken from a cited primary source, not observed by us.
 * - `reasoned`  - architectural argument. No observation stands behind it.
 */
export const EVIDENCE_BASES = ['measured', 'derived', 'sourced', 'reasoned'] as const;
export type EvidenceBasis = (typeof EVIDENCE_BASES)[number];

export const EVIDENCE_BASIS_LABEL: Record<EvidenceBasis, string> = {
  measured: 'Independently measured',
  derived: 'Derived from a captured measurement',
  sourced: 'Cited primary source',
  reasoned: 'Architectural reasoning',
};

/* ── References ─────────────────────────────────────────────────────────── */

export type ReferenceKind =
  | 'standard'
  | 'rfc'
  | 'vendor-documentation'
  | 'security-advisory'
  | 'academic'
  | 'reliastra-measurement'
  | 'source-code'
  | 'web';

export type ResearchReference = {
  /** Citation key rendered as `[1]` in the text. */
  id: string;
  kind: ReferenceKind;
  title: string;
  /** Publisher or standards body. Omitted only for in-repo source code. */
  publisher?: string;
  /** RFC number, NIST publication, DOI - the durable identifier. */
  identifier?: string;
  url?: string;
  /** Publication date of the source itself, when it has one. */
  publishedAt?: string;
  /** Date RELIASTRA last read it. Required for anything that can change. */
  accessedAt?: string;
  note?: string;
};

/* ── Artifacts ──────────────────────────────────────────────────────────── */

export type ArtifactKind =
  | 'repository'
  | 'script'
  | 'dataset'
  | 'diagram'
  | 'trace';

/**
 * A reproducible artifact. A paper that measures something should let a
 * reader re-measure it; `path` points at the versioned copy in this
 * monorepo so the artifact cannot rot away from the claims it supports.
 */
export type ResearchArtifact = {
  kind: ArtifactKind;
  label: string;
  description: string;
  /** Path inside this repository, when the artifact is versioned here. */
  path?: string;
  url?: string;
  /** MIME type for datasets, so a retrieval system knows what it is. */
  format?: string;
  /** SHA-256 of the versioned artifact at publication time, for datasets. */
  sha256?: string;
};

/* ── Entities ───────────────────────────────────────────────────────────── */

/**
 * An explicitly named entity. Retrieval systems and readers both fail on
 * "the provider experienced elevated latency"; this list is the machine-
 * readable form of the discipline of naming who and what.
 */
export type ResearchEntity = {
  role:
    | 'vendor'
    | 'dependency'
    | 'endpoint'
    | 'region'
    | 'system'
    | 'standard'
    | 'organization';
  name: string;
  /** One clause of context, e.g. "the status site, not the API". */
  note?: string;
};

/* ── Observation window ─────────────────────────────────────────────────── */

/**
 * The measurement window a paper's numbers came from. Published separately
 * from `publishedAt` because they are different facts: an incident analysis
 * written in September can describe a window that closed in August, and the
 * historical record must not move when the page is edited.
 */
export type ObservationWindow = {
  /** What was probed or read. */
  target: string;
  /** Endpoint or dataset, exactly as addressed. */
  source: string;
  protocol: string;
  regions: string[];
  /** ISO 8601 UTC. */
  startedAt: string;
  endedAt: string;
  observations: number | null;
  /** How the observation was produced. */
  method: string;
};

/* ── Datasets ───────────────────────────────────────────────────────────── */

export type ResearchDataset = {
  name: string;
  description: string;
  /** Repo-relative path to the versioned data. */
  path: string;
  format: string;
  license: string;
  variables: { name: string; type: string; unit?: string; description: string }[];
};

/* ── The paper record ───────────────────────────────────────────────────── */

export type ResearchPaper = {
  slug: string;
  /**
   * Live-data hub this paper belongs to, when it has one. Mirrors the URL
   * record in `RESEARCH_ARTICLES` and is checked against it by the corpus
   * test - it is documentation here, not a routing input.
   */
  hub?: string;
  /** One sentence, interrogative. The paper exists to answer it. */
  researchQuestion: string;
  /** Compact technical summary. Stands alone; quoted by retrieval systems. */
  abstract: string;
  /** 3-7 concrete findings, each with its basis declared. */
  keyFindings: { claim: string; basis: EvidenceBasis }[];
  /** What the paper covers - and, by exclusion, what it does not. */
  scope: string;
  /** One-paragraph method statement for the document header. */
  methodologySummary: string;
  domains: ResearchDomain[];
  researchType: ResearchType;
  /**
   * The basis that characterises the paper as a whole - what a reader should
   * assume when they have not read it. A paper that is mostly architectural
   * reasoning but contains one measurement is `reasoned`: labelling it
   * `measured` on the strength of one finding would oversell the document.
   */
  evidenceBasis: EvidenceBasis;
  entities: ResearchEntity[];
  observation?: ObservationWindow;
  dataset?: ResearchDataset;
  /** What this paper cannot prove. Mandatory: an empty list fails the gate. */
  limitations: string[];
  /** What an engineer should change. Mandatory. */
  recommendations: { title: string; detail: string }[];
  references: ResearchReference[];
  artifacts: ResearchArtifact[];
  /** Contextual links into RELIASTRA's own records - not "you may also like". */
  relatedEvidence: { href: string; label: string; description: string }[];
  /** Author id from `RESEARCH_AUTHORS`; falls back to the organization. */
  author?: string;
  publishedAt: string;
  updatedAt?: string;
  /** Plain-language correction note, when the paper has been revised. */
  revisionNote?: string;
};
