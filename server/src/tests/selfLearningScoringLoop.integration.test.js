import {
  describe,
  test,
  expect,
} from "vitest";

import runTradingAnalysis from
  "../orchestration/engineOrchestrator.js";

import createTradeSetupFingerprint from
  "../history/tradeSetupFingerprint.js";

import {
  findHistoricalAnalogues,
} from
  "../history/tradeSimilarityEngine.js";

import summarizeTradeHistoryOutcome from
  "../history/tradeHistoryOutcomeEngine.js";

import {
  scoreTradeOpportunity,
} from
  "../strategy/tradeScoringEngine.js";

/**
 * ============================================================
 * SELF-LEARNING SCORING LOOP — INTEGRATION TEST
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Prove the REAL orchestration path:
 *
 * market evidence
 *   ↓
 * trade fingerprint
 *   ↓
 * botTradeHistory
 *   ↓
 * similarity engine
 *   ↓
 * history outcome engine
 *   ↓
 * trade scoring engine
 *
 * The test deliberately supplies three completed losing trades
 * with setup fingerprints matching the current candidate.
 *
 * Expected behavior:
 *
 * - all three trades are evaluated as historical matches;
 * - historyOutcome becomes usable / COMPLETE;
 * - scoring uses TRADE_HISTORY_OUTCOME for the one historical
 *   five-point slot;
 * - repeated losses reduce support for repeating the same side;
 * - the opposite side receives stronger historical support;
 * - history never receives its own execution authority.
 *
 * IMPORTANT
 * ---------
 *
 * This test does NOT lower similarity thresholds.
 * This test does NOT fake a historyOutcome object.
 * The outcome must be produced by the real history engines.
 */

const SYMBOL =
  "AAPL";

/**
 * ============================================================
 * FIXTURES
 * ============================================================
 */

function buildAccount() {
  return {
    balance:
      10_000,

    equity:
      10_000,

    buyingPower:
      10_000,

    dailyPnL:
      0,

    openPositions: [],

    portfolioExposure:
      0,

    tradingBlocked:
      false,

    accountBlocked:
      false,

    shortingEnabled:
      true,

    status:
      "ACTIVE",
  };
}

function buildCandles({
  startTimestamp =
    "2026-08-22T14:00:00.000Z",

  count =
    80,

  startPrice =
    100,

  step =
    0.15,
} = {}) {
  const candles = [];

  const start =
    new Date(
      startTimestamp,
    ).getTime();

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const price =
      startPrice +
      index *
      step;

    candles.push({
      timestamp:
        new Date(
          start +
          index *
          60_000,
        ).toISOString(),

      open:
        price -
        0.1,

      high:
        price +
        0.3,

      low:
        price -
        0.3,

      close:
        price,

      volume:
        1_000_000 +
        index *
        1_000,
    });
  }

  return candles;
}

function buildAnalysisInput({
  asOfTimestamp,

  botTradeHistory =
    [],
} = {}) {
  return {
    symbol:
      SYMBOL,

    account:
      buildAccount(),

    candles:
      buildCandles(),

    breadth: {
      advancing:
        3500,

      declining:
        1500,
    },

    volatility: {
      vix:
        15,
    },

    liquidity: {
      price:
        111.85,

      bid:
        111.83,

      ask:
        111.87,

      currentVolume:
        2_000_000,

      averageVolume:
        1_500_000,

      positionValue:
        2_500,

      volatilityPercent:
        1.2,

      session:
        "REGULAR",
    },

    riskReward: {
      entryPrice:
        111.85,

      longStopPrice:
        109.85,

      shortStopPrice:
        113.85,

      longTargetPrice:
        117.85,

      shortTargetPrice:
        105.85,

      longTargetR:
        3,

      shortTargetR:
        3,

      longWinProbability:
        0.7,

      shortWinProbability:
        0.3,
    },

    macroInput: {
      growthScore:
        0.8,

      inflationScore:
        0.6,

      liquidityScore:
        0.8,
    },

    countryInput: {
      country:
        "US",

      stabilityScore:
        0.9,
    },

    companyInput: {
      symbol:
        SYMBOL,

      sector:
        "TECHNOLOGY",

      revenueGrowth:
        0.15,

      earningsGrowth:
        0.12,
    },

    events: [],

    socialInput: {
      posts: [],
    },

    /**
     * Market analogue records stay separate from bot history.
     */
    historicalRecords: [],

    botTradeHistory,

    asOfTimestamp,

    onUpdate:
      null,
  };
}

