/**
 * Company Intelligence v3 — Susan's Exec10X cockpit (ADR-009 §18).
 *
 * The report is ONE JSON object in Susan's Exec10X data schema
 * (prompts/company-intel/exec10x-master-prompt.md §13), rendered by her
 * template (src/components/company-intel/exec10x/template.html), plus two
 * platform additions:
 *   - `ask` on every claim-bearing item: required when its evidence code is
 *     U / H / P, so no gap is ever dropped;
 *   - `openQuestions`, computed here, which feeds Tab 3 "Questions to ask".
 *
 * Four writers produce parts of the object from the saved research. This file
 * merges the parts (sources deduped by URL, IDs renumbered S1… / F1…), checks
 * every source against the research the writers read, repairs what can be
 * repaired, and runs Susan's §13.3 validator. Nothing here calls a model.
 */

/** Which writers a run uses. Set to 2 to go back to the v2 Company Context report. */
export const REPORT_GENERATION = 3 as 2 | 3;

export const CODES = ["V", "I", "H", "U", "P", "C"] as const;
export type Code = (typeof CODES)[number];
export const CODE_LABEL: Record<Code, string> = {
  V: "Verified",
  I: "Inference",
  H: "Hypothesis",
  U: "Unknown",
  P: "Partner input · to validate",
  C: "Client-confirmed",
};
/** Codes that always become a question in Tab 3. */
const OPEN: Code[] = ["U", "H", "P"];

export const MEYER = [
  "Communicating",
  "Evaluating",
  "Persuading",
  "Leading",
  "Deciding",
  "Trusting",
  "Disagreeing",
  "Scheduling",
] as const;
const GAPS = ["Large", "Moderate", "Small"] as const;

/* -------------------------------------------------------------------------
 * Data shape (Susan's schema §13.1 + platform fields)
 * ---------------------------------------------------------------------- */

export type Finding = { id: string; title: string; c: Code; sources: string[]; ask?: string | null };
export type Source = { id: string; title: string; url: string };
export type OpenQuestion = { question: string; context: string | null; c: Code };
export type OpenGroup = { section: string; items: OpenQuestion[] };

type Obj = Record<string, unknown>;
export type CockpitData = {
  version: 3;
  schemaVersion: "1.0";
  meta: { company: string; shortName?: string | null; subtitle?: string | null; country: string; asOf: string; status: string };
  snapshot: Obj;
  business: Obj;
  organisation: Obj;
  culture: Obj;
  transformation: Obj;
  metrics: Obj;
  businessInsights: Obj;
  environment: Obj;
  confidence: Obj;
  questions: { question: string; why: string }[];
  skills: Obj[];
  findings: Finding[];
  sources: Source[];
  /** Tab 3: every open point, grouped by section. */
  openQuestions: OpenGroup[];
  validation: Validation;
};

export type Validation = {
  errors: string[];
  warnings: string[];
  /** Sources whose URL/name could not be found in the research the writers read. */
  droppedSources: string[];
  /** Findings and cards downgraded to Unknown because their evidence did not hold. */
  downgraded: string[];
};

/** One line for the results page: what the checks removed or downgraded. */
export function validationSummary(v: Validation | undefined): string | null {
  if (!v) return null;
  const parts = [
    v.droppedSources.length && `${v.droppedSources.length} source${v.droppedSources.length > 1 ? "s" : ""} removed (not in the research)`,
    v.downgraded.length && `${v.downgraded.length} claim${v.downgraded.length > 1 ? "s" : ""} downgraded`,
    v.warnings.length && `${v.warnings.length} other correction${v.warnings.length > 1 ? "s" : ""} or note${v.warnings.length > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")}. They're listed below and their questions are in "Questions to ask".` : null;
}

/** The PDF file name the browser suggests, for every report generation: <Company>_CompanyIntel. */
export const cockpitFileTitle = (name: string) => `${name.replace(/[^\p{L}\p{N}]+/gu, "") || "Company"}_CompanyIntel`;

export function isCockpit(d: unknown): d is CockpitData {
  return !!d && typeof d === "object" && (d as { version?: unknown }).version === 3;
}

/* -------------------------------------------------------------------------
 * Refresh is the user's choice (Dana, 2026-10-09)
 * ---------------------------------------------------------------------- */

/**
 * Which research areas a run researches: never-researched ones (the report
 * can't be written without them) plus the ones the user ticked. Stale or
 * earlier-brief research is reused unless ticked.
 */
export function researchPlan<T extends { module: string; status: "fresh" | "stale" | "missing" }>(modules: T[], ticked: ReadonlySet<string>): T[] {
  return modules.filter((m) => m.status === "missing" || ticked.has(m.module));
}

/* -------------------------------------------------------------------------
 * Writers
 * ---------------------------------------------------------------------- */

export type Exec10xWriterId = "company" | "market" | "culture" | "skills";
export const EXEC10X_WRITERS: Record<
  Exec10xWriterId,
  { label: string; fields: (keyof CockpitData)[]; modules: string[] | "all"; wave: 1 | 2 }
> = {
  company: { label: "Company, business & organisation", fields: ["meta", "snapshot", "business", "organisation"], modules: "all", wave: 1 },
  market: { label: "Transformation, metrics & competition", fields: ["transformation", "metrics", "businessInsights"], modules: "all", wave: 1 },
  culture: {
    label: "Culture & leadership",
    fields: ["culture"],
    modules: ["01-identity-ownership", "04-people-structure", "05-culture-voice", "06-group-structure", "08-performance-talent-ecosystem"],
    wave: 1,
  },
  skills: { label: "Success environment & Contextual Skills", fields: ["environment", "skills", "questions", "confidence"], modules: "all", wave: 2 },
};
export const EXEC10X_WAVE1: Exec10xWriterId[] = ["company", "market", "culture"];
export const EXEC10X_WAVE2: Exec10xWriterId[] = ["skills"];
export const EXEC10X_WRITER_IDS: Exec10xWriterId[] = [...EXEC10X_WAVE1, ...EXEC10X_WAVE2];
export const isExec10xWriter = (s: string): s is Exec10xWriterId => Object.hasOwn(EXEC10X_WRITERS, s);

/* ---- tool schemas (guidance for the model; repaired + validated on read) */

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const nstr = (description?: string) => ({ type: ["string", "null"], ...(description ? { description } : {}) });
const arr = (items: object, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, object>, description?: string) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...(description ? { description } : {}),
});
const code = { type: "string", enum: [...CODES], description: "Evidence code (§5)" };
const ask = nstr(
  "The client question that would settle this. REQUIRED (non-null) when c is U, H or P; otherwise null."
);
const findingRefs = arr(str(), "Finding IDs (from YOUR findings list) that support this, e.g. [\"F3\",\"F7\"]. A V or I item without findings becomes Unknown.");
const timeline = arr(obj({ time: str(), text: str() }));

