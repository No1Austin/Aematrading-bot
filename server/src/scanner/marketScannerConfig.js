/**
 * ============================================================
 * MARKET SCANNER CONFIG
 * ============================================================
 *
 * Fast-screen configuration only.
 *
 * IMPORTANT:
 * - Scanner qualification is NOT trade approval.
 * - Scanner scores are NOT probabilities.
 * - Deep research remains responsible for final analysis.
 * - Execution remains behind the existing decision/risk gates.
 */

export const SCANNER_DIRECTION =
  Object.freeze({
    LONG: "LONG",
    SHORT: "SHORT",
    NEUTRAL: "NEUTRAL",
  });

export const SCANNER_STATUS =
  Object.freeze({
    QUALIFIED: "QUALIFIED",
    REJECTED: "REJECTED",
  });

export const MARKET_SCANNER_CONFIG =
  Object.freeze({
    /**
     * --------------------------------------------------------
     * HARD GATES
     * --------------------------------------------------------
     */

    minimumPrice: 5,

    minimumAverageDailyVolume:
      500_000,

    minimumDollarVolume:
      5_000_000,

    maximumSpreadPercent:
      0.01,

    requireTradable: true,

    /**
     * --------------------------------------------------------
     * QUALIFICATION
     * --------------------------------------------------------
     */

    minimumScannerScore: 70,

    /**
     * Require some separation between LONG and SHORT.
     *
     * This helps prevent a noisy stock from simultaneously
     * appearing strongly bullish and strongly bearish.
     */
    minimumDirectionEdge: 8,

    /**
     * --------------------------------------------------------
     * VOLUME
     * --------------------------------------------------------
     */

    relativeVolume: {
      minimumInteresting: 1.25,
      strong: 1.75,
      exceptional: 2.5,
    },

    /**
     * --------------------------------------------------------
     * MOMENTUM
     * --------------------------------------------------------
     *
     * Percent values:
     * 1 = 1%
     */

    momentum: {
      fiveMinuteStrong: 0.5,
      fifteenMinuteStrong: 1,
      sixtyMinuteStrong: 2,
    },

    /**
     * --------------------------------------------------------
     * VOLATILITY
     * --------------------------------------------------------
     */

    volatility: {
      minimumAtrPercent: 0.5,
      preferredAtrPercent: 1.5,
      maximumAtrPercent: 12,

      minimumRangePercent: 0.75,
      maximumRangePercent: 20,
    },

    /**
     * --------------------------------------------------------
     * SCORE WEIGHTS
     * --------------------------------------------------------
     *
     * Total = 100.
     */

    weights: Object.freeze({
      tradabilityLiquidity: 20,
      volume: 15,
      momentum: 20,
      volatility: 10,
      trend: 15,
      priceAction: 15,
      marketRegime: 5,
    }),

    /**
     * --------------------------------------------------------
     * QUEUE DEFAULTS
     * --------------------------------------------------------
     *
     * We'll consume these when we build the registry /
     * DeepResearchCoordinator.
     */

    candidateManagement:
      Object.freeze({
        maximumCandidatesPerScan:
          20,

        candidateCooldownMinutes:
          30,

        maximumConcurrentDeepResearch:
          1,
      }),
  });

export default MARKET_SCANNER_CONFIG;