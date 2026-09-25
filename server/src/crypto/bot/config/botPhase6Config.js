export const BOT_PHASE6_CONFIG = Object.freeze({
  memory: {
    path: process.env.AEMA_BOT_TRADE_MEMORY_PATH || "./data/aema-bot-trade-memory.json",
    maximumRecords: 10000,
  },
  learning: {
    minimumComparableSample: 3,
    strongSample: 25,
    maximumInfluencePoints: 10,
    minimumSimilarity: 0.58,
    recencyHalfLifeDays: 90,
    dimensions: {
      direction: 1.50,
      technical: 1.00,
      fundamental: 0.65,
      marketStructure: 1.00,
      liquidity: 0.90,
      opportunity: 0.70,
      riskReward: 0.80,
      spread: 0.60,
      volatility: 0.70,
    },
  },
});
export default BOT_PHASE6_CONFIG;
