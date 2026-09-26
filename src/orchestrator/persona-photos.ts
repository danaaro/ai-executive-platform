import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";
import type { PersonaPhoto } from "@/shared/company-report";
import type { RunUsage } from "@/shared/ai-cost";

/** Accumulated by proposePages so the photo step's cost is recorded too. */
export const photoUsage = (): RunUsage => ({ model: DEFAULT_MODEL, inputTokens: 0, outputTokens: 0, webSearches: 0, ms: 0 });

/**
 * Persona photos (2026-09-26) — precision over recall.
 *
 * A wrong face on a persona card is worse than initials, so nothing here
 * trusts a model's judgment about who is in a picture:
 *   1. Sonnet + web_search only PROPOSES pages likely to carry an official
 *      photo (company leadership page, appointment press release, speaker
 *      page, Wikipedia). Never LinkedIn, social media or anything behind a
 *      login (ADR-009 no-logged-in-scraping rule).
 *   2. The server fetches those pages and accepts an image ONLY if its alt /
 *      title text contains the person's full name, or its file name contains
 *      both first and last name.
 *   3. Fallback: Wikidata's image (P18, Wikimedia Commons), accepted only
 *      when the entity's description or employer names the company.
 * Anything else stays as initials. Only the image URL is stored, never bytes.
 */

const BLOCKED_HOSTS =
  /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|threads\.net|rocketreach\.co|zoominfo\.com|apollo\.io|signalhire\.com|contactout\.com)$/i;

type Persona = { name: string; role: string };

