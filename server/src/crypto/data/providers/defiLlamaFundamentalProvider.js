/**
 * ============================================================
 * DEFILLAMA FUNDAMENTAL PROVIDER
 * ============================================================
 *
 * Free protocol endpoint:
 *   https://api.llama.fi/protocols
 *
 * The provider resolves a candidate conservatively by:
 *   1. exact symbol + close name
 *   2. exact normalized name
 *   3. unique exact symbol
 *
 * Ambiguous ticker matches are NOT guessed.
 */

const BASE =
  "https://api.llama.fi";

let protocolCache = null;
let protocolCacheAt = 0;

const CACHE_MS =
  5 * 60 * 1000;

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function symbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchProtocols() {
  if (
    protocolCache &&
    Date.now() -
      protocolCacheAt <
      CACHE_MS
  ) {
    return protocolCache;
  }

  const response =
    await fetch(
      `${BASE}/protocols`,
      {
        headers: {
          accept:
            "application/json",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `DefiLlama HTTP ${response.status}`,
    );
  }

  const rows =
    await response.json();

  protocolCache =
    Array.isArray(rows)
      ? rows
      : [];

  protocolCacheAt =
    Date.now();

  return protocolCache;
}

function resolveProtocol(
  rows,
  candidate,
) {
  const candidateSymbol =
    symbol(
      candidate?.symbol,
    );

  const candidateName =
    norm(
      candidate?.name,
    );

  const sameSymbol =
    rows.filter(
      row =>
        symbol(
          row?.symbol,
        ) ===
        candidateSymbol,
    );

  if (
    candidateName
  ) {
    const nameAndSymbol =
      sameSymbol.filter(
        row =>
          norm(
            row?.name,
          ) ===
            candidateName ||
          norm(
            row?.slug,
          ) ===
            candidateName,
      );

    if (
      nameAndSymbol.length ===
      1
    ) {
      return nameAndSymbol[0];
    }

    const exactName =
      rows.filter(
        row =>
          norm(
            row?.name,
          ) ===
            candidateName ||
          norm(
            row?.slug,
          ) ===
            candidateName,
      );

    if (
      exactName.length ===
      1
    ) {
      return exactName[0];
    }
  }

  if (
    sameSymbol.length ===
    1
  ) {
    return sameSymbol[0];
  }

  return null;
}

export async function getDefiLlamaFundamentals(
  candidate,
) {
  try {
    const rows =
      await fetchProtocols();

    const protocol =
      resolveProtocol(
        rows,
        candidate,
      );

    if (!protocol) {
      return {
        approved: false,
        status:
          "INSUFFICIENT_DATA",
        reason:
          "DEFILLAMA_PROTOCOL_NOT_RESOLVED",
        evidence: null,
      };
    }

    return {
      approved: true,
      status: "COMPLETE",
      provider: "DEFILLAMA",

      evidence: {
        id:
          protocol?.id ??
          null,

        slug:
          protocol?.slug ??
          null,

        name:
          protocol?.name ??
          null,

        symbol:
          protocol?.symbol ??
          null,

        category:
          protocol?.category ??
          null,

        chains:
          Array.isArray(
            protocol?.chains,
          )
            ? protocol.chains
            : [],

        tvlUsd:
          finiteOrNull(
            protocol?.tvl,
          ),

        marketCapUsd:
          finiteOrNull(
            protocol?.mcap,
          ),

        change1hPercent:
          finiteOrNull(
            protocol?.change_1h,
          ),

        change1dPercent:
          finiteOrNull(
            protocol?.change_1d,
          ),

        change7dPercent:
          finiteOrNull(
            protocol?.change_7d,
          ),

        stakingUsd:
          finiteOrNull(
            protocol?.staking,
          ),

        pool2Usd:
          finiteOrNull(
            protocol?.pool2,
          ),
      },
    };
  } catch (error) {
    return {
      approved: false,
      status: "ERROR",
      reason:
        error instanceof Error
          ? error.message
          : String(error),
      evidence: null,
    };
  }
}

export default
  getDefiLlamaFundamentals;
