// Server-only helpers for scraping Indian government tender portals via Firecrawl.
// Never import from client-reachable code.
import { getServerRuntimeEnv } from "./runtime-env.server";

export interface TenderSource {
  key: string;
  label: string;
  url: string;
}

// Keep public discovery focused on active procurement opportunities. Cancelled and archived listings are deliberately excluded to reduce stale alerts.
// Other public NIC portal menus help catch active items that are not visible on the front-page feed.
type PortalMenu = { key: string; label: string; path: string };

const NIC_MENUS: PortalMenu[] = [
  // The NIC active-tender page is CAPTCHA-gated on many installations.
  // Use the publicly rendered homepage tender feed for this source.
  { key: "latest_active", label: "Latest Public Tender Feed", path: "" },
  { key: "by_location", label: "Tenders by Location", path: "FrontEndTendersByLocation" },
  { key: "by_organisation", label: "Tenders by Organisation", path: "FrontEndTendersByOrganisation" },
  { key: "by_classification", label: "Tenders by Classification", path: "FrontEndTendersByClassification" },
  { key: "by_value", label: "Tenders by Value", path: "FrontEndAdvancedSearch" },
  { key: "mse_tenders", label: "MSE Tenders", path: "FrontEndMSETendersView" },
];

function buildPortal(
  keyPrefix: string,
  labelPrefix: string,
  base: string,
): TenderSource[] {
  return NIC_MENUS.map((m) => ({
    key: `${keyPrefix}__${m.key}`,
    label: `${labelPrefix} — ${m.label}`,
    url: m.path ? `${base}?page=${m.path}&service=page` : `${base}?service=restart`,
  }));
}

const NIC_STATE_PORTALS: Array<{ key: string; label: string; base: string }> = [
  { key: "andaman_nicobar", label: "Andaman & Nicobar eProcurement", base: "https://eprocure.andamannicobar.gov.in/nicgep/app" },
  { key: "arunachal", label: "Arunachal Pradesh eTenders", base: "https://arunachaltenders.gov.in/nicgep/app" },
  { key: "assam", label: "Assam eTenders", base: "https://assamtenders.gov.in/nicgep/app" },
  { key: "chandigarh", label: "Chandigarh eTenders", base: "https://etenders.chd.nic.in/nicgep/app" },
  { key: "dadra_nagar_haveli", label: "Dadra & Nagar Haveli eTenders", base: "https://dnhtenders.gov.in/nicgep/app" },
  { key: "daman_diu", label: "Daman & Diu eTenders", base: "https://ddtenders.gov.in/nicgep/app" },
  { key: "delhi", label: "Delhi Government Procurement", base: "https://govtprocurement.delhi.gov.in/nicgep/app" },
  { key: "goa", label: "Goa eProcurement", base: "https://eprocure.goa.gov.in/nicgep/app" },
  { key: "haryana", label: "Haryana eTenders", base: "https://etenders.hry.nic.in/nicgep/app" },
  { key: "himachal", label: "Himachal Pradesh eTenders", base: "https://hptenders.gov.in/nicgep/app" },
  { key: "jammu_kashmir", label: "Jammu & Kashmir eTenders", base: "https://jktenders.gov.in/nicgep/app" },
  { key: "jharkhand", label: "Jharkhand eTenders", base: "https://jharkhandtenders.gov.in/nicgep/app" },
  { key: "kerala", label: "Kerala eTenders", base: "https://etenders.kerala.gov.in/nicgep/app" },
  { key: "ladakh", label: "Ladakh eProcurement", base: "https://tenders.ladakh.gov.in/nicgep/app" },
  { key: "lakshadweep", label: "Lakshadweep eTenders", base: "https://tendersutl.gov.in/nicgep/app" },
  { key: "madhya_pradesh", label: "Madhya Pradesh eProcurement", base: "https://mptenders.gov.in/nicgep/app" },
  { key: "maharashtra", label: "Maharashtra eTenders", base: "https://mahatenders.gov.in/nicgep/app" },
  { key: "manipur", label: "Manipur eProcurement", base: "https://manipurtenders.gov.in/nicgep/app" },
  { key: "meghalaya", label: "Meghalaya eProcurement", base: "https://meghalayatenders.gov.in/nicgep/app" },
  { key: "mizoram", label: "Mizoram eProcurement", base: "https://mizoramtenders.gov.in/nicgep/app" },
  { key: "nagaland", label: "Nagaland eProcurement", base: "https://nagalandtenders.gov.in/nicgep/app" },
  { key: "odisha", label: "Odisha eTenders", base: "https://tendersodisha.gov.in/nicgep/app" },
  { key: "punjab", label: "Punjab eProcurement", base: "https://eproc.punjab.gov.in/nicgep/app" },
  { key: "puducherry", label: "Puducherry eTenders", base: "https://pudutenders.gov.in/nicgep/app" },
  { key: "rajasthan", label: "Rajasthan eProcurement", base: "https://eproc.rajasthan.gov.in/nicgep/app" },
  { key: "sikkim", label: "Sikkim eTenders", base: "https://sikkimtender.gov.in/nicgep/app" },
  { key: "tamil_nadu", label: "Tamil Nadu eTenders", base: "https://tntenders.gov.in/nicgep/app" },
  { key: "tripura", label: "Tripura eTenders", base: "https://tripuratenders.gov.in/nicgep/app" },
  { key: "uttar_pradesh", label: "Uttar Pradesh eTenders", base: "https://etender.up.nic.in/nicgep/app" },
  { key: "uttarakhand", label: "Uttarakhand eTenders", base: "https://uktenders.gov.in/nicgep/app" },
  { key: "west_bengal", label: "West Bengal eTenders", base: "https://wbtenders.gov.in/nicgep/app" },
  { key: "west_bengal_sdc", label: "West Bengal State Data Centre Tenders", base: "https://tenders.wb.gov.in/nicgep/app" },
];

