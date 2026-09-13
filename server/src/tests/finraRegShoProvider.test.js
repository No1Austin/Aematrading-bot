// server/src/tests/finraRegShoProvider.test.js
import { describe, expect, test } from "vitest";
import {
  normalizeFinraRegShoRow,
  aggregateFinraRegShoRows,
} from "../data/providers/institutional/finraRegShoProvider.js";

describe("FINRA Reg SHO Provider", () => {
  test("normalizes a FINRA row", () => {
    const row = normalizeFinraRegShoRow({
      tradeReportDate: "2026-08-28",
      securitiesInformationProcessorSymbolIdentifier: "aapl",
      reportingFacilityCode: "NQTRF",
      marketCode: "Q",
      shortParQuantity: 400,
      shortExemptParQuantity: 10,
      totalParQuantity: 1000,
    });
    expect(row.symbol).toBe("AAPL");
    expect(row.shortVolumeRatio).toBe(0.4);
    expect(row.interpretation).toBe("SHORT_VOLUME_PROXY_NOT_SHORT_INTEREST");
  });

  test("aggregates multiple reporting facilities", () => {
    const result = aggregateFinraRegShoRows([
      {
        securitiesInformationProcessorSymbolIdentifier: "AAPL",
        shortParQuantity: 400,
        shortExemptParQuantity: 10,
        totalParQuantity: 1000,
      },
      {
        securitiesInformationProcessorSymbolIdentifier: "AAPL",
        shortParQuantity: 300,
        shortExemptParQuantity: 5,
        totalParQuantity: 500,
      },
    ]);
    expect(result.totalVolume).toBe(1500);
    expect(result.shortVolume).toBe(700);
    expect(result.shortVolumeRatio).toBeCloseTo(700 / 1500, 8);
  });
});
