import * as React from "react";

/**
 * Renders the agents' Markdown documents (job description etc.) in the
 * Exec10X review style — Newsreader headings, gold bullet marks — without a
 * Markdown library and without ever injecting HTML: every piece of text goes
 * through React as text, so a document cannot carry markup or scripts.
 *
 * Supports what the agents write: #/##/### headings, - or * bullets, numbered
 * lists, **bold**, *italic*, horizontal rules, paragraphs, and > quotes in
 * the three shapes the JD writer uses (same rules as src/shared/jd-export.ts):
 * "> **Title**" on its own first line is a ruled panel — the opening hook when
 * it comes before the first section — otherwise a gold-bar callout. Anything
 * else is shown as plain text.
 */
export function MarkdownLite({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let inBody = false; // after the first ## section

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={blocks.length} className="leading-relaxed text-muted">
          {inline(para.join(" "))}
        </p>
      );
      para = [];
    }
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const t = /^\*\*([^*]+)\*\*$/.exec(quote[0]);
    const title = t && quote.length > 1 ? t[1].trim() : null;
    const body = (title ? quote.slice(1) : quote).join(" ");
    if (title || !inBody) {
      blocks.push(
        <div key={blocks.length} className="space-y-2 border-y border-line py-5">
          {title &&
            (inBody ? (
              <p className="font-display text-lg text-ink">{title}</p>
            ) : (
              <p className="font-display text-3xl text-accent">{title}</p>
            ))}
          <p className={inBody ? "leading-relaxed text-muted" : "font-display text-lg italic leading-relaxed text-muted"}>
            {inline(body)}
          </p>
        </div>
      );
    } else {
      blocks.push(
        <p key={blocks.length} className="border-l-2 border-accent pl-4 leading-relaxed text-muted">
          {inline(body)}
        </p>
      );
    }
    quote = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => (
        <li key={i} className="flex gap-3 text-muted">
          {list!.ordered ? (
            <span className="w-5 shrink-0 font-mono text-xs leading-[1.7] text-accent">{i + 1}.</span>
          ) : (
            <span className="mt-[0.7em] h-px w-3 shrink-0 bg-accent" aria-hidden />
          )}
          <span className="leading-relaxed">{inline(it)}</span>
        </li>
      ));
      blocks.push(
        <ul key={blocks.length} className="space-y-2">
          {items}
        </ul>
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const q = /^\s*>\s?(.*)$/.exec(line);

    if (!q) flushQuote();
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (q) {
      flushPara();
      flushList();
      if (q[1].trim()) quote.push(q[1].trim());
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara();
      flushList();
      blocks.push(<hr key={blocks.length} className="border-line" />);
    } else if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      if (level > 1) inBody = true;
      const cls =
        level === 1
          ? "font-display text-4xl font-normal text-ink"
          : level === 2
            ? "border-t border-line pt-6 font-display text-2xl font-normal text-ink"
            : "font-display text-lg font-normal text-ink";
      blocks.push(
        React.createElement(`h${level + 1}`, { key: blocks.length, className: cls }, inline(h[2]))
      );
    } else if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      // Stacked "**Company:** …" header lines are separate lines, not one paragraph.
      if (/^\*\*[^*]+:\*\*/.test(line.trim())) flushPara();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  flushQuote();

  return <div className="space-y-4">{blocks}</div>;
}

/** **bold** and *italic* only; everything stays text. */
function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith("**") ? (
        <strong key={out.length} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>
      ) : (
        <em key={out.length}>{tok.slice(1, -1)}</em>
      )
    );
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
