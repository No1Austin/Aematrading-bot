/**
 * AEMA Private Futures Research Bot
 *
 * Comparative setup-quality ranking.
 *
 * Legacy filename/function naming still refers to "execution"
 * for compatibility with existing imports.
 *
 * IMPORTANT:
 * This module does NOT execute trades.
 * It does NOT authorize orders.
 *
 * It ranks already-approved futures setups using:
 * - research quality
 * - directional separation
 * - risk/reward
 * - spread
 * - estimated slippage
 * - market depth
 * - freshness
 */

import BOT_CONFIG from "../config/botConfig.js";

/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

const clamp = (
  value,
  min = 0,
  max = 100
) =>
  Math.max(
    min,
    Math.min(max, value)
  );

/*
 * Preserve unavailable evidence as null.
 *
 * Number(null) === 0 and Number("") === 0,
 * so we must explicitly reject those values.
 */
function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/*
 * ---------------------------------------------------------
 * INVERSE QUALITY
 * ---------------------------------------------------------
 *
 * Used where LOWER is better.
 *
 * Examples:
 * - spread
 * - slippage
 * - observation age
 *
 * best  -> 100
 * worst -> 0
 */

function inverseQuality(
  value,
  best,
  worst
) {
  const number =
    finiteOrNull(value);

  if (
    number === null ||
    !Number.isFinite(best) ||
    !Number.isFinite(worst) ||
    worst <= best
  ) {
    return null;
  }

  if (number <= best) {
    return 100;
  }

  if (number >= worst) {
    return 0;
  }

  return (
    100 *
    (
      1 -
      (
        number - best
      ) /
      (
        worst - best
      )
    )
  );
}

/*
 * ---------------------------------------------------------
 * LOG QUALITY
 * ---------------------------------------------------------
 *
 * Used for market depth because depth can span several
 * orders of magnitude.
 *
 * Higher depth = higher quality.
 */

function logQuality(
  value,
  minimum,
  maximum
) {
  const number =
    finiteOrNull(value);

  if (
    number === null ||
    number <= 0 ||
    minimum <= 0 ||
    maximum <= minimum
  ) {
    return null;
  }

  if (number <= minimum) {
    return 0;
  }

  if (number >= maximum) {
    return 100;
  }

  return (
    100 *
    (
      Math.log10(number) -
      Math.log10(minimum)
    ) /
    (
      Math.log10(maximum) -
      Math.log10(minimum)
    )
  );
}

/*
 * =========================================================
 * SETUP QUALITY RANKING
 * =========================================================
 */

