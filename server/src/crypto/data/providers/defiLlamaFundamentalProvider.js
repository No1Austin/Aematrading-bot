/**
 * ============================================================
 * AEMA CRYPTO — DEFILLAMA FUNDAMENTAL PROVIDER
 * Phase 6.7
 * ============================================================
 *
 * Free bulk protocol endpoint:
 *   https://api.llama.fi/protocols
 *
 * Conservative resolution:
 *   1. exact symbol + exact normalized name/slug
 *   2. unique exact normalized name/slug
 *   3. unique exact symbol
 *
 * Ambiguous ticker matches are never guessed.
 */

const BASE = "https://api.llama.fi";

const CACHE_MS =
  Number(process.env.DEFILLAMA_FUNDAMENTAL_CACHE_MS) ||
  5 * 60 * 1000;

const TIMEOUT_MS =
  Number(process.env.CRYPTO_PROVIDER_TIMEOUT_MS) ||
  10_000;

let protocolCache = null;
let protocolCacheAt = 0;
let protocolCacheFetchedAt = null;
let protocolInflight = null;

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
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchProtocols({ refresh = false } = {}) {
  if (
    !refresh &&
    protocolCache &&
    Date.now() - protocolCacheAt < CACHE_MS
  ) {
    return protocolCache;
  }

  if (!refresh && protocolInflight) {
    return protocolInflight;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  protocolInflight = (async () => {
    try {
      const response = await fetch(
        `${BASE}/protocols`,
        {
          headers: {
            accept: "application/json",
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `DefiLlama HTTP ${response.status}`,
        );
      }

      const rows = await response.json();

      protocolCache =
        Array.isArray(rows)
          ? rows
          : [];

      protocolCacheAt = Date.now();
      protocolCacheFetchedAt = new Date(protocolCacheAt).toISOString();

      return protocolCache;
    } finally {
      clearTimeout(timer);
      protocolInflight = null;
    }
  })();

  return protocolInflight;
}

function resolveProtocol(rows, candidate) {
  const candidateSymbol =
    symbol(
      candidate?.symbol ??
      candidate?.measurements?.symbol,
    );

  const candidateName =
    norm(
      candidate?.name ??
      candidate?.measurements?.name,
    );

  const sameSymbol =
    candidateSymbol
      ? rows.filter(
          (row) =>
            symbol(row?.symbol) ===
            candidateSymbol,
        )
      : [];

  if (candidateName) {
    const nameAndSymbol =
      sameSymbol.filter(
        (row) =>
          norm(row?.name) === candidateName ||
          norm(row?.slug) === candidateName,
      );

    if (nameAndSymbol.length === 1) {
      return nameAndSymbol[0];
    }

    const exactName =
      rows.filter(
        (row) =>
          norm(row?.name) === candidateName ||
          norm(row?.slug) === candidateName,
      );

    if (exactName.length === 1) {
      return exactName[0];
    }
  }

  if (sameSymbol.length === 1) {
    return sameSymbol[0];
  }

  return null;
}

export async function getDefiLlamaFundamentals(
  candidate,
  { refresh = false } = {},
) {
  try {
    const rows =
      await fetchProtocols({ refresh });

    const protocol =
      resolveProtocol(rows, candidate);

    if (!protocol) {
      return {
        approved: false,
        status: "INSUFFICIENT_DATA",
        reason: "DEFILLAMA_PROTOCOL_NOT_RESOLVED",
        evidence: null,
      };
    }

    return {
      approved: true,
      status: "COMPLETE",
      provider: "DEFILLAMA",
      fetchedAt: protocolCacheFetchedAt,
      evidence: {
        id: protocol?.id ?? null,
        slug: protocol?.slug ?? null,
        name: protocol?.name ?? null,
        symbol: protocol?.symbol ?? null,
        category: protocol?.category ?? null,
        url: protocol?.url ?? null,
        chains:
          Array.isArray(protocol?.chains)
            ? protocol.chains
            : [],
        tvlUsd: finiteOrNull(protocol?.tvl),
        marketCapUsd: finiteOrNull(protocol?.mcap),
        change1hPercent: finiteOrNull(protocol?.change_1h),
        change1dPercent: finiteOrNull(protocol?.change_1d),
        change7dPercent: finiteOrNull(protocol?.change_7d),
        stakingUsd: finiteOrNull(protocol?.staking),
        pool2Usd: finiteOrNull(protocol?.pool2),
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

export function clearDefiLlamaFundamentalCache() {
  protocolCache = null;
  protocolCacheAt = 0;
  protocolCacheFetchedAt = null;
  protocolInflight = null;
}

export default getDefiLlamaFundamentals;
