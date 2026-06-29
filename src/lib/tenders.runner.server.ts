// Server-only orchestration: scrape sources (no keyword filter), AI-classify,
// dedupe, insert mattress-supply tenders, update settings.
import { createClient } from "@supabase/supabase-js";
import { scrapeAllSources } from "./tenders.server";
import { classifyTenders } from "./ai-classifier.server";

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
    .select("notify_email")
    .eq("id", 1)
    .single();
  if (sErr) throw new Error(sErr.message);
  const notifyEmail = (settings?.notify_email as string | null) ?? null;

  // Scrape ALL rows from each portal (no keyword pre-filter).
  const { results } = await scrapeAllSources();

  // Flatten rows for AI classification.
  type Row = (typeof results)[number]["matches"][number] & {
    source_key: string;
    source_url: string;
    source_label: string;
  };
  const allRows: Row[] = [];
  const summary: RunResult["sources"] = [];
  for (const r of results) {
    summary.push({
      key: r.source.key,
      label: r.source.label,
      matches: 0,
      error: r.error,
    });
    for (const m of r.matches) {
      allRows.push({
        ...m,
        source_key: r.source.key,
        source_url: r.source.url,
        source_label: r.source.label,
      });
    }
  }

  // AI classification.
  let verdicts: Awaited<ReturnType<typeof classifyTenders>> = [];
  let aiError = "";
  if (allRows.length > 0) {
    try {
      verdicts = await classifyTenders(
        allRows.map((r) => ({
          id: r.fingerprint,
          source_label: r.source_label,
          text: `${r.title}\n${r.organisation ?? ""}\n${r.raw_excerpt}`,
        })),
      );
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
    }
  }
  const verdictMap = new Map(verdicts.map((v) => [v.id, v]));

  // Stage 1 candidates (drop hard "no"); stage 2 inspects docs.
  let inserted = 0;
  let totalKept = 0;
  let docCheckErr = "";
  const newTenders: Array<{
    title: string;
    source_label: string;
    organisation: string | null;
    published_at: string | null;
    closing_at: string | null;
    tender_url: string | null;
    matched_keywords: string[];
  }> = [];

  // Run deep doc-classification on stage-1 yes/maybe candidates.
  const { deepClassifyTender } = await import("./doc-classifier.server");
  type DeepRow = Row & {
    stage1: (typeof verdicts)[number];
    deep?: Awaited<ReturnType<typeof deepClassifyTender>>;
  };
  const candidates: DeepRow[] = [];
  for (const row of allRows) {
    const v = verdictMap.get(row.fingerprint);
    if (!v || v.verdict === "no") continue;
    candidates.push({ ...row, stage1: v });
  }
  // Cap to a reasonable number per run to keep cost/latency bounded.
  const DEEP_CAP = 15;
  const toDeep = candidates.slice(0, DEEP_CAP);
  for (const c of toDeep) {
    if (!c.tender_url) {
      // No detail URL — keep stage-1 verdict but mark as not doc-verified.
      c.deep = {
        verdict: c.stage1.verdict,
        confidence: c.stage1.confidence,
        reason: `No detail URL; stage-1 only: ${c.stage1.reason}`,
        docs_checked: 0,
      };
      continue;
    }
    try {
      c.deep = await deepClassifyTender({
        title: c.title,
        organisation: c.organisation ?? null,
        source_label: c.source_label,
        tender_url: c.tender_url,
      });
    } catch (e) {
      docCheckErr = e instanceof Error ? e.message : String(e);
      c.deep = {
        verdict: "maybe",
        confidence: 0,
        reason: `Deep check failed: ${docCheckErr}`,
        docs_checked: 0,
      };
    }
  }

  // Keep only deep verdict === "yes" (doc-confirmed).
  const bySource = new Map<string, DeepRow[]>();
  for (const c of toDeep) {
    if (!c.deep || c.deep.verdict !== "yes") continue;
    totalKept++;
    const arr = bySource.get(c.source_key) ?? [];
    arr.push(c);
    bySource.set(c.source_key, arr);
  }

  for (let i = 0; i < summary.length; i++) {
    const sKey = summary[i].key;
    const kept = bySource.get(sKey) ?? [];
    summary[i].matches = kept.length;
    if (kept.length === 0) continue;

    const rows = kept.map((m) => {
      const d = m.deep!;
      return {
        source: m.source_key,
        source_url: m.source_url,
        fingerprint: m.fingerprint,
        title: m.title,
        organisation: m.organisation ?? null,
        published_at: m.published_at ?? null,
        closing_at: m.closing_at ?? null,
        tender_url: m.tender_url ?? null,
        matched_keywords: d.category ? [d.category] : m.matched_keywords,
        raw_excerpt: m.raw_excerpt,
        ai_verdict: d.verdict,
        ai_reason: d.reason,
        ai_confidence: d.confidence,
        stage1_verdict: m.stage1.verdict,
        docs_checked: d.docs_checked,
        doc_excerpt: d.excerpt ?? null,
      };
    });

    const { data, error } = await sb
      .from("tenders")
      .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id, fingerprint");
    if (error) {
      summary[i].error = (summary[i].error ? summary[i].error + "; " : "") + error.message;
      continue;
    }
    inserted += data?.length ?? 0;
    const insertedFps = new Set(
      (data ?? []).map((d: { fingerprint: string }) => d.fingerprint),
    );
    for (const m of kept) {
      if (insertedFps.has(m.fingerprint)) {
        const d = m.deep!;
        newTenders.push({
          title: m.title,
          source_label: m.source_label,
          organisation: m.organisation ?? null,
          published_at: m.published_at ?? null,
          closing_at: m.closing_at ?? null,
          tender_url: m.tender_url ?? null,
          matched_keywords: d.category ? [d.category] : m.matched_keywords,
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
    `Scanned ${allRows.length} tenders, AI kept ${totalKept} as mattress-related (${inserted} new).` +
    (aiError ? ` AI error: ${aiError}.` : "") +
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
    total_matches: totalKept,
    sources: summary,
    message,
  };
}
