import {
  describe,
  expect,
  test,
} from "vitest";

import analyzeInstitutionalPosition from
  "../analysis/institutionalPositionEngine.js";

const AS_OF =
  "2026-08-30T14:00:00.000Z";

function evidence(overrides = {}) {
  return {
    symbol: "AAPL",
    evidenceAt:
      "2026-08-15T14:00:00.000Z",
    reportingPeriodEnd:
      "2026-06-30",
    institutionsEvaluated: 20,
    increasedPositions: 14,
    reducedPositions: 4,
    newPositions: 5,
    exitedPositions: 1,
    sharesAdded: 12_000_000,
    sharesReduced: 3_000_000,
    ownershipPercent: 64,
    previousOwnershipPercent: 61,
    ...overrides,
  };
}

describe(
  "Institutional Position Engine",
  () => {
    test(
      "detects broad accumulation",
      () => {
        const result =
          analyzeInstitutionalPosition({
            symbol: "AAPL",
            evidence: evidence(),
            asOfTimestamp: AS_OF,
          });

        expect(result.approved).toBe(true);
        expect(result.direction).toBe("LONG");
        expect(
          result.directionalSupport.long,
        ).toBeGreaterThan(0.58);
      },
    );

    test(
      "detects distribution",
      () => {
        const result =
          analyzeInstitutionalPosition({
            symbol: "AAPL",
            evidence: evidence({
              increasedPositions: 2,
              reducedPositions: 15,
              newPositions: 1,
              exitedPositions: 7,
              sharesAdded: 1_000_000,
              sharesReduced: 14_000_000,
              ownershipPercent: 58,
              previousOwnershipPercent: 64,
            }),
            asOfTimestamp: AS_OF,
          });

        expect(result.direction).toBe("SHORT");
        expect(
          result.directionalSupport.short,
        ).toBeGreaterThan(0.58);
      },
    );

    test(
      "high ownership alone is not bullish",
      () => {
        const result =
          analyzeInstitutionalPosition({
            symbol: "AAPL",
            evidence: evidence({
              increasedPositions: 0,
              reducedPositions: 0,
              newPositions: 0,
              exitedPositions: 0,
              sharesAdded: 0,
              sharesReduced: 0,
              ownershipPercent: 90,
              previousOwnershipPercent: null,
            }),
            asOfTimestamp: AS_OF,
          });

        expect(result.status)
          .toBe("INSUFFICIENT_DATA");
        expect(
          result.directionalSupport.long,
        ).toBeNull();
      },
    );

    test(
      "future filing cannot leak backward",
      () => {
        const result =
          analyzeInstitutionalPosition({
            symbol: "AAPL",
            evidence: evidence({
              evidenceAt:
                "2026-09-01T14:00:00.000Z",
            }),
            asOfTimestamp: AS_OF,
          });

        expect(result.status)
          .toBe("INSUFFICIENT_DATA");
        expect(result.freshness.futureDated)
          .toBe(true);
      },
    );
  },
);