const OTHER_GOVERNMENT_PORTALS: TenderSource[] = [
  { key: "gem", label: "Government e-Marketplace (GeM) — All Bids", url: "https://bidplus.gem.gov.in/all-bids" },
  { key: "gem_global", label: "GeM — Global Tender Bids", url: "https://bidplus-global.gem.gov.in/" },
  { key: "bihar", label: "Bihar Government Tenders", url: "https://www.bihartenders.com/" },
  { key: "gujarat_nprocure", label: "Gujarat NProcure", url: "https://tender.nprocure.com/" },
  { key: "karnataka", label: "Karnataka Public Procurement Portal", url: "https://kppp.karnataka.gov.in/" },
  { key: "gujarat_tenders", label: "Gujarat Tenders", url: "https://www.gujarattenders.in/" },
  { key: "goa_tenderwizard", label: "Goa TenderWizard", url: "https://www.tenderwizard.com/ROOTAPP/GOA.jsp?company=GOA" },
  { key: "defence", label: "Defence eProcurement", url: "https://defproc.gov.in/nicgep/app?service=restart" },
  { key: "bhel", label: "BHEL eProcurement", url: "https://eprocurebhel.co.in/" },
  { key: "bel", label: "BEL eProcurement", url: "https://eprocurebel.co.in/" },
  { key: "coal_india", label: "Coal India eTenders", url: "https://coalindiatenders.nic.in/nicgep/app?service=restart" },
  { key: "cpcl", label: "Chennai Petroleum (CPCL) eTenders", url: "https://cpcletenders.nic.in/nicgep/app?service=restart" },
  { key: "grse", label: "Garden Reach Shipbuilders (GRSE) eProcurement", url: "https://eprocuregrse.co.in/" },
  { key: "goa_shipyard", label: "Goa Shipyard eTenders", url: "https://eprocuregsl.nic.in/nicgep/app?service=restart" },
  { key: "hindustan_shipyard", label: "Hindustan Shipyard eTenders", url: "https://eprocurehsl.nic.in/nicgep/app?service=restart" },
  { key: "indianoil", label: "IndianOil eTenders", url: "https://iocletenders.nic.in/nicgep/app?service=restart" },
  { key: "mazagon_dock", label: "Mazagon Dock eTenders", url: "https://eprocuremdl.nic.in/nicgep/app?service=restart" },
  { key: "midhani", label: "MIDHANI eTenders", url: "https://eprocuremidhani.nic.in/nicgep/app?service=restart" },
  { key: "ntpc", label: "NTPC eTenders", url: "https://eprocurentpc.nic.in/nicgep/app?service=restart" },
  { key: "beml", label: "BEML eProcurement", url: "https://eprocurebeml.nic.in/nicgep/app?service=restart" },
  { key: "pmgsy", label: "PMGSY eProcurement", url: "https://www.pmgsytenders.gov.in/nicgep/app?service=restart" },
  { key: "andhra_pradesh", label: "Andhra Pradesh eProcurement", url: "https://tender.apeprocurement.gov.in/" },
  { key: "telangana", label: "Telangana State eProcurement", url: "https://tender.telangana.gov.in/" },
  { key: "chhattisgarh", label: "Chhattisgarh eProcurement", url: "http://eproc.cgstate.gov.in/" },
];

export const TENDER_SOURCES: TenderSource[] = [
  // Broad menu coverage on the three highest-priority portals.
  ...buildPortal(
    "cppp",
    "Central Public Procurement Portal",
    "https://eprocure.gov.in/eprocure/app",
  ),
  ...buildPortal(
    "etenders_central",
    "eTenders India",
    "https://etenders.gov.in/eprocure/app",
  ),
  ...buildPortal(
    "kerala",
    "Kerala eTenders",
    "https://etenders.kerala.gov.in/nicgep/app",
  ),
  // One active-tender listing per additional NIC e-procurement portal keeps
  // national coverage broad without multiplying every portal by seven menus.
  ...NIC_STATE_PORTALS.map((portal) => ({
    key: `${portal.key}__latest_active`,
    label: `${portal.label} — Latest Active Tenders`,
    url: `${portal.base}?service=restart`,
  })),
  ...OTHER_GOVERNMENT_PORTALS,
];