export async function findPersonaPhotos(opts: {
  company: string;
  website: string | null;
  personas: Persona[];
  usage?: RunUsage;
  /** Pages of the official website already read in step 1 — checked first (source #1). */
  officialPages?: string[];
}): Promise<Record<string, PersonaPhoto | null>> {
  const result: Record<string, PersonaPhoto | null> = {};
  for (const p of opts.personas) result[p.name] = null;
  if (!opts.personas.length) return result;

  // Pass 1 — the official website (Dana's source order). Free: no model call.
  // aviv-group.com/team carries every leader's photo as a CSS background
  // named "<First Last>.jpeg", which the web-search pass never reached.
  const official = [...new Set(opts.officialPages ?? [])].filter(isAllowedUrl).slice(0, 20);
  const kept = official.map(() => ({ html: "", base: "" }));
  const officialImages = await Promise.all(
    official.map((u, i) => pageImages(u, kept[i]).catch(() => [] as PageImage[]))
  );

  // Names as the official site writes them. A Hebrew site writes "מור כהן",
  // not "Mor Cohen". One small call maps them; a variant is kept only if it
  // literally appears on one of the pages, so it cannot be invented.
  const variants = new Map<string, string[]>(opts.personas.map((p) => [p.name, [p.name]]));
  const nonLatin = kept.some((k) => /[\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF]/.test(k.html));
  if (nonLatin) {
    const onPage = await nativeNames(opts.personas, kept.map((k) => k.html), opts.usage).catch(() => ({}));
    for (const [en, native] of Object.entries(onPage)) {
      if (native && kept.some((k) => k.html.includes(native))) variants.get(en)?.push(native);
    }
  }
  const allNames = [...variants.values()].flat();
  const byName = (img: PageImage, p: Persona) => (variants.get(p.name) ?? [p.name]).some((v) => matchesPerson(img, v));

  // (a) Name rule: the image's label or file name carries the person's name.
  for (const p of opts.personas) {
    for (let i = 0; i < official.length && !result[p.name]; i++) {
      const hit = officialImages[i].find((img) => byName(img, p));
      if (hit) result[p.name] = { url: hit.src, source: official[i], via: "official website" };
    }
  }

  // (b) Team-card rule (photo directly before the name) — only on a page where
  // it is PROVEN: every person already matched by name on that page must have
  // their named photo in that position, and at least one must. On vlu.co.il
  // the photo before "שימי קאופמן" is Mor Cohen's, so the rule stays off there.
  for (let i = 0; i < official.length; i++) {
    const { html, base } = kept[i];
    if (!html) continue;
    const cardFor = (p: Persona) =>
      (variants.get(p.name) ?? [p.name]).map((v) => cardPhotoBefore(html, base, v, allNames)).find(Boolean) ?? null;
    let agree = 0;
    let disagree = 0;
    for (const p of opts.personas) {
      const named = officialImages[i].find((img) => byName(img, p));
      if (!named) continue;
      const card = cardFor(p);
      if (card && sameImage(card, named.src)) agree++;
      else if (card) disagree++;
    }
    if (agree === 0 || disagree > 0) continue;
    for (const p of opts.personas) {
      if (result[p.name]) continue;
      const card = cardFor(p);
      if (card) result[p.name] = { url: card, source: official[i], via: "official website" };
    }
  }

  // (c) Profile-page rule: the person's OWN page on the official site — its
  // <title> or address carries their full name (vlu.co.il/team/אריאל-אייבר,
  // title "אריאל אייבר - VLU") — and its og:image is their portrait.
  for (const p of opts.personas) {
    for (let i = 0; i < official.length && !result[p.name]; i++) {
      const { html, base } = kept[i];
      if (!html) continue;
      const title = norm(html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "");
      let path = "";
      try {
        path = norm(decodeURIComponent(new URL(base).pathname));
      } catch {}
      const own = (variants.get(p.name) ?? [p.name]).some((v) => {
        const full = nameParts(v).full;
        return full.includes(" ") && (` ${title} `.includes(` ${full} `) || ` ${path} `.includes(` ${full} `));
      });
      if (!own) continue;
      const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
      if (!og || /\.svg(\?|$)|logo|icon/i.test(og)) continue;
      let src: string;
      try {
        src = new URL(decodeEntities(og), base).toString();
      } catch {
        continue;
      }
      if (allNames.some((n) => !(variants.get(p.name) ?? []).includes(n) && matchesPerson({ src, label: "" }, n))) continue;
      result[p.name] = { url: src, source: official[i], via: "official website" };
    }
  }

  // Pass 2 — web search, only for people the official site didn't cover.
  const missing = opts.personas.filter((p) => !result[p.name]);
  if (!missing.length) return result;
  const pages = await proposePages({ ...opts, personas: missing }).catch((err) => {
    console.warn("[persona-photos] page search failed:", err);
    return {} as Record<string, string[]>;
  });

  // Fetch each distinct page once; many personas share a leadership page.
  const urls = [...new Set(Object.values(pages).flat())].filter(isAllowedUrl).slice(0, 25);
  const images = new Map<string, PageImage[]>();
  await Promise.all(
    urls.map(async (u) => {
      images.set(u, await pageImages(u).catch(() => []));
    })
  );

  for (const p of missing) {
    // The person's own proposed pages first, then every fetched page — a
    // leadership page found for the CEO usually carries the whole team.
    const order = [...(pages[p.name] ?? []), ...urls.filter((u) => !(pages[p.name] ?? []).includes(u))];
    for (const u of order) {
      const hit = (images.get(u) ?? []).find((img) => matchesPerson(img, p.name));
      if (hit) {
        result[p.name] = { url: hit.src, source: u, via: "web page" };
        break;
      }
    }
  }

  await Promise.all(
    missing
      .filter((p) => !result[p.name])
      .map(async (p) => {
        result[p.name] = await wikidataPhoto(p.name, opts.company).catch(() => null);
      })
  );
  return result;
}

/* -------------------------------------------------------------------------
 * 1. Proposal: which pages might show an official photo
 * ---------------------------------------------------------------------- */

