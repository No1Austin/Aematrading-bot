/**
 * Comparative research ranking after direction qualification.
 *
 * Only candidates that have already passed the direction gate
 * are eligible for ranking.
 *
 * This module does NOT:
 * - determine direction
 * - approve setups
 * - execute trades
 */

import BOT_CONFIG from "../config/botConfig.js";

const clamp = (
  value,
  min = 0,
  max = 100
) =>
  Math.max(
    min,
    Math.min(max, value)
  );

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

export function rankBotResearchCandidates(
  candidates = [],
  options = {}
) {
  const configuredTopN =
    finiteOrNull(
      options.topN ??
      BOT_CONFIG.research.topN
    );

  const topN =
    configuredTopN !== null &&
    configuredTopN > 0
      ? Math.floor(configuredTopN)
      : 10;

  /*
   * The direction gate is authoritative.
   *
   * Do not rank candidates that merely have a raw
   * LONG/SHORT preference but failed qualification.
   */
  const qualifiedCandidates =
    candidates.filter(
      (candidate) =>
        candidate
          ?.directionDecision
          ?.qualified === true &&
        (
          candidate
            ?.directionDecision
            ?.direction === "LONG" ||
          candidate
            ?.directionDecision
            ?.direction === "SHORT"
        )
    );

  const ranked =
    qualifiedCandidates
      .map((candidate) => {
        const decision =
          candidate.directionDecision;

        const longScore =
          finiteOrNull(
            decision.longScore
          );

        const shortScore =
          finiteOrNull(
            decision.shortScore
          );

        const separation =
          finiteOrNull(
            decision.separation
          );

        const confidence =
          finiteOrNull(
            decision.confidence
          );

        const availableWeight =
          finiteOrNull(
            decision.availableWeight
          );

        /*
         * A qualified direction should already contain
         * these values. If not, do not silently manufacture
         * zeros and continue ranking it.
         */
        if (
          longScore === null ||
          shortScore === null ||
          separation === null ||
          confidence === null ||
          availableWeight === null
        ) {
          return {
            ...candidate,

            researchRankScore: null,

            researchRankingDiagnostics: {
              valid: false,
              reason:
                "INCOMPLETE_DIRECTION_RANKING_EVIDENCE",
            },
          };
        }

        const directionalStrength =
          Math.max(
            longScore,
            shortScore
          );

        /*
         * Current direction scores are 0..100.
         * Separation is also expressed in score points.
         */
        const separationQuality =
          clamp(
            separation * 3
          );

        /*
         * Current research weights sum to 1.0, therefore
         * availableWeight 0.70 => 70 coverage.
         */
        const coverage =
          clamp(
            availableWeight * 100
          );

        const researchRankScore =
          directionalStrength * 0.45 +
          separationQuality * 0.20 +
          confidence * 0.20 +
          coverage * 0.15;

        return {
          ...candidate,

          researchRankScore:
            Number(
              researchRankScore.toFixed(4)
            ),

          researchRankingDiagnostics: {
            valid: true,

            directionalStrength:
              Number(
                directionalStrength.toFixed(4)
              ),

            separationQuality:
              Number(
                separationQuality.toFixed(4)
              ),

            confidence:
              Number(
                confidence.toFixed(4)
              ),

            coverage:
              Number(
                coverage.toFixed(4)
              ),
          },
        };
      })
      .filter(
        (candidate) =>
          Number.isFinite(
            candidate.researchRankScore
          )
      )
      .sort(
        (a, b) =>
          b.researchRankScore -
          a.researchRankScore
      )
      .map(
        (candidate, index) => ({
          ...candidate,

          researchRank:
            index + 1,
        })
      );

  return {
    ranked,

    top10:
      ranked.slice(
        0,
        topN
      ),

    topN,

    qualifiedCount:
      qualifiedCandidates.length,

    rankedCount:
      ranked.length,

    executionAuthority: false,
    liveExecution: false,
  };
}

export default rankBotResearchCandidates;