interface ScrapeOk {
  ok: true;
  markdown: string;
}
interface ScrapeErr {
  ok: false;
  error: string;
}

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
async function directFetchFallback(url: string): Promise<ScrapeOk | ScrapeErr> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      return { ok: false, error: `Direct HTML fallback failed (${res.status}).` };
    }

    const html = await res.text();
    const markdown = html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, " [$2]($1) ")
      .replace(/<tr\b[^>]*>/gi, "\n| ")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<\/(tr|p)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim();

    if (!markdown) {
      return { ok: false, error: "Direct HTML fallback returned an empty page." };
    }
    return { ok: true, markdown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Direct HTML fallback failed: ${reason.slice(0, 240)}` };
  } finally {
    clearTimeout(timeoutId);
  }
}


/**
 * One-page, value-free diagnostic for the exact scraper module used by scans.
 * Never returns the Firecrawl key or raw portal contents.
 */
export async function diagnoseFirecrawlScraper(): Promise<{
  keyConfigured: boolean;
  cooldownActiveAtStart: boolean;
  cooldownSecondsAtStart: number;
  ok: boolean;
  markdownChars: number;
  error?: string;
}> {
  const keyConfigured = Boolean(getServerRuntimeEnv("FIRECRAWL_API_KEY"));
  // The scanner no longer uses a cross-source cooldown; each 429 is isolated
  // to the source that received it so subsequent portal requests still run.
  const cooldownMs = 0;
  const result = await firecrawlScrape(
    "https://eprocure.gov.in/eprocure/app?page=FrontEndLatestActiveTenders&service=page",
  );
  return {
    keyConfigured,
    cooldownActiveAtStart: cooldownMs > 0,
    cooldownSecondsAtStart: Math.ceil(cooldownMs / 1000),
    ok: result.ok,
    markdownChars: result.ok ? result.markdown.length : 0,
    ...(!result.ok ? { error: result.error.slice(0, 300) } : {}),
  };
}

async function firecrawlScrape(url: string, shouldStop?: () => Promise<boolean>): Promise<ScrapeOk | ScrapeErr> {
  // Read from the server runtime binding first, with process.env as fallback.
  // Lovable's deployed Nitro/Cloudflare runtime does not always permit writes to
  // process.env, so reading process.env alone can falsely report a missing key.
  const fcKey = getServerRuntimeEnv("FIRECRAWL_API_KEY");
  if (!fcKey) {
    return directFetchFallback(url);
  }

  let stopPoll: ReturnType<typeof setInterval> | undefined;
  try {
    const controller = new AbortController();
    if (shouldStop) {
      stopPoll = setInterval(() => {
        void shouldStop().then((stop) => { if (stop) controller.abort("Tender scan stopped by administrator"); }).catch(() => undefined);
      }, 750);
    }
    let res: Response | undefined;
    let json: unknown = null;
    let responseText = "";

    // Firecrawl may return 429 during bursts. Respect Retry-After and use
    // bounded exponential backoff instead of immediately hammering the API
    // or making a slow direct request for every throttled portal.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (shouldStop && await shouldStop()) {
        return { ok: false, error: "Scan stopped by administrator." };
      }
      res = await fetch(FIRECRAWL_SCRAPE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fcKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 2500,
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
      });
      responseText = await res.text().catch(() => "");
      try {
        json = responseText ? JSON.parse(responseText) : null;
      } catch {
        json = { message: responseText.slice(0, 200) };
      }

      if (res.status !== 429 && res.status < 500) break;
      if (attempt === 2) break;

      const retryAfter = res.headers.get("retry-after");
      const retryAfterSeconds = retryAfter
        ? (Number.isFinite(Number(retryAfter))
            ? Number(retryAfter)
            : Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000))
        : 0;
      // Retry-After is authoritative: never shorten the provider's requested wait.
      const backoffMs = retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 2_000 * (2 ** attempt);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, backoffMs);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve(undefined);
        }, { once: true });
      });
      if (controller.signal.aborted) {
        return { ok: false, error: "Scan stopped by administrator." };
      }
    }

    if (stopPoll) clearInterval(stopPoll);
    if (!res) return { ok: false, error: "Firecrawl request was not started." };

    if (!res.ok) {
      const firecrawlError =
        res.status === 401 || res.status === 403
          ? `Firecrawl authentication failed (${res.status}).`
          : res.status === 402
            ? "Firecrawl credits/quota exhausted (402)."
            : res.status === 429
              ? "Firecrawl rate limit persisted after 3 attempts (429)."
              : `Firecrawl request failed (${res.status}): ${JSON.stringify(json).slice(0, 240)}`;

      // Do not bypass Firecrawl with a direct request on auth, quota, or
      // rate-limit responses. Those are provider/account issues, not portal
      // failures; a direct fallback here only creates misleading timeouts.
      if (res.status === 401 || res.status === 403 || res.status === 402 || res.status === 429) {
        return { ok: false, error: firecrawlError };
      }

      // Direct HTML fallback is reserved for provider/server failures.
      const fallback = await directFetchFallback(url);
      if (fallback.ok && fallback.markdown.length > 0) return fallback;
      return {
        ok: false,
        error: `${firecrawlError} Direct fallback: ${fallback.error ?? "no page content"}`,
      };
    }

    const obj = json as { data?: { markdown?: string }; markdown?: string; success?: boolean };
    const markdown = obj?.data?.markdown ?? obj?.markdown ?? "";
    if (obj?.success === false || typeof markdown !== "string" || markdown.length === 0) {
      return { ok: false, error: "Firecrawl returned no markdown content for this page." };
    }
    return { ok: true, markdown };
  } catch (error) {
    const reason =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") && shouldStop && await shouldStop()
        ? "Scan stopped by administrator."
        : error instanceof Error && error.name === "TimeoutError"
        ? "Firecrawl request timed out after 45 seconds."
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, error: reason };
  }
}

export interface ParsedTender {
  title: string;
  organisation?: string;
  published_at?: string;
  closing_at?: string;
  tender_url?: string;
  matched_keywords: string[];
  raw_excerpt: string;
  fingerprint: string;
}

function sha1(input: string): string {
  // Cheap, fast non-crypto hash – fine for dedupe fingerprints.
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export type MatchMode = "any" | "all" | "phrase";

export interface MatchOptions {
  include: string[];
  exclude: string[];
  mode: MatchMode;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termForms(term: string): string[] {
  const cleaned = term.trim().toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ");
  if (!cleaned) return [];
  const forms = new Set([cleaned, cleaned.replace(/-/g, " ")]);
  const parts = cleaned.split(" ");
  const last = parts[parts.length - 1];
  const stem = parts.slice(0, -1).join(" ");
  if (last) {
    if (last.endsWith("ies") && last.length > 4) {
      forms.add([stem, last.slice(0, -3) + "y"].filter(Boolean).join(" "));
    } else if (/(sses|shes|ches|xes)$/.test(last)) {
      forms.add([stem, last.slice(0, -2)].filter(Boolean).join(" "));
    } else if (last.endsWith("s") && !last.endsWith("ss")) {
      forms.add([stem, last.slice(0, -1)].filter(Boolean).join(" "));
    } else if (/(ss|ch|sh|x|z)$/.test(last)) {
      forms.add([stem, last + "es"].filter(Boolean).join(" "));
    } else if (last.endsWith("y") && last.length > 1) {
      forms.add([stem, last.slice(0, -1) + "ies"].filter(Boolean).join(" "));
    } else {
      forms.add(cleaned + "s");
    }
  }
  return [...forms].filter(Boolean);
}

export function termHits(text: string, term: string, mode: MatchMode): boolean {
  const variants = termForms(term);
  if (variants.length === 0) return false;
  if (mode === "phrase") return variants.some((variant) => text.includes(variant));
  return variants.some((variant) => {
    const escaped = variant.split(" ").map(escapeRe).join("[\\s_-]+");
    const re = new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i");
    return re.test(text);
  });
}

function findKeywordMatches(text: string, opts: MatchOptions): string[] {
  const lower = text.toLowerCase();

  // Exclusions always use word-boundary match; any hit disqualifies the row.
  for (const ex of opts.exclude) {
    const e = ex.trim().toLowerCase();
    if (!e) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(e)}([^a-z0-9]|$)`, "i");
    if (re.test(lower)) return [];
  }

  const hits: string[] = [];
  for (const kw of opts.include) {
    if (termHits(lower, kw, opts.mode)) hits.push(kw);
  }
  if (hits.length === 0) return [];
  if (opts.mode === "all") {
    // every non-empty include term must hit
    const required = opts.include.filter((k) => k.trim().length > 0);
    if (hits.length < required.length) return [];
  }
  return [...new Set(hits)];
}