const FIELD_SCHEMAS: Partial<Record<keyof CockpitData, object>> = {
  meta: obj({
    company: str("Full company name"),
    shortName: nstr("Name used in titles"),
    subtitle: nstr("Parent · country, shown after the name"),
    country: str("Main operating country"),
    asOf: str("D Mon YYYY"),
    status: str("e.g. Public-source research · not client-validated"),
  }),
  snapshot: obj({ thesis: str(), kpis: arr(obj({ value: str("Under 12 characters"), label: str("Under 70 characters") }), "4–8 tiles") }),
  business: obj({
    title: str(),
    rows: arr(obj({ label: { type: "string", enum: ["Model", "Stage", "Priorities", "Pressure"] }, text: str() }), "Exactly the four rows"),
    positionTitle: str(),
    swot: obj({ strengths: arr(str()), weaknesses: arr(str()), opportunities: arr(str()), threats: arr(str()) }),
  }),
  organisation: obj({
    title: str(),
    owners: arr(obj({ name: str(), detail: str() })),
    group: obj({ name: str(), detail: str() }),
    units: arr(obj({ name: str(), detail: str(), focus: { type: "boolean" }, former: { type: "boolean" }, brands: arr(str()) }), "Exactly one unit has focus: true"),
    note: str(),
    decisionRights: arr(obj({ decision: str(), locus: str(), c: code, findings: findingRefs, ask })),
  }),
  culture: obj({
    cultures: arr(obj({ key: str("short key, e.g. fr"), code: str("e.g. FR"), label: str("Country (who this culture represents here)") }), "2–4, most important first"),
    mapTitle: str(),
    mapNote: str(),
    map: arr(
      obj({
        dimension: { type: "string", enum: [...MEYER] },
        left: str(),
        right: str(),
        positions: { type: "object", additionalProperties: { type: "number" }, description: "culture key → 0–100" },
      }),
      "Exactly Meyer's eight scales"
    ),
    leaders: obj({ title: str(), note: str(), rows: arr(obj({ role: str(), person: str(), career: str(), c: code, findings: findingRefs, ask })) }),
    dynamics: obj({ eyebrow: str(), title: str(), items: arr(obj({ tag: str(), c: code, text: str(), findings: findingRefs, ask })), note: str() }),
    dimensionsTitle: str(),
    dimensions: arr(
      obj({
        dimension: { type: "string", enum: [...MEYER] },
        gap: { type: "string", enum: [...GAPS] },
        tension: str(),
        views: { type: "object", additionalProperties: { type: "string" }, description: "culture key → one sentence" },
        scene: str(),
        helps: str(),
      }),
      "One per Meyer scale, ordered Large → Moderate → Small"
    ),
    joining: obj({ eyebrow: str(), title: str(), items: arr(obj({ title: str(), text: str() })) }),
    hiring: obj({ title: str(), items: arr(obj({ title: str(), text: str() })), note: str() }),
  }),
  transformation: obj({ title: str(), timeline }),
  metrics: obj({
    title: str(),
    groups: arr(obj({ label: str(), bars: arr(obj({ label: str(), value: { type: "number" }, display: str(), muted: { type: "boolean" } })) })),
    note: str(),
  }),
  businessInsights: obj({
    title: str(),
    cards: arr(obj({ title: str(), text: str(), c: code, findings: findingRefs, ask })),
    competitors: arr(obj({ player: str(), model: str(), edge: str(), move: str(), threat: { type: "string", enum: ["High", "Medium", "Low–med", "Low"] } })),
    vulnerability: obj({ title: str(), intro: str(), timeline, note: str() }),
  }),
  environment: obj({
    conditions: arr(
      obj({
        title: str(),
        facts: str(),
        dayToDay: str(),
        helps: str(),
        derails: str(),
        c: code,
        findings: findingRefs,
        skills: arr({ type: "integer" }, "1-based capability numbers"),
        ask,
      }),
      "5–7 conditions"
    ),
    opportunity: str(),
  }),
  confidence: obj({ unknowns: arr(str()), hypotheses: arr(str()), contradictions: arr(str()), sourcesNote: str() }),
  questions: arr(obj({ question: str(), why: str("What its answer changes") }), "10–12 prioritised client validation questions"),
  skills: arr(
    obj({
      name: str(),
      definition: str(),
      whyHere: str(),
      markers: arr(obj({ title: str(), text: str() }), "3–4"),
      evidence: arr(str()),
      redFlags: arr(str()),
      question: str(),
      probe: str(),
      c: code,
      confidenceNote: str(),
      findings: findingRefs,
      ask,
    }),
    "5–6 capabilities, ranked"
  ),
};

const FINDINGS_SCHEMA = arr(obj({ id: str("F1, F2, …"), title: str(), c: code, sources: arr(str(), "Source IDs"), ask }));
const SOURCES_SCHEMA = arr(
  obj({ id: str("S1, S2, …"), title: str("Publisher, date: headline"), url: str("Copied EXACTLY from the research file") })
);

/** The `save_part` tool schema for one writer: its schema fields + its own findings and sources. */
export function exec10xWriterSchema(w: Exec10xWriterId) {
  const props: Record<string, object> = {};
  for (const f of EXEC10X_WRITERS[w].fields) props[f] = FIELD_SCHEMAS[f]!;
  props.findings = FINDINGS_SCHEMA;
  props.sources = SOURCES_SCHEMA;
  return obj(props);
}

/* -------------------------------------------------------------------------
 * Small, defensive readers (model output is untrusted shape)
 * ---------------------------------------------------------------------- */

const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const s = (x: unknown): string => (typeof x === "string" ? x.trim() : x == null ? "" : String(x));
const objs = (x: unknown): Obj[] => list(x).filter(isObj);

/** Tool arguments sometimes arrive with an object JSON-encoded as a string (seen in v2). */
function decode(x: unknown): unknown {
  if (typeof x !== "string") return x;
  const t = x.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return x;
  try {
    return JSON.parse(t);
  } catch {
    return x;
  }
}
export function decodePart(raw: unknown): Obj {
  // Deep copy: merging rewrites IDs in place and must never touch the stored part.
  const o: Obj = isObj(raw) ? (JSON.parse(JSON.stringify(raw)) as Obj) : {};
  for (const k of Object.keys(o)) o[k] = decode(o[k]);
  return o;
}

