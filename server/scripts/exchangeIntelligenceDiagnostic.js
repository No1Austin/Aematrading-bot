/**
 * AEMA Exchange/Liquidity/Arbitrage diagnostic
 *
 * Run:
 *   node scripts/exchangeIntelligenceDiagnostic.js SOL
 *   node scripts/exchangeIntelligenceDiagnostic.js BTC
 */

import { getCryptoExchangeIntelligence } from "../src/crypto/research/exchangeIntelligence/cryptoExchangeIntelligenceService.js";

const symbol = String(process.argv[2] ?? "SOL").trim().toUpperCase();

const result = await getCryptoExchangeIntelligence({ symbol });

console.dir({
  asset: result.asset,
  status: result.status,
  summary: result.summary,
  liquidity: {
    status: result.liquidity?.status,
    volume24hUsd: result.liquidity?.volume24hUsd,
    dexLiquidityUsd: result.liquidity?.dexLiquidityUsd,
    topVenueVolumeSharePct: result.liquidity?.topVenueVolumeSharePct,
    top3VolumeSharePct: result.liquidity?.top3VolumeSharePct,
  },
  cex: result.cexMarkets?.slice(0, 10).map(m => ({
    venue: m.venue,
    pair: `${m.baseSymbol}/${m.quoteSymbol}`,
    priceUsd: m.priceUsd,
    bidUsd: m.bidUsd,
    askUsd: m.askUsd,
    spreadPct: m.spreadPct,
    volume24hUsd: m.volume24hUsd,
  })),
  dex: result.dexMarkets?.slice(0, 10).map(m => ({
    venue: m.venue,
    chain: m.chainId,
    pair: `${m.baseSymbol}/${m.quoteSymbol}`,
    priceUsd: m.priceUsd,
    liquidityUsd: m.liquidityUsd,
    volume24hUsd: m.volume24hUsd,
  })),
  arbitrage: {
    status: result.arbitrage?.status,
    observedCount: result.arbitrage?.observedCount,
    depthConfirmedCount: result.arbitrage?.depthConfirmedCount,
    top: result.arbitrage?.routes?.slice(0, 15),
  },
  errors: result.errors,
}, { depth: 8, colors: true });

if (!result.approved) process.exitCode = 2;