/**
 * Parse a markdown blob from a tender listing page into candidate rows.
 * These portals render tables that Firecrawl converts to markdown tables or
 * pipe-separated lines. We split into chunks (paragraphs / table rows) and
 * keep anything mentioning a configured keyword.
 */
export function parseListing(
  source: TenderSource,
  markdown: string,
  opts?: MatchOptions,
): ParsedTender[] {
  if (!markdown) return [];
  const lines = markdown
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: string[] = [];
  let buf: string[] = [];
  for (const line of lines) {
    if (line.startsWith("|") || line.startsWith("- ") || /^\d+\./.test(line)) {
      if (buf.length) {
        rows.push(buf.join(" "));
        buf = [];
      }
      rows.push(line);
    } else {
      buf.push(line);
      if (buf.length >= 3) {
        rows.push(buf.join(" "));
        buf = [];
      }
    }
  }
  if (buf.length) rows.push(buf.join(" "));

  // Keep the public listing header semantics so a Bid Opening Date is never
  // confused with the Bid Submission Closing Date.
  const tableHeaderLine = lines.find((line) =>
    line.startsWith("|")
    && /tender title|title/i.test(line)
    && /(closing date|bid end date|submission end)/i.test(line),
  );
  const tableHeaders = tableHeaderLine
    ? tableHeaderLine.split("|").map((cell) => cell.trim().toLowerCase()).filter(Boolean)
    : [];
  const publishedHeaderIndex = tableHeaders.findIndex((cell) => /published date|publish date/i.test(cell));
  const closingHeaderIndex = tableHeaders.findIndex((cell) => /closing date|bid end date|submission end/i.test(cell));

  const out: ParsedTender[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.length < 20) continue;

    let matches: string[] = [];
    if (opts) {
      matches = findKeywordMatches(row, opts);
      if (matches.length === 0) continue;
    }

    const linkMatch = row.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const titleFromLink = linkMatch?.[1];
    let tender_url: string | undefined;
    if (linkMatch?.[2]) {
      try {
        const resolved = new URL(linkMatch[2], source.url);
        if (resolved.protocol === "https:" || resolved.protocol === "http:") {
          tender_url = resolved.href;
        }
      } catch {
        // Ignore malformed or non-web links; the source URL remains available.
      }
    }

    const cells = row.startsWith("|")
      ? row.split("|").map((c) => c.trim()).filter((c) => c.length > 0)
      : null;

    let published_at: string | undefined;
    let closing_at: string | undefined;
    let title = titleFromLink ?? row;
    let organisation: string | undefined;

    if (cells && cells.length >= 2) {
      const dateRe = /\d{1,2}[-/](?:\d{1,2}|[A-Za-z]{3,9})[-/]\d{2,4}/;
      const dates = cells.filter((c) => dateRe.test(c));
      if (closingHeaderIndex >= 0 && dateRe.test(cells[closingHeaderIndex] ?? "")) {
        closing_at = cells[closingHeaderIndex];
        published_at = publishedHeaderIndex >= 0 && dateRe.test(cells[publishedHeaderIndex] ?? "")
          ? cells[publishedHeaderIndex]
          : undefined;
      } else {
        published_at = dates[0];
        closing_at = dates.length >= 3 ? dates[1] : dates.length >= 2 ? dates[1] : dates[0];
      }
      const linkCell = cells.find((c) => /\[[^\]]+\]\(/.test(c));
      const longestCell = [...cells].sort((a, b) => b.length - a.length)[0];
      const t = linkCell ?? longestCell;
      const tLink = t?.match(/\[([^\]]+)\]\(/);
      title = tLink?.[1] ?? t ?? title;
      organisation = cells.find(
        (c) => c !== t && !dateRe.test(c) && c.length > 8 && !/^\d+$/.test(c),
      );
    }

    title = title.replace(/\s+/g, " ").trim().slice(0, 500);
    if (title.length < 10) continue;
    const fingerprint = sha1(`${source.key}|${title}|${published_at ?? ""}`);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    out.push({
      title,
      organisation,
      published_at,
      closing_at,
      tender_url,
      matched_keywords: matches,
      raw_excerpt: row.slice(0, 800),
      fingerprint,
    });
  }
  return out;
}

