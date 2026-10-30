// Server-only orchestration: scrape sources (no keyword filter), AI-classify,
// dedupe, insert mattress-supply tenders, update settings.

import { scrapeAllSources } from "./tenders.server";
import { classifyTenders } from "./ai-classifier.server";
import { createServerSupabaseClient, getServerRuntimeEnv } from "./runtime-env.server";

function getServerClient() {
  const supabaseUrl = getServerRuntimeEnv("SUPABASE_URL");
  const serviceRoleKey = getServerRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Tender scanner server configuration is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createServerSupabaseClient(supabaseUrl, serviceRoleKey);
}

export interface RunResult {
  ok: boolean;
  new_count: number;
  total_matches: number;
  sources: { key: string; label: string; matches: number; error?: string }[];
  message: string;
}

async function scanStopRequested(sb: ReturnType<typeof getServerClient>): Promise<boolean> {
  const { data } = await sb.from("settings").select("last_run_status").eq("id", 1).single();
  return data?.last_run_status === "stopping" || data?.last_run_status === "stopped";
}

async function finishStoppedScan(sb: ReturnType<typeof getServerClient>): Promise<RunResult> {
  const message = "Scan stopped by administrator. No further sources or tender documents will be processed."; 
  await sb.from("settings").update({
    last_run_at: new Date().toISOString(),
    last_run_status: "stopped",
    last_run_message: message,
  }).eq("id", 1);
  return { ok: false, new_count: 0, total_matches: 0, sources: [], message };
}

