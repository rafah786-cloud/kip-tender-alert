import { createFileRoute } from "@tanstack/react-router";
import { scrapeAllSourcesRaw } from "@/lib/tenders.server";
import { classifyTenders } from "@/lib/ai-classifier.server";
import { deepClassifyTenderDebug } from "@/lib/doc-classifier.server";

// Public debug endpoint — inspect exactly what the pipeline sees for a run.
// Returns:
//  - Per source: raw Firecrawl markdown (truncated) + parsed row summaries
//  - Per audited row: stage-1 verdict, detail-page markdown, discovered doc
//    URLs, the docs actually fed to Gemini, and the deep verdict/rationale.
//
// Query params:
//   ?limit=N   how many rows to deep-audit (default 5, max 15)
//   ?source=K  restrict deep audit to a single source key (cppp | etenders_central | kerala)
//   ?pageChars=N  truncate detail-page markdown returned (default 4000)
//   ?mdChars=N    truncate listing markdown returned per source (default 6000)

export const Route = createFileRoute("/api/public/debug/tender-scan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
        try {
          const url = new URL(request.url);
          const limit = Math.min(
            Math.max(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 1),
            15,
          );
          const sourceFilter = url.searchParams.get("source");
          const pageChars =
            parseInt(url.searchParams.get("pageChars") ?? "4000", 10) || 4000;
          const mdChars =
            parseInt(url.searchParams.get("mdChars") ?? "6000", 10) || 6000;

          const started = Date.now();

          // 1. Scrape listing pages (raw markdown preserved).
          const { results } = await scrapeAllSourcesRaw(undefined, mdChars);

          // 2. Build flat row list, respecting the optional source filter.
          const rows = results
            .filter((r) => (sourceFilter ? r.source.key === sourceFilter : true))
            .flatMap((r) =>
              r.parsed.map((p) => ({
                source_key: r.source.key,
                source_label: r.source.label,
                ...p,
              })),
            );

          // 3. Stage-1 (title-level) classification — informational only.
          let stage1: Awaited<ReturnType<typeof classifyTenders>> = [];
          let stage1Error: string | null = null;
          if (rows.length > 0) {
            try {
              stage1 = await classifyTenders(
                rows.map((r) => ({
                  id: r.fingerprint,
                  source_label: r.source_label,
                  text: `${r.title}\n${r.organisation ?? ""}\n${r.raw_excerpt}`,
                })),
              );
            } catch (e) {
              stage1Error = e instanceof Error ? e.message : String(e);
            }
          }
          const stage1Map = new Map(stage1.map((v) => [v.id, v]));

          // 4. Deep-audit the first `limit` rows and capture internals.
          const toAudit = rows.slice(0, limit);
          const audited: Array<{
            source_key: string;
            title: string;
            organisation: string | null;
            tender_url: string | null;
            fingerprint: string;
            raw_excerpt: string;
            stage1: {
              verdict: string;
              confidence: number;
              reason: string;
              category?: string;
            } | null;
            deep: Awaited<ReturnType<typeof deepClassifyTenderDebug>> | null;
            deep_error?: string;
          }> = [];

          for (const row of toAudit) {
            const s1 = stage1Map.get(row.fingerprint) ?? null;
            if (!row.tender_url) {
              audited.push({
                source_key: row.source_key,
                title: row.title,
                organisation: row.organisation ?? null,
                tender_url: null,
                fingerprint: row.fingerprint,
                raw_excerpt: row.raw_excerpt,
                stage1: s1
                  ? {
                      verdict: s1.verdict,
                      confidence: s1.confidence,
                      reason: s1.reason,
                      category: s1.category,
                    }
                  : null,
                deep: null,
                deep_error: "no tender_url on listing row",
              });
              continue;
            }
            try {
              const debug = await deepClassifyTenderDebug(
                {
                  title: row.title,
                  organisation: row.organisation ?? null,
                  source_label: row.source_label,
                  tender_url: row.tender_url,
                },
                { pageChars },
              );
              audited.push({
                source_key: row.source_key,
                title: row.title,
                organisation: row.organisation ?? null,
                tender_url: row.tender_url,
                fingerprint: row.fingerprint,
                raw_excerpt: row.raw_excerpt,
                stage1: s1
                  ? {
                      verdict: s1.verdict,
                      confidence: s1.confidence,
                      reason: s1.reason,
                      category: s1.category,
                    }
                  : null,
                deep: debug,
              });
            } catch (e) {
              audited.push({
                source_key: row.source_key,
                title: row.title,
                organisation: row.organisation ?? null,
                tender_url: row.tender_url,
                fingerprint: row.fingerprint,
                raw_excerpt: row.raw_excerpt,
                stage1: s1
                  ? {
                      verdict: s1.verdict,
                      confidence: s1.confidence,
                      reason: s1.reason,
                      category: s1.category,
                    }
                  : null,
                deep: null,
                deep_error: e instanceof Error ? e.message : String(e),
              });
            }
          }

          return Response.json({
            ok: true,
            elapsed_ms: Date.now() - started,
            params: { limit, sourceFilter, pageChars, mdChars },
            sources: results.map((r) => ({
              key: r.source.key,
              label: r.source.label,
              url: r.source.url,
              ok: r.ok,
              error: r.error,
              markdown_chars: r.markdown_chars,
              parsed_rows: r.parsed.length,
              markdown_sample: r.markdown,
              parsed_preview: r.parsed.slice(0, 20).map((p) => ({
                fingerprint: p.fingerprint,
                title: p.title,
                organisation: p.organisation,
                tender_url: p.tender_url,
                published_at: p.published_at,
                closing_at: p.closing_at,
              })),
            })),
            stage1_error: stage1Error,
            total_rows: rows.length,
            audited_count: audited.length,
            audited,
          });
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