// Run scrapes with limited concurrency so 20+ menu pages don't fan out all at
// once (Firecrawl throttles + Worker CPU budget).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

interface FirecrawlBatchItem {
  markdown?: string;
  url?: string;
  metadata?: {
    url?: string;
    sourceURL?: string;
    statusCode?: number;
    error?: string;
  };
  error?: string;
}

interface FirecrawlBatchStatus {
  status?: string;
  total?: number;
  completed?: number;
  data?: FirecrawlBatchItem[];
  next?: string | null;
}

function canonicalScrapeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

function batchRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter
    ? Number.isFinite(Number(retryAfter))
      ? Number(retryAfter)
      : Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000)
    : 0;
  return Math.min(30_000, Math.max(1_500, seconds > 0 ? seconds * 1000 : 2_000 * (2 ** attempt)));
}

async function readFirecrawlJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text().catch(() => "");
  try {
    return body ? JSON.parse(body) as Record<string, unknown> : {};
  } catch {
    return { error: body.slice(0, 500) };
  }
}

/**
 * Run the portal set as one asynchronous Firecrawl job. This avoids holding
 * the Lovable webhook open for dozens of individual scrape requests.
 */
async function scrapeSourcesWithBatch(
  sources: TenderSource[],
  shouldStop?: () => Promise<boolean>,
): Promise<Map<string, ScrapeOk | ScrapeErr>> {
  const key = getServerRuntimeEnv("FIRECRAWL_API_KEY");
  // Prefer a bounded, no-credit HTML fetch. Firecrawl is the recovery path for
  // portals that block direct requests, require browser rendering, or expose
  // a page shell without a parseable tender listing.
  const directItems = await mapWithConcurrency(sources, 12, async (source) => {
    if (shouldStop && await shouldStop()) {
      return { url: canonicalScrapeUrl(source.url), result: { ok: false as const, error: "Scan stopped by administrator." }, needsBrowser: false };
    }
    const url = canonicalScrapeUrl(source.url);
    const fetched = await directFetchFallback(source.url);
    if (!fetched.ok) return { url, result: fetched, needsBrowser: true };
    const challenge = isPortalChallengePage(fetched.markdown);
    const publicTenderRows = hasPublicTenderRows(source, fetched.markdown);
    if (challenge || !publicTenderRows) {
      return {
        url,
        result: { ok: false as const, error: challenge ?? "Direct HTML loaded but no public tender rows could be parsed." },
        needsBrowser: true,
      };
    }
    return { url, result: fetched, needsBrowser: false };
  });

  const baseResults = new Map<string, ScrapeOk | ScrapeErr>();
  for (const item of directItems) baseResults.set(item.url, item.result);
  const pendingUrls = [...new Set(directItems.filter((item) => item.needsBrowser).map((item) => item.url))];
  if (shouldStop && await shouldStop()) {
    for (const url of pendingUrls) baseResults.set(url, { ok: false, error: "Scan stopped by administrator." });
    return baseResults;
  }
  if (pendingUrls.length === 0) return baseResults;
  if (!key) return baseResults;

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + key,
  };
  const batchUrl = "https://api.firecrawl.dev/v2/batch/scrape";
  let startResponse: Response | undefined;
  let startJson: Record<string, unknown> = {};

  for (let attempt = 0; attempt < 3; attempt++) {
    if (shouldStop && await shouldStop()) {
      return new Map([...baseResults, ...pendingUrls.map((url) => [url, { ok: false as const, error: "Scan stopped by administrator." }] as const)]);
    }
    startResponse = await fetch(batchUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        urls: pendingUrls,
        ignoreInvalidURLs: true,
        formats: [{ type: "markdown" }],
        onlyMainContent: true,
        maxAge: 0,
        waitFor: 1_000,
        timeout: 30_000,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    startJson = await readFirecrawlJson(startResponse);
    if (startResponse.status !== 429 || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, batchRetryDelayMs(startResponse!, attempt)));
  }

  if (!startResponse || !startResponse.ok) {
    const status = startResponse ? startResponse.status : 0;
    const detail = String(startJson.error ?? startJson.message ?? "").slice(0, 240);
    const reason = status === 401 || status === 403
      ? "Firecrawl authentication failed (" + status + ")."
      : status === 402
        ? "Firecrawl credits/quota exhausted (402)."
        : status === 429
          ? "Firecrawl batch start was rate-limited after retries (429)."
          : "Firecrawl batch start failed (" + status + "): " + detail;
    return new Map([...baseResults, ...pendingUrls.map((url) => [url, { ok: false as const, error: reason }] as const)]);
  }

  const batchId = typeof startJson.id === "string" ? startJson.id : "";
  if (!batchId) {
    const reason = "Firecrawl batch response did not include a job id: " + String(startJson.error ?? "unknown response").slice(0, 200);
    return new Map([...baseResults, ...pendingUrls.map((url) => [url, { ok: false as const, error: reason }] as const)]);
  }

  const statusUrl = "https://api.firecrawl.dev/v2/batch/scrape/" + encodeURIComponent(batchId);
  const deadline = Date.now() + 220_000;
  let batch: FirecrawlBatchStatus = {};
  let terminal = false;

  while (Date.now() < deadline) {
    if (shouldStop && await shouldStop()) {
      await fetch(statusUrl, { method: "DELETE", headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
      return new Map([...baseResults, ...pendingUrls.map((url) => [url, { ok: false as const, error: "Scan stopped by administrator." }] as const)]);
    }

    const response = await fetch(statusUrl, {
      method: "GET",
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(20_000),
    });
    const json = await readFirecrawlJson(response);
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, batchRetryDelayMs(response, 0)));
      continue;
    }
    if (!response.ok) {
      const reason = "Firecrawl batch status failed (" + response.status + "): " + String(json.error ?? "").slice(0, 200);
      return new Map([...baseResults, ...pendingUrls.map((url) => [url, { ok: false as const, error: reason }] as const)]);
    }

    batch = json as FirecrawlBatchStatus;
    if (batch.status === "completed" || batch.status === "failed" || batch.status === "cancelled") {
      terminal = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }

  const items: FirecrawlBatchItem[] = Array.isArray(batch.data) ? [...batch.data] : [];
  let next = batch.next ?? null;
  let pagesFetched = 0;
  while (next && pagesFetched < 20) {
    let nextUrl: URL;
    try {
      nextUrl = new URL(next, statusUrl);
    } catch {
      break;
    }
    if (nextUrl.hostname !== "api.firecrawl.dev" || !nextUrl.pathname.startsWith("/v2/batch/scrape/")) break;
    const response = await fetch(nextUrl, {
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) break;
    const page = await readFirecrawlJson(response) as FirecrawlBatchStatus;
    if (Array.isArray(page.data)) items.push(...page.data);
    next = page.next ?? null;
    pagesFetched++;
  }

  const byUrl = new Map<string, FirecrawlBatchItem>();
  items.forEach((item, index) => {
    const rawUrl = item.metadata?.sourceURL ?? item.metadata?.url ?? item.url ?? pendingUrls[index];
    if (rawUrl) byUrl.set(canonicalScrapeUrl(rawUrl), item);
  });

  const results = new Map<string, ScrapeOk | ScrapeErr>(baseResults);
  const fallbackCandidates: string[] = [];

  for (const url of pendingUrls) {
    const item = byUrl.get(url);
    const markdown = typeof item?.markdown === "string" ? item.markdown : "";
    if (markdown.trim().length > 0) {
      results.set(url, { ok: true, markdown });
      continue;
    }

    const statusCode = item?.metadata?.statusCode ?? 0;
    const error = item?.metadata?.error ?? item?.error ?? "";
    if (statusCode >= 500) {
      fallbackCandidates.push(url);
      results.set(url, { ok: false, error: "Firecrawl portal fetch failed (" + statusCode + "): " + (error || "server error") });
    } else if (statusCode === 429) {
      results.set(url, { ok: false, error: "Firecrawl batch item was rate-limited (429)." });
    } else if (!terminal) {
      results.set(url, { ok: false, error: "Firecrawl batch job did not finish within the scan time budget." });
    } else {
      results.set(url, { ok: false, error: "Firecrawl returned no content for this portal" + (error ? ": " + error.slice(0, 200) : ".") });
    }
  }

  // Use direct HTML only for portal/server 5xx failures, never to bypass
  // Firecrawl authentication, quota or rate-limit responses.
  const fallback = await mapWithConcurrency(fallbackCandidates, 2, async (url) => ({
    url,
    result: await directFetchFallback(url),
  }));
  for (const item of fallback) {
    if (item.result.ok && item.result.markdown.length > 0) {
      results.set(item.url, item.result);
    } else {
      const previous = results.get(item.url);
      const suffix = item.result.ok ? "empty page" : item.result.error;
      results.set(item.url, {
        ok: false,
        error: (previous && !previous.ok ? previous.error : "Firecrawl portal fetch failed.") + " Direct fallback: " + suffix,
      });
    }
  }

  return results;
}

