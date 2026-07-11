import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// /__clerk is Clerk's auto-proxy path — must pass through untouched or
// Clerk's own auth machinery breaks.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/__clerk(.*)",
]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

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
