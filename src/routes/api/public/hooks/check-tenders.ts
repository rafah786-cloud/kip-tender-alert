import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { runTenderCheck } from "@/lib/tenders.runner.server";

// Called by pg_cron periodically. Accepts either the CRON_SECRET env var or
// the scheduler token stored in Supabase Vault (tender_watch_cron_token),
// verified via the is_valid_tender_cron_secret() database function. This
// prevents unauthenticated visitors from triggering the paid scrape+AI
// pipeline while keeping the token out of cron job definitions.
async function checkAuth(request: Request): Promise<Response | null> {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : (new URL(request.url).searchParams.get("secret") ?? "");
  if (!provided) {
    return new Response("Unauthorized", { status: 401 });
  }

  const envSecret = process.env.CRON_SECRET;
  if (envSecret && provided === envSecret) return null;

  // Fall back to the Vault-stored scheduler token.
  try {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await sb.rpc("is_valid_tender_cron_secret", {
      candidate_secret: provided,
    });
    if (!error && data === true) return null;
  } catch (e) {
    console.error("[check-tenders] vault token check failed", e);
  }
  return new Response("Unauthorized", { status: 401 });
}

export const Route = createFileRoute("/api/public/hooks/check-tenders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = await checkAuth(request);
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
        const unauth = await checkAuth(request);
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
