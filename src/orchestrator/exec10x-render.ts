import fs from "node:fs";
import path from "node:path";
import { cockpitFileTitle } from "@/shared/exec10x";

/** Susan's template with the platform additions (ADR-009 §18). */
const TEMPLATE = path.join(process.cwd(), "src/components/company-intel/exec10x/template.html");

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

/** JSON that can sit inside <script type="application/json"> without ending it. */
export function scriptSafeJson(data: unknown): string {
  return JSON.stringify(data ?? null)
    .replace(/</g, "\\u003c")
    .split(LINE_SEP)
    .join("\\u2028")
    .split(PARA_SEP)
    .join("\\u2029");
}


/** The cockpit page for one report. Rendering happens in the browser, inside per-section guards. */
let cached: string | null = null;
/** Read once in production; re-read in development so template edits show up. */
const template = () => (process.env.NODE_ENV === "production" ? (cached ??= fs.readFileSync(TEMPLATE, "utf-8")) : fs.readFileSync(TEMPLATE, "utf-8"));

export function renderCockpitHtml(data: unknown, companyName: string): string {
  return template()
    .replace("__EXEC10X_TITLE__", () => cockpitFileTitle(companyName))
    .replace("__EXEC10X_DATA__", () => scriptSafeJson(data));
}
