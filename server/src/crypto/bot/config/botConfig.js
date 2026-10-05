/**
 * AEMA Private Futures Research Bot
 *
 * Central configuration for:
 * - Bybit perpetual universe
 * - market eligibility
 * - opportunity discovery
 * - research engines
 * - direction qualification
 * - setup construction
 * - setup qualification
 * - monitoring
 *
 * The private market-search pipeline does NOT execute trades.
 *
 * Legacy paper-execution settings remain temporarily for
 * compatibility with the old trading-cycle modules.
 */

export const BOT_CONFIG = Object.freeze({
  /*
   * ---------------------------------------------------------
   * FUTURES UNIVERSE
   * ---------------------------------------------------------
   */
  universe: {
    exchange: "BYBIT",

    quoteAssets: [
      "USDT",
      "USDC",
    ],

    contractType: "PERPETUAL",

    maximumSymbols: 1000,

    timeoutMs: 12000,
  },

  /*
   * ---------------------------------------------------------
   * HARD MARKET ELIGIBILITY
   * ---------------------------------------------------------
   */
  eligibility: {
    requireTradingStatus: true,

    requirePerpetual: true,

    requireValidPrice: true,

    requireMarketData: true,

    minimumPrice: 0,
  },

  /*
   * ---------------------------------------------------------
   * OPPORTUNITY DISCOVERY
   *
   * Cheap comparative scoring used to reduce the
   * futures universe to the Top 20 research candidates.
   *
   * Participation uses futures participation/open-interest
   * evidence rather than spot-style trade count.
   * ---------------------------------------------------------
   */
  opportunity: {
    topN: 20,

    minimumQuoteVolumeUsd:
      1_000_000,

    minimumAbsoluteChangePercent:
      0,

    weights: Object.freeze({
      volume: 0.25,

      liquidity: 0.25,

      volatility: 0.20,

      momentum: 0.15,

      participation: 0.15,
    }),
  },

  /*
   * ---------------------------------------------------------
   * DEEP RESEARCH
   * ---------------------------------------------------------
   */
  research: {
    topN: 10,

    candleInterval: "15m",

    candleLimit: 96,

    depthLimit: 100,

    timeoutMs: 12000,

    /*
     * Missing engines should remain unavailable.
     * They must not be fabricated as neutral/zero evidence.
     */
    weights: Object.freeze({
      technical: 0.20,

      fundamental: 0.20,

      narrative: 0.15,

      news: 0.15,

      marketStructure: 0.15,

      liquidity: 0.15,
    }),
  },

  /*
   * ---------------------------------------------------------
   * DIRECTION QUALIFICATION
   *
   * LONG / SHORT are internal semantics.
   *
   * Private portal mapping:
   * LONG  -> BUY SETUP
   * SHORT -> SELL SETUP
   *
   * Direction alone is NOT enough.
   * Every requirement below must pass before a setup
   * can reach the setup builder.
   * ---------------------------------------------------------
   */
  directionGate: {
    /*
     * Winning aggregate direction must score at least 58.
     */
    minimumDirectionalScore: 58,

    /*
     * Difference between LONG and SHORT aggregate scores.
     */
    minimumSeparation: 12,

    /*
     * Weighted confidence requirement.
     */
    minimumConfidence: 55,

    /*
     * At least 45% of configured research weight
     * must contain real available evidence.
     */
    minimumAvailableWeight: 0.45,

    /*
     * Technical and Market Structure must each
     * support the selected direction by at least
     * this amount.
     *
     * Prevents something such as 50.1 / 49.9 from
     * counting as meaningful independent confirmation.
     */
    minimumIndependentSeparation: 5,

    requireTechnical: true,

    requireMarketStructure: true,

    requireIndependentAgreement: true,
  },

  /*
   * ---------------------------------------------------------
   * FUTURES SETUP CONSTRUCTION
   * ---------------------------------------------------------
   */
  setup: {
    candleInterval: "5m",

    candleLimit: 100,

    atrPeriod: 14,

    structureLookback: 20,

    depthLimit: 100,

    slippageNotionalUsd: 1000,

    timeoutMs: 12000,

    /*
     * Maximum acceptable age of the market observation.
     * 420,000 ms = 7 minutes.
     */
    maximumObservationAgeMs:
      420000,

    atrStopBufferMultiplier:
      0.25,

    targetAtrExtensionMultiplier:
      1.5,
  },

  /*
   * ---------------------------------------------------------
   * SETUP QUALIFICATION
   *
   * Passing direction does NOT automatically mean
   * a BUY/SELL setup exists.
   * ---------------------------------------------------------
   */
  setupQualification: {
    minimumRiskReward: 1.5,

    maximumSpreadPercent: 0.50,
  },

  /*
   * ---------------------------------------------------------
   * SETUP RANKING
   *
   * This ranks qualified research setups.
   * It does NOT authorize execution.
   * ---------------------------------------------------------
   */
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

  /*
   * ---------------------------------------------------------
   * MONITORING
   *
   * Used after the user chooses to monitor a setup.
   * ---------------------------------------------------------
   */
  monitoring: {
    weakeningConfidenceDrop: 12,

    weakeningSeparationDrop: 10,

    reboundDistanceToStopPercent:
      0.75,
  },

  /*
   * ---------------------------------------------------------
   * LEGACY ACCOUNT / PAPER-RISK CONFIGURATION
   *
   * Keep temporarily because the old trading-cycle
   * modules still import these settings.
   *
   * The new runBotMarketSearch() pipeline does not
   * use these values to execute trades.
   * ---------------------------------------------------------
   */
  account: {
    startingEquityUsd: 10000,

    riskPerTradePercent: 1.0,

    maximumPositionNotionalPercent:
      25,

    maximumMarginPercent: 20,

    maximumLeverage: 5,

    minimumLeverage: 1,
  },

  /*
   * ---------------------------------------------------------
   * LEGACY FINAL REVALIDATION
   *
   * Retained temporarily for compatibility with the
   * old paper-trading cycle.
   * ---------------------------------------------------------
   */
  revalidation: {
    timeoutMs: 10000,

    maximumEntryDriftPercent:
      0.35,

    maximumSpreadPercent:
      0.50,
  },

  /*
   * ---------------------------------------------------------
   * EXECUTION SAFETY
   *
   * IMPORTANT:
   * Live execution remains disabled.
   * ---------------------------------------------------------
   */
  execution: {
    liveExecution: false,

    paperOnly: true,
  },
});

export default BOT_CONFIG;