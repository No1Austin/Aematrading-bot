/**
 * AEMA CRYPTO — MARKET NORMALIZER
 * Phase 1.0 — CEX + DEX research normalization
 *
 * Research-only. No execution authority.
 */

export const STABLE_QUOTES = new Set(["USD", "USDC", "USDT", "DAI", "FDUSD", "TUSD"]);

export function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function lower(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeQuoteToUsd(quote, quoteUsd = null) {
  const q = upper(quote);
  if (q === "USD") return 1;
  const supplied = finite(quoteUsd);
  if (supplied !== null && supplied > 0) return supplied;
  if (STABLE_QUOTES.has(q)) return 1; // research approximation; flagged by caller
  return null;
}

export function normalizeMarket(row = {}) {
  const venueType = upper(row.venueType || row.type || "UNKNOWN");
  const baseSymbol = upper(row.baseSymbol || row.base);
  const quoteSymbol = upper(row.quoteSymbol || row.quote);
  const priceUsd = finite(row.priceUsd ?? row.price);
  const bidUsd = finite(row.bidUsd ?? row.bid);
  const askUsd = finite(row.askUsd ?? row.ask);
  const liquidityUsd = finite(row.liquidityUsd ?? row.reserveUsd);
  const volume24hUsd = finite(row.volume24hUsd ?? row.volume24h);

  const midpoint =
    bidUsd !== null && askUsd !== null && bidUsd > 0 && askUsd > 0
      ? (bidUsd + askUsd) / 2
      : priceUsd;

  const spreadPct =
    bidUsd !== null &&
    askUsd !== null &&
    midpoint !== null &&
    midpoint > 0
      ? ((askUsd - bidUsd) / midpoint) * 100
      : finite(row.spreadPct);

  return {
    venue: upper(row.exchange || row.venue || "UNKNOWN"),
    venueType,
    source: upper(row.source || row.exchange || "UNKNOWN"),
    productId: row.productId ?? row.pairAddress ?? row.poolAddress ?? row.poolId ?? null,
    pairAddress: row.pairAddress ?? row.poolAddress ?? null,
    chainId: lower(row.chainId || row.network) || null,
    baseSymbol,
    quoteSymbol,
    baseAddress: lower(row.baseAddress) || null,
    quoteAddress: lower(row.quoteAddress) || null,
    priceUsd,
    bidUsd,
    askUsd,
    midpointUsd: midpoint,
    spreadPct,
    volume24hUsd,
    liquidityUsd,
    marketCapUsd: finite(row.marketCapUsd),
    fdvUsd: finite(row.fdvUsd),
    transactions24h: finite(row.transactions24h),
    buys24h: finite(row.buys24h),
    sells24h: finite(row.sells24h),
    tradable: row.tradable !== false,
    status: upper(row.status || "UNKNOWN"),
    observedAt: row.observedAt ?? new Date().toISOString(),
    pairCreatedAt: row.pairCreatedAt ?? row.poolCreatedAt ?? null,
    url: row.url ?? null,
    labels: Array.isArray(row.labels) ? row.labels : [],
    depth: row.depth ?? null,
    fee: row.fee ?? null,
    transfer: row.transfer ?? null,
    identity: row.identity ?? null,
    raw: row.raw ?? null,
  };
}

export function dedupeMarkets(markets = []) {
  const seen = new Map();

  for (const market of markets.map(normalizeMarket)) {
    const key = [
      market.venueType,
      market.venue,
      market.chainId ?? "",
      market.productId ?? "",
      market.baseSymbol,
      market.quoteSymbol,
    ].join("|");

    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, market);
      continue;
    }

    const previousEvidence =
      Number(previous.priceUsd !== null) +
      Number(previous.volume24hUsd !== null) +
      Number(previous.liquidityUsd !== null) +
      Number(previous.bidUsd !== null && previous.askUsd !== null);

    const nextEvidence =
      Number(market.priceUsd !== null) +
      Number(market.volume24hUsd !== null) +
      Number(market.liquidityUsd !== null) +
      Number(market.bidUsd !== null && market.askUsd !== null);

    if (nextEvidence > previousEvidence) seen.set(key, market);
  }

  return [...seen.values()];
}

export function marketMatchesAsset(market, asset = {}) {
  const symbol = upper(asset.symbol);
  const address = lower(asset.address || asset.tokenAddress);

  if (address) {
    if (market.baseAddress && market.baseAddress === address) return true;
    return false;
  }

  return Boolean(symbol && upper(market.baseSymbol) === symbol);
}
