// server/src/tests/secInstitutionalFilingsProvider.test.js
import { describe, expect, test } from "vitest";
import { normalizeSecInstitutionalFiling } from "../data/providers/institutional/secInstitutionalFilingsProvider.js";

describe("SEC Institutional Filings Provider", () => {
  test("normalizes 13F filing metadata", () => {
    const result = normalizeSecInstitutionalFiling({
      cik: "1067983",
      filerName: "Example Manager",
      filing: {
        accessionNumber: "0001067983-26-000001",
        filingDate: "2026-08-14",
        acceptanceDateTime: "2026-08-14T17:31:00.000Z",
        reportDate: "2026-06-30",
        form: "13F-HR",
        primaryDocument: "primary_doc.xml",
      },
    });
    expect(result.source).toBe("SEC_EDGAR");
    expect(result.sourceType).toBe("13F");
    expect(result.cik).toBe("0001067983");
    expect(result.availableFrom).toBe("2026-08-14T17:31:00.000Z");
    expect(result.filingIndexUrl).toContain("/1067983/000106798326000001/index.json");
  });

  test("normalizes 13G separately", () => {
    const result = normalizeSecInstitutionalFiling({
      cik: "123456",
      filing: {
        accessionNumber: "0000123456-26-000010",
        filingDate: "2026-08-20",
        form: "SC 13G",
      },
    });
    expect(result.sourceType).toBe("BENEFICIAL_OWNERSHIP_13G");
  });
});
