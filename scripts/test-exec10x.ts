/**
 * Company Intel v3 (Exec10X cockpit) — offline code QA. Free: no model calls,
 * no database. Run: npm run test:exec10x
 *
 * 1. Susan's validator accepts her own SeLoger cockpit and our test output.
 * 2. Merging writer parts: renumbering, dedupe, references, traceability.
 * 3. Fault injection: broken parts are repaired or rejected, never a crash.
 * 4. Tab 3: every U/H/P item carries a question.
 * 5. Refresh rule: only missing + ticked areas run.
 * 6. Rendering in headless Chrome (when installed): all tabs fill, a broken
 *    section shows the guard banner, hostile strings stay inert.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  EXEC10X_WRITERS,
  isExec10xWriter,
  makeSourceCheck,
  makeUrlCheck,
  registerFingerprint,
  validationSummary,
  validatePart,
  cockpitToMarkdown,
  mergeAll,
  mergeParts,
  mergeRegister,
  researchPlan,
  validateCockpit,
  type CockpitData,
  type Exec10xWriterId,
  type Part,
} from "../src/shared/exec10x";
import { renderCockpitHtml } from "../src/orchestrator/exec10x-render";

const EX = "products/interview-intelligence/examples/company-intel";
const susan = JSON.parse(fs.readFileSync(`${EX}/seloger-susan.json`, "utf-8"));
const ours = JSON.parse(fs.readFileSync(`${EX}/seloger-v3-test.json`, "utf-8"));

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** A corpus in which every source of `d` is traceable (stands in for the saved research). */
const corpusOf = (...ds: { sources?: { url: string; title: string }[] }[]) =>
  ds.flatMap((d) => (d.sources ?? []).map((s) => `${s.title} ${s.url}`)).join("\n");

/**
 * Splits a full cockpit into the four writer parts the way the writers return them:
 * the market writer owns the findings its cards cite (numbered locally), the
 * company writer owns the rest, and the skills part cites the merged register
 * numbering it would have been shown (company findings first, then market).
 */
function split(d: CockpitData): Part[] {
  const fields = (w: Exec10xWriterId) => Object.fromEntries(EXEC10X_WRITERS[w].fields.map((f) => [f, clone((d as unknown as Record<string, unknown>)[f])]));
  const cards = (d.businessInsights.cards as { findings: string[] }[]) ?? [];
  const marketIds = new Set(cards.flatMap((c) => c.findings));
  const companyF = d.findings.filter((f) => !marketIds.has(f.id));
  const marketF = d.findings.filter((f) => marketIds.has(f.id));
  const registerId = new Map<string, string>();
  [...companyF, ...marketF].forEach((f, i) => registerId.set(f.id, `F${i + 1}`));
  const market = fields("market") as { businessInsights: { cards: { findings: string[] }[] } };
  const skills = fields("skills") as { environment: { conditions: { findings: string[] }[] }; skills: { findings: string[] }[] };
  const toRegister = (ids: string[]) => ids.map((id) => registerId.get(id) ?? id);
  skills.environment.conditions.forEach((c) => (c.findings = toRegister(c.findings)));
  skills.skills.forEach((x) => (x.findings = toRegister(x.findings)));
  return [
    { writer: "company", data: { ...fields("company"), findings: clone(companyF), sources: clone(d.sources) } },
    { writer: "market", data: { ...market, findings: clone(marketF), sources: clone(d.sources) } },
    { writer: "culture", data: { ...fields("culture"), findings: [], sources: [] } },
    { writer: "skills", data: { ...skills, findings: [], sources: [] } },
  ];
}

/* 1 ------------------------------------------------------------------ */
section("1 · Susan's validator on known-good cockpits");
{
  const a = validateCockpit(susan);
  check("Susan's seloger.json: 0 errors", a.errors.length === 0, a.errors);
  const b = validateCockpit(ours);
  check("Our SeLoger test output: 0 errors", b.errors.length === 0, b.errors);
}

