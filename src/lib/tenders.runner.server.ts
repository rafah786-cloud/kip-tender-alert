// Server-only orchestration: scrape sources, dedupe, insert new tenders, update settings.
import { scrapeAllSources } from "./tenders.server";

function getServerClient() {
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface RunResult {
  ok: boolean;
  new_count: number;
  total_matches: number;
  sources: { key: string; label: string; matches: number; error?: string }[];
  message: string;
}

export async function runTenderCheck(): Promise<RunResult> {
  const sb = getServerClient();
  const { data: settings, error: sErr } = await sb
    .from("settings")
    .select("keywords")
    .eq("id", 1)
    .single();
  if (sErr) throw new Error(sErr.message);
  const keywords = (settings?.keywords as string[]) ?? [];
  if (keywords.length === 0) {
    await sb
      .from("settings")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "error",
        last_run_message: "No keywords configured",
      })
      .eq("id", 1);
    return {
      ok: false,
      new_count: 0,
      total_matches: 0,
      sources: [],
      message: "No keywords configured",
    };
  }

  const { results } = await scrapeAllSources(keywords);

  let total = 0;
  let inserted = 0;
  const summary: RunResult["sources"] = [];

  for (const r of results) {
    total += r.matches.length;
    summary.push({
      key: r.source.key,
      label: r.source.label,
      matches: r.matches.length,
      error: r.error,
    });
    if (r.matches.length === 0) continue;
    const rows = r.matches.map((m) => ({
      source: r.source.key,
      source_url: r.source.url,
      fingerprint: m.fingerprint,
      title: m.title,
      organisation: m.organisation ?? null,
      published_at: m.published_at ?? null,
      closing_at: m.closing_at ?? null,
      tender_url: m.tender_url ?? null,
      matched_keywords: m.matched_keywords,
      raw_excerpt: m.raw_excerpt,
    }));
    // upsert on fingerprint; count only newly inserted
    const { data, error } = await sb
      .from("tenders")
      .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) {
      summary[summary.length - 1].error = error.message;
      continue;
    }
    inserted += data?.length ?? 0;
  }

  const errored = summary.filter((s) => s.error).map((s) => `${s.key}: ${s.error}`);
  const status = errored.length === results.length ? "error" : errored.length > 0 ? "partial" : "ok";
  const message =
    `Found ${total} matches across ${results.length} portals. ${inserted} new.` +
    (errored.length ? ` Errors: ${errored.join("; ")}` : "");

  await sb
    .from("settings")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_message: message,
    })
    .eq("id", 1);

  return {
    ok: status !== "error",
    new_count: inserted,
    total_matches: total,
    sources: summary,
    message,
  };
}
