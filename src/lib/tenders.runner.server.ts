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
    .select("notify_email, ai_min_confidence, ai_include_maybe")
    .eq("id", 1)
    .single();
  if (sErr) throw new Error(sErr.message);
  const notifyEmail = (settings?.notify_email as string | null) ?? null;
  const minConfidence = Number(
    (settings as { ai_min_confidence?: number } | null)?.ai_min_confidence ?? 0.6,
  );
  const includeMaybe = Boolean(
    (settings as { ai_include_maybe?: boolean } | null)?.ai_include_maybe ?? false,
  );

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

  // Deep BOQ audit runs on EVERY scraped tender, regardless of stage-1 title
  // verdict. Stage-1 is kept only as an informational hint; the authoritative
  // decision comes from reading the tender's actual BOQ/contract documents.
  const { deepClassifyTender } = await import("./doc-classifier.server");
  type DeepRow = Row & {
    stage1: (typeof verdicts)[number];
    deep?: Awaited<ReturnType<typeof deepClassifyTender>>;
  };
  const candidates: DeepRow[] = allRows.map((row) => ({
    ...row,
    stage1: verdictMap.get(row.fingerprint) ?? {
      id: row.fingerprint,
      verdict: "maybe" as const,
      confidence: 0,
      reason: "stage-1 skipped",
    },
  }));
  // Skip repeated AI review: tenders already saved in the database were
  // audited when first seen — don't spend Firecrawl/AI credits on them again.
  const fingerprints = candidates.map((c) => c.fingerprint);
  const knownFps = new Set<string>();
  if (fingerprints.length > 0) {
    const { data: existing } = await sb
      .from("tenders")
      .select("fingerprint")
      .in("fingerprint", fingerprints);
    for (const row of existing ?? []) {
      knownFps.add((row as { fingerprint: string }).fingerprint);
    }
  }
  const fresh = candidates.filter((c) => !knownFps.has(c.fingerprint));
  const skippedKnown = candidates.length - fresh.length;

  // Cap per run to keep cost/latency bounded (deep audit downloads PDFs).
  const DEEP_CAP = 40;
  const toDeep = fresh.slice(0, DEEP_CAP);

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

  // Keep deep verdict per user threshold + maybe inclusion setting.
  const bySource = new Map<string, DeepRow[]>();
  for (const c of toDeep) {
    if (!c.deep) continue;
    const v = c.deep.verdict;
    const conf = c.deep.confidence ?? 0;
    const verdictOk = v === "yes" || (includeMaybe && v === "maybe");
    if (!verdictOk) continue;
    if (conf < minConfidence) continue;
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
      const dashboardUrl = process.env.SITE_URL || "https://kip-tender-alert.lovable.app";
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

  // Record per-portal health so the dashboard can show which sources are
  // reachable and how many candidates each produced on the last run.
  const nowIso = new Date().toISOString();
  const healthRows = summary.map((s) => ({
    source_key: s.key,
    source_label: s.label,
    source_url:
      results.find((r) => r.source.key === s.key)?.source.url ?? "",
    last_checked_at: nowIso,
    last_status: s.error ? "error" : "ok",
    candidate_count: s.matches,
    last_error: s.error ?? null,
    updated_at: nowIso,
  }));
  if (healthRows.length > 0) {
    const { error: hErr } = await sb
      .from("tender_source_health")
      .upsert(healthRows, { onConflict: "source_key" });
    if (hErr) console.error("[tender-health] upsert failed:", hErr.message);
  }

  const errored = summary.filter((s) => s.error).map((s) => `${s.key}: ${s.error}`);
  const status =
    errored.length === results.length ? "error" : errored.length > 0 ? "partial" : "ok";
  const message =
    `Scanned ${allRows.length} tenders (${skippedKnown} already saved, skipped re-review) → deep-audited BOQ/contract docs for ${toDeep.length} → ${totalKept} kept at ≥${Math.round(minConfidence * 100)}% confidence${includeMaybe ? " (incl. maybe)" : " (yes only)"} (${inserted} new).` +
    (aiError ? ` Stage-1 error: ${aiError}.` : "") +
    (docCheckErr ? ` Doc-check error: ${docCheckErr}.` : "") +
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