/* 2 ------------------------------------------------------------------ */
section("2 · Merging writer parts");
const corpus = corpusOf(ours);
const merged = mergeParts(split(ours), corpus);
{
  check("merged: 0 validator errors", merged.validation.errors.length === 0, merged.validation.errors);
  check("merged: version 3", merged.version === 3);
  check("merged: findings kept", merged.findings.length === ours.findings.length, `${merged.findings.length} vs ${ours.findings.length}`);
  const ids = merged.findings.map((f) => f.id);
  check("findings numbered F1…Fn", ids.every((id, i) => id === `F${i + 1}`), ids);
  const sids = new Set(merged.sources.map((s) => s.id));
  check("every finding source resolves", merged.findings.every((f) => f.sources.every((s) => sids.has(s))));
  const fids = new Set(ids);
  const cited = [
    ...(merged.businessInsights.cards as { findings: string[] }[]),
    ...((merged.environment.conditions as { findings: string[] }[]) ?? []),
    ...(merged.skills as { findings: string[] }[]),
  ].flatMap((c) => c.findings);
  check("every card reference resolves", cited.length > 0 && cited.every((f) => fids.has(f)), cited.filter((f) => !fids.has(f)));
  check("no source dropped when all are traceable", merged.validation.droppedSources.length === 0, merged.validation.droppedSources);
  const reg = mergeRegister(split(ours), corpus);
  check("register shown to the skills writer = merged register", JSON.stringify(reg.findings.map((f) => f.title)) === JSON.stringify(merged.findings.map((f) => f.title)));
  const again = mergeParts(split(ours), corpus);
  check("merging is deterministic", JSON.stringify(again) === JSON.stringify(merged));
  const parts = split(ours);
  const before = JSON.stringify(parts);
  mergeParts(parts, corpus);
  check("merging never mutates the stored parts", JSON.stringify(parts) === before);
}

