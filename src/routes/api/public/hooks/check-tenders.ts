import { createFileRoute } from "@tanstack/react-router";
import { runTenderCheck } from "@/lib/tenders.runner.server";

// Called by pg_cron periodically. Requires CRON_SECRET shared secret to
// prevent unauthenticated visitors from triggering the paid scrape+AI pipeline.
function checkAuth(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Server not configured", { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : new URL(request.url).searchParams.get("secret") ?? "";
  if (provided !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/check-tenders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkAuth(request);
        if (unauth) return unauth;
        try {
          const result = await runTenderCheck();
          return Response.json(result);
        } catch (e) {
          console.error("[check-tenders] failed", e);
          return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        const unauth = checkAuth(request);
        if (unauth) return unauth;
        try {
          const result = await runTenderCheck();
          return Response.json(result);
        } catch (e) {
          console.error("[check-tenders] failed", e);
          return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
        }
      },
    },
  },
});
