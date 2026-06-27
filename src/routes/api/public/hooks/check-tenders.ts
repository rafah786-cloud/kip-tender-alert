import { createFileRoute } from "@tanstack/react-router";
import { runTenderCheck } from "@/lib/tenders.runner.server";

// Called by pg_cron periodically. Public (no auth) — does nothing destructive,
// only triggers an outbound scrape and writes new tender rows.
export const Route = createFileRoute("/api/public/hooks/check-tenders")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runTenderCheck();
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      GET: async () => {
        try {
          const result = await runTenderCheck();
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