interface FirecrawlWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface FirecrawlSearchPayload {
  success?: boolean;
  data?: { web?: FirecrawlWebResult[] };
  error?: string;
}

function isOfficialProcurementHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "bidplus.gem.gov.in"
    || host.endsWith(".gov.in")
    || host === "gov.in"
    || host.endsWith(".nic.in")
    || host === "nic.in"
    || host.endsWith(".edu.in")
    || host.endsWith(".ac.in")
    || host === "aiims.edu"
    || host.endsWith(".nprocure.com");
}

export function extractDateNearLabel(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const index = text.toLowerCase().indexOf(label.toLowerCase());
    if (index < 0) continue;
    const excerpt = text.slice(index, index + 180);
    const human = excerpt.match(/(\d{1,2})[-/\s]+([A-Za-z]{3,9}|\d{1,2})[-/\s]+(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?))?/i);
    if (human) return human[1] + "-" + human[2] + "-" + human[3] + (human[4] ? " " + human[4].trim() : "");
    const iso = excerpt.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (iso) return iso[3] + "-" + iso[2] + "-" + iso[1];
  }
  return undefined;
}

function searchResultTenderTitle(title: string, description: string): string {
  const combined = title + "\n" + description;
  const labelled = combined.match(/(?:Tender Title|Work Description|Title)\s*[:|]\s*[*_"]*([^|\n*"]{10,220})/i);
  if (labelled?.[1]) return labelled[1].replace(/\s+/g, " ").trim().slice(0, 500);
  const procurement = description.match(/(?:procurement|purchase|supply) of [^\|\n.]{8,180}/i);
  if (procurement?.[0]) return procurement[0].replace(/\s+/g, " ").trim().slice(0, 500);
  return title.replace(/^\s*\[(?:PDF|DOCX?|XLSX?)\]\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 500);
}

