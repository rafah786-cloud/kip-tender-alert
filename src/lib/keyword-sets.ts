export type MatchMode = "any" | "all" | "phrase";
export interface KeywordSet {
  id: string;
  name: string;
  enabled: boolean;
  match_mode: MatchMode;
  include_keywords: string[];
  exclude_keywords: string[];
  ai_scope: string;
}
export interface KeywordSetMatchContext {
  id: string;
  name: string;
  ai_scope: string;
  matched_keywords: string[];
}
export const DEFAULT_MATTRESS_AI_SCOPE =
  "Tenders for supply of mattresses and directly related bedding products: foam, coir, spring, medical and hospital mattresses; mattress covers and protectors; bed linen, bedsheets, pillows, bolsters, blankets, quilts, bedding kits and bed-rolls. Count beds only when a mattress is explicitly included.";
export const CONSTRUCTION_PWD_STARTER: KeywordSet = {
  id: "construction-pwd",
  name: "Construction / PWD",
  enabled: false,
  match_mode: "any",
  include_keywords: [
    "PWD", "Public Works Department", "civil works", "civil construction",
    "construction", "building construction", "road construction", "road work",
    "road works", "road improvement", "road widening", "bridge construction",
    "bridge works", "culvert", "drainage works", "storm water drain", "footpath",
    "paving works", "bitumen work", "asphalt work", "re-tarring", "re carpeting",
    "building maintenance", "renovation works", "repair works", "electrical works",
    "plumbing works", "painting works", "water supply works", "sewerage works",
    "canal works", "irrigation works", "school building", "hospital building",
    "public building", "structural repair", "compound wall", "boundary wall",
    "roofing works", "general civil work", "works contract", "construction tender", "NIT",
  ],
  exclude_keywords: [],
  ai_scope: "Public works and construction contracts: roads, bridges, buildings, culverts, drainage, water supply, sewerage, canals, irrigation, electrical and plumbing works, painting, roofing, repairs, renovation and maintenance. Evaluate the actual works scope and BOQ; do not require mattress or product-supply relevance.",
};
const FALLBACK_MATTRESS_TERMS = [
  "mattress", "mattresses", "mattress supply", "foam mattress", "coir mattress",
  "spring mattress", "hospital mattress", "medical mattress", "patient mattress",
  "bed sheet", "bedsheet", "bed linen", "pillow", "blanket", "bedding",
];
function cleanTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const term = item.trim().replace(/\s+/g, " ");
    const key = term.toLowerCase();
    if (!term || term.length > 80 || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= 300) break;
  }
  return terms;
}
function makeId(name: string, index: number): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "search-set-" + (index + 1);
}
function normaliseOne(value: unknown, index: number): KeywordSet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim().slice(0, 60) : "";
  if (!name) return null;
  return {
    id: typeof row.id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(row.id) ? row.id : makeId(name, index),
    name,
    enabled: row.enabled === true,
    match_mode: row.match_mode === "all" || row.match_mode === "phrase" ? row.match_mode : "any",
    include_keywords: cleanTerms(row.include_keywords),
    exclude_keywords: cleanTerms(row.exclude_keywords),
    ai_scope: typeof row.ai_scope === "string" ? row.ai_scope.trim().slice(0, 1200) : "",
  };
}
export function normalizeKeywordSets(value: unknown, legacyKeywords: unknown = [], legacyExcludeKeywords: unknown = [], legacyMode: unknown = "any"): KeywordSet[] {
  if (Array.isArray(value)) {
    const parsed = value.map((row, index) => normaliseOne(row, index)).filter((row): row is KeywordSet => row !== null);
    if (parsed.length) return parsed.slice(0, 20);
  }
  const legacy = cleanTerms(legacyKeywords);
  return [
    {
      id: "mattress", name: "Mattress", enabled: true,
      match_mode: legacyMode === "all" || legacyMode === "phrase" ? legacyMode : "any",
      include_keywords: legacy.length ? legacy : FALLBACK_MATTRESS_TERMS,
      exclude_keywords: cleanTerms(legacyExcludeKeywords),
      ai_scope: DEFAULT_MATTRESS_AI_SCOPE,
    },
    { ...CONSTRUCTION_PWD_STARTER },
  ];
}
export function sanitizeKeywordSets(value: unknown): KeywordSet[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new Error("Create between 1 and 20 search sets.");
  const ids = new Set<string>();
  const names = new Set<string>();
  const sets = value.map((row, index) => {
    const set = normaliseOne(row, index);
    if (!set) throw new Error("Every search set needs a name.");
    if (ids.has(set.id)) throw new Error("Search set IDs must be unique.");
    if (names.has(set.name.toLowerCase())) throw new Error("Search set names must be unique.");
    ids.add(set.id);
    names.add(set.name.toLowerCase());
    return set;
  });
  if (!sets.some((set) => set.enabled && set.include_keywords.length)) throw new Error("Enable at least one search set and add an include keyword.");
  return sets;
}