const normCode = (x: unknown): Code => {
  const c = s(x).toUpperCase();
  return (CODES as readonly string[]).includes(c) ? (c as Code) : "U";
};

export function normUrl(u: string): string | null {
  try {
    const url = new URL(u.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return (url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/+$/, "") + url.search).toLowerCase();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Traceability: a source counts only if its exact page is in the research
 * ---------------------------------------------------------------------- */

const URL_IN_TEXT = /https?:\/\/[^\s)\]>"'<`|]+/g;

/**
 * Stricter than v2's makeEvidenceCheck (which accepts any page on a domain the
 * research mentions): the cited page itself — host + path, www and trailing
 * slash ignored, query optional — must occur in the research text. A deep
 * link invented on a known domain is dropped.
 */
export function makeUrlCheck(corpus: string) {
  const pages = new Set<string>();
  for (const m of corpus.match(URL_IN_TEXT) ?? []) {
    const key = normUrl(m.replace(/[.,;:!?'"]+$/, ""));
    if (!key) continue;
    pages.add(key);
    pages.add(key.replace(/\?.*$/, ""));
  }
  // Fallback for links the pattern above cuts short (parentheses, spaces): the
  // link copied verbatim — protocol, www and trailing slash aside — is in the text.
  const text = corpus.toLowerCase();
  const bare = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  const verbatim = (u: string) => {
    const b = bare(u);
    if (b.length < 12 || !b.includes("/")) return false; // a bare domain is not a page
    let decoded = b;
    try {
      decoded = decodeURI(b);
    } catch {
      // malformed escape: compare as written
    }
    return [b, decoded].some((needle) => {
      for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
        // The match must be the whole link, not the start of a longer one
        // (acme.com/about must not pass for acme.com/about-us/team).
        const next = text.slice(i + needle.length, i + needle.length + 2);
        if (!next || /^(\/?[\s)\]>"'<`|,;]|\/?$|[.!?]?(\s|$))/.test(next)) return true;
      }
      return false;
    });
  };
  return (url: string): boolean => {
    const key = normUrl(url);
    return !!key && (pages.has(key) || pages.has(key.replace(/\?.*$/, "")) || verbatim(url));
  };
}

/**
 * Web pages must be in the research (makeUrlCheck). Uploaded documents have no
 * web address — they are the second most trusted source (Dana) — so a source
 * naming one of this company's uploaded files is kept as a document source
 * (url ""). Returns the dedupe key, or null when the source can't be traced.
 */
export type SourceCheck = (url: string, title: string) => string | null;
export function makeSourceCheck(corpus: string, documents: string[] = []): SourceCheck {
  const web = makeUrlCheck(corpus);
  // The exact filename, extension included: a generic stem ("report") must not
  // vouch for an invented source.
  const docs = documents.filter((f) => !f.startsWith("company-website-") && f.length >= 5);
  return (url, title) => {
    const key = normUrl(url);
    if (key) return web(url) ? key : null;
    const hay = `${url} ${title}`.toLowerCase();
    const doc = docs.find((f) => hay.includes(f.toLowerCase()));
    return doc ? `document:${doc}` : null;
  };
}

/* -------------------------------------------------------------------------
 * Merge: parts → one cockpit object
 * ---------------------------------------------------------------------- */

export type Part = { writer: Exec10xWriterId; data: unknown };
type Decoded = { writer: Exec10xWriterId; d: Obj };

const byWave = (parts: Part[], wave: 1 | 2): Decoded[] =>
  EXEC10X_WRITER_IDS.filter((w) => EXEC10X_WRITERS[w].wave === wave)
    .map((w) => parts.find((p) => p.writer === w))
    .filter((p): p is Part => Boolean(p))
    .map((p) => ({ writer: p.writer, d: decodePart(p.data) }));

/**
 * Merges writer parts. Wave-1 parts number their findings/sources locally; the
 * wave-2 part ("skills") is given the merged wave-1 register (`mergeRegister`)
 * and may cite those global IDs or add new ones that continue the numbering.
 * Output IDs are compact: S1…Sn in first-use order, F1…Fn in part order.
 */
const asCheck = (c: string | SourceCheck): SourceCheck => (typeof c === "string" ? makeSourceCheck(c) : c);

export function mergeParts(parts: Part[], corpus: string | SourceCheck): CockpitData {
  return mergeAll(parts, corpus).data;
}

/**
 * The merge, plus the wave-1 register exactly as the skills writer is shown it
 * (built once and reused — for the wave-2 prompt and the drift check).
 */
export function mergeAll(parts: Part[], corpus: string | SourceCheck): { data: CockpitData; register: { findings: Finding[]; sources: Source[] } } {
  const ok = asCheck(corpus);
  const v: Validation = { errors: [], warnings: [], droppedSources: [], downgraded: [] };
  const out: Obj = { version: 3, schemaVersion: "1.0" };
  const wave1 = byWave(parts, 1);
  const wave2 = byWave(parts, 2);

  // 1) Register: wave 1 first; its IDs are exactly what wave 2 was shown.
  const reg = buildRegister(wave1.map((p) => p.d), ok, v);
  // The skills writer must see the codes assembly will apply: a V/I finding left
  // without sources, or a C finding (no client input yet), is Unknown.
  const shownCode = (f: Finding): Code => (f.c === "C" || ((f.c === "V" || f.c === "I") && f.sources.length === 0) ? "U" : f.c);
  const register = {
    findings: [...reg.findings.values()].map(({ droppedAll: _d, ...f }) => ({ ...f, c: shownCode(f), sources: [...f.sources] })),
    sources: [...reg.sources.values()].map((x) => ({ ...x })),
  };
  for (const p of wave1) Object.assign(out, pick(p.d, EXEC10X_WRITERS[p.writer].fields));
  for (const p of wave2) {
    extendRegister(reg, p.d, ok, v);
    Object.assign(out, pick(p.d, EXEC10X_WRITERS[p.writer].fields));
  }

  // 2) Resolve finding references (a part's own IDs first, then the shown register),
  //    then 3) compact the numbering. Sources no finding uses are dropped.
  // Wave-1 writers number locally: their references resolve only inside their own
  // part. Wave 2 may also cite the register it was shown.
  const { findings, sources, fRename } = compact(reg);
  const refs = (ids: unknown, scope: string, label: string) => {
    const out: string[] = [];
    for (const x of list(ids).map(s)) {
      const id = reg.findingAlias.get(`${scope}:${x}`) ?? (scope === "wave2" ? reg.globalAlias.get(x) : undefined);
      const nid = id ? fRename.get(id) : undefined;
      if (nid) {
        if (!out.includes(nid)) out.push(nid);
      } else v.warnings.push(`${label} cites ${x}, which isn't in the findings (reference removed)`);
    }
    return out;
  };
  const scopeOf = (w: Exec10xWriterId) => `wave1:${wave1.findIndex((p) => p.writer === w)}`;
  const marketScope = scopeOf("market");
  // Every claim-bearing row is traced through its own writer's findings — including
  // Susan's rows that have no findings field in her schema (platform addition).
  if (isObj(out.organisation)) {
    const org = out.organisation as Obj;
    org.decisionRights = objs(org.decisionRights).map((r) => ({ ...r, findings: refs(r.findings, scopeOf("company"), `Decision right "${s(r.decision)}"`) }));
  }
  if (isObj(out.culture)) {
    const cu = out.culture as Obj;
    if (isObj(cu.leaders)) {
      const l = cu.leaders as Obj;
      l.rows = objs(l.rows).map((r) => ({ ...r, findings: refs(r.findings, scopeOf("culture"), `Leader "${s(r.person)}"`) }));
    }
    if (isObj(cu.dynamics)) {
      const dy = cu.dynamics as Obj;
      dy.items = objs(dy.items).map((r) => ({ ...r, findings: refs(r.findings, scopeOf("culture"), `Dynamics "${s(r.tag)}"`) }));
    }
  }
  if (isObj(out.businessInsights)) {
    const bi = out.businessInsights as Obj;
    bi.cards = objs(bi.cards).map((c) => ({ ...c, findings: refs(c.findings, marketScope, `Insight "${s(c.title)}"`) }));
  }
  if (isObj(out.environment)) {
    const env = out.environment as Obj;
    env.conditions = objs(env.conditions).map((c) => ({ ...c, findings: refs(c.findings, "wave2", `Condition "${s(c.title)}"`) }));
  }
  out.skills = objs(out.skills).map((sk) => ({ ...sk, findings: refs(sk.findings, "wave2", `Capability "${s(sk.name)}"`) }));
  out.findings = findings;
  out.sources = sources;

  repair(out, v);
  downgradeUnsupported(out, v);
  fillAsks(out);
  out.openQuestions = openQuestions(out as unknown as CockpitData);
  out.validation = v;
  const { errors, warnings } = validateCockpit(out as unknown as CockpitData);
  v.errors.push(...errors);
  v.warnings.push(...warnings);
  return { data: out as unknown as CockpitData, register };
}

function pick(d: Obj, fields: (keyof CockpitData)[]): Obj {
  const o: Obj = {};
  for (const f of fields) if (d[f] !== undefined) o[f] = d[f];
  return o;
}

type Register = {
  /** global source id → source (insertion order = allocation order) */
  sources: Map<string, Source>;
  byUrl: Map<string, string>;
  findings: Map<string, Finding & { droppedAll: boolean }>;
  /** `${scope}:${localId}` → global finding id; scope = wave1:<index> or wave2 */
  findingAlias: Map<string, string>;
  /** IDs as shown to wave 2 (F1…) → themselves */
  globalAlias: Map<string, string>;
};

function addSource(reg: Register, raw: Obj, ok: SourceCheck, v: Validation): string | null {
  const url = s(raw.url);
  const title = s(raw.title) || url;
  const key = ok(url, title);
  if (!key) {
    v.droppedSources.push(normUrl(url) ? `${title} — ${url}` : `${title} (not a web page or an uploaded document)`);
    return null;
  }
  const existing = reg.byUrl.get(key);
  if (existing) return existing;
  const id = `S${reg.sources.size + 1}`;
  reg.sources.set(id, { id, title, url: key.startsWith("document:") ? "" : url });
  reg.byUrl.set(key, id);
  return id;
}

function addFinding(reg: Register, f: Obj, resolveSource: (id: string) => string | null, alias: string) {
  const id = `F${reg.findings.size + 1}`;
  const cited = list(f.sources).map((x) => s(x));
  const kept = [...new Set(cited.map(resolveSource).filter(Boolean) as string[])];
  reg.findings.set(id, { id, title: s(f.title), c: normCode(f.c), sources: kept, ask: s(f.ask) || null, droppedAll: cited.length > 0 && kept.length === 0 });
  reg.findingAlias.set(alias, id);
  return id;
}

function buildRegister(parts: Obj[], ok: SourceCheck, v: Validation): Register {
  const reg: Register = { sources: new Map(), byUrl: new Map(), findings: new Map(), findingAlias: new Map(), globalAlias: new Map() };
  parts.forEach((d, i) => {
    const local = new Map<string, string | null>();
    for (const src of objs(d.sources)) local.set(s(src.id), addSource(reg, src, ok, v));
    for (const f of objs(d.findings)) {
      const id = addFinding(reg, f, (x) => local.get(x) ?? null, `wave1:${i}:${s(f.id)}`);
      reg.globalAlias.set(id, id);
    }
  });
  return reg;
}

/** The register exactly as wave 2 is shown it. */
export function mergeRegister(parts: Part[], corpus: string | SourceCheck): { findings: Finding[]; sources: Source[] } {
  return mergeAll(byWave(parts, 1).map((p) => ({ writer: p.writer, data: p.d })), corpus).register;
}

/**
 * Key-order-free fingerprint of a register. Postgres jsonb re-orders object
 * keys on the way back, so the stored copy is compared through this, never as
 * raw JSON text.
 */
export function registerFingerprint(reg: unknown): string {
  const r = isObj(reg) ? reg : {};
  return JSON.stringify([
    objs(r.findings).map((f) => [s(f.id), s(f.title), s(f.c), list(f.sources).map(s)]),
    objs(r.sources).map((x) => [s(x.id), s(x.url)]),
  ]);
}

/** Word overlap of two finding titles (0–1), to tell a re-worded re-statement from a different claim. */
function overlap(a: string, b: string) {
  const words = (x: string) => new Set(x.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / new Set([...A, ...B]).size;
}

function extendRegister(reg: Register, d: Obj, ok: SourceCheck, v: Validation) {
  const local = new Map<string, string | null>();
  for (const src of objs(d.sources)) {
    const id = s(src.id);
    if (!s(src.url) && reg.sources.has(id)) continue; // a bare reference to a shown source
    // Dedupes against the register. A re-listed register source whose URL got
    // mangled (same site, same title) keeps pointing at the register's traced
    // source; a NEW source that merely reuses an ID does not.
    const shown = reg.sources.get(id);
    const host = (u: string) => normUrl(u)?.split("/")[0] ?? "";
    const relisted = shown && host(s(src.url)) === host(shown.url) && overlap(s(src.title), shown.title) >= 0.5;
    local.set(id, addSource(reg, src, ok, v) ?? (relisted ? id : null));
  }
  const resolveSource = (x: string) => (local.has(x) ? local.get(x) ?? null : reg.sources.has(x) ? x : null);
  for (const f of objs(d.findings)) {
    const fid = s(f.id);
    const shown = reg.globalAlias.has(fid) ? reg.findings.get(fid) : undefined;
    // An ID from the register is a reference to that finding (the prompt asks for new
    // ones from F{n+1}), even when re-worded. Only a clearly different claim under a
    // shown ID means the writer restarted its numbering: then it is a NEW finding.
    if (shown) {
      if (overlap(shown.title, s(f.title)) >= 0.2) continue;
      v.warnings.push(`The skills writer reused ${fid} for a different claim ("${s(f.title)}"); kept as a new finding`);
    }
    addFinding(reg, f, resolveSource, `wave2:${fid}`);
  }
}

function compact(reg: Register) {
  const sRename = new Map<string, string>();
  const fRename = new Map<string, string>();
  const findings: Finding[] = [];
  for (const f of reg.findings.values()) {
    const nid = `F${findings.length + 1}`;
    fRename.set(f.id, nid);
    const sources = f.sources.map((sid) => {
      if (!sRename.has(sid)) sRename.set(sid, `S${sRename.size + 1}`);
      return sRename.get(sid)!;
    });
    findings.push({ id: nid, title: f.title, c: f.c, sources, ask: f.ask, ...(f.droppedAll ? { droppedAll: true } : {}) } as Finding);
  }
  const sources: Source[] = [...sRename].map(([old, nid]) => ({ ...reg.sources.get(old)!, id: nid }));
  return { findings, sources, fRename };
}

/* -------------------------------------------------------------------------
 * Repair, downgrade, asks
 * ---------------------------------------------------------------------- */

function repair(d: Obj, v: Validation) {
  // Every claim-bearing item gets a code; a missing or invalid one becomes U (and so a question).
  // "C" (client-confirmed) needs client input, which the platform doesn't take yet: also U.
  const fix = (o: Obj, where: string) => {
    let c = normCode(o.c);
    if (c === "C") {
      v.warnings.push(`${where}: coded Client-confirmed, but no client input exists yet — treated as Unknown`);
      c = "U";
    } else if (s(o.c).toUpperCase() !== c) v.warnings.push(`${where}: evidence code ${o.c == null ? "missing" : `"${s(o.c)}"`} replaced by U`);
    o.c = c;
  };
  const org = isObj(d.organisation) ? d.organisation : null;
  if (org) objs(org.decisionRights).forEach((r, i) => fix(r, `decision right ${i + 1}`));
  const cu = isObj(d.culture) ? d.culture : null;
  if (cu) {
    const cultures = objs(cu.cultures);
    // Keys must be non-empty, trimmed and unique (the template looks values up by key).
    const original = cultures.map((k) => ({ key: s(k.key), code: s(k.code) }));
    const keys: string[] = [];
    cultures.forEach((k, i) => {
      let key = (original[i].key || original[i].code || `c${i + 1}`).toLowerCase().replace(/\s+/g, "");
      while (keys.includes(key)) key = `${key}${i + 1}`;
      if (key !== s(k.key)) v.warnings.push(`culture ${i + 1}: key "${s(k.key)}" normalised to "${key}"`);
      keys.push(key);
      k.key = key;
    });
    // The model sometimes keys positions/views by the code ("FR") or another case:
    // find a culture's value by its key or its code, case-insensitively.
    const lookup = (o: Obj, i: number) => {
      const want = [original[i].key, original[i].code, keys[i]].filter(Boolean).map((x) => x.toLowerCase());
      const hit = Object.keys(o).find((k) => want.includes(k.trim().toLowerCase()));
      return hit === undefined ? undefined : o[hit];
    };
    cu.map = objs(cu.map).map((m) => {
      const dim = MEYER.find((x) => x.toLowerCase() === s(m.dimension).toLowerCase()) ?? s(m.dimension);
      const pos = isObj(m.positions) ? m.positions : {};
      const positions: Obj = {};
      for (const [i, k] of keys.entries()) {
        // Unknown stays unknown: null, "" or false must not become a position of 0.
        const raw = lookup(pos, i);
        const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
        if (Number.isFinite(n)) {
          positions[k] = Math.min(100, Math.max(0, Math.round(n)));
          if (n < 0 || n > 100) v.warnings.push(`${dim}: position for ${k} clamped to 0–100`);
        }
      }
      return { ...m, dimension: dim, positions };
    });
    cu.dimensions = objs(cu.dimensions).map((x) => {
      const dim = MEYER.find((m) => m.toLowerCase() === s(x.dimension).toLowerCase()) ?? s(x.dimension);
      const gap = GAPS.find((g) => g.toLowerCase() === s(x.gap).toLowerCase()) ?? s(x.gap);
      const raw = isObj(x.views) ? x.views : {};
      const views: Obj = {};
      keys.forEach((k, i) => {
        const val = lookup(raw, i);
        if (val !== undefined) views[k] = val;
      });
      return { ...x, dimension: dim, gap, views };
    });
    if (isObj(cu.leaders)) objs((cu.leaders as Obj).rows).forEach((r, i) => fix(r, `leader row ${i + 1}`));
    if (isObj(cu.dynamics)) objs((cu.dynamics as Obj).items).forEach((r, i) => fix(r, `dynamics item ${i + 1}`));
  }
  if (isObj(d.businessInsights)) objs((d.businessInsights as Obj).cards).forEach((r, i) => fix(r, `insight card ${i + 1}`));
  const nSkills = objs(d.skills).length;
  if (isObj(d.environment)) {
    objs((d.environment as Obj).conditions).forEach((r, i) => {
      fix(r, `condition ${i + 1}`);
      const nums = list(r.skills).map(Number).filter((n) => Number.isInteger(n));
      const valid = nums.filter((n) => n >= 1 && n <= nSkills);
      if (valid.length !== nums.length) v.warnings.push(`condition ${i + 1}: mapped to a capability that doesn't exist (removed)`);
      r.skills = [...new Set(valid)];
    });
  }
  objs(d.skills).forEach((r, i) => fix(r, `capability ${i + 1}`));
}

/** V/I claims whose evidence didn't hold become U, with a question. */
function downgradeUnsupported(d: Obj, v: Validation) {
  const F = new Map((d.findings as (Finding & { droppedAll?: boolean })[]).map((f) => [f.id, f]));
  for (const f of F.values()) {
    if (f.c === "C") {
      v.downgraded.push(`${f.id} ${f.title} (coded Client-confirmed, but no client input exists yet)`);
      f.c = "U";
    }
    if ((f.c === "V" || f.c === "I") && f.sources.length === 0) {
      v.downgraded.push(`${f.id} ${f.title}${f.droppedAll ? " (its sources weren't in the research)" : " (no source)"}`);
      f.c = "U";
      f.ask = f.ask || `Can you confirm: ${f.title}?`;
    }
    delete f.droppedAll;
  }
  const check = (item: Obj, label: string) => {
    if (item.c !== "V" && item.c !== "I") return;
    const ids = list(item.findings).map(String);
    if (!ids.length) {
      v.downgraded.push(`${label} (cites no finding)`);
      item.c = "U";
    } else if (ids.every((id) => F.get(id)?.c === "U")) {
      v.downgraded.push(`${label} (every finding it cites is unconfirmed)`);
      item.c = "U";
    } else if (ids.every((id) => ["U", "H", "P"].includes(F.get(id)?.c ?? "U"))) {
      // Built only on hypotheses or partner input: it is a hypothesis, not a verified fact.
      v.downgraded.push(`${label} (rests only on hypotheses or partner input)`);
      item.c = "H";
    }
  };
  if (isObj(d.organisation)) objs((d.organisation as Obj).decisionRights).forEach((c) => check(c, `Decision right: ${s(c.decision)}`));
  if (isObj(d.culture)) {
    const cu = d.culture as Obj;
    if (isObj(cu.leaders)) objs((cu.leaders as Obj).rows).forEach((c) => check(c, `Leader: ${s(c.person)}`));
    if (isObj(cu.dynamics)) objs((cu.dynamics as Obj).items).forEach((c) => check(c, `Dynamics: ${s(c.tag)}`));
  }
  if (isObj(d.businessInsights)) objs((d.businessInsights as Obj).cards).forEach((c) => check(c, `Insight: ${s(c.title)}`));
  if (isObj(d.environment)) objs((d.environment as Obj).conditions).forEach((c) => check(c, `Condition: ${s(c.title)}`));
  objs(d.skills).forEach((c) => check(c, `Capability: ${s(c.name)}`));
}

const needsAsk = (c: unknown) => OPEN.includes(c as Code);
function fillAsks(d: Obj) {
  const set = (o: Obj, fallback: string) => {
    if (needsAsk(o.c)) o.ask = s(o.ask) || fallback;
    else o.ask = s(o.ask) || null;
  };
  (d.findings as Obj[]).forEach((f) => set(f, `Can you confirm: ${s(f.title)}?`));
  const org = isObj(d.organisation) ? d.organisation : null;
  if (org) objs(org.decisionRights).forEach((r) => set(r, `Who actually decides this, and who must sign off: ${s(r.decision)}?`));
  const cu = isObj(d.culture) ? d.culture : null;
  if (cu && isObj(cu.leaders)) objs((cu.leaders as Obj).rows).forEach((r) => set(r, `Can you confirm ${s(r.person)} as ${s(r.role)}, and where their career was built?`));
  if (cu && isObj(cu.dynamics)) objs((cu.dynamics as Obj).items).forEach((r) => set(r, `How true is this here: ${s(r.tag)}?`));
  if (isObj(d.businessInsights)) objs((d.businessInsights as Obj).cards).forEach((r) => set(r, `Can you confirm: ${s(r.title)}?`));
  if (isObj(d.environment)) objs((d.environment as Obj).conditions).forEach((r) => set(r, `How true is this here: ${s(r.title)}?`));
  objs(d.skills).forEach((r) => set(r, `Does this capability matter as much as we think: ${s(r.name)}?`));
}

/* -------------------------------------------------------------------------
 * Tab 3: open questions
 * ---------------------------------------------------------------------- */

export function openQuestions(d: CockpitData): OpenGroup[] {
  const seen = new Set<string>(list(d.questions).filter(isObj).map((q) => s(q.question).toLowerCase()));
  const groups: OpenGroup[] = [];
  const add = (section: string, items: OpenQuestion[]) => {
    const kept = items.filter((x) => {
      const k = x.question.toLowerCase();
      if (!x.question || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (kept.length) groups.push({ section, items: kept });
  };
  const open = (o: Obj) => needsAsk(o.c);
  const q = (o: Obj, context: string): OpenQuestion => ({ question: s(o.ask), context: context || null, c: normCode(o.c) });

  const org = isObj(d.organisation) ? d.organisation : {};
  add("Organisation & decision rights", objs(org.decisionRights).filter(open).map((r) => q(r, `${s(r.decision)}: ${s(r.locus)}`)));
  const cu = isObj(d.culture) ? d.culture : {};
  add("Leadership", objs(isObj(cu.leaders) ? (cu.leaders as Obj).rows : []).filter(open).map((r) => q(r, `${s(r.role)}: ${s(r.person)}`)));
  add("Culture dynamics", objs(isObj(cu.dynamics) ? (cu.dynamics as Obj).items : []).filter(open).map((r) => q(r, s(r.tag))));
  const bi = isObj(d.businessInsights) ? d.businessInsights : {};
  add("Business & competition", objs(bi.cards).filter(open).map((r) => q(r, s(r.title))));
  const env = isObj(d.environment) ? d.environment : {};
  add("Executive success environment", objs(env.conditions).filter(open).map((r) => q(r, s(r.title))));
  add("Contextual Skills", objs(d.skills).filter(open).map((r) => q(r, s(r.name))));
  add("Evidence we could not confirm", list(d.findings).filter(isObj).filter(open).map((f) => q(f, `${s(f.id)} · ${s(f.title)}`)));
  const cf = isObj(d.confidence) ? d.confidence : {};
  add("Critical unknowns", list(cf.unknowns).map((x) => ({ question: s(x), context: null, c: "U" as Code })));
  add("Hypotheses to test", list(cf.hypotheses).map((x) => ({ question: s(x), context: null, c: "H" as Code })));
  add("Contradictions to resolve", list(cf.contradictions).map((x) => ({ question: s(x), context: null, c: "U" as Code })));
  return groups;
}

/* -------------------------------------------------------------------------
 * Susan's validator (§13.3). Errors block saving; warnings are kept.
 * ---------------------------------------------------------------------- */

const REQUIRED: (keyof CockpitData)[] = [
  "schemaVersion",
  "meta",
  "snapshot",
  "business",
  "organisation",
  "culture",
  "transformation",
  "metrics",
  "businessInsights",
  "environment",
  "confidence",
  "questions",
  "skills",
  "findings",
  "sources",
];
/** Top-level fields that are lists; every other required field is an object. */
export const ARRAY_FIELDS: (keyof CockpitData)[] = ["questions", "skills", "findings", "sources"];
const empty = (x: unknown) => x == null || x === "" || (Array.isArray(x) && x.length === 0) || (isObj(x) && Object.keys(x).length === 0);

export function validateCockpit(d: CockpitData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(d)) return { errors: ["The report is not an object"], warnings };
  for (const k of REQUIRED) if (empty((d as unknown as Obj)[k])) errors.push(`Missing or empty: ${k}`);
  for (const k of REQUIRED) {
    const x = (d as unknown as Obj)[k];
    if (empty(x) || k === "schemaVersion") continue;
    const wantArray = ARRAY_FIELDS.includes(k);
    if (wantArray ? !Array.isArray(x) : !isObj(x)) errors.push(`${k} came back as ${Array.isArray(x) ? "a list" : typeof x}, not ${wantArray ? "a list" : "an object"}`);
  }

  const codeOk = (c: unknown, where: string) => {
    if (c !== undefined && !(CODES as readonly string[]).includes(c as string)) errors.push(`${where}: evidence code "${String(c)}" is not one of V, I, H, U, P, C`);
  };
  const walk = (x: unknown, path: string) => {
    if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${path}[${i}]`));
    else if (isObj(x)) for (const [k, y] of Object.entries(x)) (k === "c" ? codeOk(y, path) : walk(y, `${path}.${k}`));
  };
  for (const k of REQUIRED) if (k !== "findings") walk((d as unknown as Obj)[k], k);
  list(d.findings).filter(isObj).forEach((f) => codeOk(f.c, `finding ${s(f.id)}`));

  const cu = isObj(d.culture) ? d.culture : {};
  const keys = objs(cu.cultures).map((k) => s(k.key));
  if (keys.length < 2 || keys.length > 4) errors.push(`Cultures: ${keys.length} mapped; must be 2–4`);
  const covers = (rows: Obj[]) => {
    const dims = rows.map((r) => s(r.dimension));
    return dims.length === MEYER.length && MEYER.every((m) => dims.includes(m));
  };
  if (!covers(objs(cu.map))) errors.push("Culture map must cover exactly Meyer's eight scales");
  if (!covers(objs(cu.dimensions))) errors.push("Culture cards must cover exactly Meyer's eight scales");
  for (const m of objs(cu.map)) {
    const pos = isObj(m.positions) ? m.positions : {};
    for (const k of keys) {
      const n = pos[k];
      if (typeof n !== "number" || n < 0 || n > 100) errors.push(`Culture map ${s(m.dimension)}: position for "${k}" missing or outside 0–100`);
    }
  }
  for (const x of objs(cu.dimensions)) {
    if (!(GAPS as readonly string[]).includes(s(x.gap))) errors.push(`Culture card ${s(x.dimension)}: gap "${s(x.gap)}" must be Large, Moderate or Small`);
    const views = isObj(x.views) ? x.views : {};
    for (const k of keys) if (!s(views[k])) errors.push(`Culture card ${s(x.dimension)}: view missing for "${k}"`);
  }

  const nSkills = list(d.skills).length;
  const env = isObj(d.environment) ? d.environment : {};
  const conditions = objs(env.conditions);
  conditions.forEach((c, i) =>
    list(c.skills).forEach((n) => {
      if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > nSkills) errors.push(`Condition ${i + 1} maps to capability ${String(n)}, which doesn't exist`);
    })
  );

  const fids = new Set(list(d.findings).filter(isObj).map((f) => s(f.id)));
  const sids = new Set(list(d.sources).filter(isObj).map((x) => s(x.id)));
  const cards: [string, Obj][] = [
    ...objs(isObj(d.businessInsights) ? (d.businessInsights as Obj).cards : []).map((c) => [`Insight "${s(c.title)}"`, c] as [string, Obj]),
    ...conditions.map((c) => [`Condition "${s(c.title)}"`, c] as [string, Obj]),
    ...objs(d.skills).map((c) => [`Capability "${s(c.name)}"`, c] as [string, Obj]),
  ];
  for (const [label, c] of cards) {
    for (const f of list(c.findings)) if (!fids.has(s(f))) errors.push(`${label} cites unknown finding ${s(f)}`);
    if (!list(c.findings).length) warnings.push(`${label} cites no findings`);
  }
  for (const f of list(d.findings).filter(isObj)) for (const x of list(f.sources)) if (!sids.has(s(x))) errors.push(`Finding ${s(f.id)} cites unknown source ${s(x)}`);
  for (const x of list(d.sources).filter(isObj)) if (s(x.url) && !normUrl(s(x.url))) errors.push(`Source ${s(x.id)} has no valid web address`);

  const range = (label: string, n: number, lo: number, hi: number) => {
    if (n < lo || n > hi) warnings.push(`${label}: ${n} (expected ${lo}–${hi})`);
  };
  range("KPIs", list(isObj(d.snapshot) ? (d.snapshot as Obj).kpis : []).length, 4, 8);
  range("Capabilities", nSkills, 5, 6);
  objs(d.skills).forEach((sk, i) => range(`Capability ${i + 1} markers`, list(sk.markers).length, 3, 4));
  range("Conditions", conditions.length, 5, 7);
  range("Priority questions", list(d.questions).length, 8, 12);
  const mapped = new Set(conditions.flatMap((c) => list(c.skills)));
  for (let i = 1; i <= nSkills; i++) if (!mapped.has(i)) warnings.push(`Capability ${i} is not mapped from any condition`);
  const order = objs(cu.dimensions).map((x) => GAPS.indexOf(s(x.gap) as (typeof GAPS)[number]));
  if (order.some((g, i) => i > 0 && g < order[i - 1])) warnings.push("Culture cards are not ordered by gap size");
  return { errors, warnings };
}

/**
 * Susan's rules that one writer's part can break on its own, checked when the
 * part is saved: a failure fails just that writer, and a retry re-runs only it.
 */
export function validatePart(w: Exec10xWriterId, part: unknown): string[] {
  const d = decodePart(part);
  const errors: string[] = [];
  for (const f of EXEC10X_WRITERS[w].fields) {
    const x = d[f];
    if (empty(x)) errors.push(`${f} is missing or empty`);
    else if (ARRAY_FIELDS.includes(f) ? !Array.isArray(x) : !isObj(x)) errors.push(`${f} came back malformed`);
  }
  if (errors.length || w !== "culture") return errors;
  // Normalise exactly as assembly will, then apply the culture rules.
  const probe: Obj = { culture: d.culture };
  repair(probe, { errors: [], warnings: [], droppedSources: [], downgraded: [] });
  const { errors: all } = validateCockpit(probe as unknown as CockpitData);
  return all.filter((e) => /^Culture/.test(e));
}

/* -------------------------------------------------------------------------
 * Markdown download
 * ---------------------------------------------------------------------- */

export function cockpitToMarkdown(d: CockpitData, opts: { company: string; builtOn: string }): string {
  const L: string[] = [];
  const t = (x: unknown) => s(x);
  /** Table cell: a pipe or line break would split or end the table. */
  const cell = (x: unknown) => s(x).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const code = (c: unknown) => `[${CODE_LABEL[normCode(c)]}]`;
  const g = (o: unknown, k: string) => (isObj(o) ? o[k] : undefined);
  L.push(`# ${opts.company} — Exec10X Company Intelligence`, "", `_${t(d.meta?.status)} · as of ${t(d.meta?.asOf) || opts.builtOn}_`, "");
  L.push("## 1 · Executive Dashboard", "", `> ${t(g(d.snapshot, "thesis"))}`, "");
  for (const k of objs(g(d.snapshot, "kpis"))) L.push(`- **${t(k.value)}** — ${t(k.label)}`);
  L.push("", `### ${t(g(d.business, "title"))}`);
  for (const r of objs(g(d.business, "rows"))) L.push(`- **${t(r.label)}:** ${t(r.text)}`);
  L.push("", `### ${t(g(d.organisation, "title"))}`, t(g(d.organisation, "note")), "", "| Decision | Likely locus | Basis |", "|---|---|---|");
  for (const r of objs(g(d.organisation, "decisionRights"))) L.push(`| ${cell(r.decision)} | ${cell(r.locus)} | ${code(r.c)} |`);
  const cu = d.culture ?? {};
  const cultures = objs(g(cu, "cultures"));
  L.push("", `### ${t(g(cu, "mapTitle"))}`, `_${t(g(cu, "mapNote"))}_`, "");
  L.push(`| Scale | ${cultures.map((k) => t(k.code)).join(" | ")} | 0 = | 100 = |`, `|---|${cultures.map(() => "---").join("|")}|---|---|`);
  for (const m of objs(g(cu, "map"))) {
    const pos = isObj(m.positions) ? m.positions : {};
    L.push(`| ${cell(m.dimension)} | ${cultures.map((k) => cell(pos[s(k.key)] ?? "—")).join(" | ")} | ${cell(m.left)} | ${cell(m.right)} |`);
  }
  const leaders = g(cu, "leaders");
  L.push("", `### ${t(g(leaders, "title")) || "Who sets the tone"}`, t(g(leaders, "note")), "", "| Role | Person | Career built in | Basis |", "|---|---|---|---|");
  for (const r of objs(g(leaders, "rows"))) L.push(`| ${cell(r.role)} | ${cell(r.person)} | ${cell(r.career)} | ${code(r.c)} |`);
  L.push("", `### ${t(g(cu, "dimensionsTitle")) || "Culture gaps in practice"}`);
  for (const x of objs(g(cu, "dimensions"))) L.push("", `**${t(x.dimension)}** (${t(x.gap)} gap) — ${t(x.tension)}`, `${t(x.scene)} _What helps:_ ${t(x.helps)}`);
  L.push("", `### ${t(g(d.transformation, "title"))}`);
  for (const x of objs(g(d.transformation, "timeline"))) L.push(`- **${t(x.time)}** ${t(x.text)}`);
  L.push("", `### ${t(g(d.businessInsights, "title"))}`);
  for (const c of objs(g(d.businessInsights, "cards"))) L.push(`- **${t(c.title)}** ${code(c.c)} ${t(c.text)}`);
  L.push("", "| Player | Model | Edge | Recent move | Threat |", "|---|---|---|---|---|");
  for (const c of objs(g(d.businessInsights, "competitors"))) L.push(`| ${cell(c.player)} | ${cell(c.model)} | ${cell(c.edge)} | ${cell(c.move)} | ${cell(c.threat)} |`);
  L.push("", "### Executive success environment", t(g(d.environment, "opportunity")));
  objs(g(d.environment, "conditions")).forEach((c, i) =>
    L.push("", `**${i + 1}. ${t(c.title)}** ${code(c.c)} → capability ${list(c.skills).join(", ")}`, `- What we know: ${t(c.facts)}`, `- Day to day: ${t(c.dayToDay)}`, `- Helps: ${t(c.helps)} · Derails: ${t(c.derails)}`)
  );
  L.push("", "## 2 · Contextual Skills");
  objs(d.skills).forEach((sk, i) => {
    L.push("", `### ${i + 1}. ${t(sk.name)} ${code(sk.c)}`, t(sk.definition), "", `_Why here:_ ${t(sk.whyHere)}`, "");
    for (const m of objs(sk.markers)) L.push(`- **${t(m.title)}** ${t(m.text)}`);
    L.push("", `Evidence to look for: ${list(sk.evidence).map(t).join("; ")}`, `Red flags: ${list(sk.redFlags).map(t).join("; ")}`, `**Interview question:** ${t(sk.question)}`, `_Probe:_ ${t(sk.probe)}`);
  });
  L.push("", "## 3 · Questions to ask", "", "### Priority");
  list(d.questions).filter(isObj).forEach((q, i) => L.push(`${i + 1}. ${t(q.question)} — _${t(q.why)}_`));
  for (const grp of d.openQuestions ?? []) {
    L.push("", `### ${grp.section}`);
    for (const x of grp.items) L.push(`- ${x.question}${x.context ? ` _(${x.context})_` : ""}`);
  }
  L.push("", "## Sources", "");
  for (const x of d.sources ?? [])
    L.push(x.url ? `- ${x.id} [${s(x.title).replace(/[[\]]/g, "\\$&")}](<${x.url.replace(/>/g, "%3E")}>)` : `- ${x.id} ${x.title} (uploaded document)`);
  return L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