/**
 * A second discovery path for official procurement pages. This is deliberately
 * separate from portal scraping: public search indexes can expose tender PDFs
 * whose source portals are CAPTCHA-gated or client-rendered. Search matches
 * remain candidates only; the existing AI/document audit still decides
 * whether an opportunity is actually relevant.
 */
async function searchOfficialTenderIndex(
  opts: MatchOptions,
  shouldStop?: () => Promise<boolean>,
): Promise<{ source: TenderSource; matches: ParsedTender[]; error?: string }[]> {
  const apiKey = getServerRuntimeEnv("FIRECRAWL_API_KEY");
  const searchSource: TenderSource = {
    key: "official_tender_index",
    label: "Official procurement search index",
    url: "https://www.firecrawl.dev/",
  };
  if (!apiKey) {
    return [{ source: searchSource, matches: [], error: "FIRECRAWL_API_KEY is not configured; indexed discovery is unavailable." }];
  }
  if (shouldStop && await shouldStop()) {
    return [{ source: searchSource, matches: [], error: "Scan stopped by administrator." }];
  }

  // Search one focused official-domain segment per scheduler slot. This
  // spreads indexed discovery across GeM, central NIC feeds, state/PSU sites
  // and government institutions without consuming the whole monthly search
  // allowance on every two-hour scan.
  const querySegments = [
    'site:bidplus.gem.gov.in (mattress OR mattresses OR "bed mattress" OR "hospital mattress" OR "ICU mattress" OR "coir mattress" OR "foam mattress" OR "air mattress" OR "bed sheets" OR bedsheets OR pillow OR bedding) (bid OR tender)',
    '(site:eprocure.gov.in OR site:etenders.gov.in OR site:etenders.kerala.gov.in) (mattress OR "bed sheet" OR bedsheet OR pillow OR bedding OR "hospital bed") (tender OR procurement)',
    '(site:gov.in OR site:nic.in OR site:edu.in OR site:ac.in) (mattress OR "bed sheets" OR bedsheets OR pillow OR bedding OR "ICU bed") (tender OR "Bid End Date") India',
    '(site:gov.in OR site:nic.in OR site:nprocure.com) ("coir mattress" OR "rubberised coir" OR "foam mattress" OR "air mattress" OR "hospital linen" OR "linen supplies") (tender OR bid) India',
  ];
  const searchSlot = Math.floor(Date.now() / (2 * 60 * 60 * 1000));
  const query = querySegments[searchSlot % querySegments.length];
  let response: Response;
  try {
    response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        query,
        sources: ["web"],
        country: "IN",
        tbs: "qdr:y",
        limit: 5,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return [{ source: searchSource, matches: [], error: "Official tender index request failed: " + (error instanceof Error ? error.message : String(error)).slice(0, 260) }];
  }

  const responseText = await response.text().catch(() => "");
  let payload: FirecrawlSearchPayload = {};
  try {
    payload = responseText ? JSON.parse(responseText) as FirecrawlSearchPayload : {};
  } catch {
    payload = { error: responseText.slice(0, 260) };
  }
  if (!response.ok || payload.success === false) {
    const reason = response.status === 401 || response.status === 403
      ? "Firecrawl search authentication failed (" + response.status + ")."
      : response.status === 402
        ? "Firecrawl search quota exhausted (402)."
        : response.status === 429
          ? "Firecrawl search was rate-limited (429)."
          : "Firecrawl search failed (" + response.status + "): " + String(payload.error ?? "").slice(0, 220);
    return [{ source: searchSource, matches: [], error: reason }];
  }

  const byHost = new Map<string, { source: TenderSource; matches: ParsedTender[] }>();
  for (const item of payload.data?.web ?? []) {
    if (!item.url) continue;
    let url: URL;
    try { url = new URL(item.url); } catch { continue; }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (!isOfficialProcurementHost(url.hostname)) continue;

    const title = item.title ?? "";
    const description = item.description ?? "";
    const searchable = (title + "\n" + description).slice(0, 5000);
    const matched = findKeywordMatches(searchable.toLowerCase(), opts);
    if (matched.length === 0) continue;
    const tenderEvidence = /tender|bid|procurement|bid end date|tender id|bid number/i.test(searchable);
    const tenderDocumentPath = /showbidDocument|bidding\/bid|\/tenders?\/|tenderStore|attachments\/tenderfile|nicgep\/app|eprocure\/app/i.test(url.pathname);
    if (!tenderEvidence && !tenderDocumentPath) continue;

    const host = url.hostname.toLowerCase();
    let group = byHost.get(host);
    if (!group) {
      group = {
        source: {
          key: "index_" + sha1(host),
          label: "Official procurement search — " + host,
          url: url.origin + "/",
        },
        matches: [],
      };
      byHost.set(host, group);
    }

    const tenderId = searchable.match(/\bGEM\/\d{4}\/B\/\d+\b/i)?.[0]
      ?? searchable.match(/\b\d{4}_[A-Z0-9]+_\d+_\d+\b/i)?.[0]
      ?? url.href;
    const fingerprint = sha1(host + "|" + tenderId.toLowerCase());
    if (group.matches.some((row) => row.fingerprint === fingerprint)) continue;

    group.matches.push({
      title: searchResultTenderTitle(title, description) || title || host,
      matched_keywords: matched,
      published_at: extractDateNearLabel(searchable, ["Published Date", "Published on", "Dated"]),
      closing_at: extractDateNearLabel(searchable, ["Bid End Date/Time", "Bid End Date", "Bid Submission End Date", "Closing Date"]),
      tender_url: url.href,
      raw_excerpt: searchable.slice(0, 800),
      fingerprint,
    });
  }

  const grouped = [...byHost.values()];
  return grouped.length ? grouped : [{ source: searchSource, matches: [] }];
}