export function rankBotExecutionSetups(
  candidates = [],
  options = {}
) {
  if (!Array.isArray(candidates)) {
    throw new Error(
      "BOT_SETUP_RANKING_CANDIDATES_MUST_BE_ARRAY"
    );
  }

  /*
   * Keep the existing config key for compatibility.
   *
   * Despite the legacy name "executionRanking",
   * these are now setup-quality ranking weights.
   */
  const weights = {
    ...BOT_CONFIG
      .executionRanking
      .weights,

    ...(options.weights || {}),
  };

  /*
   * -------------------------------------------------------
   * EVALUATE EACH SETUP
   * -------------------------------------------------------
   */

  const evaluated =
    candidates.map(
      (candidate) => {
        const setup =
          candidate?.setup || {};

        const direction =
          candidate
            ?.directionDecision || {};

        /*
         * Only setups that passed the setup builder
         * can participate in setup-quality ranking.
         */
        if (
          setup.approved !== true
        ) {
          return {
            ...candidate,

            /*
             * Legacy compatibility.
             */
            executionRankScore:
              null,

            executionQuality:
              null,

            /*
             * Preferred terminology.
             */
            setupQualityScore:
              null,

            setupQuality:
              null,

            setupRankingDiagnostics: {
              valid: false,

              reason:
                "SETUP_NOT_APPROVED",

              blockers:
                Array.isArray(
                  setup.blockers
                )
                  ? setup.blockers
                  : [],
            },
          };
        }

        /*
         * -------------------------------------------------
         * NORMALIZE REQUIRED EVIDENCE
         * -------------------------------------------------
         */

        const researchScore =
          finiteOrNull(
            candidate
              ?.researchRankScore
          );

        const separation =
          finiteOrNull(
            direction
              ?.separation
          );

        const riskReward =
          finiteOrNull(
            setup
              ?.riskReward
          );

        const spreadPercent =
          finiteOrNull(
            setup
              ?.spreadPercent
          );

        const slippagePercent =
          finiteOrNull(
            setup
              ?.slippagePercent
          );

        const depthNotional =
          finiteOrNull(
            setup
              ?.depthNotional
          );

        const ageMs =
          finiteOrNull(
            setup
              ?.freshness
              ?.ageMs
          );

        const maximumAgeMs =
          finiteOrNull(
            setup
              ?.freshness
              ?.maximumAgeMs
          );

        /*
         * -------------------------------------------------
         * DATA-INTEGRITY CHECK
         * -------------------------------------------------
         *
         * An approved setup should already contain these
         * values.
         *
         * If something is unexpectedly missing, we do not
         * silently replace it with zero.
         */

        const missing = [];

        if (
          researchScore === null
        ) {
          missing.push(
            "RESEARCH_SCORE"
          );
        }

        if (
          separation === null
        ) {
          missing.push(
            "DIRECTION_SEPARATION"
          );
        }

        if (
          riskReward === null
        ) {
          missing.push(
            "RISK_REWARD"
          );
        }

        if (
          spreadPercent === null
        ) {
          missing.push(
            "SPREAD"
          );
        }

        if (
          slippagePercent === null
        ) {
          missing.push(
            "SLIPPAGE"
          );
        }

        if (
          depthNotional === null
        ) {
          missing.push(
            "DEPTH"
          );
        }

        if (
          ageMs === null ||
          maximumAgeMs === null ||
          maximumAgeMs <= 0
        ) {
          missing.push(
            "FRESHNESS"
          );
        }

        if (
          missing.length > 0
        ) {
          return {
            ...candidate,

            executionRankScore:
              null,

            executionQuality:
              null,

            setupQualityScore:
              null,

            setupQuality:
              null,

            setupRankingDiagnostics: {
              valid: false,

              reason:
                "INCOMPLETE_SETUP_RANKING_EVIDENCE",

              missing,
            },
          };
        }

        /*
         * -------------------------------------------------
         * RESEARCH QUALITY
         * -------------------------------------------------
         */

        const researchQuality =
          clamp(
            researchScore
          );

        /*
         * -------------------------------------------------
         * DIRECTION QUALITY
         * -------------------------------------------------
         *
         * Larger LONG/SHORT separation means stronger
         * directional differentiation.
         */

        const directionSeparationQuality =
          clamp(
            separation * 3
          );

        /*
         * -------------------------------------------------
         * RISK / REWARD QUALITY
         * -------------------------------------------------
         *
         * R:R 3.0 or higher receives the maximum
         * ranking contribution.
         *
         * Setup qualification has already enforced the
         * minimum acceptable R:R.
         */

        const riskRewardQuality =
          clamp(
            (
              riskReward /
              3
            ) *
              100
          );

        /*
         * -------------------------------------------------
         * SPREAD QUALITY
         * -------------------------------------------------
         *
         * Lower spread is better.
         */

        const spreadQuality =
          inverseQuality(
            spreadPercent,
            0.005,
            0.35
          );

        /*
         * -------------------------------------------------
         * SLIPPAGE QUALITY
         * -------------------------------------------------
         *
         * Lower estimated directional slippage is better.
         */

        const slippageQuality =
          inverseQuality(
            Math.abs(
              slippagePercent
            ),
            0.01,
            0.50
          );

        /*
         * -------------------------------------------------
         * DEPTH QUALITY
         * -------------------------------------------------
         *
         * Logarithmic because futures depth can vary by
         * several orders of magnitude.
         */

        const depthQuality =
          logQuality(
            depthNotional,
            100_000,
            100_000_000
          );

        /*
         * -------------------------------------------------
         * FRESHNESS QUALITY
         * -------------------------------------------------
         *
         * Fresh observation -> closer to 100.
         * Observation at maximum allowed age -> 0.
         */

        const freshnessQuality =
          inverseQuality(
            ageMs,
            0,
            maximumAgeMs
          );

        /*
         * -------------------------------------------------
         * QUALITY OBJECT
         * -------------------------------------------------
         */

        const quality = {
          research:
            researchQuality,

          directionSeparation:
            directionSeparationQuality,

          riskReward:
            riskRewardQuality,

          spread:
            spreadQuality,

          slippage:
            slippageQuality,

          depth:
            depthQuality,

          freshness:
            freshnessQuality,
        };

        /*
         * No missing quality dimensions should reach
         * weighted ranking.
         */

        const invalidQuality =
          Object.entries(
            quality
          )
            .filter(
              ([, value]) =>
                value === null ||
                !Number.isFinite(
                  value
                )
            )
            .map(
              ([key]) =>
                key
            );

        if (
          invalidQuality.length >
          0
        ) {
          return {
            ...candidate,

            executionRankScore:
              null,

            executionQuality:
              null,

            setupQualityScore:
              null,

            setupQuality:
              null,

            setupRankingDiagnostics: {
              valid: false,

              reason:
                "SETUP_QUALITY_CALCULATION_FAILED",

              invalidQuality,
            },
          };
        }

        /*
         * -------------------------------------------------
         * WEIGHTED SCORE
         * -------------------------------------------------
         *
         * Normalize by weightUsed so custom weights do
         * not have to sum exactly to 1.
         */

        let weightedScore = 0;
        let weightUsed = 0;

        for (
          const [
            key,
            rawWeight,
          ] of Object.entries(
            weights
          )
        ) {
          const weight =
            finiteOrNull(
              rawWeight
            );

          const qualityValue =
            quality[key];

          if (
            weight === null ||
            weight < 0 ||
            !Number.isFinite(
              qualityValue
            )
          ) {
            continue;
          }

          weightedScore +=
            qualityValue *
            weight;

          weightUsed +=
            weight;
        }

        if (
          weightUsed <= 0
        ) {
          return {
            ...candidate,

            executionRankScore:
              null,

            executionQuality:
              null,

            setupQualityScore:
              null,

            setupQuality:
              null,

            setupRankingDiagnostics: {
              valid: false,

              reason:
                "NO_VALID_SETUP_RANKING_WEIGHTS",
            },
          };
        }

        const setupQualityScore =
          weightedScore /
          weightUsed;

        const roundedScore =
          Number(
            setupQualityScore.toFixed(
              4
            )
          );

        /*
         * -------------------------------------------------
         * RESULT
         * -------------------------------------------------
         */

        return {
          ...candidate,

          /*
           * Preferred terminology.
           */
          setupQuality:
            quality,

          setupQualityScore:
            roundedScore,

          /*
           * Legacy compatibility.
           *
           * Existing modules may still read these names.
           */
          executionQuality:
            quality,

          executionRankScore:
            roundedScore,

          setupRankingDiagnostics: {
            valid: true,

            weightUsed:
              Number(
                weightUsed.toFixed(
                  4
                )
              ),

            inputs: {
              researchScore,

              separation,

              riskReward,

              spreadPercent,

              slippagePercent,

              depthNotional,

              ageMs,

              maximumAgeMs,
            },
          },

          /*
           * Ranking does NOT grant execution authority.
           */
          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }
    );

  /*
   * -------------------------------------------------------
   * RANK VALID SETUPS
   * -------------------------------------------------------
   */

  const rankedSetups =
    evaluated
      .filter(
        (candidate) =>
          Number.isFinite(
            candidate
              ?.setupQualityScore
          )
      )
      .sort(
        (a, b) =>
          b.setupQualityScore -
          a.setupQualityScore
      )
      .map(
        (
          candidate,
          index
        ) => ({
          ...candidate,

          /*
           * Preferred terminology.
           */
          setupRank:
            index + 1,

          /*
           * Legacy compatibility.
           */
          executionRank:
            index + 1,
        })
      );

  const bestSetup =
    rankedSetups[0] ??
    null;

  /*
   * -------------------------------------------------------
   * RETURN
   * -------------------------------------------------------
   */

  return {
    evaluated,

    /*
     * Preferred terminology.
     */
    rankedSetups,

    bestSetup,

    /*
     * Legacy compatibility.
     *
     * Existing runBotMarketSearch code can continue
     * reading:
     *
     * ranking.executable
     * ranking.best
     *
     * without breaking.
     */
    executable:
      rankedSetups,

    best:
      bestSetup,

    evaluatedCount:
      evaluated.length,

    approvedSetupCount:
      rankedSetups.length,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default rankBotExecutionSetups;