/* 3 ------------------------------------------------------------------ */
section("3 · Fault injection");
{
  // a) A source whose URL isn't in the research → dropped; its finding becomes U with a question.
  const p = split(ours);
  const company = p[0].data as CockpitData;
  company.sources.push({ id: "S999", title: "Made-up blog, 2026", url: "https://not-in-the-research.example.com/post" });
  company.findings.push({ id: "F999", title: "A claim only a made-up blog supports", c: "V", sources: ["S999"] });
  const m = mergeParts(p, corpus);
  const f = m.findings.find((x) => x.title.startsWith("A claim only"));
  check("untraceable source dropped", m.validation.droppedSources.some((s) => s.includes("not-in-the-research")), m.validation.droppedSources);
  check("its finding downgraded to U", f?.c === "U", f);
  check("…and carries a question", Boolean(f?.ask));
  check("…and appears in Tab 3", m.openQuestions.some((g) => g.items.some((i) => i.question === f?.ask)));
  check("still saves (0 errors)", m.validation.errors.length === 0, m.validation.errors);
}
{
  // b) The same URL in two parts collapses to one source.
  const p = split(ours);
  const first = (p[0].data as CockpitData).sources[0];
  const u = new URL(first.url);
  u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
  // Same page, written differently: www toggled, trailing slash added.
  (p[1].data as CockpitData).sources = [{ id: "S1", title: "dup", url: u.toString().replace(/\/?$/, "/") }];
  (p[1].data as CockpitData).findings = [{ id: "F1", title: "Market fact on the same page", c: "V", sources: ["S1"] }];
  const m = mergeParts(p, corpus);
  const urls = m.sources.map((s) => s.url);
  check("duplicate URL collapsed", new Set(urls).size === urls.length);
  const mf = m.findings.find((x) => x.title === "Market fact on the same page");
  check("…and the finding points at the original source", mf?.sources.length === 1 && m.sources.find((s) => s.id === mf!.sources[0])?.url === first.url, mf);
}
{
  // c) A bad evidence code is repaired to U, warned, and asked about.
  const p = split(ours);
  const org = (p[0].data as CockpitData).organisation as { decisionRights: { c: string; ask?: string | null }[] };
  org.decisionRights[0].c = "X";
  org.decisionRights[0].ask = null;
  const m = mergeParts(p, corpus);
  const dr = (m.organisation as typeof org).decisionRights[0];
  check("bad code → U", dr.c === "U");
  check("…warned", m.validation.warnings.some((w) => w.includes('"X"')));
  check("…fallback question added", Boolean(dr.ask));
  check("…in Tab 3", m.openQuestions.some((g) => g.section.startsWith("Organisation") && g.items.some((i) => i.question === dr.ask)));
}
{
  // d) Culture with three Meyer scales → blocked (Susan's rule), no crash.
  const p = split(ours);
  const cu = (p[2].data as CockpitData).culture as { map: unknown[]; dimensions: unknown[] };
  cu.map = cu.map.slice(0, 3);
  const m = mergeParts(p, corpus);
  check("3 Meyer scales → validator error", m.validation.errors.some((e) => e.includes("eight scales")), m.validation.errors);
}
{
  // e) Positions outside 0–100 and lower-case enum values are repaired.
  const p = split(ours);
  const cu = (p[2].data as CockpitData).culture as { map: { positions: Record<string, number>; dimension: string }[]; dimensions: { gap: string }[] };
  const key = Object.keys(cu.map[0].positions)[0];
  cu.map[0].positions[key] = 140;
  cu.map[1].dimension = cu.map[1].dimension.toLowerCase();
  cu.dimensions[0].gap = cu.dimensions[0].gap.toLowerCase();
  const m = mergeParts(p, corpus);
  check("position clamped, case repaired → 0 errors", m.validation.errors.length === 0, m.validation.errors);
}
{
  // f) A condition mapped to a capability that doesn't exist; a dangling finding reference.
  const p = split(ours);
  const sk = p[3].data as CockpitData;
  (sk.environment.conditions as { skills: number[] }[])[0].skills = [9];
  (sk.skills[0] as { findings: string[] }).findings = ["F404"];
  const m = mergeParts(p, corpus);
  check("bad capability number removed (no error)", m.validation.errors.length === 0, m.validation.errors);
  check("…warned", m.validation.warnings.some((w) => w.includes("doesn't exist")));
  check("dangling finding reference dropped", !(m.skills[0] as { findings: string[] }).findings.includes("F404"));
}
{
  // g) A part delivered as a JSON-encoded string (seen in v2) is decoded.
  const p = split(ours);
  const d = p[1].data as Record<string, unknown>;
  d.businessInsights = JSON.stringify(d.businessInsights);
  const m = mergeParts(p, corpus);
  check("JSON-string part decoded → 0 errors", m.validation.errors.length === 0, m.validation.errors);
}
{
  // h) A whole writer missing, or garbage → errors (save blocked), never a throw.
  let threw = false;
  let m: CockpitData | null = null;
  try {
    m = mergeParts(split(ours).filter((x) => x.writer !== "culture"), corpus);
  } catch {
    threw = true;
  }
  check("missing culture writer: no throw", !threw);
  check("…and saving is blocked", Boolean(m?.validation.errors.some((e) => e.includes("culture"))), m?.validation.errors);
  threw = false;
  try {
    m = mergeParts([{ writer: "company", data: null }, { writer: "market", data: "nonsense" }, { writer: "culture", data: 42 }, { writer: "skills", data: [] }], "");
  } catch (e) {
    threw = true;
    console.log(e);
  }
  check("garbage parts: no throw", !threw);
  check("…and saving is blocked", Boolean(m && m.validation.errors.length > 0));
}
{
  // i) A V finding with no sources at all → U with a question.
  const p = split(ours);
  (p[0].data as CockpitData).findings.push({ id: "F777", title: "An unsourced 'verified' fact", c: "V", sources: [] });
  const m = mergeParts(p, corpus);
  const f = m.findings.find((x) => x.title.startsWith("An unsourced"));
  check("unsourced V → U with a question", f?.c === "U" && Boolean(f.ask), f);
}
{
  // j) A source with a javascript: URL never reaches the page.
  const p = split(ours);
  (p[0].data as CockpitData).sources.push({ id: "S666", title: "evil", url: "javascript:alert(1)" });
  (p[0].data as CockpitData).findings.push({ id: "F666", title: "Evil-sourced claim", c: "V", sources: ["S666"] });
  const m = mergeParts(p, corpus + "\njavascript:alert(1) evil");
  check("javascript: URL dropped", m.sources.every((s) => /^https?:\/\//.test(s.url)));
}

{
  // k) Code review 2026-10-10: a made-up deep link on a domain the research mentions is NOT traced.
  const p = split(ours);
  const known = new URL((p[0].data as CockpitData).sources[0].url);
  (p[0].data as CockpitData).sources.push({ id: "S555", title: "Invented page", url: `https://${known.hostname}/press/made-up-2025-restructuring` });
  (p[0].data as CockpitData).findings.push({ id: "F555", title: "Claim on an invented page", c: "V", sources: ["S555"] });
  const m = mergeParts(p, corpus);
  check("invented deep link on a known domain dropped", m.validation.droppedSources.some((x) => x.includes("made-up-2025")), m.validation.droppedSources);
  check("…its finding becomes U", m.findings.find((f) => f.title === "Claim on an invented page")?.c === "U");
}
{
  // l) The skills writer restarts numbering at F1 for NEW findings: they must not be swallowed
  //    by wave-1 F1 or attach the skill to the wrong finding.
  const p = split(ours);
  const sk = p[3].data as CockpitData;
  const src = (p[0].data as CockpitData).sources[0];
  sk.sources = [{ id: "S1", title: src.title, url: src.url }];
  sk.findings = [{ id: "F1", title: "A brand-new skills-only finding", c: "V", sources: ["S1"] }];
  (sk.skills[0] as { findings: string[] }).findings = ["F1"];
  const m = mergeParts(p, corpus);
  const nf = m.findings.find((f) => f.title === "A brand-new skills-only finding");
  check("renumbered new finding kept", Boolean(nf), m.findings.length);
  check("…and the skill cites it, not wave-1 F1", (m.skills[0] as { findings: string[] }).findings.includes(nf?.id ?? "?"), (m.skills[0] as { findings: string[] }).findings);
  check("…with its source resolved", (nf?.sources.length ?? 0) === 1);
  // A genuine re-statement (same ID, same claim) is not duplicated.
  const p2 = split(ours);
  const f1 = (p2[0].data as CockpitData).findings[0];
  (p2[3].data as CockpitData).findings = [{ ...f1 }];
  const m2 = mergeParts(p2, corpus);
  check("re-stated finding not duplicated", m2.findings.length === ours.findings.length, `${m2.findings.length} vs ${ours.findings.length}`);
}
{
  // m) An item with no evidence code becomes U, gets a question, and reaches Tab 3.
  const p = split(ours);
  const skill = (p[3].data as CockpitData).skills[1] as { c?: string; ask?: string | null; name: string };
  delete skill.c;
  skill.ask = null;
  const m = mergeParts(p, corpus);
  const out = m.skills[1] as { c: string; ask: string };
  check("missing code → U", out.c === "U");
  check("…with a question in Tab 3", Boolean(out.ask) && m.openQuestions.some((g) => g.items.some((i) => i.question === out.ask)));
}
{
  // n) Only real writer names are writers (no prototype keys).
  check("'constructor' is not a writer", !isExec10xWriter("constructor") && !isExec10xWriter("__proto__") && isExec10xWriter("skills"));
}

{
  // o) Second review: the drift check survives Postgres jsonb key re-ordering.
  const reg = mergeRegister(split(ours), corpus);
  const reordered = JSON.parse(JSON.stringify({
    sources: reg.sources.map((x) => ({ url: x.url, title: x.title, id: x.id })),
    findings: reg.findings.map((f) => ({ sources: f.sources, c: f.c, ask: f.ask, title: f.title, id: f.id })),
  }));
  check("register fingerprint ignores key order", registerFingerprint(reg) === registerFingerprint(reordered));
  const changed = clone(reordered);
  changed.sources[0].url += "-changed";
  check("…but catches a changed source", registerFingerprint(reg) !== registerFingerprint(changed));
}
{
  // p) A shortened or partial link is not "the page in the research".
  const ok = makeUrlCheck("See https://acme.com/about-us/leadership-team (2026) and [x](https://acme.com/news/2026-03-a).");
  check("exact link traced", ok("https://acme.com/about-us/leadership-team") && ok("https://www.acme.com/about-us/leadership-team/"));
  check("link inside markdown parentheses traced", ok("https://acme.com/news/2026-03-a"));
  check("prefix of a longer link rejected", !ok("https://acme.com/about") && !ok("https://acme.com/about-us/lead") && !ok("https://acme.com/news/2026-03"));
  check("bare domain rejected", !ok("https://acme.com"));
}
{
  // q) A V card citing only findings that don't exist → U with a question; a market card can't borrow another writer's IDs.
  const p = split(ours);
  const mk = p[1].data as CockpitData;
  mk.findings = [{ id: "F1", title: "Market's own fact", c: "V", sources: [] }];
  const cards = mk.businessInsights.cards as { c: string; findings: string[]; title: string }[];
  cards[0].c = "V";
  cards[0].findings = ["F42"];
  cards[1].c = "V";
  cards[1].findings = ["F5"]; // exists only in the company part
  const m = mergeParts(p, corpus);
  const out = m.businessInsights.cards as { c: string; findings: string[]; ask?: string }[];
  check("card citing an unknown finding → U", out[0].c === "U" && out[0].findings.length === 0 && Boolean(out[0].ask));
  check("…warned", m.validation.warnings.some((w) => w.includes("F42")));
  check("market card can't cite the company writer's F5", !out[1].findings.length && out[1].c === "U");
}
{
  // r) Unknown culture positions stay unknown (no invented 0) and block the save, per Susan's rule.
  const p = split(ours);
  const cu = (p[2].data as CockpitData).culture as { map: { positions: Record<string, unknown> }[] };
  const key = Object.keys(cu.map[0].positions)[0];
  cu.map[0].positions[key] = null;
  const m = mergeParts(p, corpus);
  const pos = (m.culture.map as { positions: Record<string, unknown> }[])[0].positions[key];
  check("null position not turned into 0", pos === undefined, pos);
  check("…and the validator blocks the save", m.validation.errors.some((e) => e.includes("position")));
}
{
  // s) Markdown tables survive pipes and line breaks in model text.
  const d = clone(merged);
  (d.organisation.decisionRights as { locus: string }[])[0].locus = "Board | CEO\nthen group";
  const md = cockpitToMarkdown(d, { company: "SeLoger", builtOn: "2026-10-10" });
  const row = md.split("\n").find((l) => l.includes("Board"));
  check("markdown cell escaped", Boolean(row) && row!.includes("Board \\| CEO then group"), row);
}

{
  // t) Third review: a hypothesis in culture dynamics reaches Tab 3.
  const p = split(ours);
  const dyn = ((p[2].data as CockpitData).culture as { dynamics: { items: { c: string; tag: string; ask?: string | null }[] } }).dynamics;
  dyn.items[0].c = "H";
  dyn.items[0].ask = null;
  const m = mergeParts(p, corpus);
  check("dynamics hypothesis → question in Tab 3", m.openQuestions.some((g) => g.section === "Culture dynamics" && g.items.length > 0));
}
{
  // u) A re-worded re-statement of a shown finding is a reference, not a duplicate.
  const p = split(ours);
  const f0 = (p[0].data as CockpitData).findings[0];
  const words = f0.title.split(" ");
  (p[3].data as CockpitData).findings = [{ id: f0.id, title: `${words.slice(0, Math.max(3, Math.ceil(words.length * 0.6))).join(" ")} (restated)`, c: f0.c, sources: [] }];
  const m = mergeParts(p, corpus);
  check("re-worded re-statement not duplicated", m.findings.length === ours.findings.length, `${m.findings.length} vs ${ours.findings.length}`);
}
{
  // v) The results page says what the checks removed.
  check("summary is null when nothing was removed", validationSummary({ errors: [], warnings: [], droppedSources: [], downgraded: [] }) === null);
  check("summary counts removals", /1 source removed.*1 claim downgraded/.test(validationSummary({ errors: [], warnings: [], droppedSources: ["x"], downgraded: ["y"] }) ?? ""));
}

{
  // w) Fourth review: a fact from an uploaded document is kept (no web address needed).
  const p = split(ours);
  (p[0].data as CockpitData).sources.push({ id: "S800", title: "acme-board-deck-2026.pdf (uploaded)", url: "" });
  (p[0].data as CockpitData).findings.push({ id: "F800", title: "Board approved the 2027 plan", c: "V", sources: ["S800"] });
  const m = mergeParts(p, makeSourceCheck(corpus, ["acme-board-deck-2026.pdf", "company-website-2026-10-09.md"]));
  const f = m.findings.find((x) => x.title === "Board approved the 2027 plan");
  check("uploaded-document source kept", f?.c === "V" && f.sources.length === 1, f);
  check("…with no link", m.sources.find((x) => x.id === f?.sources[0])?.url === "");
  check("…and the report still validates", m.validation.errors.length === 0, m.validation.errors);
  const m2 = mergeParts(p, makeSourceCheck(corpus, []));
  check("a document we don't have is dropped", m2.findings.find((x) => x.title === "Board approved the 2027 plan")?.c === "U");
}
{
  // x) A V card built only on hypotheses is a hypothesis.
  const p = split(ours);
  const mk = p[1].data as CockpitData;
  mk.findings = [{ id: "F1", title: "Hypothesis A", c: "H", sources: [] }, { id: "F2", title: "Partner says B", c: "P", sources: [] }];
  const card = (mk.businessInsights.cards as { c: string; findings: string[]; ask?: string | null }[])[0];
  card.c = "V";
  card.findings = ["F1", "F2"];
  card.ask = null;
  const m = mergeParts(p, corpus);
  const out = (m.businessInsights.cards as { c: string; ask?: string }[])[0];
  check("V card on H/P findings → H with a question", out.c === "H" && Boolean(out.ask), out.c);
}
{
  // y) Markdown source links survive brackets, parentheses and documents.
  const d = clone(merged);
  d.sources = [
    { id: "S1", title: "Les Echos: [Exclusive] cuts", url: "https://en.wikipedia.org/wiki/SeLoger_(company)" },
    { id: "S2", title: "board-deck.pdf", url: "" },
  ];
  const md = cockpitToMarkdown(d, { company: "SeLoger", builtOn: "2026-10-10" });
  check("md link escaped", md.includes("[Les Echos: \\[Exclusive\\] cuts](<https://en.wikipedia.org/wiki/SeLoger_(company)>)"), md.split("\n").find((l) => l.includes("S1 ")));
  check("md document source", md.includes("- S2 board-deck.pdf (uploaded document)"));
}

{
  // z) Fifth review.
  const p = split(ours);
  const cu = (p[2].data as CockpitData).culture as { leaders: { rows: { c: string; findings?: string[]; person: string; ask?: string | null }[] } };
  (p[2].data as CockpitData).findings = [{ id: "F1", title: "Capron is CEO since Sep 2024", c: "V", sources: [] }];
  (p[2].data as CockpitData).sources = [];
  const src = (p[0].data as CockpitData).sources[0];
  (p[2].data as CockpitData).sources.push({ id: "S1", title: src.title, url: src.url });
  (p[2].data as CockpitData).findings[0].sources = ["S1"];
  cu.leaders.rows[0].c = "V";
  cu.leaders.rows[0].findings = ["F1"];
  cu.leaders.rows[1].c = "V";
  cu.leaders.rows[1].findings = [];
  cu.leaders.rows[1].ask = null;
  const card = ((p[1].data as CockpitData).businessInsights.cards as { c: string }[])[0];
  card.c = "C";
  const m = mergeParts(p, corpus);
  const rows = (m.culture.leaders as { rows: { c: string; ask?: string; findings: string[] }[] }).rows;
  check("leader with a traced finding stays V", rows[0].c === "V" && rows[0].findings.length === 1, rows[0]);
  check("leader with no finding → U, asked in Tab 3", rows[1].c === "U" && m.openQuestions.some((g) => g.section === "Leadership" && g.items.some((i) => i.question === rows[1].ask)));
  check("Client-confirmed without client input → U", (m.businessInsights.cards as { c: string }[])[0].c === "U");
}
{
  const ok = makeSourceCheck("", ["report.pdf", "acme-board-deck-2026.pdf"]);
  check("generic stem doesn't vouch for an invented source", ok("", "Annual report 2024 (press coverage)") === null);
  check("exact uploaded filename does", ok("", "acme-board-deck-2026.pdf, p.4") === "document:acme-board-deck-2026.pdf");
}
{
  const bad = clone(merged) as unknown as Record<string, unknown>;
  bad.snapshot = "{not json";
  bad.skills = { name: "x" };
  const { errors } = validateCockpit(bad as unknown as CockpitData);
  check("wrong-shape sections block the save", errors.some((e) => e.startsWith("snapshot came back")) && errors.some((e) => e.startsWith("skills came back")), errors);
}

{
  // Seventh review: positions/views keyed by the culture CODE or another case still count.
  const p = split(ours);
  const cu = (p[2].data as CockpitData).culture as {
    cultures: { key: string; code: string }[];
    map: { positions: Record<string, unknown> }[];
    dimensions: { views: Record<string, unknown> }[];
  };
  const recode = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).map(([k, val]) => [cu.cultures.find((c) => c.key === k)?.code ?? k, val]));
  cu.map.forEach((m) => (m.positions = recode(m.positions)));
  cu.dimensions.forEach((x, i) => (x.views = i % 2 ? recode(x.views) : Object.fromEntries(Object.entries(x.views).map(([k, val]) => [k.toUpperCase(), val]))));
  const m = mergeParts(p, corpus);
  check("positions/views keyed by code or case → 0 errors", m.validation.errors.length === 0, m.validation.errors.slice(0, 3));
  check("good culture part passes its own checks", validatePart("culture", split(ours)[2].data).length === 0, validatePart("culture", split(ours)[2].data));
  const bad = split(ours)[2].data as CockpitData;
  (bad.culture as { cultures: unknown[] }).cultures = (bad.culture as { cultures: unknown[] }).cultures.slice(0, 1);
  check("one-culture part fails at the writer (only that writer re-runs)", validatePart("culture", bad).some((e) => e.includes("Cultures")));
  check("malformed part fails at the writer", validatePart("company", { meta: "x", snapshot: {}, business: [], organisation: {} }).length >= 3);
}