function hasExplicitEmptyTenderResult(markdown: string): boolean {
  return /no (?:active )?(?:tenders|bids|records|results) found|no records available|no data available|no active tenders available/i.test(markdown);
}

export function hasPublicTenderRows(source: TenderSource, markdown: string): boolean {
  if (hasExplicitEmptyTenderResult(markdown)) return true;
  const parsed = parseListing(source, markdown);
  if (parsed.some((row) => Boolean(row.published_at || row.closing_at))) return true;
  const hasTenderId =
    new RegExp("\\bGEM/\\d{4}/B/\\d+\\b", "i").test(markdown)
    || new RegExp("\\b\\d{4}_[A-Z0-9]+_\\d+_\\d+\\b", "i").test(markdown);
  if (hasTenderId) return true;
  const linkPattern = new RegExp("\\[([^\\]]+)\\]\\((https?://[^)]+)\\)", "g");
  const links = [...markdown.matchAll(linkPattern)];
  const tenderLinks = links.filter((match) => /tender|bid|notice|supply|procure|purchase/i.test(match[1]));
  return /tender title|bid number|tender reference number/i.test(markdown) && tenderLinks.length > 0;
}
export function isPortalChallengePage(markdown: string): string | null {
  const lower = markdown.toLowerCase();
  if (lower.includes("provide captcha and click on search button to list all active tenders")
    || (lower.includes("enter captcha") && lower.includes("active tenders") && lower.includes("tender title"))) {
    return "Portal returned a CAPTCHA-gated tender list; this route did not expose public tender rows.";
  }
  if ((lower.includes("enable javascript") || lower.includes("javascript is required"))
    && !lower.includes("tender title")) {
    return "Portal returned a JavaScript-only shell; no server-rendered tender rows were available.";
  }
  return null;
}

export async function scrapeAllSources(
  opts?: MatchOptions,
  shouldStop?: () => Promise<boolean>,
): Promise<{
  results: { source: TenderSource; matches: ParsedTender[]; error?: string }[];
}> {
  const sources = [...new Map(TENDER_SOURCES.map((source) => [source.key, source])).values()];
  const scrapedByUrl = await scrapeSourcesWithBatch(sources, shouldStop);
  const raw = sources.map((source) => {
    const scraped = scrapedByUrl.get(canonicalScrapeUrl(source.url));
    if (!scraped) {
      return { source, matches: [] as ParsedTender[], error: "Firecrawl batch returned no result for this portal." };
    }
    if (!scraped.ok) {
      return { source, matches: [] as ParsedTender[], error: scraped.error };
    }
    const challenge = isPortalChallengePage(scraped.markdown);
    if (challenge) {
      return { source, matches: [] as ParsedTender[], error: challenge };
    }
    if (!hasPublicTenderRows(source, scraped.markdown)) {
      return {
        source,
        matches: [] as ParsedTender[],
        error: "Page was reachable but contained no extractable public tender rows; zero matches cannot be verified.",
      };
    }
    return { source, matches: parseListing(source, scraped.markdown, opts) };
  });

  // Indexed official-source discovery complements direct portal feeds, catching
  // notices and PDFs that are not rendered on public listing pages.
  if (opts) {
    try {
      raw.push(...await searchOfficialTenderIndex(opts, shouldStop));
    } catch (error) {
      raw.push({
        source: {
          key: "official_tender_index",
          label: "Official procurement search index",
          url: "https://www.firecrawl.dev/",
        },
        matches: [],
        error: "Indexed tender discovery failed: " + (error instanceof Error ? error.message : String(error)).slice(0, 260),
      });
    }
  }

  // Cross-menu dedupe: the same tender shows up under Latest, By Location,
  // By Organisation etc. Keep the first occurrence keyed on a normalised title.
  const seenTitles = new Set<string>();
  const results = raw.map((r) => {
    const kept = r.matches.filter((m) => {
      const norm = m.title.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });
    return { ...r, matches: kept };
  });
  return { results };
}

export interface RawScrapeResult {
  source: TenderSource;
  ok: boolean;
  error?: string;
  markdown: string;
  markdown_chars: number;
  parsed: ParsedTender[];
}

/**
 * Debug variant: returns the raw markdown returned by Firecrawl for each
 * source (truncated to `markdownChars`) alongside the parsed rows.
 */
export async function scrapeAllSourcesRaw(
  opts?: MatchOptions,
  markdownChars = 6000,
): Promise<{ results: RawScrapeResult[] }> {
  const results = await mapWithConcurrency(TENDER_SOURCES, 4, async (source) => {
    const scraped = await firecrawlScrape(source.url);
    if (!scraped.ok) {
      return {
        source,
        ok: false as const,
        error: scraped.error,
        markdown: "",
        markdown_chars: 0,
        parsed: [] as ParsedTender[],
      };
    }
    return {
      source,
      ok: true as const,
      markdown: scraped.markdown.slice(0, markdownChars),
      markdown_chars: scraped.markdown.length,
      parsed: parseListing(source, scraped.markdown, opts),
    };
  });
  return { results };
}




