import { NextResponse } from "next/server";

/**
 * GET /api/version
 * Returns a build identifier that changes on each Vercel deploy.
 * Tablet and TV apps poll this to auto-reload when a new version is available.
 */
export async function GET() {
  const buildId =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.BUILD_ID ??
    "dev";

  return NextResponse.json(
    { v: buildId },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}
