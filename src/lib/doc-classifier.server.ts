// Server-only: fetch a tender's detail page + attached BOQ/contract docs, then
// re-classify with Gemini reading the actual document text (PDF understanding).
import { getServerRuntimeEnv } from "./runtime-env.server";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const DEEP_SYSTEM = `You are auditing a single Indian government tender by reading its
detail page and attached documents (BOQ / tender notice / contract / schedule).
Decide whether the tender's SCOPE OF SUPPLY includes mattresses or directly
related bedding products: coir/foam/spring/hospital/ICU/air mattresses, mattress
covers and protectors, bed sheets/bedsheets, bed linen, pillow and pillow covers,
bolsters, blankets, quilts, bedding kits and bed-rolls. Also count hospital or
patient beds ONLY when a mattress is explicitly included in the supply scope.
Hospital beds as furniture alone DO NOT count.

Return strict JSON: {"verdict":"yes|no|maybe","confidence":0-1,"reason":"<=30 words","category":"<short tag>","excerpt":"<<=240 chars quote from the doc that justifies the verdict>"}`;

export interface DeepInput {
  title: string;
  organisation: string | null;
  source_label: string;
  tender_url: string;
}

export interface DeepResult {
  verdict: "yes" | "no" | "maybe";
  confidence: number;
  reason: string;
  category?: string;
  excerpt?: string;
  docs_checked: number;
  closing_at?: string;
}

interface FirecrawlOk {
  ok: true;
  markdown: string;
  links: string[];
}
interface FirecrawlErr {
  ok: false;
  error: string;
}