{
  // Eighth review.
  // E) The skills writer sees the codes assembly will apply.
  const p = split(ours);
  (p[0].data as CockpitData).sources.push({ id: "S901", title: "Invented", url: "https://not-in-research.example.org/x" });
  (p[0].data as CockpitData).findings.push({ id: "F901", title: "Rests on an invented page", c: "V", sources: ["S901"] });
  (p[0].data as CockpitData).findings.push({ id: "F902", title: "Claims client confirmation", c: "C", sources: [] });
  const { register } = mergeAll(p, corpus);
  check("register shows a sourceless V as U", register.findings.find((f) => f.title === "Rests on an invented page")?.c === "U");
  check("register shows C as U", register.findings.find((f) => f.title === "Claims client confirmation")?.c === "U");
}
{
  // D) Re-listing a register source with a mangled URL keeps the register's source.
  const p = split(ours);
  const sk = p[3].data as CockpitData;
  // A source with a real path, so the mangling keeps the same site.
  const shown = mergeRegister(p, corpus).sources.find((x) => new URL(x.url).pathname.length > 5)!;
  sk.sources = [{ id: shown.id, title: shown.title, url: shown.url.replace(/\/?$/, "-mangled") }];
  sk.findings = [{ id: "F990", title: "A new skills fact on a shown source", c: "V", sources: [shown.id] }];
  const m = mergeParts(p, corpus);
  const f = m.findings.find((x) => x.title === "A new skills fact on a shown source");
  check("mangled re-listed source falls back to the register's", f?.c === "V" && f.sources.length === 1, f);
}
{
  // F) Missing, padded or duplicate culture keys are normalised, and the template finds them.
  const p = split(ours);
  const cu = (p[2].data as CockpitData).culture as { cultures: { key: string; code: string }[]; map: { positions: Record<string, unknown> }[] };
  const k0 = cu.cultures[0].key;
  cu.cultures[0].key = ` ${k0} `;
  cu.map.forEach((m) => {
    m.positions[` ${k0} `] = m.positions[k0];
    delete m.positions[k0];
  });
  const m = mergeParts(p, corpus);
  const out = m.culture as { cultures: { key: string }[]; map: { positions: Record<string, unknown> }[] };
  check("padded key trimmed and positions kept", out.cultures[0].key === k0.toLowerCase() && out.map.every((x) => typeof x.positions[out.cultures[0].key] === "number") && m.validation.errors.length === 0, m.validation.errors.slice(0, 2));
}

