// Copies pdf.js (and its worker) from node_modules into public/vendor/pdfjs so
// the browser loads it as plain static files. Next.js's bundler cannot package
// pdfjs-dist v5 ("Object.defineProperty called on non-object"), so it is kept
// out of the bundle entirely — see src/lib/extract-text.ts.
// Runs before `dev` and `build`, so the copy always matches the installed version.
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules/pdfjs-dist/build");
const dest = path.join(process.cwd(), "public/vendor/pdfjs");
fs.mkdirSync(dest, { recursive: true });
for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) fs.copyFileSync(path.join(src, f), path.join(dest, f));