async function firecrawl(url: string): Promise<FirecrawlOk | FirecrawlErr> {
  const key = getServerRuntimeEnv("FIRECRAWL_API_KEY");
  if (!key) {
    return {
      ok: false,
      error: "FIRECRAWL_API_KEY is not available to the deployed server runtime. Verify the Lovable project secret and publish the latest source.",
    };
  }
  try {
    const res = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "links"],
        parsers: ["pdf"],
        onlyMainContent: true,
        waitFor: 2500,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const json = (await res.json().catch(() => null)) as
      | { data?: { markdown?: string; links?: string[] }; markdown?: string; links?: string[] }
      | null;
    if (!res.ok) {
      return {
        ok: false,
        error: `Firecrawl ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`,
      };
    }
    return {
      ok: true,
      markdown: json?.data?.markdown ?? json?.markdown ?? "",
      links: json?.data?.links ?? json?.links ?? [],
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const DOC_EXT_RE = /\.(pdf|doc|docx|xls|xlsx)(?:$|[?#])/i;

function pickDocLinks(markdown: string, links: string[]): string[] {
  const all = new Set<string>();
  for (const l of links) {
    if (DOC_EXT_RE.test(l)) all.add(l);
  }
  // Also harvest from markdown body (Firecrawl `links` is sometimes empty).
  const mdLinks = [...markdown.matchAll(/\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  for (const l of mdLinks) {
    if (DOC_EXT_RE.test(l)) all.add(l);
  }
  // Prefer ones whose URL/anchor mentions BOQ / tender / notice / spec.
  const ranked = [...all].sort((a, b) => {
    const score = (u: string) => {
      const s = u.toLowerCase();
      let n = 0;
      if (/boq/.test(s)) n += 5;
      if (/tender|nit|notice/.test(s)) n += 3;
      if (/spec|schedule|annex/.test(s)) n += 2;
      if (/\.pdf/.test(s)) n += 1;
      return -n;
    };
    return score(a) - score(b);
  });
  return ranked.slice(0, 3);
}

const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 MB per doc

async function downloadDoc(
  url: string,
): Promise<{ ok: true; base64: string; mime: string; size: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_DOC_BYTES) return { ok: false, error: "too large" };
    const lower = url.toLowerCase();
    const mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      (lower.endsWith(".pdf")
        ? "application/pdf"
        : lower.endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : lower.endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/octet-stream");
    // Convert ArrayBuffer → base64 (Workers-safe).
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(bin);
    return { ok: true, base64, mime, size: buf.byteLength };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface ContentBlock {
  type: string;
  text?: string;
  file?: { filename: string; file_data: string };
}

async function geminiDeepClassify(
  ctx: { title: string; org: string | null; source: string; pageText: string },
  docs: { filename: string; mime: string; base64: string }[],
): Promise<DeepResult> {
  const key = getServerRuntimeEnv("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not available to the deployed server runtime.");

  const userBlocks: ContentBlock[] = [
    {
      type: "text",
      text:
        `TENDER:\n  Title: ${ctx.title}\n  Org: ${ctx.org ?? "?"}\n  Portal: ${ctx.source}\n\n` +
        `DETAIL PAGE (markdown, truncated):\n${ctx.pageText.slice(0, 12000)}\n\n` +
        `Documents attached: ${docs.length}. Read them and decide.`,
    },
  ];
  for (const d of docs) {
    // Gemini supports PDF natively; non-PDF Office docs can still be sent and
    // will be best-effort. If the provider rejects, we fall back below.
    userBlocks.push({
      type: "file",
      file: {
        filename: d.filename,
        file_data: `data:${d.mime};base64,${d.base64}`,
      },
    });
  }

  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: DEEP_SYSTEM },
      { role: "user", content: userBlocks },
    ],
    response_format: { type: "json_object" as const },
  };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    return {
      verdict: "maybe",
      confidence: 0,
      reason: `Doc-AI unavailable (${res.status}): ${errTxt.slice(0, 120)}`,
      docs_checked: docs.length,
    };
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: Partial<DeepResult> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const v =
    parsed.verdict === "yes" || parsed.verdict === "no" || parsed.verdict === "maybe"
      ? parsed.verdict
      : "maybe";
  return {
    verdict: v,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    reason: (parsed.reason ?? "").toString().slice(0, 300),
    category: parsed.category?.toString().slice(0, 80),
    excerpt: parsed.excerpt?.toString().slice(0, 280),
    docs_checked: docs.length,
  };
}

function extractTenderClosingDate(markdown: string): string | undefined {
  const labels = [
    "Bid End Date/Time",
    "Bid End Date",
    "Bid Submission End Date",
    "Bid Submission Closing Date",
    "Closing Date",
  ];
  const lower = markdown.toLowerCase();
  for (const label of labels) {
    const index = lower.indexOf(label.toLowerCase());
    if (index < 0) continue;
    const match = markdown.slice(index, index + 220).match(/(\d{1,2})[-/]([A-Za-z]{3,9}|\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?))?/i);
    if (match) return match[1] + "-" + match[2] + "-" + match[3] + (match[4] ? " " + match[4].trim() : "");
  }
  return undefined;
}

export async function deepClassifyTender(input: DeepInput): Promise<DeepResult> {
  // 1. Scrape the tender detail page.
  const page = await firecrawl(input.tender_url);
  if (!page.ok) {
    return {
      verdict: "maybe",
      confidence: 0,
      reason: `Detail page unreachable: ${page.error}`,
      docs_checked: 0,
    };
  }

  // 2. Find document links (BOQ / tender notice / contract).
  const discoveredDocUrls = pickDocLinks(page.markdown, page.links);
  let directTenderDocument: string[] = [];
  try {
    const detailUrl = new URL(input.tender_url);
    if (/showbidDocument|documentdownload/i.test(detailUrl.pathname)) {
      directTenderDocument = [detailUrl.href];
    }
  } catch {
    // Ignore malformed tender URLs; the detail-page fetch has already failed
    // safely if the URL is not valid.
  }
  const docUrls = [...new Set([...directTenderDocument, ...discoveredDocUrls])].slice(0, 3);

  // 3. Download what we can.
  const docs: { filename: string; mime: string; base64: string }[] = [];
  for (const u of docUrls) {
    const d = await downloadDoc(u);
    if (!d.ok) continue;
    // Skip clearly-non-document types we can't parse cheaply (e.g. .zip).
    if (!/^application\/(pdf|vnd\.|msword|octet-stream)/.test(d.mime)) continue;
    const name = u.split("/").pop()?.split("?")[0] || "doc";
    docs.push({ filename: name, mime: d.mime, base64: d.base64 });
    if (docs.length >= 3) break;
  }

  // 4. Classify (with whatever docs we got, or just the page text if none).
  const classification = await geminiDeepClassify(
    {
      title: input.title,
      org: input.organisation,
      source: input.source_label,
      pageText: page.markdown,
    },
    docs,
  );
  return {
    ...classification,
    closing_at: extractTenderClosingDate(page.markdown),
  };
}

export interface DeepDebugResult {
  result: DeepResult;
  page_ok: boolean;
  page_error?: string;
  page_markdown: string; // truncated
  discovered_doc_urls: string[];
  docs_used: { filename: string; mime: string; size_bytes: number }[];
}

/**
 * Debug variant of deepClassifyTender: same pipeline but also returns the
 * intermediate artefacts (scraped detail-page markdown, discovered doc links,
 * documents actually sent to the model) so a caller can see WHY a verdict
 * came out the way it did.
 */
export async function deepClassifyTenderDebug(
  input: DeepInput,
  opts?: { pageChars?: number },
): Promise<DeepDebugResult> {
  const page = await firecrawl(input.tender_url);
  if (!page.ok) {
    return {
      result: {
        verdict: "maybe",
        confidence: 0,
        reason: `Detail page unreachable: ${page.error}`,
        docs_checked: 0,
      },
      page_ok: false,
      page_error: page.error,
      page_markdown: "",
      discovered_doc_urls: [],
      docs_used: [],
    };
  }

  const discoveredDocUrls = pickDocLinks(page.markdown, page.links);
  let directTenderDocument: string[] = [];
  try {
    const detailUrl = new URL(input.tender_url);
    if (/showbidDocument|documentdownload/i.test(detailUrl.pathname)) {
      directTenderDocument = [detailUrl.href];
    }
  } catch {
    // Ignore malformed tender URLs; the detail-page fetch has already failed
    // safely if the URL is not valid.
  }
  const docUrls = [...new Set([...directTenderDocument, ...discoveredDocUrls])].slice(0, 3);
  const docs: { filename: string; mime: string; base64: string; size: number }[] = [];
  for (const u of docUrls) {
    const d = await downloadDoc(u);
    if (!d.ok) continue;
    if (!/^application\/(pdf|vnd\.|msword|octet-stream)/.test(d.mime)) continue;
    const name = u.split("/").pop()?.split("?")[0] || "doc";
    docs.push({ filename: name, mime: d.mime, base64: d.base64, size: d.size });
    if (docs.length >= 3) break;
  }

  const result = await geminiDeepClassify(
    {
      title: input.title,
      org: input.organisation,
      source: input.source_label,
      pageText: page.markdown,
    },
    docs.map((d) => ({ filename: d.filename, mime: d.mime, base64: d.base64 })),
  );

  return {
    result,
    page_ok: true,
    page_markdown: page.markdown.slice(0, opts?.pageChars ?? 4000),
    discovered_doc_urls: docUrls,
    docs_used: docs.map((d) => ({ filename: d.filename, mime: d.mime, size_bytes: d.size })),
  };
}

