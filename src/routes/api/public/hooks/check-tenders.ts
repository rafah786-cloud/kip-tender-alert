import { createFileRoute } from "@tanstack/react-router";
import { runTenderCheck } from "@/lib/tenders.runner.server";
import { isAdminSession, isSameOriginRequest } from "@/lib/admin-session.server";
import { createServerSupabaseClient, getServerRuntimeEnv } from "@/lib/runtime-env.server";

// Called by pg_cron. Accept a configured server CRON_SECRET or a dedicated
// high-entropy token stored in Supabase Vault. Never accept tokens in query URLs.
async function checkAuth(request: Request): Promise<Response | null> {
  // Interactive manual scans are allowed only from this origin with a valid
  // signed administrator session. Scheduled scans continue using the Vault token.
  if (isSameOriginRequest(request) && await isAdminSession(request)) return null;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!provided) return new Response("Tender Watch auth probe: bearer header missing", { status: 401, headers: { "X-Tender-Watch-Auth-Probe": "cron-auth-probe-4" } });

  const configuredSecret = getServerRuntimeEnv("CRON_SECRET");
  if (configuredSecret && provided === configuredSecret) return null;

  const supabaseUrl = getServerRuntimeEnv("SUPABASE_URL");
  const serviceRoleKey = getServerRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Tender Watch auth probe: Supabase server credentials missing", { status: 503, headers: { "X-Tender-Watch-Auth-Probe": "cron-auth-probe-4" } });
  }

  try {
    const sb = createServerSupabaseClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await sb.rpc("is_valid_tender_cron_secret", {
      candidate_secret: provided,
    });
    if (error) {
      console.error("[check-tenders] scheduler-token RPC failed", {
        code: error.code,
        message: error.message,
      });
      return new Response(`Tender Watch auth probe: Supabase RPC failed (${error.code ?? "unknown"})`, { status: 503, headers: { "X-Tender-Watch-Auth-Probe": "cron-auth-probe-4" } });
    }
    if (data === true) return null;
  } catch (error) {
    console.error("[check-tenders] scheduler-token validation failed", error);
    return new Response("Server not configured", { status: 503 });
  }

  return new Response("Tender Watch auth probe: Vault token rejected", { status: 401, headers: { "X-Tender-Watch-Auth-Probe": "cron-auth-probe-4" } });
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
