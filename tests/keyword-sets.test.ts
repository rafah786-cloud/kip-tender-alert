import { describe, expect, test } from "bun:test";
import { CONSTRUCTION_PWD_STARTER, normalizeKeywordSets, sanitizeKeywordSets } from "../src/lib/keyword-sets.ts";
import { matchKeywordSets } from "../src/lib/tenders.server.ts";

const mattress = {
  id: "mattress", name: "Mattress", enabled: true, match_mode: "any" as const,
  include_keywords: ["coir mattress", "foam mattress", "bedsheet"],
  exclude_keywords: ["spring water"], ai_scope: "Mattresses and bedding supply only.",
};
const construction = { ...CONSTRUCTION_PWD_STARTER, enabled: true };

describe("Independent tender search sets", () => {
  test("matches Construction / PWD independently and supplies its own AI scope", () => {
    const result = matchKeywordSets("PWD road construction and bridge improvement work", {
      include: [], exclude: [], mode: "any", sets: [mattress, construction],
    });
    expect(result.matched_keyword_sets).toContain("Construction / PWD");
    expect(result.matched_keyword_sets).not.toContain("Mattress");
    expect(result.matched_set_contexts[0]?.ai_scope).toContain("Public works");
  });
  test("one tender may be assigned to multiple enabled sets", () => {
    const result = matchKeywordSets("Construction and supply of coir mattress for a public hospital", {
      include: [], exclude: [], mode: "any", sets: [mattress, construction],
    });
    expect(result.matched_keyword_sets).toContain("Mattress");
    expect(result.matched_keyword_sets).toContain("Construction / PWD");
  });
  test("disabled sets are not searched", () => {
    const result = matchKeywordSets("PWD road construction", {
      include: [], exclude: [], mode: "any", sets: [mattress, CONSTRUCTION_PWD_STARTER],
    });
    expect(result.matched_keyword_sets).toEqual([]);
  });
  test("legacy keyword settings normalise to Mattress and a disabled Construction / PWD set", () => {
    const sets = normalizeKeywordSets(null, ["mattress", "coir mattress"], [], "any");
    expect(sets[0]?.name).toBe("Mattress");
    expect(sets[0]?.include_keywords).toEqual(["mattress", "coir mattress"]);
    expect(sets.find((set) => set.id === "construction-pwd")?.enabled).toBe(false);
  });
  test("provides all sector starter sets while keeping Mattress as the only enabled set", () => {
    const sets = normalizeKeywordSets(null, ["mattress", "coir mattress"], [], "any");
    expect(sets).toHaveLength(21);
    expect(sets.filter((set) => set.enabled).map((set) => set.id)).toEqual(["mattress"]);
    expect(sets.find((set) => set.id === "construction-pwd")?.include_keywords.length).toBeGreaterThan(40);
    expect(sets.find((set) => set.id === "medical-hospital-equipment")?.include_keywords).toContain("ventilator");
    expect(sets.find((set) => set.id === "solar-renewable-energy")?.enabled).toBe(false);
  });

  test("requires at least one enabled set with include terms", () => {
    expect(() => sanitizeKeywordSets([{ ...mattress, enabled: false }])).toThrow();
    expect(sanitizeKeywordSets([mattress, construction])).toHaveLength(2);
  });
});
