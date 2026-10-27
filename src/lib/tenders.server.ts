// Server-only helpers for scraping Indian government tender portals via Firecrawl.
// Never import from client-reachable code.

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl";

export interface TenderSource {
  key: string;
  label: string;
  url: string;
}

// Each portal exposes several menu pages (Latest Active Tenders, Tenders by
// Location, Tenders by Organisation, Tenders by Classification, Tenders by
// Value, MSE tenders, Archived / Cancelled). We hit each menu so the AI sees
// listings across all classifications, not just the homepage's "latest" list.
type PortalMenu = { key: string; label: string; path: string };

const NIC_MENUS: PortalMenu[] = [
  { key: "latest_active", label: "Latest Active Tenders", path: "FrontEndLatestActiveTenders" },
  { key: "by_location", label: "Tenders by Location", path: "FrontEndTendersByLocation" },
  { key: "by_organisation", label: "Tenders by Organisation", path: "FrontEndTendersByOrganisation" },
  { key: "by_classification", label: "Tenders by Classification", path: "FrontEndTendersByClassification" },
  { key: "by_value", label: "Tenders by Value", path: "FrontEndAdvancedSearch" },
  { key: "mse_tenders", label: "MSE Tenders", path: "FrontEndMSETendersView" },
  { key: "cancelled", label: "Cancelled Tenders", path: "FrontEndCancelledTenders" },
];

function buildPortal(
  keyPrefix: string,
  labelPrefix: string,
  base: string,
): TenderSource[] {
  return NIC_MENUS.map((m) => ({
    key: `${keyPrefix}__${m.key}`,
    label: `${labelPrefix} — ${m.label}`,
    url: `${base}?page=${m.path}&service=page`,
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
  { key: "gujarat_nprocure", label: "Gujarat NProcure", url: "https://jmc.nprocure.com/asp/home/new_home_tenders.asp" },
  { key: "karnataka", label: "Karnataka eProcurement", url: "https://eproc.karnataka.gov.in/" },
  { key: "gujarat_tenders", label: "Gujarat Tenders", url: "https://www.gujarattenders.in/" },
  { key: "goa_tenderwizard", label: "Goa TenderWizard", url: "https://www.tenderwizard.com/ROOTAPP/GOA.jsp?company=GOA" },
  { key: "defence", label: "Defence eProcurement", url: "https://defproc.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "bhel", label: "BHEL eProcurement", url: "https://eprocurebhel.co.in/" },
  { key: "bel", label: "BEL eProcurement", url: "https://eprocurebel.co.in/" },
  { key: "coal_india", label: "Coal India eTenders", url: "https://coalindiatenders.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "cpcl", label: "Chennai Petroleum (CPCL) eTenders", url: "https://cpcletenders.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "grse", label: "Garden Reach Shipbuilders (GRSE) eProcurement", url: "https://eprocuregrse.co.in/" },
  { key: "goa_shipyard", label: "Goa Shipyard eTenders", url: "https://eprocuregsl.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "hindustan_shipyard", label: "Hindustan Shipyard eTenders", url: "https://eprocurehsl.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "indianoil", label: "IndianOil eTenders", url: "https://iocletenders.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "mazagon_dock", label: "Mazagon Dock eTenders", url: "https://eprocuremdl.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "midhani", label: "MIDHANI eTenders", url: "https://eprocuremidhani.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "ntpc", label: "NTPC eTenders", url: "https://eprocurentpc.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "beml", label: "BEML eProcurement", url: "https://eprocurebeml.nic.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
  { key: "pmgsy", label: "PMGSY eProcurement", url: "https://www.pmgsytenders.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page" },
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
    url: `${portal.base}?page=FrontEndLatestActiveTenders&service=page`,
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

async function firecrawlScrape(url: string): Promise<ScrapeOk | ScrapeErr> {
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) {
    return { ok: false, error: "Missing FIRECRAWL_API_KEY" };
  }
  try {
    const res = await fetch(`https://api.firecrawl.dev/v2/scrape`, {
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
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `Firecrawl ${res.status}: ${JSON.stringify(json)?.slice(0, 300)}` };
    }
    const obj = json as { data?: { markdown?: string }; markdown?: string };
    const md = obj?.data?.markdown ?? obj?.markdown ?? "";
    return { ok: true, markdown: md };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
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

function termHits(text: string, term: string, mode: MatchMode): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  if (mode === "phrase") {
    // exact substring (case-insensitive); multi-word allowed
    return text.includes(t);
  }
  // word-boundary-ish for 'any' and 'all'
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`, "i");
  return re.test(text);
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
function parseListing(
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

  const out: ParsedTender[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.length < 20) continue;

    let matches: string[] = [];
    if (opts) {
      matches = findKeywordMatches(row, opts);
      if (matches.length === 0) continue;
    }

    const linkMatch = row.match(/\[([^\]]+)\]\((https?:[^)]+)\)/);
    const tender_url = linkMatch?.[2];
    const titleFromLink = linkMatch?.[1];

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
      published_at = dates[0];
      closing_at = dates[1];
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

export async function scrapeAllSources(opts?: MatchOptions): Promise<{
  results: { source: TenderSource; matches: ParsedTender[]; error?: string }[];
}> {
  const raw = await mapWithConcurrency(TENDER_SOURCES, 4, async (source) => {
    const scraped = await firecrawlScrape(source.url);
    if (!scraped.ok) {
      return { source, matches: [] as ParsedTender[], error: scraped.error };
    }
    return { source, matches: parseListing(source, scraped.markdown, opts) };
  });

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




