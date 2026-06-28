// Server-only orchestration: scrape sources, dedupe, insert new tenders, update settings.
import { createClient } from "@supabase/supabase-js";
import { scrapeAllSources } from "./tenders.server";

function getServerClient() {
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
    .select("keywords, exclude_keywords, match_mode, notify_email")
    .eq("id", 1)
    .single();
  if (sErr) throw new Error(sErr.message);
  const include = (settings?.keywords as string[]) ?? [];
  const exclude = (settings?.exclude_keywords as string[]) ?? [];
  const mode = ((settings?.match_mode as string) ?? "any") as "any" | "all" | "phrase";
  const notifyEmail = (settings?.notify_email as string | null) ?? null;
  if (include.length === 0) {
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

  const { results } = await scrapeAllSources({ include, exclude, mode });


  let total = 0;
  let inserted = 0;
  const summary: RunResult["sources"] = [];
  const newTenders: Array<{
    title: string;
    source_label: string;
    organisation: string | null;
    published_at: string | null;
    closing_at: string | null;
    tender_url: string | null;
    matched_keywords: string[];
  }> = [];

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
    const { data, error } = await sb
      .from("tenders")
      .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id, fingerprint");
    if (error) {
      summary[summary.length - 1].error = error.message;
      continue;
    }
    inserted += data?.length ?? 0;
    const insertedFps = new Set(
      (data ?? []).map((d: { fingerprint: string }) => d.fingerprint),
    );
    for (const m of r.matches) {
      if (insertedFps.has(m.fingerprint)) {
        newTenders.push({
          title: m.title,
          source_label: r.source.label,
          organisation: m.organisation ?? null,
          published_at: m.published_at ?? null,
          closing_at: m.closing_at ?? null,
          tender_url: m.tender_url ?? null,
          matched_keywords: m.matched_keywords,
        });
      }
    }
  }

  // Instant email alert when new tenders were inserted.
  let emailNote = "";
  if (inserted > 0 && notifyEmail && notifyEmail.includes("@")) {
    try {
      const { sendTenderEmail } = await import("./email-send.server");
      const dashboardUrl = process.env.SITE_URL || "https://tenderwatch.lovable.app";
      const result = await sendTenderEmail({
        templateName: "tender-alert",
        recipientEmail: notifyEmail,
        idempotencyKey: `tender-alert-${Date.now()}-${inserted}`,
        templateData: {
          totalNew: inserted,
          dashboardUrl,
          tenders: newTenders,
        },
      });
      emailNote = result.ok
        ? ` Email queued to ${notifyEmail}.`
        : ` Email skipped: ${result.reason}.`;
    } catch (e) {
      emailNote = ` Email error: ${e instanceof Error ? e.message : String(e)}.`;
    }
  }

  const errored = summary.filter((s) => s.error).map((s) => `${s.key}: ${s.error}`);
  const status =
    errored.length === results.length ? "error" : errored.length > 0 ? "partial" : "ok";
  const message =
    `Found ${total} matches across ${results.length} portals. ${inserted} new.` +
    emailNote +
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
