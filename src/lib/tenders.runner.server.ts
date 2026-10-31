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

export function isTenderDeadlinePassed(value: string | null | undefined): boolean {
  if (!value) return false;
  let day: number;
  let month: number;
  let year: number;

  const iso = value.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else {
    const human = value.match(/\b(\d{1,2})[-/\s]+([A-Za-z]{3,9}|\d{1,2})[-/\s]+(\d{4})\b/i);
    if (!human) return false;
    day = Number(human[1]);
    year = Number(human[3]);
    const monthToken = human[2].toLowerCase();
    if (/^\d{1,2}$/.test(monthToken)) {
      month = Number(monthToken) - 1;
    } else {
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      month = monthNames.indexOf(monthToken.slice(0, 3));
    }
  }

  if (month < 0 || month > 11 || day < 1 || day > 31) return false;
  const time = value.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/i);
  let hour = time ? Number(time[1]) : 23;
  const minute = time ? Number(time[2]) : 59;
  const second = time?.[3] ? Number(time[3]) : 59;
  const meridiem = time?.[4]?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return false;
    if (meridiem === "AM") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  }
  // Government bid deadlines are published in Indian Standard Time (UTC+05:30).
  const deadlineMs = Date.UTC(year, month, day, hour, minute, second) - (330 * 60 * 1000);
  if (!Number.isFinite(deadlineMs)) return false;
  return deadlineMs < Date.now();
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
    "mattress", "mattresses", "mattress supply", "mattress set", "foam mattress",
    "PU foam mattress", "polyurethane foam mattress", "memory foam mattress",
    "rebonded foam mattress", "latex mattress", "coir mattress", "rubberised coir",
    "rubberized coir", "spring mattress", "bonnell spring mattress", "pocket spring mattress",
    "hospital mattress", "medical mattress", "patient mattress", "orthopaedic mattress",
    "orthopedic mattress", "ICU mattress", "pressure relief mattress", "pressure-relief mattress",
    "anti-decubitus mattress", "air mattress", "water mattress", "folding mattress",
    "portable mattress", "camping mattress", "hostel mattress", "cot mattress",
    "mattress cover", "mattress protector", "mattress topper", "mattress pad",
    "bed", "beds", "hospital bed", "patient bed", "ward bed", "ICU bed",
    "bunk bed", "cot", "cots", "bed frame", "bed base", "bedstead", "bed roll",
    "bedroll", "sleeping mattress", "sleeping mat", "sleeping pad", "sleeping bag",
    "pillow", "pillows", "pillow cover", "pillow case", "pillowcase", "bolster",
    "bedding", "bed linen", "bedsheet", "bed sheet", "blanket", "blankets",
    "comforter", "quilt", "quilts", "duvet", "bedspread", "hospital linen", "linen",
    "foam sheet", "PU foam", "coir mattress", "rubberised coir mattress",
    "bed sheets", "bed sheet supply", "bedsheet sets", "bed linen supply",
    "bed linen sets", "bedclothes", "bed cover", "bed covers", "pillow covers",
    "pillowcase sets", "cushion", "cushions", "mattress foam", "rubber foam",
    "HR foam", "high resilience foam", "air mattress for medical use",
    "medical air mattress", "anti bedsore mattress", "alternating pressure mattress",
    "pressure mattress", "patient transfer mattress", "surgical mattress",
    "ICU bed with mattress", "hospital bed with mattress", "medical bed with mattress",
    "cotton mattress", "cotton bed", "cotton bedsheet", "cotton bed sheet",
    "linen items", "linen supplies", "hospital bedding", "hostel bedding",
    "dormitory supplies", "sleeping equipment", "ward furniture",
    "bedside locker", "bedside cabinet",
  ];
  // Always retain the built-in mattress/bedding vocabulary and add the
  // administrator's custom terms. This makes expanded discovery effective
  // immediately, even before a database migration has been applied.
  const savedKeywords = Array.isArray(settingsRow.keywords)
    ? settingsRow.keywords.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const keywords = [...new Map(
    [...defaultKeywords, ...savedKeywords].map((term) => [term.trim().toLowerCase(), term.trim()]),
  ).values()];
  const excludeKeywords = Array.isArray(settingsRow.exclude_keywords)
    ? settingsRow.exclude_keywords.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  // Discovery is deliberately recall-first: the built-in vocabulary and
  // custom terms are OR-matched so an old "all words" preference cannot
  // accidentally require dozens of unrelated terms to appear in one row.
  // Ignore legacy strict/phrase modes during ingestion. Candidate discovery
  // must stay broad; the AI and BOQ audit perform relevance filtering later.
  const matchMode = "any" as const;
  const { results } = await scrapeAllSources({
    include: keywords,
    exclude: excludeKeywords,
    mode: matchMode,
  }, () => scanStopRequested(sb));
  if (await scanStopRequested(sb)) return finishStoppedScan(sb);

  // Persist per-portal health so users can distinguish "no matches" from a
  // website that could not be reached or parsed.
  const checkedAt = new Date().toISOString();
  const healthBySource = new Map(
    results.map((r) => [
      r.source.key,
      {
        source_key: r.source.key,
        source_label: r.source.label,
        source_url: r.source.url,
        last_checked_at: checkedAt,
        last_status: r.error ? "error" : "ok",
        candidate_count: r.matches.length,
        last_error: r.error ? r.error.slice(0, 1200) : null,
      },
    ]),
  );
  const healthRows = [...healthBySource.values()];
  const { error: healthError } = await sb
    .from("tender_source_health")
    .upsert(healthRows, { onConflict: "source_key" });
  if (healthError) {
    console.error("[tender-runner] could not record source health:", healthError.message);
  } else if (healthRows.length > 0) {
    // Remove health rows for portals that are no longer in the active scanner
    // list. Otherwise retired sources remain visible as permanent old errors.
    const activeSourceKeys = `(${healthRows.map((row) => `"${row.source_key.replace(/"/g, '\\"')}"`).join(",")})`;
    const { error: staleHealthError } = await sb
      .from("tender_source_health")
      .delete()
      .not("source_key", "in", activeSourceKeys);
    if (staleHealthError) {
      console.error("[tender-runner] could not prune retired source health:", staleHealthError.message);
    }
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
  const expiredCount = allRows.filter((row) => isTenderDeadlinePassed(row.closing_at)).length;
  const actionableRows = allRows.filter((row) => !isTenderDeadlinePassed(row.closing_at));
  const freshRows = actionableRows.filter((row) => !existingFingerprints.has(row.fingerprint));

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
  // Stage 1 is a ranking hint, never a hard exclusion. A title-only model
  // can miss a relevant BOQ line item, so even "no" candidates remain in the
  // rotating queue at lower priority for eventual document-level verification.
  const eligibleCandidates = candidates;
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
  // Cap per run to keep cost/latency bounded (deep audit downloads PDFs).
  // Rotate each portal's queue by the two-hour scheduler slot so candidates
  // beyond the per-run cap are not starved forever by the same first 40 rows.
  const DEEP_CAP = 40;
  const scanSlot = Math.floor(Date.now() / (2 * 60 * 60 * 1000));
  const queues = [...candidateQueues.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, queue]) => {
      if (queue.length > 1) {
        const offset = (scanSlot * DEEP_CAP) % queue.length;
        queue.push(...queue.splice(0, offset));
      }
      return queue;
    });
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

  // Run two detail/BOQ audits concurrently. This reduces serial waiting while
  // keeping provider load and per-request memory bounded.
  const docErrors: string[] = [];
  for (let offset = 0; offset < toDeep.length; offset += 2) {
    if (await scanStopRequested(sb)) return finishStoppedScan(sb);
    const batch = toDeep.slice(offset, offset + 2);
    await Promise.all(batch.map(async (c) => {
      if (await scanStopRequested(sb)) return;
      if (!c.tender_url) {
        c.deep = {
          verdict: c.stage1.verdict,
          confidence: c.stage1.confidence,
          reason: `No detail URL; stage-1 only: ${c.stage1.reason}`,
          docs_checked: 0,
        };
        return;
      }
      try {
        c.deep = await deepClassifyTender({
          title: c.title,
          organisation: c.organisation ?? null,
          source_label: c.source_label,
          tender_url: c.tender_url,
        });
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        docErrors.push(reason);
        c.deep = {
          verdict: "maybe",
          confidence: 0,
          reason: `Deep check failed: ${reason.slice(0, 240)}`,
          docs_checked: 0,
        };
      }
    }));
    if (await scanStopRequested(sb)) return finishStoppedScan(sb);
  }
  const contentFailures = toDeep
    .filter((row) => row.deep?.reason && /^(Detail page unreachable|Doc-AI unavailable)/i.test(row.deep.reason))
    .map((row) => row.source_label + ": " + row.deep!.reason);
  docCheckErr = [...new Set([...docErrors, ...contentFailures])].slice(0, 6).join("; ").slice(0, 1_200);

  if (await scanStopRequested(sb)) return finishStoppedScan(sb);

  // Keep deep verdict per user threshold + maybe inclusion setting.
  const bySource = new Map<string, DeepRow[]>();
  for (const c of toDeep) {
    if (!c.deep) continue;
    const v = c.deep.verdict;
    const conf = c.deep.confidence ?? 0;
    const verifiedClosing = c.deep.closing_at ?? c.closing_at;
    // Search indexes retain historical PDFs. Use the deadline extracted from
    // the actual tender detail document, not just the search snippet.
    if (isTenderDeadlinePassed(verifiedClosing)) continue;
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
        closing_at: d.closing_at ?? m.closing_at ?? null,
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
      const dashboardUrl = process.env.SITE_URL || "https://tenders.zizzmattress.com";
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
  const processingErrors = Boolean(aiError || docCheckErr);
  const status =
    errored.length === results.length && results.length > 0
      ? "error"
      : errored.length > 0 || processingErrors
        ? "partial"
        : "ok";
  const message =
    `Scanned ${results.length} source pages; ${allRows.length} keyword matches (${expiredCount} already-expired excluded before audit; ${freshRows.length} actionable and not previously saved) → deep-audited BOQ/contract docs for ${toDeep.length} → ${totalKept} kept at ≥${Math.round(minConfidence * 100)}% confidence after document-level deadline checks${includeMaybe ? " (incl. maybe)" : " (yes only)"} (${inserted} new).` +
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
