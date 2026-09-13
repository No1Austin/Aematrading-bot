/**
 * ============================================================
 * CRYPTO CANDIDATE REGISTRY — PHASE 2.3
 * ============================================================
 *
 * Stores candidate action-policy metadata explicitly.
 */

import {
  applyCryptoCandidatePolicy,
  CRYPTO_CANDIDATE_TYPE,
} from "../policy/cryptoCandidateActionPolicy.js";

const candidates =
  new Map();

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

export function upsertCryptoCandidate(
  candidate,
) {
  const key =
    keyFor(
      candidate,
    );

  if (!key) {
    return {
      accepted:
        false,

      reason:
        "CANDIDATE_ID_REQUIRED",
    };
  }

  /*
   * Re-apply policy before persistence so callers cannot strip
   * the server-side action policy accidentally.
   */
  const protectedCandidate =
    applyCryptoCandidatePolicy(
      candidate,
    );

  const next = {
    ...candidates.get(
      key,
    ),

    ...protectedCandidate,

    registryUpdatedAt:
      new Date()
        .toISOString(),
  };

  candidates.set(
    key,
    next,
  );

  return {
    accepted:
      true,

    candidate:
      next,
  };
}

export function getCryptoCandidate(
  id,
) {
  return candidates.get(
    String(
      id ??
      "",
    )
      .trim()
      .toLowerCase(),
  ) ??
    null;
}

export function listCryptoCandidates({
  limit = 20,
  candidateType = null,
} = {}) {
  return [
    ...candidates.values(),
  ]
    .filter(
      candidate =>
        !candidateType ||
        candidate
          ?.candidateType ===
        candidateType,
    )
    .sort(
      (
        a,
        b,
      ) =>
        (
          Number(
            b?.scannerScore,
          ) ||
          0
        ) -
        (
          Number(
            a?.scannerScore,
          ) ||
          0
        ),
    )
    .slice(
      0,
      limit,
    );
}

export function listCryptoCexCandidates({
  limit = 20,
} = {}) {
  return listCryptoCandidates({
    limit,

    candidateType:
      CRYPTO_CANDIDATE_TYPE.CEX,
  });
}

export function listCryptoEmergingCandidates({
  limit = 20,
} = {}) {
  return listCryptoCandidates({
    limit,

    candidateType:
      CRYPTO_CANDIDATE_TYPE
        .EMERGING,
  });
}

export function clearCryptoCandidates() {
  candidates.clear();
}

export function getCryptoCandidateRegistryStats() {
  const values =
    [
      ...candidates.values(),
    ];

  return {
    count:
      values.length,

    cex:
      values.filter(
        candidate =>
          candidate
            ?.candidateType ===
          CRYPTO_CANDIDATE_TYPE.CEX,
      ).length,

    emerging:
      values.filter(
        candidate =>
          candidate
            ?.candidateType ===
          CRYPTO_CANDIDATE_TYPE
            .EMERGING,
      ).length,

    botEligible:
      values.filter(
        candidate =>
          candidate
            ?.botEligible ===
          true,
      ).length,

    executionEligible:
      values.filter(
        candidate =>
          candidate
            ?.executionEligible ===
          true,
      ).length,
  };
}

export default {
  upsertCryptoCandidate,
  getCryptoCandidate,
  listCryptoCandidates,
  listCryptoCexCandidates,
  listCryptoEmergingCandidates,
  clearCryptoCandidates,
  getCryptoCandidateRegistryStats,
};