async function proposePages(opts: {
  company: string;
  website: string | null;
  personas: Persona[];
  usage?: RunUsage;
}): Promise<Record<string, string[]>> {
  const started = Date.now();
  const tool: Anthropic.Messages.Tool = {
    name: "save_pages",
    description: "Save the candidate pages found for each person. Call exactly once.",
    input_schema: {
      type: "object",
      properties: {
        people: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              pages: { type: "array", items: { type: "string" }, description: "Up to 3 URLs" },
            },
            required: ["name", "pages"],
          },
        },
      },
      required: ["people"],
    },
  };

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content:
        `Company: ${opts.company}${opts.website ? ` (${opts.website})` : ""}\n\n` +
        `For each person below, find up to 3 publicly accessible web pages that are likely to show their ` +
        `official professional photo WITH their name next to it. In order of preference: the company's own ` +
        `leadership/management/board page; the official press release announcing their appointment; a ` +
        `conference or event speaker page; their Wikipedia article.\n` +
        `Never propose LinkedIn, Facebook, Instagram, X/Twitter, TikTok, contact-data sites (RocketReach, ` +
        `ZoomInfo, etc.) or any page that requires a login. Pages about a different person with the same ` +
        `name are worse than no page: check the role and company.\n\n` +
        opts.personas.map((p) => `- ${p.name}, ${p.role}`).join("\n") +
        `\n\nWhen done, call save_pages once with the URLs you found (an empty list for anyone you can't find).`,
    },
  ];

  for (let round = 0; round < 4; round++) {
    const msg = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4000,
      messages,
      tools: [
        { type: "web_search_20260318", name: "web_search", max_uses: 10, allowed_callers: ["direct"] },
        tool,
      ],
    });
    if (opts.usage) {
      opts.usage.inputTokens += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0);
      opts.usage.outputTokens += msg.usage.output_tokens;
      opts.usage.webSearches = (opts.usage.webSearches ?? 0) + (msg.usage.server_tool_use?.web_search_requests ?? 0);
      opts.usage.ms = Date.now() - started;
    }
    const call = msg.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "save_pages"
    );
    if (call) {
      const out: Record<string, string[]> = {};
      for (const row of (call.input as { people?: { name: string; pages: string[] }[] }).people ?? []) {
        if (typeof row?.name === "string" && Array.isArray(row.pages)) {
          out[row.name] = row.pages.filter((u) => typeof u === "string").slice(0, 3);
        }
      }
      return out;
    }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  return {};
}

/* -------------------------------------------------------------------------
 * 2. Fetch a page and list its images with their labels
 * ---------------------------------------------------------------------- */

type PageImage = { src: string; label: string };

function isAllowedUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname;
    // No internal targets: this runs server-side on URLs a model proposed.
    if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".internal")) {
      return false;
    }
    return !BLOCKED_HOSTS.test(host);
  } catch {
    return false;
  }
}

async function pageImages(pageUrl: string, keep?: { html: string; base: string }): Promise<PageImage[]> {
  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      Accept: "text/html",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return [];
  const html = (await res.text()).slice(0, 2_000_000);
  const base = res.url || pageUrl;
  if (keep) {
    keep.html = html;
    keep.base = base;
  }
  const abs = (src: string) => {
    try {
      return new URL(decodeEntities(src.trim().split(/\s+/)[0]), base).toString();
    } catch {
      return null;
    }
  };
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((x) => x !== undefined) ??
    "";

  const out: PageImage[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const raw = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "srcset");
    const src = raw && !raw.startsWith("data:") ? abs(raw) : null;
    if (!src) continue;
    out.push({ src, label: decodeEntities(`${attr(tag, "alt")} ${attr(tag, "title")}`) });
  }
  // CSS background images and any other quoted image URL (Webflow team grids,
  // sliders). No label — they only count through the file-name rule.
  for (const m of html.matchAll(/url\(\s*["']?([^"')\s]+\.(?:jpe?g|png|webp|avif)[^"')\s]*)["']?\s*\)/gi)) {
    const src = abs(m[1]);
    if (src) out.push({ src, label: "" });
  }
  for (const m of html.matchAll(/["'](https?:\/\/[^"'\s]+\.(?:jpe?g|png|webp|avif)(?:\?[^"'\s]*)?)["'\s,]/gi)) {
    const src = abs(m[1]);
    if (src) out.push({ src, label: "" });
  }
  // Social-card image: only counts through the file-name rule (its label is the page, not the picture).
  for (const m of html.matchAll(/<meta\b[^>]*(?:og:image|twitter:image)[^>]*>/gi)) {
    const src = abs(attr(m[0], "content"));
    if (src) out.push({ src, label: "" });
  }
  return out.filter((i) => /^https?:/i.test(i.src) && !/\.svg(\?|$)/i.test(i.src) && !/logo|icon|sprite/i.test(i.src));
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/* -------------------------------------------------------------------------
 * 3. The match rule — the precision gate
 * ---------------------------------------------------------------------- */

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function nameParts(name: string) {
  const cleaned = name
    .replace(/\([^)]*\)/g, " ") // "Theodore (Theo) Mseka", "Brig. Gen. (Res.)"
    .replace(/\b(dr|prof|mr|mrs|ms|rabbi|brig|gen|col|maj|capt|lt|adv)\.?\s+/gi, " ");
  const parts = norm(cleaned).split(" ").filter((w) => w.length > 1);
  return { first: parts[0] ?? "", last: parts[parts.length - 1] ?? "", full: parts.join(" ") };
}

