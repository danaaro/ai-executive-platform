/**
 * Company logo (2026-09-26) — for the report header and the past-research list.
 *
 * Deterministic, no model involved: read the company's own homepage and take,
 * in order of trust,
 *   1. the Organization logo it declares in JSON-LD (schema.org),
 *   2. an <img> whose class / id / alt / src says "logo" (header first),
 *   3. its apple-touch-icon (a square, usually 180px, brand mark),
 *   4. its largest <link rel="icon">.
 * Many corporate sites block automated requests, so when the homepage can't be
 * read the fallback is the site's icon via Google's public favicon service
 * (always resolves for a live domain, lower resolution). Only the URL is kept.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";

export function googleFavicon(host: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decode(m[2] ?? m[3] ?? "") : "";
}

export async function findCompanyLogo(website: string, companyName = ""): Promise<string | null> {
  const nameTokens = companyName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2 && !["group", "the", "and", "inc", "ltd", "company"].includes(t));
  let home: URL;
  try {
    home = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return null;
  }
  const host = home.hostname.replace(/^www\./, "");

  let html = "";
  let base = home.toString();
  try {
    const res = await fetch(home, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("html")) {
      html = (await res.text()).slice(0, 1_500_000);
      base = res.url || base;
    }
  } catch {
    // unreachable / blocked — fall through to the favicon service
  }
  const abs = (u: string) => {
    try {
      return u && !u.startsWith("data:") ? new URL(u.trim(), base).toString() : null;
    } catch {
      return null;
    }
  };

  const candidates: string[] = [];
  if (html) {
    // 1. JSON-LD Organization logo
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      const logo = m[1].match(/"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"(?:url|contentUrl)"\s*:\s*"([^"]+)")/i);
      const u = abs(logo?.[1] ?? logo?.[2] ?? "");
      if (u) candidates.push(u);
    }
    // 2. The site's own logo: an image labelled "logo" that sits in the
    //    header / nav or inside the link back to the homepage. A "logo" image
    //    anywhere else counts only if it names the company — body logo grids
    //    are brands, clients and partners (aviv-group.com lists SeLoger,
    //    Immoweb… and has no labelled logo of its own).
    const chrome = [
      ...(html.match(/<header\b[\s\S]*?<\/header>/gi) ?? []),
      ...(html.match(/<nav\b[\s\S]*?<\/nav>/gi) ?? []),
      ...(html.match(/<a\b[^>]*href\s*=\s*["'](?:\/|\.\/|https?:\/\/(?:www\.)?[^"'/]+\/?)["'][^>]*>[\s\S]{0,800}?<\/a>/gi) ?? []),
    ].join(" ");
    const logoImgs = (scope: string) =>
      [...scope.matchAll(/<img\b[^>]*>/gi)]
        .map((m) => m[0])
        .map((tag) => ({
          tag,
          // The file NAME only — a folder path like /kkr/sites/… names every image on the site.
          hint: `${attr(tag, "class")} ${attr(tag, "id")} ${attr(tag, "alt")} ${fileName(attr(tag, "src") || attr(tag, "data-src"))}`.toLowerCase(),
        }))
        .filter(({ hint }) => !/partner|client|customer|award|footer|sponsor|companies-logo|brand-logo/.test(hint));
    for (const { tag, hint } of logoImgs(chrome)) {
      if (!/logo/.test(hint) && !nameTokens.some((t) => hint.includes(t))) continue;
      const u = abs(attr(tag, "src") || attr(tag, "data-src"));
      if (u) candidates.push(u);
    }
    for (const { tag, hint } of logoImgs(html)) {
      if (!/logo/.test(hint) || !nameTokens.some((t) => hint.includes(t))) continue;
      const u = abs(attr(tag, "src") || attr(tag, "data-src"));
      if (u) candidates.push(u);
    }
    // 3–4. touch icon, then the largest declared icon
    const icons = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((t) => /rel\s*=\s*["'][^"']*icon/i.test(t))
      .map((t) => ({
        href: abs(attr(t, "href")),
        touch: /apple-touch-icon/i.test(attr(t, "rel")),
        size: Number(attr(t, "sizes").split("x")[0]) || (/\.svg(\?|$)/i.test(attr(t, "href")) ? 512 : 16),
      }))
      .filter((i) => i.href);
    for (const i of icons.filter((i) => i.touch)) candidates.push(i.href!);
    for (const i of icons.filter((i) => !i.touch).sort((a, b) => b.size - a.size)) candidates.push(i.href!);
  }

  // The header tile is white: a "white" / reversed logo variant would vanish on it.
  const onDark = (u: string) => /white|negative|inverse|reverse|[-_]light\b|knockout/i.test(fileName(u));
  const ordered = [...new Set(candidates)];
  const ranked = [...ordered.filter((u) => !onDark(u)), ...ordered.filter(onDark)];
  for (const u of ranked.slice(0, 6)) {
    if (await isImage(u)) return u;
  }
  const fav = googleFavicon(host);
  return (await isImage(fav)) ? fav : null;
}

function fileName(u: string) {
  try {
    return decodeURIComponent(new URL(u, "https://x.invalid").pathname.split("/").pop() ?? "");
  } catch {
    return u.split("/").pop() ?? "";
  }
}

async function isImage(u: string): Promise<boolean> {
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return false;
    const bytes = (await res.arrayBuffer()).byteLength;
    return bytes > 150; // 1×1 trackers and empty placeholders
  } catch {
    return false;
  }
}

/** The company's own domain: the stored website, else a cited URL whose host carries the company's name. */
export function guessWebsite(slug: string, researchTexts: string[]): string | null {
  const tokens = slug.split("-").filter((t) => t.length > 2 && t !== "group");
  if (!tokens.length) return null;
  const counts = new Map<string, number>();
  for (const text of researchTexts) {
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = m[1].toLowerCase().replace(/^www\./, "");
      const first = host.split(".")[0];
      if (tokens.some((t) => first.includes(t))) counts.set(host, (counts.get(host) ?? 0) + 1);
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? `https://${best[0]}` : null;
}
