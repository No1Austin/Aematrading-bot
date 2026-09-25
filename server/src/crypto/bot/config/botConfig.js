/**
 * AEMA Independent Crypto Bot — Phase 2 Configuration
 * Independent from the legacy scanner/Q2 architecture.
 */
export const BOT_CONFIG = Object.freeze({
  universe: {
    exchange: "BINANCE_USDM",
    quoteAssets: ["USDT", "USDC"],
    contractType: "PERPETUAL",
    maximumSymbols: 1000,
    timeoutMs: 12000,
  },

  eligibility: {
    requireTradingStatus: true,
    requirePerpetual: true,
    requireValidPrice: true,
    requireMarketData: true,
    minimumPrice: 0,
  },

  opportunity: {
    topN: 20,
    minimumQuoteVolumeUsd: 1_000_000,
    minimumAbsoluteChangePercent: 0,
    weights: Object.freeze({
      volume: 0.25,
      liquidity: 0.25,
      volatility: 0.20,
      momentum: 0.15,
      activity: 0.15,
    }),
  },

  research: {
    topN: 10,
    candleInterval: "15m",
    candleLimit: 96,
    depthLimit: 100,
    timeoutMs: 12000,

    // Comparative research weights. No fixed "75 = trade" threshold.
    weights: Object.freeze({
      technical: 0.20,
      fundamental: 0.20,
      narrative: 0.15,
      news: 0.15,
      marketStructure: 0.15,
      liquidity: 0.15,
    }),
  },

  setup: {
    candleInterval: "5m",
    candleLimit: 100,
    atrPeriod: 14,
    structureLookback: 20,
    depthLimit: 100,
    slippageNotionalUsd: 1000,
    timeoutMs: 12000,
    maximumObservationAgeMs: 420000,
    atrStopBufferMultiplier: 0.25,
    targetAtrExtensionMultiplier: 1.5,
  },

  executionRanking: {
    weights: Object.freeze({
      research: 0.15,
      directionSeparation: 0.10,
      riskReward: 0.25,
      spread: 0.15,
      slippage: 0.15,
      depth: 0.10,
      freshness: 0.10,
    }),
  },

  account: {
    startingEquityUsd: 10000,
    riskPerTradePercent: 1.0,
    maximumPositionNotionalPercent: 25,
    maximumMarginPercent: 20,
    maximumLeverage: 5,
    minimumLeverage: 1,
  },

  revalidation: {
    timeoutMs: 10000,
    maximumEntryDriftPercent: 0.35,
    maximumSpreadPercent: 0.50,
  },

  execution: {
    liveExecution: false,
    paperOnly: true,
  },
});

export default BOT_CONFIG;
