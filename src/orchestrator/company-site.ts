/**
 * The company's own website as a research input (2026-09-26).
 *
 * Why this exists: Anthropic's web_fetch tool could not open aviv-group.com
 * at all, so every module fell back to aggregators, and an April-2023
 * commercial-register entry was reported as the current Chief People Officer
 * while the official team page (readable with a plain request) listed someone
 * else. Primary sources must not depend on one tool's reach.
 *
 * Before the modules run, the server itself reads the homepage plus the pages
 * that matter most (team / leadership / about / companies / newsroom /
 * careers), found from the homepage's own links and common paths, and returns
 * them as one dated text document. It is stored as an input, so every module
 * reads it at the highest trust level.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";

const KEYWORDS: [RegExp, number][] = [
  [/team|leadership|management|executive|board|governance|who-we-are|people/i, 10],
  [/companies|our-companies|brands|portfolio|subsidiar|our-group|group-companies/i, 8],
  [/about|history|story|mission|values|culture/i, 6],
  [/news|press|media|newsroom|announce/i, 5],
  [/career|jobs|join|work-with-us/i, 4],
  [/investor|ir\b|annual-report/i, 4],
];
const COMMON_PATHS = [
  "/team", "/leadership", "/about", "/about-us", "/management", "/our-team", "/company",
  "/companies", "/brands", "/our-companies", "/newsroom", "/press", "/news", "/careers",
];
const PER_PAGE_CHARS = 9000;
const TOTAL_CHARS = 45000;

export type SitePack = { website: string; pages: { url: string; text: string }[]; markdown: string };

export async function readCompanySite(website: string, today: string): Promise<SitePack | null> {
  let home: URL;
  try {
    home = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return null;
  }
  const homePage = await getHtml(home.toString());
  if (!homePage) return null;
  const root = new URL(homePage.url);
  const rootHost = root.hostname.replace(/^www\./, "");

  // Hop 1: the homepage's own links, scored by what they point at; common
  // paths only as a weak fallback (many sites answer them with a 200 shell).
  const hop1 = new Map<string, number>();
  collectLinks(homePage.html, root, rootHost, hop1);
  for (const p of COMMON_PATHS) {
    const key = root.origin + p;
    if (!hop1.has(key)) hop1.set(key, Math.min(3, scoreFor(p)));
  }
  const first = await fetchAll(top(hop1, 10));

  // Hop 2: leadership / board / team pages are often one click deeper
  // (Amdocs: amdocs.com → investors.amdocs.com → corporate governance).
  const hop2 = new Map<string, number>();
  for (const p of [homePage, ...first]) if (p) collectLinks(p.html, new URL(p.url), rootHost, hop2);
  const already = new Set([homePage, ...first].filter(Boolean).map((p) => norm(p!.url)));
  const people = [...hop2.entries()]
    .filter(([u, sc]) => sc >= 10 && !already.has(norm(u)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([u]) => u);
  const second = await fetchAll(people);

  const seen = new Set<string>();
  const candidates: { url: string; full: string }[] = [];
  for (const p of [homePage, ...first, ...second]) {
    if (!p || seen.has(norm(p.url))) continue;
    seen.add(norm(p.url));
    const full = htmlToText(p.html);
    if (full.length >= 300) candidates.push({ url: p.url, full });
  }
  // Identical text on several URLs = a "not found" / cookie shell served with 200.
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.full, (counts.get(c.full) ?? 0) + 1);
  const pages = candidates
    .filter((c, idx) => idx === 0 || counts.get(c.full) === 1)
    .map((c) => ({ url: c.url, text: c.full.slice(0, PER_PAGE_CHARS) }));
  // Leadership and group pages first (after the homepage), so the total cap never cuts them.
  const rank = (u: string) => {
    const x = new URL(u);
    return scoreFor(`${x.hostname.split(".")[0]} ${x.pathname}`);
  };
  pages.sort((a, b) => (a.url === homePage.url ? -1 : b.url === homePage.url ? 1 : rank(b.url) - rank(a.url)));

  let total = 0;
  const kept = pages.filter((p) => (total += p.text.length) <= TOTAL_CHARS);
  if (!kept.length) return null;

  const markdown =
    `# Company website, read directly on ${today}\n\n` +
    `Source: the company's own website (${root.origin}), fetched by the platform on ${today}. ` +
    `Treat as a primary source dated ${today}. Pages may be truncated.\n\n` +
    kept.map((p) => `## Page: ${p.url}\n\n${p.text}`).join("\n\n---\n\n");
  return { website: root.origin, pages: kept, markdown };
}

function norm(u: string) {
  return u.replace(/[?#].*$/, "").replace(/\/$/, "").replace("://www.", "://");
}

function scoreFor(hay: string) {
  return KEYWORDS.reduce((s, [re, w]) => (re.test(hay) ? Math.max(s, w) : s), 0);
}

function top(m: Map<string, number>, n: number) {
  return [...m.entries()].filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([u]) => u);
}

async function fetchAll(urls: string[]) {
  return Promise.all(urls.map((u) => getHtml(u)));
}

/** Same-site links (subdomains included), scored; individual articles score low. */
function collectLinks(html: string, base: URL, rootHost: string, into: Map<string, number>) {
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, "");
    if (!/^https?:$/.test(u.protocol) || !(host === rootHost || host.endsWith(`.${rootHost}`))) continue;
    if (/\.(pdf|jpe?g|png|svg|zip|mp4)$/i.test(u.pathname)) continue;
    const segs = u.pathname.split("/").filter(Boolean);
    const hay = `${host.split(".")[0]} ${u.pathname} ${stripTags(m[2])}`;
    let score = scoreFor(hay);
    if (!score || (!segs.length && host === rootHost)) continue;
    // A single article/case study/whitepaper is not a section page.
    if (segs.length > 1 && /news|press|blog|insight|article|case-study|whitepaper|story|event|webinar/i.test(segs[0])) score = 1;
    score -= Math.max(0, segs.length - 2) * 1.5;
    const key = u.origin + u.pathname.replace(/\/$/, "");
    into.set(key, Math.max(into.get(key) ?? 0, score));
  }
}

async function getHtml(url: string): Promise<{ url: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en;q=1, *;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    return { url: res.url || url, html: (await res.text()).slice(0, 2_000_000) };
  } catch {
    return null;
  }
}

function stripTags(s: string) {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Readable text: drops scripts/styles/SVG, keeps block structure, dedupes repeated lines (menus, footers). */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<h[1-6]\b[^>]*>/gi, "\n### ")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");
  const seen = new Set<string>();
  return decode(body)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => {
      if (!l || l === "-" || l === "###") return false;
      if (l.length < 60 && seen.has(l)) return false; // repeated nav/menu items
      seen.add(l);
      return true;
    })
    .join("\n");
}
