/**
 * AEMA Private Stock Research Bot
 *
 * Central configuration for:
 * - perpetual stocks universe
 * - market eligibility
 * - opportunity discovery
 * - research engines
 * - direction qualification
 * - setup construction
 * - setup qualification
 * - setup ranking
 * - monitored research setups
 *
 * Current stocks market-data provider:
 * - Gate USDT perpetual stocks
 *
 * IMPORTANT:
 * - The private market-search pipeline does NOT execute trades.
 * - Monitoring is observational only.
 * - Monitoring has no execution authority.
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
    exchange: "GATE",

    /*
     * Gate linear stocks currently use USDT settlement
     * in the active provider implementation.
     */
    quoteAssets: [
      "USDT",
    ],

    contractType: "PERPETUAL",

    maximumSymbols: 1000,

    timeoutMs: 12000,
  },

  /*
   * ---------------------------------------------------------
   * HARD MARKET ELIGIBILITY
   * ---------------------------------------------------------
   *
   * Markets must pass these checks before opportunity
   * ranking or deep research can occur.
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
   * ---------------------------------------------------------
   *
   * Cheap comparative scoring used to reduce the stocks
   * universe to the Top 20 research candidates.
   *
   * Participation uses stocks participation/open-interest
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
   *
   * Research uses 15-minute perpetual-stocks evidence.
   *
   * Missing evidence must remain unavailable/null.
   * It must never be fabricated as neutral or zero evidence.
   * ---------------------------------------------------------
   */
  research: {
    topN: 10,

    candleInterval: "15m",

    candleLimit: 96,

    depthLimit: 100,

    timeoutMs: 12000,

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
   * ---------------------------------------------------------
   *
   * LONG / SHORT remain internal setup semantics.
   *
   * User-facing research terminology should use:
   *
   * LONG  -> BULL
   * SHORT -> BEAR
   *
   * Direction alone is NOT sufficient to produce a setup.
   * Every required qualification below must pass before
   * the candidate can reach setup construction.
   * ---------------------------------------------------------
   */
  directionGate: {
    /*
     * Winning aggregate direction must score at least 58.
     */
    minimumDirectionalScore: 58,

    /*
     * Minimum difference between competing directional
     * aggregate scores.
     */
    minimumSeparation: 12,

    /*
     * Weighted confidence requirement.
     */
    minimumConfidence: 55,

    /*
     * At least 45% of configured research weight must
     * contain genuine available evidence.
     */
    minimumAvailableWeight: 0.45,

    /*
     * Technical and Market Structure must independently
     * support the selected direction by at least this amount.
     *
     * Prevents something like 50.1 / 49.9 from counting as
     * meaningful independent confirmation.
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
     * Maximum acceptable age of the setup market
     * observation.
     *
     * 420,000 ms = 7 minutes.
     */
    maximumObservationAgeMs:
      420_000,

    /*
     * Additional ATR distance beyond identified structure
     * when constructing the protective stop.
     */
    atrStopBufferMultiplier:
      0.25,

    /*
     * ATR extension used during target construction.
     */
    targetAtrExtensionMultiplier:
      1.5,
  },

  /*
   * ---------------------------------------------------------
   * SETUP QUALIFICATION
   * ---------------------------------------------------------
   *
   * Passing direction qualification does NOT automatically
   * mean a valid setup exists.
   * ---------------------------------------------------------
   */
  setupQualification: {
    minimumRiskReward: 1.5,

    maximumSpreadPercent: 0.50,
  },

  /*
   * ---------------------------------------------------------
   * SETUP RANKING
   * ---------------------------------------------------------
   *
   * Ranks qualified research setups.
   *
   * Despite the legacy property name "executionRanking",
   * this does NOT authorize or perform execution.
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
   * ---------------------------------------------------------
   *
   * Monitoring begins only after the user explicitly chooses
   * to monitor a qualified setup.
   *
   * Monitoring is observational.
   *
   * It MUST NOT:
   * - place an order
   * - open a position
   * - modify the paper account
   * - authorize live execution
   *
   * The background monitoring runtime will use these values
   * to observe entry activation, TP/SL outcomes and thesis
   * changes.
   * ---------------------------------------------------------
   */
  monitoring: {
    /*
     * -------------------------------------------------------
     * THESIS MONITORING
     * -------------------------------------------------------
     */

    /*
     * Flag weakening when confidence falls this many
     * percentage points from the original setup.
     */
    weakeningConfidenceDrop: 12,

    /*
     * Flag weakening when directional separation falls
     * this many points from the original setup.
     */
    weakeningSeparationDrop: 10,

    /*
     * Flag a setup when current price moves within this
     * percentage distance of its stop.
     */
    reboundDistanceToStopPercent:
      0.75,

    /*
     * -------------------------------------------------------
     * BACKGROUND MONITORING
     * -------------------------------------------------------
     */

    enabled: true,

    /*
     * Server-side monitoring frequency.
     *
     * The browser does not own monitoring.
     * Once a setup is registered, the backend runtime should
     * continue monitoring it independently.
     */
    intervalMs:
      15_000,

    /*
     * Use 1-minute candles for price-path observation.
     *
     * Candle high/low allows the monitor to detect a TP or
     * SL touch that occurred between runtime cycles.
     */
    priceMonitorCandleInterval:
      "1m",

    /*
     * Fetch enough recent candles to safely overlap the
     * previous monitoring observation.
     */
    priceMonitorCandleLimit:
      10,

    /*
     * -------------------------------------------------------
     * RESEARCH RE-EVALUATION
     * -------------------------------------------------------
     *
     * Price-path monitoring can run frequently, but the
     * heavier research engines do not need to run every
     * 15 seconds.
     *
     * Re-evaluate the research thesis every 5 minutes.
     */
    researchRefreshIntervalMs:
      5 * 60_000,

    /*
     * -------------------------------------------------------
     * ENTRY ACTIVATION
     * -------------------------------------------------------
     *
     * Monitoring a setup does not automatically mean its
     * proposed entry was filled.
     *
     * A setup should initially remain WAITING_ENTRY until
     * market evidence shows that its entry price was touched.
     *
     * Expire an untriggered setup after 24 hours.
     */
    maximumWaitingEntryAgeMs:
      24 * 60 * 60_000,

    /*
     * -------------------------------------------------------
     * TERMINAL OUTCOMES
     * -------------------------------------------------------
     *
     * Completed monitored setups should remain available
     * for history and learning.
     */
    retainCompletedMonitors:
      true,

    /*
     * OHLC candles do not reveal intrabar event ordering.
     *
     * If both TP and SL were touched inside the same candle
     * and their ordering cannot be determined, never invent
     * a WIN or LOSS.
     */
    ambiguousCandlePolicy:
      "RECORD_AMBIGUOUS",

    /*
     * -------------------------------------------------------
     * SAFETY
     * -------------------------------------------------------
     */

    executionAuthority:
      false,
  },

  /*
   * ---------------------------------------------------------
   * LEGACY ACCOUNT / PAPER-RISK CONFIGURATION
   * ---------------------------------------------------------
   *
   * Retained temporarily because legacy trading-cycle
   * modules still import these settings.
   *
   * The new runBotMarketSearch() pipeline and monitored
   * setup runtime must NOT use these values to execute
   * trades.
   * ---------------------------------------------------------
   */
  account: {
    startingEquityUsd:
      10_000,

    riskPerTradePercent:
      1.0,

    maximumPositionNotionalPercent:
      25,

    maximumMarginPercent:
      20,

    maximumLeverage:
      5,

    minimumLeverage:
      1,
  },

  /*
   * ---------------------------------------------------------
   * LEGACY REVALIDATION
   * ---------------------------------------------------------
   */
  revalidation: {
    timeoutMs:
      10_000,

    maximumEntryDriftPercent:
      0.35,

    maximumSpreadPercent:
      0.50,
  },

  /*
   * ---------------------------------------------------------
   * EXECUTION SAFETY
   * ---------------------------------------------------------
   *
   * The current private research pipeline has no live
   * execution authority.
   * ---------------------------------------------------------
   */
  execution: {
    liveExecution:
      false,

    paperOnly:
      true,
  },
});

export default BOT_CONFIG;