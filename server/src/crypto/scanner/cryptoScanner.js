/**
 * ============================================================
 * AEMA CRYPTO SCANNER — PHASE 2.4
 * ============================================================
 */

import {
  CRYPTO_SCANNER_CONFIG,
} from "./cryptoScannerConfig.js";

import qualifyCryptoCandidate from
  "./cryptoCandidateQualificationEngine.js";

import {
  CRYPTO_CANDIDATE_TYPE,
} from "../policy/cryptoCandidateActionPolicy.js";

function finite(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function keyFor(
  candidate,
) {
  return String(
    candidate?.assetId ??
    candidate?.symbol ??
    "",
  )
    .trim()
    .toLowerCase();
}

function rank(
  rows,
) {
  return [...rows]
    .sort(
      (
        a,
        b,
      ) =>
        finite(
          b?.scannerScore,
        ) -
          finite(
            a?.scannerScore,
          ) ||
        finite(
          b?.directionEdge,
        ) -
          finite(
            a?.directionEdge,
          ),
    );
}

function emergingScore(
  candidate,
) {
  return finite(
    candidate
      ?.measurements
      ?.discoveryIntelligence
      ?.emergingProject
      ?.score,
  );
}

function buildSelected({
  researchable,
  maximumCandidates,
  config,
}) {
  const composition =
    config
      .discovery
      .candidateComposition;

  const emerging =
    researchable
      .filter(
        candidate => {
          if (
            candidate
              ?.candidateType !==
            CRYPTO_CANDIDATE_TYPE
              .EMERGING
          ) {
            return false;
          }

          return (
            emergingScore(
              candidate,
            ) >=
            composition
              .minimumEmergingIntelligenceScore
          );
        },
      )
      .sort(
        (
          a,
          b,
        ) =>
          emergingScore(
            b,
          ) -
            emergingScore(
              a,
            ) ||
          finite(
            b?.scannerScore,
          ) -
            finite(
              a?.scannerScore,
            ),
      )
      .slice(
        0,
        Math.min(
          maximumCandidates,
          composition
            .maximumEmergingCandidates,
        ),
      );

  const emergingKeys =
    new Set(
      emerging.map(
        keyFor,
      ),
    );

  const general =
    researchable
      .filter(
        candidate =>
          !emergingKeys.has(
            keyFor(
              candidate,
            ),
          ),
      )
      .slice(
        0,
        Math.max(
          0,
          maximumCandidates -
            emerging.length,
        ),
      );

  return rank([
    ...general,
    ...emerging,
  ]);
}

export async function scanCryptoMarket({
  measurements = [],
  config =
    CRYPTO_SCANNER_CONFIG,
  maximumCandidates =
    config
      .discovery
      .maximumCandidates,
} = {}) {
  const startedAt =
    new Date()
      .toISOString();

  const allResults =
    Array.isArray(
      measurements,
    )
      ? measurements.map(
          measurement =>
            qualifyCryptoCandidate(
              measurement,
              config,
            ),
        )
      : [];

  /**
   * Initial qualified/researchable universe.
   */
  const researchable =
    rank(
      allResults.filter(
        result =>
          result?.qualified ===
          true,
      ),
    );

  /**
   * Strong discovery signals only.
   */
  const highInterest =
    rank(
      allResults.filter(
        result =>
          result?.highInterest ===
          true,
      ),
    );

  const candidates =
    buildSelected({
      researchable,
      maximumCandidates,
      config,
    });

  const cexCandidates =
    candidates.filter(
      candidate =>
        candidate
          ?.candidateType ===
        CRYPTO_CANDIDATE_TYPE.CEX,
    );

  const emergingCandidates =
    candidates.filter(
      candidate =>
        candidate
          ?.candidateType ===
        CRYPTO_CANDIDATE_TYPE
          .EMERGING,
    );

  /**
   * Selected qualified candidates may now enter deep research.
   */
  const deepResearchCandidates =
    candidates.filter(
      candidate =>
        candidate
          ?.deepResearchEligible ===
        true,
    );

  return {
    approved:
      allResults.length > 0,

    scanner:
      "CRYPTO_DISCOVERY_SCANNER",

    scanned:
      allResults.length,

    /*
     * Number that passed initial qualification.
     */
    qualified:
      researchable.length,

    researchable:
      researchable.length,

    /*
     * Separate high-conviction discovery metric.
     */
    highInterest:
      highInterest.length,

    selected:
      candidates.length,

    cexSelected:
      cexCandidates.length,

    emergingSelected:
      emergingCandidates.length,

    deepResearchEligible:
      deepResearchCandidates.length,

    /*
     * Always expected to be zero at scanner stage.
     */
    botEligibleNow:
      candidates.filter(
        candidate =>
          candidate?.botEligible ===
          true,
      ).length,

    candidates,

    cexCandidates,

    emergingCandidates,

    deepResearchCandidates,

    highInterestCandidates:
      highInterest,

    allResults,

    startedAt,

    completedAt:
      new Date()
        .toISOString(),
  };
}

export default
  scanCryptoMarket;