export function matchesPerson(img: PageImage, name: string): boolean {
  const { first, last, full } = nameParts(name);
  if (!first || !last || first === last) return false;
  if (img.label && ` ${norm(img.label)} `.includes(` ${full} `)) return true;
  // Also accept "first last" when the full name carries a middle name.
  if (img.label && ` ${norm(img.label)} `.includes(` ${first} ${last} `)) return true;
  let file = "";
  try {
    file = norm(decodeURIComponent(new URL(img.src).pathname.split("/").pop() ?? ""));
  } catch {
    return false;
  }
  const tokens = new Set(file.split(" "));
  return tokens.has(first) && tokens.has(last);
}

/** Same picture, allowing for size variants ("-p-500", "-1024x882") and query strings. */
function sameImage(a: string, b: string) {
  const key = (u: string) =>
    decodeURIComponent(u.split("?")[0].split("/").pop() ?? "")
      .replace(/(-p-\d+|-\d+x\d+|@\d(\.\d)?x?)(?=\.\w+$)/i, "")
      .toLowerCase();
  return key(a) === key(b);
}

/** One small call: how does the official page write each name? */
async function nativeNames(personas: Persona[], htmls: string[], usage?: RunUsage): Promise<Record<string, string>> {
  const text = htmls
    .map((h) => h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
    .join("\n")
    .slice(0, 30000);
  const tool: Anthropic.Messages.Tool = {
    name: "save_names",
    description: "Save how each person's name is written on the page.",
    input_schema: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: {
            type: "object",
            properties: { english: { type: "string" }, onPage: { type: "string" } },
            required: ["english", "onPage"],
          },
        },
      },
      required: ["names"],
    },
  };
  const msg = await getAnthropicClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1500,
    tools: [tool],
    messages: [
      {
        role: "user",
        content:
          `People (English names):\n${personas.map((p) => `- ${p.name} (${p.role})`).join("\n")}\n\n` +
          `Below is text from the company's own website. For each person, copy EXACTLY how their name ` +
          `is written in this text (same script and spelling, e.g. Hebrew), or "" if they do not appear. ` +
          `Never translate or guess a name that is not in the text. Call save_names once.\n\n<page>\n${text}\n</page>`,
      },
    ],
  });
  if (usage) {
    usage.inputTokens += msg.usage.input_tokens;
    usage.outputTokens += msg.usage.output_tokens;
  }
  const call = msg.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "save_names"
  );
  const out: Record<string, string> = {};
  for (const r of (call?.input as { names?: { english: string; onPage: string }[] })?.names ?? []) {
    if (r?.english && typeof r.onPage === "string" && r.onPage.trim().length > 1) out[r.english] = r.onPage.trim();
  }
  return out;
}

