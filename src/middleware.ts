import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// /__clerk is Clerk's auto-proxy path — must pass through untouched or
// Clerk's own auth machinery breaks.
// /api/job-description/voice-llm is called server-to-server by ElevenLabs
// (no Clerk session exists for that caller); it authenticates itself with
// the ELEVENLABS_CUSTOM_LLM_SECRET bearer token inside the handler (ADR-005).
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/__clerk(.*)",
  "/api/job-description/voice-llm(.*)",
]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

/**
 * The two text-agent routes, opened ONLY for local end-to-end tests.
 *
 * Why this exists: `npm run test:document` has to drive the real HTTP endpoint,
 * because the bug it guards against (a long generation outliving the function
 * budget, the platform returning HTML, the browser throwing an opaque parse
 * error) lives in the transport and cannot be reproduced by calling the
 * orchestrator. Before this, running that test meant hand-editing this file —
 * and a guard that requires editing the security layer to run is a guard nobody
 * runs. That is how the bug reached the user in the first place.
 *
 * Two independent conditions, both required, so this cannot open in production:
 * `NODE_ENV !== "production"` (Vercel builds always set it to production, so the
 * deployed app can never take this branch regardless of env vars) AND an
 * explicit opt-in flag that is absent from .env.local and set only inline by the
 * test script.
 */
const isTestOpenRoute = createRouteMatcher([
  "/api/job-description",
  "/api/agents/(.*)",
]);

const testRoutesAllowed =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_UNAUTHED_AGENT_ROUTES === "1";

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  if (testRoutesAllowed && isTestOpenRoute(req)) {
    console.warn(`[middleware] TEST MODE: serving ${req.nextUrl.pathname} without auth`);
    return;
  }

  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return;
  }

  // Explicit redirect target, not Clerk's default rewrite-then-client-JS-completes
  // dance — that mechanism depends on the browser having already loaded Clerk's
  // script and is not observable/testable with a plain HTTP client.
  await auth.protect({ unauthenticatedUrl: new URL("/sign-in", req.url).toString() });
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
