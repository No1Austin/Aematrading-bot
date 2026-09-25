import { getCryptoUniverse } from "../universe/cryptoUniverseProvider.js";

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function firstFinite(...values) {
  for (const value of values) {
    const n = finiteOrNull(value);
    if (n !== null) return n;
  }
  return null;
}
function marketType(asset) {
  const cex = firstFinite(asset?.venues?.cexCount, asset?.cexCount) ?? 0;
  const dex = firstFinite(asset?.venues?.dexCount, asset?.dexCount) ?? 0;
  if (cex > 0 && dex > 0) return "CEX + DEX";
  if (dex > 0) return "DEX";
  if (cex > 0 || asset?.tradable === true) return "CEX";
  return asset?.marketType ?? null;
}
function normalize(asset, index) {
  return {
    rank: firstFinite(asset?.rank, asset?.marketCapRank, asset?.market_cap_rank) ?? index + 1,
    assetId: asset?.assetId ?? asset?.id ?? null,
    symbol: String(asset?.symbol ?? "").toUpperCase(),
    name: asset?.name ?? asset?.symbol ?? "Unknown asset",
    price: firstFinite(asset?.priceUsd, asset?.price, asset?.currentPrice, asset?.current_price),
    change24h: firstFinite(asset?.change24hPercent, asset?.change24h, asset?.priceChange24h, asset?.price_change_percentage_24h),
    marketCap: firstFinite(asset?.marketCapUsd, asset?.marketCap, asset?.market_cap),
    volume24h: firstFinite(asset?.volume24hUsd, asset?.volume24h, asset?.totalVolume24h, asset?.total_volume),
    marketType: marketType(asset),
    venue: asset?.primaryVenue ?? asset?.venue ?? asset?.venues?.primaryVenue ?? asset?.venues?.primary ?? asset?.exchange ?? null,
    tradable: asset?.tradable === true,
    network: asset?.network ?? null,
    contractAddress: asset?.contractAddress ?? null,
  };
}
function sumKnown(assets, field) {
  let total = 0, count = 0;
  for (const asset of assets) {
    const n = finiteOrNull(asset?.[field]);
    if (n === null) continue;
    total += n; count += 1;
  }
  return count ? total : null;
}
function weightedChange(assets) {
  let sum = 0, weight = 0;
  for (const asset of assets) {
    const c = finiteOrNull(asset?.change24h);
    const m = finiteOrNull(asset?.marketCap);
    if (c === null || m === null || m <= 0) continue;
    sum += c * m; weight += m;
  }
  return weight > 0 ? sum / weight : null;
}

export async function getCryptoMarketOverview({ refresh = false, maximumAssets = 1000 } = {}) {
  const universe = await getCryptoUniverse({
    refresh,
    maximumAssets,
    includeDexDiscovery: true,
  });

  const assets = Array.isArray(universe?.assets)
    ? universe.assets.map(normalize).filter(asset => Boolean(asset.symbol))
    : [];

  const totalMarketCap = sumKnown(assets, "marketCap");
  const volume24h = sumKnown(assets, "volume24h");
  const btc = assets.find(asset => asset.symbol === "BTC");
  const btcDominance =
    totalMarketCap > 0 && finiteOrNull(btc?.marketCap) !== null
      ? (btc.marketCap / totalMarketCap) * 100
      : null;

  return {
    approved: universe?.approved === true && assets.length > 0,
    status: universe?.status ?? (assets.length ? "COMPLETE" : "EMPTY"),
    assetCount: assets.length,
    assets,
    totalMarketCap,
    volume24h,
    btcDominance,
    marketChange24h: weightedChange(assets),
    composition: universe?.composition ?? null,
    providers: universe?.providers ?? null,
    warnings: Array.isArray(universe?.warnings) ? universe.warnings : [],
    errors: Array.isArray(universe?.errors) ? universe.errors : [],
    generatedAt: universe?.generatedAt ?? new Date().toISOString(),
    updatedAt: universe?.generatedAt ?? new Date().toISOString(),
    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export default getCryptoMarketOverview;
