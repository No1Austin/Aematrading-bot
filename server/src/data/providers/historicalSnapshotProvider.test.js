import "dotenv/config";

import {
  getHistoricalBars,
  ALPACA_TIMEFRAME,
  ALPACA_FEED,
} from "./alpacaHistoricalDataService.js";

import getHistoricalSnapshot from "./historicalSnapshotProvider.js";

/**
 * ============================================================
 * HISTORICAL SNAPSHOT PROVIDER TEST
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Prove that:
 *
 * - real Alpaca historical candles load
 * - snapshot reconstruction works
 * - only candles at/before the cutoff are used
 * - future candles do not leak into the historical snapshot
 * - point-in-time macro/company/country/event providers execute
 * - missing social/liquidity/breadth/volatility remain null
 */

function assertCondition(
  condition,
  message,
) {
  if (!condition) {
    throw new Error(message);
  }
}

function timestampMs(
  value,
) {
  const number =
    new Date(value)
      .getTime();

  return Number.isFinite(number)
    ? number
    : null;
}

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "HISTORICAL SNAPSHOT PROVIDER TEST",
  );

  console.log(
    "====================================\n",
  );

  /**
   * ========================================================
   * TEST PARAMETERS
   * ========================================================
   *
   * We deliberately download candles AFTER the cutoff.
   *
   * The snapshot provider must exclude them.
   */

  const symbol =
    "AAPL";

  const start =
    "2026-07-01T13:30:00.000Z";

  const end =
    "2026-07-10T20:00:00.000Z";

  const cutoff =
    "2026-07-08T16:00:00.000Z";

  console.log(
    "Symbol:",
    symbol,
  );

  console.log(
    "Download start:",
    start,
  );

  console.log(
    "Download end:",
    end,
  );

  console.log(
    "Historical cutoff:",
    cutoff,
  );

  /**
   * ========================================================
   * LOAD REAL ALPACA HISTORY
   * ========================================================
   */

  const marketData =
    await getHistoricalBars({
      symbol,

      timeframe:
        ALPACA_TIMEFRAME
          .FIVE_MINUTES,

      start,

      end,

      feed:
        ALPACA_FEED.IEX,

      maximumBars:
        20_000,
    });

  assertCondition(
    marketData?.approved ===
      true,
    `Alpaca historical request failed: ${
      marketData
        ?.errors
        ?.join(", ") ??
      "unknown error"
    }`,
  );

  assertCondition(
    Array.isArray(
      marketData.bars,
    ),
    "Alpaca did not return a bars array.",
  );

  assertCondition(
    marketData.bars.length >
      0,
    "Alpaca returned no historical bars.",
  );

  console.log(
    "\nALPACA HISTORY",
  );

  console.log(
    "Bars:",
    marketData.bars.length,
  );

  console.log(
    "First:",
    marketData
      .bars[0]
      ?.timestamp,
  );

  console.log(
    "Last:",
    marketData
      .bars[
        marketData.bars.length -
          1
      ]
      ?.timestamp,
  );

  /**
   * Confirm our source dataset really contains future candles.
   *
   * Otherwise this would not prove look-ahead filtering.
   */

  const cutoffMs =
    timestampMs(
      cutoff,
    );

  const futureCandles =
    marketData.bars.filter(
      (bar) => {
        const value =
          timestampMs(
            bar.timestamp,
          );

        return (
          value !== null &&
          value >
            cutoffMs
        );
      },
    );

  assertCondition(
    futureCandles.length >
      0,
    "Test dataset contains no candles after the cutoff; look-ahead protection cannot be validated.",
  );

  console.log(
    "Candles AFTER cutoff:",
    futureCandles.length,
  );

  /**
   * ========================================================
   * BUILD HISTORICAL SNAPSHOT
   * ========================================================
   */

  const snapshot =
    await getHistoricalSnapshot({
      symbol,

      candles:
        marketData.bars,

      asOfTimestamp:
        cutoff,

      /**
       * These intentionally remain unavailable.
       *
       * The provider must NOT create synthetic values.
       */
      breadth:
        null,

      volatility:
        null,

      liquidity:
        null,

      social:
        null,
    });

  console.log(
    "\n====================================",
  );

  console.log(
    "HISTORICAL SNAPSHOT RESULT",
  );

  console.log(
    "====================================\n",
  );

  console.dir(
    snapshot,
    {
      depth: null,
    },
  );

  assertCondition(
    snapshot?.approved ===
      true,
    `Historical snapshot failed: ${
      snapshot
        ?.errors
        ?.join(", ") ??
      "unknown error"
    }`,
  );

  assertCondition(
    snapshot?.data,
    "Historical snapshot returned no data.",
  );

  assertCondition(
    snapshot
      ?.data
      ?.fingerprint,
    "Historical snapshot fingerprint is missing.",
  );

  /**
   * ========================================================
   * LOOK-AHEAD PROTECTION TEST
   * ========================================================
   */

  const latestSnapshotCandle =
    snapshot
      ?.data
      ?.candleContext
      ?.latestTimestamp;

  assertCondition(
    latestSnapshotCandle,
    "Snapshot did not report its latest candle timestamp.",
  );

  const latestSnapshotMs =
    timestampMs(
      latestSnapshotCandle,
    );

  assertCondition(
    latestSnapshotMs !==
      null,
    "Snapshot latest candle timestamp is invalid.",
  );

  assertCondition(
    latestSnapshotMs <=
      cutoffMs,
    [
      "LOOK-AHEAD FAILURE:",
      "snapshot used a candle newer than the historical cutoff.",
      `Latest snapshot candle: ${latestSnapshotCandle}`,
      `Cutoff: ${cutoff}`,
    ].join(" "),
  );

  console.log(
    "\nLOOK-AHEAD CHECK",
  );

  console.log(
    "Latest snapshot candle:",
    latestSnapshotCandle,
  );

  console.log(
    "Cutoff:",
    cutoff,
  );

  console.log(
    "Future candles excluded:",
    futureCandles.length,
  );

  console.log(
    "Result: PASS",
  );

  /**
   * ========================================================
   * MISSING DATA MUST REMAIN MISSING
   * ========================================================
   */

  assertCondition(
    snapshot
      ?.data
      ?.social ===
      null,
    "Historical social sentiment should remain null when no point-in-time source is supplied.",
  );

  assertCondition(
    snapshot
      ?.data
      ?.liquidity ===
      null,
    "Historical liquidity should remain null when no historical quote source is supplied.",
  );

  assertCondition(
    snapshot
      ?.data
      ?.breadth ===
      null,
    "Historical breadth should remain null when no historical breadth source is supplied.",
  );

  assertCondition(
    snapshot
      ?.data
      ?.volatility ===
      null,
    "Historical external volatility should remain null when unavailable.",
  );

  /**
   * ========================================================
   * COVERAGE CHECK
   * ========================================================
   */

  const coverage =
    snapshot
      ?.data
      ?.coverage;

  assertCondition(
    coverage,
    "Historical snapshot coverage metadata is missing.",
  );

  console.log(
    "\nCOVERAGE",
  );

  console.log(
    "Available:",
    coverage.availableCount,
  );

  console.log(
    "Total:",
    coverage.totalCount,
  );

  console.log(
    "Ratio:",
    coverage.ratio,
  );

  console.log(
    "\nCOMPONENTS\n",
  );

  console.dir(
    coverage.components,
    {
      depth: null,
    },
  );

  /**
   * ========================================================
   * FINGERPRINT
   * ========================================================
   */

  console.log(
    "\nFINGERPRINT\n",
  );

  console.dir(
    snapshot
      .data
      .fingerprint,
    {
      depth: null,
    },
  );

  /**
   * ========================================================
   * SUCCESS
   * ========================================================
   */

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — HISTORICAL SNAPSHOT TEST PASSED",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Status:",
    snapshot.status,
  );

  console.log(
    "Historical candles used:",
    snapshot
      .data
      .candleContext
      .candleCount,
  );

  console.log(
    "Latest candle:",
    latestSnapshotCandle,
  );

  console.log(
    "Cutoff:",
    cutoff,
  );

  console.log(
    "Future candles rejected:",
    futureCandles.length,
  );

  console.log(
    "Coverage:",
    coverage.ratio,
  );

  console.log(
    "====================================\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nHISTORICAL SNAPSHOT TEST FAILED:",
    );

    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);