{
  // Ninth review: a NEW invented source reusing a register ID is not re-pointed to the real one.
  const p = split(ours);
  const sk = p[3].data as CockpitData;
  const shown = mergeRegister(p, corpus).sources[1];
  sk.sources = [{ id: shown.id, title: "Totally different invented article", url: "https://invented.example.net/story" }];
  sk.findings = [{ id: "F991", title: "Claim on an invented article", c: "V", sources: [shown.id] }];
  const m = mergeParts(p, corpus);
  const f = m.findings.find((x) => x.title === "Claim on an invented article");
  check("ID-colliding invented source dropped, finding → U", f?.c === "U" && f.sources.length === 0, f);
}

/* 4 ------------------------------------------------------------------ */
section("4 · Tab 3 — every open item carries a question");
{
  const asked = new Set(merged.openQuestions.flatMap((g) => g.items.map((i) => i.question.toLowerCase())));
  merged.questions.forEach((q) => asked.add(q.question.toLowerCase()));
  const openItems: { label: string; c: string; ask?: string | null }[] = [
    ...merged.findings.map((f) => ({ label: f.id, c: f.c, ask: f.ask })),
    ...((merged.organisation.decisionRights as { decision: string; c: string; ask?: string }[]) ?? []).map((r) => ({ label: r.decision, c: r.c, ask: r.ask })),
    ...(((merged.culture.leaders as { rows: { person: string; c: string; ask?: string }[] }).rows) ?? []).map((r) => ({ label: r.person, c: r.c, ask: r.ask })),
    ...(merged.businessInsights.cards as { title: string; c: string; ask?: string }[]).map((r) => ({ label: r.title, c: r.c, ask: r.ask })),
    ...(merged.environment.conditions as { title: string; c: string; ask?: string }[]).map((r) => ({ label: r.title, c: r.c, ask: r.ask })),
    ...(merged.skills as { name: string; c: string; ask?: string }[]).map((r) => ({ label: r.name, c: r.c, ask: r.ask })),
  ].filter((x) => ["U", "H", "P"].includes(x.c));
  check("there are open items to test against", openItems.length > 0, openItems.length);
  const missing = openItems.filter((x) => !x.ask || !asked.has(x.ask.toLowerCase()));
  check("every U/H/P item has an ask that appears in Tab 3", missing.length === 0, missing.map((x) => x.label));
  const unknowns = (merged.confidence.unknowns as string[]) ?? [];
  check("critical unknowns are in Tab 3", unknowns.every((u) => asked.has(u.toLowerCase())));
  const all = merged.openQuestions.flatMap((g) => g.items.map((i) => i.question.toLowerCase()));
  check("no duplicate questions", new Set(all).size === all.length);
}