export async function runTenderCheck(): Promise<RunResult> {
  const sb = getServerClient();
  const { data: settings, error: sErr } = await sb
    .from("settings")
    .select("notify_email, ai_min_confidence, ai_include_maybe, keywords, exclude_keywords, match_mode")
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

  // Use the saved keyword rules before AI processing so the deep-document
  // audit is spent on likely mattress/bedding opportunities, not every tender.
  const settingsRow = settings as {
    keywords?: string[] | null;
    exclude_keywords?: string[] | null;
    match_mode?: string | null;
  };
  const defaultKeywords = [
    "mattress", "mattresses", "foam mattress", "spring mattress", "coir mattress",
    "rubberised coir", "rubberized coir", "hospital mattress", "medical mattress",
    "orthopaedic mattress", "orthopedic mattress", "latex mattress", "folding mattress",
    "mattress cover", "mattress protector", "pillow", "pillows", "bedding", "bed linen",
    "bedsheet", "bed sheet", "bedroll", "bed roll", "sleeping mat", "sleeping mattress",
    "cot mattress", "patient mattress", "pressure relief mattress",
  ];
  const keywords = Array.isArray(settingsRow.keywords) && settingsRow.keywords.length
    ? settingsRow.keywords.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : defaultKeywords;
  const excludeKeywords = Array.isArray(settingsRow.exclude_keywords)
    ? settingsRow.exclude_keywords.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const rawMode = settingsRow.match_mode ?? "any";
  const matchMode = rawMode === "all" || rawMode === "phrase" ? rawMode : "any";
  const { results } = await scrapeAllSources({
    include: keywords,
    exclude: excludeKeywords,
    mode: matchMode,
  }, () => scanStopRequested(sb));
  if (await scanStopRequested(sb)) return finishStoppedScan(sb);

  // Persist per-portal health so users can distinguish "no matches" from a
  // website that could not be reached or parsed.
  const checkedAt = new Date().toISOString();
  const healthRows = results.map((r) => ({
    source_key: r.source.key,
    source_label: r.source.label,
    source_url: r.source.url,
    last_checked_at: checkedAt,
    last_status: r.error ? "error" : "ok",
    candidate_count: r.matches.length,
    last_error: r.error ? r.error.slice(0, 1200) : null,
  }));
  const { error: healthError } = await sb
    .from("tender_source_health")
    .upsert(healthRows, { onConflict: "source_key" });
  if (healthError) {
    console.error("[tender-runner] could not record source health:", healthError.message);
  }

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

  // Avoid spending model/document-analysis work on the same saved opportunities
  // every two hours. Chunk the lookup so PostgREST URL limits stay reasonable.
  const existingFingerprints = new Set<string>();
  const fingerprints = [...new Set(allRows.map((row) => row.fingerprint))];
  for (let offset = 0; offset < fingerprints.length; offset += 150) {
    const batch = fingerprints.slice(offset, offset + 150);
    const { data, error } = await sb
      .from("tenders")
      .select("fingerprint")
      .in("fingerprint", batch);
    if (error) {
      throw new Error(`Unable to check previously discovered tenders: ${error.message}`);
    }
    for (const row of data ?? []) {
      existingFingerprints.add((row as { fingerprint: string }).fingerprint);
    }
  }
  const freshRows = allRows.filter((row) => !existingFingerprints.has(row.fingerprint));

  // AI classification is only run on newly discovered candidates.
  let verdicts: Awaited<ReturnType<typeof classifyTenders>> = [];
  let aiError = "";
  if (freshRows.length > 0) {
    try {
      verdicts = await classifyTenders(
        freshRows.map((r) => ({
          id: r.fingerprint,
          source_label: r.source_label,
          text: `${r.title}\n${r.organisation ?? ""}\n${r.raw_excerpt}`,
        })),
      );
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
    }
  }
  if (await scanStopRequested(sb)) return finishStoppedScan(sb);
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
  const candidates: DeepRow[] = freshRows.map((row) => ({
    ...row,
    stage1: verdictMap.get(row.fingerprint) ?? {
      id: row.fingerprint,
      verdict: "maybe" as const,
      confidence: 0,
      reason: "stage-1 skipped",
    },
  }));
  // Stage 1 is used to prioritise likely mattress/bedding opportunities. Do not
  // send obvious "no" results into costly document/PDF analysis. If stage-1 is
  // unavailable, missing classifications safely remain "maybe".
  const eligibleCandidates = candidates.filter((c) => c.stage1.verdict !== "no");
  const candidateQueues = new Map<string, DeepRow[]>();
  for (const candidate of eligibleCandidates) {
    const queue = candidateQueues.get(candidate.source_key) ?? [];
    queue.push(candidate);
    candidateQueues.set(candidate.source_key, queue);
  }
  for (const queue of candidateQueues.values()) {
    queue.sort((a, b) => {
      const rank = (v: string) => (v === "yes" ? 2 : v === "maybe" ? 1 : 0);
      return rank(b.stage1.verdict) - rank(a.stage1.verdict)
        || b.stage1.confidence - a.stage1.confidence;
    });
  }
  // Cap per run to keep cost/latency bounded (deep audit downloads PDFs). Round-
  // robin across portals so a busy central source cannot consume the whole cap.
  const DEEP_CAP = 40;
  const queues = [...candidateQueues.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, queue]) => queue);
  const toDeep: DeepRow[] = [];
  while (toDeep.length < DEEP_CAP) {
    let added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        toDeep.push(next);
        added = true;
        if (toDeep.length >= DEEP_CAP) break;
      }
    }
    if (!added) break;
  }

  for (const c of toDeep) {
    if (await scanStopRequested(sb)) return finishStoppedScan(sb);
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

  if (await scanStopRequested(sb)) return finishStoppedScan(sb);

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
    if (await scanStopRequested(sb)) return finishStoppedScan(sb);
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

  const errored = summary.filter((s) => s.error).map((s) => `${s.key}: ${s.error}`);
  const status =
    errored.length === results.length ? "error" : errored.length > 0 ? "partial" : "ok";
  const message =
    `Scanned ${results.length} source pages; ${allRows.length} keyword matches (${freshRows.length} not previously saved) → deep-audited BOQ/contract docs for ${toDeep.length} → ${totalKept} kept at ≥${Math.round(minConfidence * 100)}% confidence${includeMaybe ? " (incl. maybe)" : " (yes only)"} (${inserted} new).` +
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
