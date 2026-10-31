import { describe, expect, test } from "bun:test";
import {
  termHits,
  parseListing,
  hasPublicTenderRows,
  isPortalChallengePage,
  extractDateNearLabel,
} from "../src/lib/tenders.server.ts";
import { isTenderDeadlinePassed } from "../src/lib/tenders.runner.server.ts";
import { extractTenderClosingDate } from "../src/lib/doc-classifier.server.ts";

const source = {
  key: "test_portal",
  label: "Tender test portal",
  url: "https://procurement.example.gov.in/",
};

describe("Tender Finder discovery regression tests", () => {
  test("matches singular, plural, hyphenated and underscored product phrases", () => {
    expect(termHits("Supply of Foam Mattresses", "foam mattress", "any")).toBe(true);
    expect(termHits("Supply of bed-sheets", "bed sheets", "any")).toBe(true);
    expect(termHits("Supply of bed_sheets", "bed sheets", "any")).toBe(true);
    expect(termHits("Hospital pillow covers", "pillow cover", "any")).toBe(true);
    expect(termHits("Procurement of office chairs", "mattress", "any")).toBe(false);
  });

  test("parses a public tender table row with title, URL and closing date", () => {
    const markdown = [
      "| Tender Title | Reference No | Closing Date | Bid Opening Date |",
      "| --- | --- | --- | --- |",
      "| [Supply of 100 Foam Mattresses](https://procurement.example.gov.in/tender/123) | REF-123 | 02-Nov-2099 06:00 PM | 03-Nov-2099 10:00 AM |",
    ].join("\n");
    const rows = parseListing(source, markdown, { include: ["mattress"], exclude: [], mode: "any" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toContain("Supply of 100 Foam Mattresses");
    expect(rows[0]?.tender_url).toBe("https://procurement.example.gov.in/tender/123");
    expect(rows[0]?.closing_at).toBe("02-Nov-2099 06:00 PM");

    const spacedMonth = [
      "| Tender Title | Reference No | Closing Date | Bid Opening Date |",
      "| --- | --- | --- | --- |",
      "| [Supply of 50 Coir Mattresses](https://procurement.example.gov.in/tender/456) | REF-456 | 02 Nov 2099 06:00 PM | 03 Nov 2099 10:00 AM |",
    ].join("\n");
    const spacedRows = parseListing(source, spacedMonth, { include: ["coir mattress"], exclude: [], mode: "any" });
    expect(spacedRows[0]?.closing_at).toBe("02 Nov 2099 06:00 PM");
  });

  test("distinguishes a public feed from a shell with no tender rows", () => {
    const feed = [
      "| Tender Title | Reference No | Closing Date | Bid Opening Date |",
      "| --- | --- | --- | --- |",
      "| [Supply of mattresses](https://procurement.example.gov.in/tender/123) | REF-123 | 02-Nov-2099 06:00 PM | 03-Nov-2099 10:00 AM |",
    ].join("\n");
    expect(hasPublicTenderRows(source, feed)).toBe(true);
    expect(hasPublicTenderRows(source, "No active tenders found")).toBe(true);
    expect(hasPublicTenderRows(source, "Home | Search | Latest Active Tenders | Login")).toBe(false);
  });

  test("identifies CAPTCHA-gated active tender pages", () => {
    const captcha = "Enter Captcha. Provide Captcha and click on Search button to list all active tenders.";
    expect(isPortalChallengePage(captcha)).toContain("CAPTCHA-gated");
    expect(isPortalChallengePage("Tender Title | Bid Number | Closing Date")).toBeNull();
  });

  test("extracts numeric, month-name and ISO deadline date formats", () => {
    expect(extractDateNearLabel("Bid End Date/Time 02-11-2099 18:00:00", ["Bid End Date/Time"])).toBe("02-11-2099 18:00:00");
    expect(extractDateNearLabel("Bid End Date/Time 02-Nov-2099 06:00 PM", ["Bid End Date/Time"])).toBe("02-Nov-2099 06:00 PM");
    expect(extractDateNearLabel("Bid End Date 2099-11-02", ["Bid End Date"])).toBe("02-11-2099");
    expect(extractDateNearLabel("Bid End Date 02 November 2099 6:00 PM", ["Bid End Date"])).toBe("02-November-2099 6:00 PM");
    expect(extractTenderClosingDate("Bid End Date/Time | 02-Nov-2099 06:00 PM")).toBe("02-Nov-2099 06:00 PM");
  });

  test("filters expired deadlines using IST and retains future deadlines", () => {
    expect(isTenderDeadlinePassed("02-01-2000 06:00 PM")).toBe(true);
    expect(isTenderDeadlinePassed("02-Nov-2099 06:00 PM")).toBe(false);
    expect(isTenderDeadlinePassed("2099-11-02")).toBe(false);
  });
});
