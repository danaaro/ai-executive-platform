import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";
import type { PersonaPhoto } from "@/shared/company-report";

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
}): Promise<Record<string, PersonaPhoto | null>> {
  const result: Record<string, PersonaPhoto | null> = {};
  for (const p of opts.personas) result[p.name] = null;
  if (!opts.personas.length) return result;

  const pages = await proposePages(opts).catch((err) => {
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

  for (const p of opts.personas) {
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
    opts.personas
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
}): Promise<Record<string, string[]>> {
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

async function pageImages(pageUrl: string): Promise<PageImage[]> {
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
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function nameParts(name: string) {
  const parts = norm(name.replace(/\b(dr|prof|mr|mrs|ms)\.?\s+/gi, "")).split(" ").filter((w) => w.length > 1);
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
