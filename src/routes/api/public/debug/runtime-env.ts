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
        let providerProbe: {
          attempted: boolean;
          httpStatus?: number;
          apiSuccess?: boolean;
          markdownChars?: number;
          error?: string;
        } = { attempted: false };

        if (new URL(request.url).searchParams.get("probe") === "firecrawl" && firecrawl.configured) {
          providerProbe = { attempted: true };
          const apiKey = getServerRuntimeEnv("FIRECRAWL_API_KEY")!;
          try {
            const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                url: "https://eprocure.gov.in/eprocure/app?page=FrontEndLatestActiveTenders&service=page",
                formats: ["markdown"],
                onlyMainContent: true,
                waitFor: 1000,
              }),
              signal: AbortSignal.timeout(45000),
            });
            const body = await response.text().catch(() => "");
            let parsed: { success?: boolean; data?: { markdown?: string }; error?: string; message?: string } = {};
            try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { message: body.slice(0, 180) }; }
            providerProbe = {
              attempted: true,
              httpStatus: response.status,
              apiSuccess: response.ok && parsed.success !== false,
              markdownChars: parsed.data?.markdown?.length ?? 0,
              ...(!response.ok ? { error: `Firecrawl returned HTTP ${response.status}: ${(parsed.error ?? parsed.message ?? "provider rejected request").slice(0, 220)}` } : {}),
            };
          } catch (error) {
            providerProbe = {
              attempted: true,
              error: error instanceof Error ? error.message.slice(0, 220) : "Firecrawl request failed",
            };
          }
        }

        return Response.json({
          ok: true,
          firecrawl: {
            configured: firecrawl.configured,
            source: firecrawl.source,
            processEnvConfigured: firecrawl.processEnvConfigured,
            workerBindingConfigured: firecrawl.workerBindingConfigured,
          },
          firecrawlProbe: providerProbe,
          serverSupabaseConfigured:
            Boolean(getServerRuntimeEnv("SUPABASE_URL")) &&
            Boolean(getServerRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")),
        });
      },
    },
  },
});
