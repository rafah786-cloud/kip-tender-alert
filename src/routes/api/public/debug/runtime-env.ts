import { createFileRoute } from "@tanstack/react-router";
import { isAdminSession, isSameOriginRequest } from "@/lib/admin-session.server";
import {
  createServerSupabaseClient,
  getServerRuntimeEnv,
  getServerRuntimeEnvDiagnostics,
} from "@/lib/runtime-env.server";

async function authorize(request: Request): Promise<Response | null> {
  if (isSameOriginRequest(request) && await isAdminSession(request)) return null;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return new Response("Unauthorized", { status: 401 });

  const cronSecret = getServerRuntimeEnv("CRON_SECRET");
  if (cronSecret && provided === cronSecret) return null;

  const supabaseUrl = getServerRuntimeEnv("SUPABASE_URL");
  const serviceRoleKey = getServerRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Server auth is not configured", { status: 503 });
  }

  const sb = createServerSupabaseClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await sb.rpc("is_valid_tender_cron_secret", {
    candidate_secret: provided,
  });
  if (error) {
    console.error("[runtime-env-debug] token validation failed", {
      code: error.code,
      message: error.message,
    });
    return new Response("Authorization check unavailable", { status: 503 });
  }
  return data === true ? null : new Response("Unauthorized", { status: 401 });
}

export const Route = createFileRoute("/api/public/debug/runtime-env")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await authorize(request);
        if (denied) return denied;

        // Never return secret values, prefixes, lengths, or hashes.
        const firecrawl = getServerRuntimeEnvDiagnostics("FIRECRAWL_API_KEY");
        return Response.json({
          ok: true,
          firecrawl: {
            configured: firecrawl.configured,
            source: firecrawl.source,
            processEnvConfigured: firecrawl.processEnvConfigured,
            workerBindingConfigured: firecrawl.workerBindingConfigured,
          },
          serverSupabaseConfigured:
            Boolean(getServerRuntimeEnv("SUPABASE_URL")) &&
            Boolean(getServerRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")),
        });
      },
    },
  },
});