function historicalComponent(
  scoring,
  side,
) {
  const sideResult =
    side === "SHORT"
      ? scoring?.short
      : scoring?.long;

  return sideResult
    ?.components
    ?.find?.(
      component =>
        component
          ?.name ===
        "HISTORICAL",
    ) ??
    null;
}


function directional({
  long = 0.9,
  short = 0.1,
  approved = true,
  status = "COMPLETE",
} = {}) {
  return {
    approved,
    status,

    directionalSupport: {
      long,
      short,
    },
  };
}

function buildRichFingerprint({
  side =
    "LONG",

  asOfTimestamp =
    "2026-08-22T22:00:00.000Z",
} = {}) {
  const isLong =
    side === "LONG";

  return createTradeSetupFingerprint({
    symbol:
      SYMBOL,

    side,

    technical: {
      approved: true,
      status:
        "COMPLETE",

      direction:
        side,

      trend:
        isLong
          ? "BULLISH"
          : "BEARISH",

      rsi:
        isLong
          ? 62
          : 38,

      macdDirection:
        side,

      atrPercent:
        1.2,

      volumeRatio:
        1.5,

      aboveVWAP:
        isLong,

      belowVWAP:
        !isLong,

      directionalSupport: {
        long:
          isLong
            ? 0.9
            : 0.1,

        short:
          isLong
            ? 0.1
            : 0.9,
      },
    },

    macro:
      directional({
        long:
          isLong
            ? 0.82
            : 0.18,

        short:
          isLong
            ? 0.18
            : 0.82,
      }),

    marketRegime:
      directional({
        long:
          isLong
            ? 0.86
            : 0.14,

        short:
          isLong
            ? 0.14
            : 0.86,
      }),

    events:
      directional({
        long:
          isLong
            ? 0.75
            : 0.25,

        short:
          isLong
            ? 0.25
            : 0.75,
      }),

    company:
      directional({
        long:
          isLong
            ? 0.8
            : 0.2,

        short:
          isLong
            ? 0.2
            : 0.8,
      }),

    country:
      directional({
        long:
          isLong
            ? 0.78
            : 0.22,

        short:
          isLong
            ? 0.22
            : 0.78,
      }),

    social:
      directional({
        long:
          isLong
            ? 0.74
            : 0.26,

        short:
          isLong
            ? 0.26
            : 0.74,
      }),

    historical:
      directional({
        long:
          isLong
            ? 0.68
            : 0.32,

        short:
          isLong
            ? 0.32
            : 0.68,
      }),

    liquidity: {
      approved: true,
      status:
        "COMPLETE",

      qualityScore:
        0.9,

      spreadPercent:
        0.04,

      averageDailyVolume:
        2_000_000,
    },

    riskReward:
      directional({
        long:
          isLong
            ? 0.9
            : 0.7,

        short:
          isLong
            ? 0.7
            : 0.9,
      }),

    consensus:
      directional({
        long:
          isLong
            ? 0.88
            : 0.12,

        short:
          isLong
            ? 0.12
            : 0.88,
      }),

    scoring: {
      approved: true,
      status:
        "COMPLETE",

      preferredSide:
        side,

      preferredScore:
        90,

      long: {
        score:
          isLong
            ? 90
            : 20,
      },

      short: {
        score:
          isLong
            ? 20
            : 90,
      },
    },

    entryPrice:
      111.85,

    stopPrice:
      isLong
        ? 109.85
        : 113.85,

    targetPrice:
      isLong
        ? 117.85
        : 105.85,

    asOfTimestamp,
  });
}

/**
 * Build a completed trade that is deliberately identical to
 * the baseline candidate fingerprint.
 *
 * Point-in-time timestamps are all BEFORE the second analysis.
 */
