/** @type {import('next').NextConfig} */
const nextConfig = {
  // The runtime reads declarative agent content (products/**, prompts/**) from
  // disk at request time (ADR-001). Vercel's serverless bundler only ships
  // traced files, so these must be included explicitly or every agent route
  // 500s in production with ENOENT.
  outputFileTracingIncludes: {
    "/api/**": ["./products/**/*.md", "./prompts/**/*.md"],
    // Company Intel page reads the review checklist at request time (ADR-009).
    "/internal/**": ["./products/interview-intelligence/evals/company-intel/*.md"],
  },
  // pdf-parse v2 wraps pdfjs-dist, which webpack cannot bundle: it mutates
  // globals and loads its worker dynamically, so the bundled copy threw
  // "Object.defineProperty called on non-object" at IMPORT time — PDF upload
  // failed before a single byte was parsed, while DOCX/TXT worked. Loading it
  // as a real Node module (require at runtime, unbundled) is the supported
  // path. mammoth is listed for the same reason — it is native-ish and has no
  // reason to go through the bundler either.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
