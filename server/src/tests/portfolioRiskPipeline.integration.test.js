import {
  describe,
  test,
  expect,
} from "vitest";

import createPaperTradingSession from
  "../execution/paperTradingSession.js";

import runTradingAnalysis from
  "../orchestration/engineOrchestrator.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const SYMBOL = "AAPL";

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
  count = 80,
  startPrice = 100,
  step = 0.15,
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
} = {}) {
  return {
    symbol:
      SYMBOL,

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

    asOfTimestamp,

    onUpdate:
      null,
  };
}

/**
 * ============================================================
 * TEST
 * ============================================================
 */

describe(
  "Self Learning Paper Loop — End To End",
  () => {
    test(
      "completed trade becomes historical intelligence for the next analysis",
      async () => {
        const session =
          createPaperTradingSession({
            account:
              buildAccount(),

            analysisRunner:
              runTradingAnalysis,
          });

        /**
         * ==================================================
         * ANALYSIS #1
         * ==================================================
         */

        const firstAnalysis =
          await session.analyze(
            buildAnalysisInput({
              asOfTimestamp:
                "2026-08-22T18:00:00.000Z",
            }),
          );

        expect(
          firstAnalysis.approved,
        ).toBe(true);

        expect(
          firstAnalysis
            .historyRecordsUsed,
        ).toBe(0);

        const firstResult =
          firstAnalysis
            .analysis;

        expect(
          firstResult
            ?.results
            ?.tradeFingerprint,
        ).toBeTruthy();

        /**
         * This fixture may or may not produce actual trade
         * approval depending on the current decision engine.
         *
         * If it does not, do not fake approval.
         *
         * Instead, this test will directly assert that the
         * history store starts empty before we create a known
         * completed paper trade.
         */

        expect(
          session.historySize,
        ).toBe(0);

        /**
         * ==================================================
         * CREATE A CONTROLLED APPROVED PAPER TRADE
         * ==================================================
         *
         * We use the first real analysis fingerprint so the
         * next real analysis can recognize the stored setup.
         */

        const fingerprint =
          firstResult
            ?.results
            ?.tradeFingerprint
            ?.fingerprint;

        expect(
          fingerprint,
        ).toBeTruthy();

        const controlledAnalysis = {
          approved: true,

          symbol:
            SYMBOL,

          finalDecision: {
            symbol:
              SYMBOL,

            decision:
              "APPROVED_FOR_PAPER_EXECUTION",

            preferredSide:
              fingerprint
                ?.side ??
              "LONG",

            preferredScore:
              90,

            canProceedToRiskManager:
              true,

            riskApproved:
              true,

            canProceedToPaperExecution:
              true,

            timestamp:
              "2026-08-22T18:00:00.000Z",
          },

          results: {
            ...firstResult
              .results,

            tradeFingerprint: {
              approved:
                true,

              status:
                "COMPLETE",

              fingerprint,
            },

            riskApproval: {
              approved:
                true,

              status:
                "APPROVED",

              canExecute:
                true,

              side:
                fingerprint
                  ?.side ??
                "LONG",

              intelligenceScore:
                90,

              position: {
                shares:
                  100,

                entryPrice:
                  100,

                stopPrice:
                  (
                    fingerprint
                      ?.side ===
                    "SHORT"
                  )
                    ? 102
                    : 98,

                targetPrice:
                  (
                    fingerprint
                      ?.side ===
                    "SHORT"
                  )
                    ? 80
                    : 120,

                riskPerShare:
                  2,

                dollarRisk:
                  200,

                accountRiskPercent:
                  0.5,
              },
            },
          },
        };

        /**
         * ==================================================
         * OPEN TRADE #1
         * ==================================================
         */

        const entry =
          session.openApprovedTrade({
            analysis:
              controlledAnalysis,

            currentPrice:
              100,

            slippagePercent:
              0,

            metadata: {
              timestamp:
                "2026-08-22T18:01:00.000Z",
            },
          });

        expect(
          entry.approved,
        ).toBe(true);

        expect(
          session.position,
        ).toBeTruthy();

        expect(
          session.position
            .entryFingerprint,
        ).toEqual(
          fingerprint,
        );

        /**
         * ==================================================
         * CLOSE TRADE #1
         * ==================================================
         */

        const closePrice =
          controlledAnalysis
            .results
            .riskApproval
            .side ===
          "SHORT"
            ? 102.5
            : 97.5;

        const closed =
          await session
            .updateOpenPosition({
              currentPrice:
                closePrice,

              atr:
                1,

              slippagePercent:
                0,

              monitorThesis:
                false,

              asOfTimestamp:
                "2026-08-22T18:10:00.000Z",
            });

        expect(
          closed.approved,
        ).toBe(true);

        expect(
          closed.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          session.position,
        ).toBeNull();

        expect(
          session.historySize,
        ).toBe(1);

        const storedHistory =
          session.getHistory();

        expect(
          storedHistory,
        ).toHaveLength(1);

        expect(
          storedHistory[0]
            .entryFingerprint,
        ).toEqual(
          fingerprint,
        );

        /**
         * ==================================================
         * ANALYSIS #2
         * ==================================================
         *
         * No historicalRecords are supplied manually.
         *
         * The session must inject trade #1.
         */

        const secondAnalysis =
          await session.analyze(
            buildAnalysisInput({
              asOfTimestamp:
                "2026-08-22T19:00:00.000Z",
            }),
          );

        expect(
          secondAnalysis.approved,
        ).toBe(true);

        expect(
          secondAnalysis
            .historyRecordsUsed,
        ).toBe(1);

        const secondResult =
          secondAnalysis
            .analysis;

        /**
         * ==================================================
         * HISTORY PIPELINE
         * ==================================================
         */

        expect(
          secondResult
            ?.results
            ?.historySimilarity,
        ).toBeTruthy();

        expect(
          secondResult
            ?.results
            ?.historyOutcome,
        ).toBeTruthy();
console.log(
  "\n=== SELF LEARNING DEBUG ===",
  JSON.stringify(
    {
      storedHistory:
        session.getHistory(),

      secondFingerprint:
        secondResult
          ?.results
          ?.tradeFingerprint,

      historySimilarity:
        secondResult
          ?.results
          ?.historySimilarity,

      historyOutcome:
        secondResult
          ?.results
          ?.historyOutcome,
    },
    null,
    2,
  ),
);
        expect(
          secondResult
            ?.results
            ?.historySimilarity
            ?.evaluatedTrades,
        ).toBeGreaterThanOrEqual(
          1,
        );

        /**
         * One prior trade is intentionally below the default
         * minimum sample size for confident historical outcome
         * intelligence.
         *
         * The correct result is therefore typically
         * INSUFFICIENT_DATA, not fabricated confidence.
         */

        expect(
          [
            "COMPLETE",
            "INSUFFICIENT_DATA",
            "NO_MATCHES",
          ],
        ).toContain(
          secondResult
            ?.results
            ?.historyOutcome
            ?.status,
        );

        /**
         * ==================================================
         * SCORING SAFETY
         * ==================================================
         *
         * Historical learning may influence only the existing
         * historical scoring slot.
         */

        expect(
          secondResult
            ?.results
            ?.scoring,
        ).toBeTruthy();

        expect(
          secondResult
            ?.results
            ?.scoring
            ?.long
            ?.score ??
          0,
        ).toBeLessThanOrEqual(
          100,
        );

        expect(
          secondResult
            ?.results
            ?.scoring
            ?.short
            ?.score ??
          0,
        ).toBeLessThanOrEqual(
          100,
        );

        /**
         * ==================================================
         * EXECUTION SAFETY
         * ==================================================
         *
         * History must never create its own execution flag.
         */

        expect(
          secondResult
            ?.results
            ?.historyOutcome
            ?.canExecute,
        ).toBeUndefined();

        expect(
          typeof secondResult
            ?.finalDecision
            ?.canProceedToPaperExecution,
        ).toBe(
          "boolean",
        );


        /**
         * ==================================================
         * POSITIVE LEARNING PATH — 3 MATCHING TRADES
         * ==================================================
         *
         * The default history outcome engine requires at
         * least three qualifying matches. Create two more
         * completed paper trades using the exact same entry
         * fingerprint as trade #1. Together with trade #1,
         * this gives the next analysis three genuine,
         * same-side, high-similarity historical observations.
         *
         * We deliberately create LOSSES here. The test does
         * not require the engine to approve a trade. It only
         * proves that sufficiently repeated historical
         * evidence reaches COMPLETE and becomes usable
         * historical intelligence.
         */

        for (
          let tradeIndex = 2;
          tradeIndex <= 3;
          tradeIndex += 1
        ) {
          const tradeAnalysis = {
            ...controlledAnalysis,

            finalDecision: {
              ...controlledAnalysis
                .finalDecision,

              timestamp:
                `2026-08-22T${18 + tradeIndex}:00:00.000Z`,
            },

            results: {
              ...controlledAnalysis
                .results,

              tradeFingerprint: {
                approved: true,

                status:
                  "COMPLETE",

                fingerprint,
              },

              riskApproval: {
                ...controlledAnalysis
                  .results
                  .riskApproval,
              },
            },
          };

          const repeatedEntry =
            session.openApprovedTrade({
              analysis:
                tradeAnalysis,

              currentPrice:
                100,

              slippagePercent:
                0,

              metadata: {
                timestamp:
                  `2026-08-22T${18 + tradeIndex}:01:00.000Z`,
              },
            });

          expect(
            repeatedEntry.approved,
          ).toBe(true);

          const repeatedClose =
            await session
              .updateOpenPosition({
                currentPrice:
                  closePrice,

                atr:
                  1,

                slippagePercent:
                  0,

                monitorThesis:
                  false,

                asOfTimestamp:
                  `2026-08-22T${18 + tradeIndex}:10:00.000Z`,
              });

          expect(
            repeatedClose.approved,
          ).toBe(true);

          expect(
            repeatedClose.status,
          ).toBe(
            "POSITION_CLOSED",
          );
        }

        expect(
          session.historySize,
        ).toBe(3);

        /**
         * ==================================================
         * ANALYSIS #3 — HISTORY MUST NOW BE USABLE
         * ==================================================
         */

        const learnedAnalysis =
          await session.analyze(
            buildAnalysisInput({
              asOfTimestamp:
                "2026-08-22T22:00:00.000Z",
            }),
          );

        expect(
          learnedAnalysis.approved,
        ).toBe(true);

        expect(
          learnedAnalysis
            .historyRecordsUsed,
        ).toBe(3);

        const learnedResult =
          learnedAnalysis
            .analysis;

        const learnedSimilarity =
          learnedResult
            ?.results
            ?.historySimilarity;

        const learnedOutcome =
          learnedResult
            ?.results
            ?.historyOutcome;

        expect(
          learnedSimilarity,
        ).toBeTruthy();

        expect(
          learnedSimilarity
            ?.evaluatedTrades,
        ).toBeGreaterThanOrEqual(
          3,
        );

        /**
         * Because all three records use the exact same
         * entry fingerprint as the current deterministic
         * fixture, the similarity engine should have enough
         * qualifying evidence to complete.
         */
        expect(
          learnedSimilarity
            ?.qualifyingTrades,
        ).toBeGreaterThanOrEqual(
          3,
        );

        expect(
          learnedSimilarity
            ?.status,
        ).toBe(
          "COMPLETE",
        );

        expect(
          learnedOutcome,
        ).toBeTruthy();

        expect(
          learnedOutcome
            ?.status,
        ).toBe(
          "COMPLETE",
        );

        expect(
          learnedOutcome
            ?.confidence,
        ).not.toBe(
          "INSUFFICIENT",
        );

        /**
         * All three controlled trades were closed against
         * their entry side, so the learned outcome must not
         * become supportive of repeating that losing side.
         */
        const learnedSide =
          fingerprint
            ?.side ??
          "LONG";

        const sameSideSupport =
          learnedSide === "SHORT"
            ? learnedOutcome
                ?.directionalSupport
                ?.short
            : learnedOutcome
                ?.directionalSupport
                ?.long;

        const oppositeSideSupport =
          learnedSide === "SHORT"
            ? learnedOutcome
                ?.directionalSupport
                ?.long
            : learnedOutcome
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
         * SCORING INTEGRATION
         * ==================================================
         *
         * The historical component must remain bounded by
         * the existing five-point historical slot. History
         * is intelligence only; it cannot create execution
         * authority.
         */

        const learnedScoring =
          learnedResult
            ?.results
            ?.scoring;

        expect(
          learnedScoring,
        ).toBeTruthy();

        const learnedSideScore =
          learnedSide === "SHORT"
            ? learnedScoring
                ?.short
            : learnedScoring
                ?.long;

        const historicalComponent =
          learnedSideScore
            ?.components
            ?.find?.(
              component =>
                component?.name ===
                "HISTORICAL",
            );

        expect(
          historicalComponent,
        ).toBeTruthy();

        expect(
          historicalComponent
            ?.source,
        ).toBe(
          "TRADE_HISTORY_OUTCOME",
        );

        expect(
          historicalComponent
            ?.points ??
          0,
        ).toBeLessThanOrEqual(
          5,
        );

        expect(
          learnedOutcome
            ?.canExecute,
        ).toBeUndefined();

        expect(
          typeof learnedResult
            ?.finalDecision
            ?.canProceedToPaperExecution,
        ).toBe(
          "boolean",
        );
      },
    );
  },
);