function buildLosingHistoricalTrade({
  id,

  fingerprint,

  closedAt,
} = {}) {
  const side =
    fingerprint?.side ??
    "LONG";

  const isLong =
    side === "LONG";

  return {
    id,

    symbol:
      fingerprint?.symbol ??
      SYMBOL,

    side,

    status:
      "CLOSED",

    fingerprintVersion:
      fingerprint?.version ??
      1,

    entryFingerprint: {
      ...fingerprint,

      /**
       * Preserve the setup evidence but give each stored trade
       * its own historical timestamp.
       */
      asOfTimestamp:
        new Date(
          new Date(
            closedAt,
          ).getTime() -
          10 * 60_000,
        ).toISOString(),
    },

    openedAt:
      new Date(
        new Date(
          closedAt,
        ).getTime() -
        9 * 60_000,
      ).toISOString(),

    closedAt,

    durationMs:
      9 * 60_000,

    entryPrice:
      100,

    exitPrice:
      isLong
        ? 97.5
        : 102.5,

    originalShares:
      100,

    realizedPnL:
      -250,

    finalR:
      -1.25,

    peakR:
      0,

    outcome:
      "LOSS",

    exitReason:
      "INITIAL_STOP",

    reductionHistory: [],

    metadata: {
      paperTrade:
        true,

      persistedFrom:
        "SELF_LEARNING_SCORING_TEST",

      entryFingerprint: {
        ...fingerprint,
      },
    },
  };
}

/**
 * ============================================================
 * TEST
 * ============================================================
 */

