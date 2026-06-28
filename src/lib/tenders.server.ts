// Server-only helpers for scraping Indian government tender portals via Firecrawl.
// Never import from client-reachable code.

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl";

export interface TenderSource {
  key: string;
  label: string;
  url: string;
}

export const TENDER_SOURCES: TenderSource[] = [
  {
    key: "cppp",
    label: "Central Public Procurement Portal (eprocure.gov.in)",
    url: "https://eprocure.gov.in/eprocure/app?page=FrontEndLatestActiveTenders&service=page",
  },
  {
    key: "etenders_central",
    label: "eTenders India (etenders.gov.in)",
    url: "https://etenders.gov.in/eprocure/app?page=FrontEndLatestActiveTenders&service=page",
  },
  {
    key: "kerala",
    label: "Kerala eTenders (etenders.kerala.gov.in)",
    url: "https://etenders.kerala.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page",
  },
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
  keywords: string[],
): ParsedTender[] {
  if (!markdown) return [];
  // Break into table rows + paragraphs.
  const lines = markdown
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Group into "rows": a markdown table row, or a paragraph (single line here).
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
    const matches = findKeywordMatches(row, keywords);
    if (matches.length === 0) continue;

    // Try to extract a link from markdown [text](url)
    const linkMatch = row.match(/\[([^\]]+)\]\((https?:[^)]+)\)/);
    const tender_url = linkMatch?.[2];
    const titleFromLink = linkMatch?.[1];

    // Pipe-table parsing: | published | closing | title | organisation | ...
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
      // Title is usually the longest cell, or the cell with the link.
      const linkCell = cells.find((c) => /\[[^\]]+\]\(/.test(c));
      const longestCell = [...cells].sort((a, b) => b.length - a.length)[0];
      const t = linkCell ?? longestCell;
      const tLink = t?.match(/\[([^\]]+)\]\(/);
      title = tLink?.[1] ?? t ?? title;
      // Organisation: another long-ish cell that isn't the title or a date.
      organisation = cells.find(
        (c) => c !== t && !dateRe.test(c) && c.length > 8 && !/^\d+$/.test(c),
      );
    }

    title = title.replace(/\s+/g, " ").trim().slice(0, 500);
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

export async function scrapeAllSources(keywords: string[]): Promise<{
  results: { source: TenderSource; matches: ParsedTender[]; error?: string }[];
}> {
  const results: { source: TenderSource; matches: ParsedTender[]; error?: string }[] = [];
  for (const source of TENDER_SOURCES) {
    const scraped = await firecrawlScrape(source.url);
    if (!scraped.ok) {
      results.push({ source, matches: [], error: scraped.error });
      continue;
    }
    const matches = parseListing(source, scraped.markdown, keywords);
    results.push({ source, matches });
  }
  return { results };
}