/**
 * The team-card rule, for the company's OWN pages only. Accepts the <img>
 * immediately before the person's name when, between the two, there is no
 * other image and no other listed person's name, the gap fits one card, and
 * the image is not a logo/icon or named for someone else. Verified on
 * aviv-group.com/team (every card is photo → name).
 */
function cardPhotoBefore(html: string, base: string, name: string, allNames: string[]): string | null {
  const at = html.indexOf(name);
  if (at < 0) return null;
  const imgs = [...html.slice(0, at).matchAll(/<img\b[^>]*>/gi)];
  const last = imgs[imgs.length - 1];
  if (!last || at - (last.index ?? 0) > 12_000) return null;
  const between = html.slice((last.index ?? 0) + last[0].length, at);
  if (/<img\b/i.test(between)) return null;
  if (allNames.some((n) => n !== name && between.includes(n))) return null;
  const raw = (last[0].match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? "").trim();
  if (!raw || raw.startsWith("data:") || /\.svg(\?|$)|logo|icon|sprite/i.test(raw)) return null;
  let src: string;
  try {
    src = new URL(decodeEntities(raw), base).toString();
  } catch {
    return null;
  }
  // Named for a different listed person? Then it's that person's photo.
  if (allNames.some((n) => n !== name && matchesPerson({ src, label: "" }, n))) return null;
  return src;
}

/* -------------------------------------------------------------------------
 * 4. Wikidata fallback
 * ---------------------------------------------------------------------- */

async function wikidataPhoto(name: string, company: string): Promise<PersonaPhoto | null> {
  const api = "https://www.wikidata.org/w/api.php";
  const ua = { "User-Agent": "SusieBrain-CompanyIntel/1.0 (internal research tool)" };
  const search = await fetch(
    `${api}?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(name)}`,
    { headers: ua, signal: AbortSignal.timeout(6000) }
  ).then((r) => r.json());
  const ids: string[] = (search.search ?? []).map((s: { id: string }) => s.id);
  if (!ids.length) return null;

  const ents = await fetch(
    `${api}?action=wbgetentities&format=json&languages=en&props=labels|descriptions|claims&ids=${ids.join("|")}`,
    { headers: ua, signal: AbortSignal.timeout(6000) }
  ).then((r) => r.json());

  const companyTokens = norm(company)
    .split(" ")
    .filter((t) => t.length > 2 && !["group", "the", "and", "company", "holding", "holdings"].includes(t));
  if (!companyTokens.length) return null;

  for (const id of ids) {
    const e = ents.entities?.[id];
    if (!e) continue;
    const label = norm(e.labels?.en?.value ?? "");
    if (label !== nameParts(name).full && !label.includes(nameParts(name).full)) continue;
    const image = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value as string | undefined;
    if (!image) continue;

    // Tie to the company: its name in the description, or an employer (P108) whose label names it.
    let tied = companyTokens.some((t) => ` ${norm(e.descriptions?.en?.value ?? "")} `.includes(` ${t} `));
    if (!tied) {
      const employers: string[] = (e.claims?.P108 ?? [])
        .map((c: { mainsnak?: { datavalue?: { value?: { id?: string } } } }) => c.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
      if (employers.length) {
        const emp = await fetch(
          `${api}?action=wbgetentities&format=json&languages=en&props=labels&ids=${employers.slice(0, 10).join("|")}`,
          { headers: ua, signal: AbortSignal.timeout(6000) }
        ).then((r) => r.json());
        tied = Object.values(emp.entities ?? {}).some((x) => {
          const l = norm((x as { labels?: { en?: { value?: string } } }).labels?.en?.value ?? "");
          return companyTokens.some((t) => ` ${l} `.includes(` ${t} `));
        });
      }
    }
    if (!tied) continue;

    return {
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=240`,
      source: `https://www.wikidata.org/wiki/${id}`,
      via: "Wikimedia Commons",
    };
  }
  return null;
}
