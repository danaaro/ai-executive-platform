/** @type {import('next').NextConfig} */
const nextConfig = {
  // The runtime reads declarative agent content (products/**, prompts/**) from
  // disk at request time (ADR-001). Vercel's serverless bundler only ships
  // traced files, so these must be included explicitly or every agent route
  // 500s in production with ENOENT.
  outputFileTracingIncludes: {
    "/api/**": ["./products/**/*.md", "./prompts/**/*.md"],
  },
};

export default nextConfig;