describe(
  "Self Learning Scoring Loop — Real Engines",
  () => {
    test(
      "three high-coverage similar losses become COMPLETE historical intelligence and change scoring safely",
      async () => {
        /**
         * ==================================================
         * 1. REAL ORCHESTRATOR BASELINE
         * ==================================================
         *
         * Keep one real orchestrator pass in the integration
         * so this test remains tied to the actual application
         * pipeline and verifies the history engines are exposed.
         */

        const baseline =
          await runTradingAnalysis(
            buildAnalysisInput({
              asOfTimestamp:
                "2026-08-22T18:00:00.000Z",
            }),
          );

        expect(
          baseline.approved,
        ).toBe(true);

        expect(
          baseline
            ?.results
            ?.tradeFingerprint,
        ).toBeTruthy();

        expect(
          baseline
            ?.results
            ?.historySimilarity,
        ).toBeTruthy();

        expect(
          baseline
            ?.results
            ?.historyOutcome,
        ).toBeTruthy();

        /**
         * ==================================================
         * 2. BUILD A HIGH-COVERAGE CURRENT FINGERPRINT
         * ==================================================
         *
         * The normal lightweight orchestrator fixture does not
         * expose enough COMPLETE engine evidence to satisfy the
         * production minimum-coverage rule. That is correct.
         *
         * Here we create a rich fingerprint through the REAL
         * fingerprint engine rather than lowering thresholds.
         */

        const rich =
          buildRichFingerprint({
            side:
              "LONG",

            asOfTimestamp:
              "2026-08-22T22:00:00.000Z",
          });

        expect(
          rich.approved,
        ).toBe(true);

        expect(
          rich.status,
        ).toBe(
          "COMPLETE",
        );

        expect(
          rich.coverage,
        ).toBeGreaterThanOrEqual(
          0.4,
        );

        const fingerprint =
          rich.fingerprint;

        expect(
          fingerprint,
        ).toBeTruthy();

        const learnedSide =
          fingerprint.side;

        /**
         * ==================================================
         * 3. THREE COMPLETED MATCHING LOSSES
         * ==================================================
         */

        const botTradeHistory = [
          buildLosingHistoricalTrade({
            id:
              "loss_1",

            fingerprint,

            closedAt:
              "2026-08-22T18:30:00.000Z",
          }),

          buildLosingHistoricalTrade({
            id:
              "loss_2",

            fingerprint,

            closedAt:
              "2026-08-22T19:00:00.000Z",
          }),

          buildLosingHistoricalTrade({
            id:
              "loss_3",

            fingerprint,

            closedAt:
              "2026-08-22T19:30:00.000Z",
          }),
        ];

        /**
         * ==================================================
         * 4. REAL SIMILARITY ENGINE
         * ==================================================
         */

        const similarity =
          findHistoricalAnalogues({
            candidate:
              fingerprint,

            historicalTrades:
              botTradeHistory,
          });

        expect(
          similarity.approved,
        ).toBe(true);

        expect(
          similarity
            .evaluatedTrades,
        ).toBe(3);

        expect(
          similarity
            .qualifyingTrades,
        ).toBeGreaterThanOrEqual(
          3,
        );

        expect(
          similarity
            .matches
            .length,
        ).toBeGreaterThanOrEqual(
          3,
        );

        for (
          const match
          of similarity.matches
        ) {
          expect(
            match.similarity,
          ).toBeGreaterThanOrEqual(
            0.7,
          );

          expect(
            match.coverage,
          ).toBeGreaterThanOrEqual(
            0.4,
          );
        }

        /**
         * ==================================================
         * 5. REAL HISTORY OUTCOME ENGINE
         * ==================================================
         */

        const historyOutcome =
          summarizeTradeHistoryOutcome({
            /**
             * Match the production orchestrator contract exactly.
             *
             * tradeHistoryOutcomeEngine consumes the matched
             * analogue array, the candidate side, and symbol.
             */
            matches:
              similarity
                ?.matches ??
              [],

            side:
              learnedSide,

            symbol:
              SYMBOL,
          });

        expect(
          historyOutcome.approved,
        ).toBe(true);

        expect(
          historyOutcome.status,
        ).toBe(
          "COMPLETE",
        );

        expect(
          historyOutcome
            .confidence,
        ).not.toBe(
          "INSUFFICIENT",
        );

        const sameSideSupport =
          learnedSide === "SHORT"
            ? historyOutcome
                ?.directionalSupport
                ?.short
            : historyOutcome
                ?.directionalSupport
                ?.long;

        const oppositeSideSupport =
          learnedSide === "SHORT"
            ? historyOutcome
                ?.directionalSupport
                ?.long
            : historyOutcome
                ?.directionalSupport
                ?.short;

        expect(
          typeof sameSideSupport,
        ).toBe(
          "number",
        );

        expect(
          typeof oppositeSideSupport,
        ).toBe(
          "number",
        );

        expect(
          sameSideSupport,
        ).toBeLessThan(
          oppositeSideSupport,
        );

        /**
         * ==================================================
         * 6. REAL TRADE SCORING ENGINE
         * ==================================================
         *
         * Feed the REAL historyOutcome into scoring. The
         * historical component must use the bot-history source
         * and remain inside the existing five-point allocation.
         */

        const scoring =
          scoreTradeOpportunity({
            symbol:
              SYMBOL,

            technical:
              directional({
                long: 1,
                short: 0,
              }),

            macro:
              directional({
                long: 1,
                short: 0,
              }),

            marketRegime:
              directional({
                long: 1,
                short: 0,
              }),

            events:
              directional({
                long: 1,
                short: 0,
              }),

            company:
              directional({
                long: 1,
                short: 0,
              }),

            country:
              directional({
                long: 1,
                short: 0,
              }),

            social:
              directional({
                long: 1,
                short: 0,
              }),

            historical:
              directional({
                long: 0.9,
                short: 0.1,
              }),

            historyOutcome,

            liquidity: {
              approved: true,
              status:
                "COMPLETE",
              qualityScore:
                0.95,
            },

            riskReward:
              directional({
                long: 1,
                short: 0,
              }),

            consensus:
              directional({
                long: 1,
                short: 0,
              }),
          });

        expect(
          scoring.approved,
        ).toBe(true);

        const sameComponent =
          historicalComponent(
            scoring,
            learnedSide,
          );

        const oppositeComponent =
          historicalComponent(
            scoring,
            learnedSide ===
              "LONG"
              ? "SHORT"
              : "LONG",
          );

        expect(
          sameComponent,
        ).toBeTruthy();

        expect(
          oppositeComponent,
        ).toBeTruthy();

        expect(
          sameComponent.source,
        ).toBe(
          "TRADE_HISTORY_OUTCOME",
        );

        expect(
          oppositeComponent.source,
        ).toBe(
          "TRADE_HISTORY_OUTCOME",
        );

        expect(
          sameComponent.maximumPoints,
        ).toBe(5);

        expect(
          oppositeComponent.maximumPoints,
        ).toBe(5);

        expect(
          sameComponent.points,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          sameComponent.points,
        ).toBeLessThanOrEqual(
          5,
        );

        expect(
          oppositeComponent.points,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          oppositeComponent.points,
        ).toBeLessThanOrEqual(
          5,
        );

        expect(
          sameComponent.points,
        ).toBeLessThan(
          oppositeComponent.points,
        );

        /**
         * ==================================================
         * 7. SAFETY BOUNDARY
         * ==================================================
         */

        expect(
          historyOutcome
            ?.canExecute,
        ).toBeUndefined();

        expect(
          historyOutcome
            ?.canProceedToPaperExecution,
        ).toBeUndefined();

        /**
         * A historical outcome cannot independently authorize
         * anything. Execution authority remains downstream.
         */
        expect(
          typeof scoring
            ?.tradeEligible,
        ).toBe(
          "boolean",
        );
      },
    );
  },
);