/* 5 ------------------------------------------------------------------ */
section("5 · Refresh is the user's choice");
{
  const mods = [
    { module: "01", status: "fresh" as const },
    { module: "02", status: "stale" as const },
    { module: "03", status: "missing" as const },
    { module: "04", status: "fresh" as const },
  ];
  const plan = (t: string[]) => researchPlan(mods, new Set(t)).map((m) => m.module).join(",");
  check("nothing ticked → only the missing area", plan([]) === "03", plan([]));
  check("stale is not run unless ticked", !plan([]).includes("02"));
  check("ticked areas run", plan(["01", "02"]) === "01,02,03", plan(["01", "02"]));
}

/* 6 ------------------------------------------------------------------ */
section("6 · Rendering in headless Chrome");
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.log("  (skipped: Chrome not found)");
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exec10x-"));
  const dom = (name: string, data: unknown, after = "") => {
    const file = path.join(dir, `${name}.html`);
    // Fonts are a network fetch; drop them so the test is offline and fast.
    fs.writeFileSync(file, renderCockpitHtml(data, "SeLoger Group").replace(/<link[^>]+fonts[^>]*>/g, "").replace("</body>", `${after}</body>`));
    return execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--virtual-time-budget=3000", "--dump-dom", `file://${file}`], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60000,
    });
  };
  const has = (html: string, id: string, needle: string) => {
    const i = html.indexOf(`id="${id}"`);
    if (i < 0) return false;
    return html.slice(i, i + 4000).includes(needle);
  };
  const bannerShown = (html: string) => /<div class="banner" id="buildError">[^<]+/.test(html);

  const good = dom("good", merged);
  check("good: no error banner", !bannerShown(good), good.match(/id="buildError"[^>]*>[^<]*/)?.[0]);
  check("good: KPIs rendered", has(good, "kpis", 'class="stat"'));
  check("good: culture map rendered", has(good, "cultureMap", 'class="dot'));
  check("good: skills rendered", has(good, "profileList", 'class="skill"'));
  check("good: Tab 3 priority questions", has(good, "qtPriority", "<li>"));
  check("good: Tab 3 open points", has(good, "qtOpen", 'class="mod qgroup"'));
  check("good: three tabs", (good.match(/role="tab"[ >]/g) ?? []).length === 3, (good.match(/role="tab[^"]*"/g) ?? []).join(" "));
  check("good: title is the PDF file name", good.includes("<title>SeLogerGroup_CompanyIntel</title>"));

  // Only the selected tab is visible on screen (layout, not just attributes).
  const probe = (click: string) =>
    `<script>document.getElementById("${click}").click();document.body.dataset.vis=["dashboard","skills","questions-tab"].map(id=>getComputedStyle(document.getElementById(id)).display==="none"?0:1).join("")</script>`;
  const vis = (html: string) => html.match(/data-vis="(\d+)"/)?.[1];
  check("screen: only Tab 1 visible", vis(dom("t1", merged, probe("t-dashboard"))) === "100", vis(dom("t1", merged, probe("t-dashboard"))));
  check("screen: only Tab 2 visible", vis(dom("t2", merged, probe("t-skills"))) === "010");
  check("screen: only Tab 3 visible", vis(dom("t3", merged, probe("t-questions"))) === "001");

  const sus = dom("susan", susan);
  check("Susan's own JSON renders (no Tab 3 data)", !bannerShown(sus) && has(sus, "profileList", 'class="skill"'));

  const broken = clone(merged) as unknown as Record<string, unknown>;
  broken.culture = { cultures: "oops" };
  broken.snapshot = null;
  const b = dom("broken", broken);
  check("broken: banner names the failed sections", bannerShown(b) && /Culture/.test(b) && /Company snapshot/.test(b), b.match(/id="buildError"[^>]*>[^<]*/)?.[0]);
  check("broken: the rest still renders", has(b, "profileList", 'class="skill"') && has(b, "competitors", "<tr>"));

  const empty = dom("empty", {});
  check("empty data: banner, no blank crash", bannerShown(empty));

  const evil = clone(merged) as unknown as { snapshot: { thesis: string }; meta: { company: string } };
  evil.snapshot.thesis = '</script><script>document.title="PWNED"</script><img src=x onerror="document.title=\'PWNED\'">';
  evil.meta.company = "<b>bold</b>";
  const e = dom("evil", evil);
  check("hostile strings stay inert", !e.includes("<title>PWNED") && !/<img src="x"/.test(e));

  const pdf = path.join(dir, "print.pdf");
  try {
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${path.join(dir, "good.html")}`], { stdio: "ignore", timeout: 90000 });
    const pages = (fs.readFileSync(pdf, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    check("print: PDF has all three tabs (≥ 6 pages)", pages >= 6, `${pages} pages`);
    console.log(`  · PDF: ${pages} pages → ${pdf}`);
  } catch (err) {
    check("print to PDF", false, String(err));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
