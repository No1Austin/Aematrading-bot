// server/src/config/riskConfig.js

/**
 * ============================================================
 * TRADING BOT — MASTER RISK CONFIGURATION
 * ============================================================
 *
 * PURPOSE
 * -------
 * Central configuration for:
 *
 * - Trade qualification
 * - LONG / SHORT trades
 * - Position sizing
 * - Volatility adjustment
 * - Initial stop loss
 * - Trailing loss
 * - Trailing gain / profit locking
 * - Market regime handling
 * - Portfolio correlation control
 * - Drawdown protection
 * - Liquidity checks
 * - Spread/slippage checks
 * - Cost modelling
 * - Execution safety
 *
 * IMPORTANT
 * ---------
 * Start with:
 *
 * liveTradingEnabled: false
 *
 * All parameters should first be validated through:
 *
 * 1. Historical backtesting
 * 2. Out-of-sample testing
 * 3. Paper trading
 *
 * Do not assume any parameter is universally optimal.
 */

export const RISK_CONFIG = {
  // ==========================================================
  // 1. GLOBAL TRADING MODE
  // ==========================================================

  trading: {
    /**
     * HARD SAFETY SWITCH
     *
     * false:
     * - Backtesting
     * - Simulation
     * - Paper trading
     *
     * true:
     * - Live execution may be permitted by execution layer.
     *
     * Leave FALSE during development.
     */
    liveTradingEnabled: false,

    allowLong: true,

    allowShort: true,

    /**
     * Prevent multiple independent positions on the same
     * symbol unless pyramiding is added later.
     */
    onePositionPerSymbol: true,

    /**
     * Maximum number of simultaneous positions.
     *
     * Portfolio risk controls may reduce this further.
     */
    maxOpenPositions: 4,

    /**
     * Prevent trades outside supported trading sessions.
     */
    requireMarketOpen: true,

    /**
     * Do not automatically carry intraday trades overnight.
     *
     * Can later become strategy-specific.
     */
    allowOvernightPositions: false,
  },

  // ==========================================================
  // 2. ENTRY SCORE / QUALITY GATE
  // ==========================================================

  entry: {
    /**
     * USER REQUIREMENT:
     *
     * Minimum score required before trade can be considered.
     */
    minimumScore: 80,

    /**
     * 80% does NOT automatically mean execute.
     *
     * The trade must still pass:
     *
     * - Risk
     * - Volatility
     * - Liquidity
     * - Portfolio exposure
     * - Cost
     * - Market regime
     * - Execution
     */
    requireRiskApproval: true,

    requireLiquidityApproval: true,

    requireVolatilityApproval: true,

    requirePortfolioApproval: true,

    requireCostApproval: true,

    requireMarketRegimeApproval: true,

    /**
     * Reject stale market data.
     */
    maxMarketDataAgeSeconds: 10,

    /**
     * Maximum acceptable bid/ask spread.
     *
     * 0.003 = 0.30%
     */
    maximumSpreadPercent: 0.003,

    /**
     * Used initially as a quality requirement.
     *
     * Trend strategies may later rely more heavily on
     * trailing exits than fixed profit targets.
     */
    preferredMinimumRewardRiskRatio: 2.0,

    confirmation: {
      requireTrendConfirmation: true,

      requireMomentumConfirmation: true,

      requireVolumeConfirmation: true,

      requireMarketRegimeConfirmation: true,

      /**
       * Four possible confirmation categories above.
       */
      minimumConfirmations: 3,
    },

    /**
     * Backtesting should test alternative score thresholds.
     *
     * 80 remains our production candidate until the data
     * demonstrates a better threshold.
     */
    optimization: {
      enabled: true,

      candidateThresholds: [
        70,
        75,
        80,
        85,
        90,
      ],
    },
  },

  // ==========================================================
  // 3. TRADE SCORING
  // ==========================================================

  scoring: {
    minimumScore: 0,

    maximumScore: 100,

    /**
     * Total = 100
     *
     * These weights are starting assumptions.
     *
     * They should later be evaluated independently using
     * backtesting and out-of-sample validation.
     */
    weights: {
      technicalSetup: 20,

      trend: 15,

      momentum: 15,

      volume: 10,

      marketRegime: 10,

      volatilityQuality: 10,

      rewardRisk: 10,

      newsSentiment: 5,

      liquidityQuality: 5,
    },

    levels: {
      reject: {
        min: 0,
        max: 59.99,
      },

      watch: {
        min: 60,
        max: 69.99,
      },

      possible: {
        min: 70,
        max: 79.99,
      },

      approved: {
        min: 80,
        max: 89.99,
      },

      strong: {
        min: 90,
        max: 100,
      },
    },
  },

  // ==========================================================
  // 4. POSITION SIZING
  // ==========================================================

  positionSizing: {
    /**
     * Initial simulation setting:
     *
     * 0.005 = risk up to 0.50% account equity per trade.
     */
    baseRiskPerTrade: 0.005,

    /**
     * Lower bound available to dynamic sizing.
     */
    minimumRiskPerTrade: 0.0025,

    /**
     * Absolute risk ceiling for one trade.
     *
     * 0.01 = 1%
     */
    maximumRiskPerTrade: 0.01,

    /**
     * Prevent an apparently low-risk trade from consuming
     * too much capital.
     *
     * 0.20 = maximum 20% account allocation per trade.
     */
    maximumCapitalAllocation: 0.20,

    /**
     * Small positions may become pointless after trading costs.
     */
    minimumPositionValue: 25,

    /**
     * Position quantity must not exceed available buying power.
     */
    respectBuyingPower: true,

    /**
     * Core principle:
     *
     * quantity =
     *
     * accountRiskAmount / riskPerShare
     */
    useStopDistanceForSizing: true,

    /**
     * Scale size down when volatility becomes elevated.
     */
    volatilityAdjusted: true,

    /**
     * Reduce size if existing positions are highly correlated.
     */
    correlationAdjusted: true,

    /**
     * Reduce position size under adverse market regimes.
     */
    marketRegimeAdjusted: true,

    /**
     * Include expected execution costs before deciding the
     * final quantity.
     */
    costAdjusted: true,

    /**
     * Never automatically increase risk because a prior
     * trade lost.
     *
     * Prevents martingale-style behaviour.
     */
    allowMartingale: false,
  },

  // ==========================================================
  // 5. INITIAL STOP LOSS
  // ==========================================================

  initialStop: {
    enabled: true,

    /**
     * PRIMARY METHOD
     *
     * ATR adapts the stop to current volatility.
     */
    method: "ATR",

    atrPeriod: 14,

    atrMultiplier: 1.5,

    /**
     * Guardrail:
     *
     * Do not use an unrealistically tiny stop.
     */
    minimumStopPercent: 0.005,

    /**
     * Reject trades requiring stops wider than this unless
     * a future strategy explicitly overrides it.
     *
     * 0.04 = 4%
     */
    maximumStopPercent: 0.04,

    /**
     * Stop can tighten.
     *
     * Stop must NEVER be widened after entry simply because
     * the trade moved against us.
     */
    allowStopWideningAfterEntry: false,

    /**
     * LONG:
     *
     * stop < entry
     *
     * SHORT:
     *
     * stop > entry
     */
    validateDirection: true,
  },

  // ==========================================================
  // 6. TRAILING LOSS
  // ==========================================================

  trailingLoss: {
    enabled: true,

    /**
     * Do not immediately trail from the first tiny movement.
     */
    activationMode: "R_OR_PERCENT",

    /**
     * Activate once trade reaches +1R.
     *
     * R = original amount risked per share.
     */
    activationR: 1.0,

    /**
     * Percentage fallback.
     *
     * 0.01 = +1%
     */
    activationProfitPercent: 0.01,

    /**
     * Prefer volatility-aware trailing.
     */
    method: "ATR",

    atrPeriod: 14,

    atrMultiplier: 1.25,

    /**
     * Used only when ATR is unavailable.
     */
    fallbackTrailPercent: 0.0125,

    /**
     * LONG:
     *
     * trailing stop follows highest price upward.
     *
     * SHORT:
     *
     * trailing stop follows lowest price downward.
     */
    trackBestPrice: true,

    /**
     * Once stop protection improves it cannot move backward.
     */
    tightenOnly: true,

    /**
     * Optional move toward break-even once trade performs.
     */
    breakEven: {
      enabled: true,

      activationR: 1.0,

      /**
       * 0 means exact entry.
       *
       * Later we may include transaction costs so break-even
       * becomes true net break-even.
       */
      lockR: 0,

      /**
       * Tiny buffer beyond entry to help account for costs.
       *
       * 0.001 = 0.10%
       */
      bufferPercent: 0.001,
    },
  },

  // ==========================================================
  // 7. TRAILING GAIN / PROFIT PROTECTION
  // ==========================================================

  trailingGain: {
    enabled: true,

    /**
     * Profit protection is primarily defined in R multiples.
     *
     * Example:
     *
     * Entry = $100
     * Initial stop = $98
     *
     * Initial risk = $2 = 1R
     *
     * $102 = +1R
     * $104 = +2R
     * $106 = +3R
     */
    useRMultiples: true,

    /**
     * Start gain protection after meaningful progress.
     */
    activationR: 1.5,

    /**
     * Fallback activation when R information is unavailable.
     */
    fallbackActivationProfitPercent: 0.02,

    /**
     * Progressive profit locking.
     *
     * As the trade becomes more profitable, we allow
     * progressively less profit to be given back.
     */
    progressiveLocking: {
      enabled: true,

      levels: [
        {
          activationR: 1.0,

          /**
           * At +1R:
           *
           * At minimum protect break-even territory.
           */
          minimumLockedR: 0,
        },

        {
          activationR: 1.5,

          minimumLockedR: 0.5,

          maximumGivebackR: 1.0,
        },

        {
          activationR: 2.0,

          minimumLockedR: 1.0,

          maximumGivebackR: 0.75,
        },

        {
          activationR: 3.0,

          minimumLockedR: 2.0,

          maximumGivebackR: 0.60,
        },

        {
          activationR: 4.0,

          minimumLockedR: 3.0,

          maximumGivebackR: 0.50,
        },

        {
          activationR: 5.0,

          minimumLockedR: 4.0,

          maximumGivebackR: 0.40,
        },
      ],
    },

    /**
     * ATR can also be used to prevent the profit trail from
     * becoming unrealistically tight during volatile moves.
     */
    volatilityAware: {
      enabled: true,

      atrPeriod: 14,

      atrMultiplier: 1.5,
    },

    /**
     * Never loosen a gain-protection level once it has moved
     * in our favour.
     */
    tightenOnly: true,
  },

  // ==========================================================
  // 8. TAKE PROFIT
  // ==========================================================

  takeProfit: {
    enabled: true,

    /**
     * We do NOT force every trend trade to close exactly
     * at 2R.
     */
    mode: "DYNAMIC",

    preferredRewardRiskRatio: 2,

    /**
     * Strong trends may continue beyond the original target.
     */
    allowRunner: true,

    /**
     * Different trade types may eventually behave differently.
     */
    strategyModes: {
      TREND: {
        preferTrailingExit: true,

        forceFixedTarget: false,
      },

      MEAN_REVERSION: {
        preferTrailingExit: false,

        forceFixedTarget: true,
      },
    },

    partialExit: {
      /**
       * OFF initially.
       *
       * We can test whether partial profit taking improves
       * risk-adjusted returns.
       */
      enabled: false,

      firstTargetR: 2,

      firstExitFraction: 0.50,
    },
  },

  // ==========================================================
  // 9. LONG / BUY CONFIGURATION
  // ==========================================================

  long: {
    enabled: true,

    direction: "LONG",

    openingAction: "BUY",

    closingAction: "SELL",

    requireBullishBias: true,

    requirePositiveMomentum: true,

    /**
     * Can later be turned on for specific intraday strategies.
     */
    requirePriceAboveVWAP: false,

    positionSizeMultiplier: 1.0,
  },

  // ==========================================================
  // 10. SHORT / SELL CONFIGURATION
  // ==========================================================

  short: {
    enabled: true,

    direction: "SHORT",

    /**
     * Keep this explicit.
     *
     * SELL could otherwise be confused with closing a LONG.
     */
    openingAction: "SELL_SHORT",

    closingAction: "BUY_TO_COVER",

    requireBearishBias: true,

    requireNegativeMomentum: true,

    requirePriceBelowVWAP: false,

    /**
     * Broker must indicate that security can actually
     * be borrowed for shorting.
     */
    requireShortableSecurity: true,

    /**
     * Reject difficult/expensive short borrow situations
     * when broker data is available.
     */
    rejectHardToBorrow: true,

    includeBorrowCost: true,

    /**
     * Shorts start smaller than comparable LONG positions
     * because their risk characteristics differ.
     */
    positionSizeMultiplier: 0.75,

    /**
     * Do not open new shorts during abnormal trading events.
     */
    blockDuringTradingHalts: true,

    blockIfBorrowDataUnavailable: true,
  },

  // ==========================================================
  // 11. MARKET REGIME ENGINE
  // ==========================================================

  marketRegime: {
    enabled: true,

    possibleRegimes: [
      "STRONG_BULL",
      "BULL",
      "SIDEWAYS",
      "BEAR",
      "STRONG_BEAR",
      "HIGH_VOLATILITY",
    ],

    /**
     * Risk engine can change exposure based on the broader
     * environment.
     */
    adjustPositionSize: true,

    adjustEntryThreshold: true,

    adjustTrailingDistance: true,

    adjustLongShortBias: true,

    rules: {
      STRONG_BULL: {
        longSizeMultiplier: 1.0,

        shortSizeMultiplier: 0.50,

        additionalLongScoreRequired: 0,

        additionalShortScoreRequired: 5,
      },

      BULL: {
        longSizeMultiplier: 1.0,

        shortSizeMultiplier: 0.75,

        additionalLongScoreRequired: 0,

        additionalShortScoreRequired: 3,
      },

      SIDEWAYS: {
        longSizeMultiplier: 0.75,

        shortSizeMultiplier: 0.75,

        additionalLongScoreRequired: 3,

        additionalShortScoreRequired: 3,
      },

      BEAR: {
        longSizeMultiplier: 0.75,

        shortSizeMultiplier: 1.0,

        additionalLongScoreRequired: 3,

        additionalShortScoreRequired: 0,
      },

      STRONG_BEAR: {
        longSizeMultiplier: 0.50,

        shortSizeMultiplier: 1.0,

        additionalLongScoreRequired: 5,

        additionalShortScoreRequired: 0,
      },

      HIGH_VOLATILITY: {
        longSizeMultiplier: 0.50,

        shortSizeMultiplier: 0.50,

        additionalLongScoreRequired: 5,

        additionalShortScoreRequired: 5,
      },
    },
  },

  // ==========================================================
  // 12. VOLATILITY CONTROL
  // ==========================================================

  volatility: {
    enabled: true,

    useATR: true,

    atrPeriod: 14,

    /**
     * ATR / price.
     *
     * Reject setups where movement is extremely small.
     */
    minimumATRPercent: 0.002,

    /**
     * Reject extremely volatile securities.
     *
     * 0.08 = ATR equals 8% of price.
     */
    maximumATRPercent: 0.08,

    /**
     * Reduce exposure as volatility rises.
     */
    dynamicExposureReduction: true,

    tiers: [
      {
        maxATRPercent: 0.015,
        sizeMultiplier: 1.0,
      },

      {
        maxATRPercent: 0.03,
        sizeMultiplier: 0.85,
      },

      {
        maxATRPercent: 0.05,
        sizeMultiplier: 0.65,
      },

      {
        maxATRPercent: 0.08,
        sizeMultiplier: 0.40,
      },
    ],
  },

  // ==========================================================
  // 13. PORTFOLIO RISK
  // ==========================================================

  portfolioRisk: {
    enabled: true,

    maxOpenPositions: 4,

    /**
     * Prevent total simultaneous theoretical stop loss from
     * becoming excessive.
     *
     * 0.02 = 2% account equity.
     */
    maximumTotalOpenRiskPercent: 0.02,

    /**
     * Example:
     *
     * Avoid:
     *
     * NVDA LONG
     * AMD LONG
     * AVGO LONG
     * QQQ LONG
     *
     * all behaving like essentially one technology bet.
     */
    correlationControl: {
      enabled: true,

      /**
       * Starting threshold.
       *
       * Backtest this rather than assuming it is optimal.
       */
      highCorrelationThreshold: 0.75,

      maximumHighlyCorrelatedPositions: 2,

      reducePositionInsteadOfAlwaysRejecting: true,

      correlatedPositionSizeMultiplier: 0.50,
    },

    sectorExposure: {
      enabled: true,

      /**
       * 30% maximum portfolio allocation to one sector.
       */
      maximumSectorAllocation: 0.30,
    },

    /**
     * Avoid allowing all positions to point in the same
     * direction during unstable market conditions.
     */
    directionalExposure: {
      enabled: true,

      maximumNetLongExposure: 0.70,

      maximumNetShortExposure: 0.50,
    },
  },

  // ==========================================================
  // 14. ACCOUNT PROTECTION
  // ==========================================================

  accountProtection: {
    enabled: true,

    /**
     * Stop opening new positions after losing 2% of starting
     * session equity.
     */
    maximumDailyLossPercent: 0.02,

    /**
     * Hard account-level drawdown protection.
     */
    maximumAccountDrawdownPercent: 0.08,

    /**
     * Stop repeatedly trading when strategy appears to be
     * failing under current market conditions.
     */
    consecutiveLossLimit: 3,

    cooldownAfterConsecutiveLossesMinutes: 30,

    blockNewEntriesWhenTriggered: true,

    /**
     * Existing positions can still be closed.
     */
    allowRiskReducingOrders: true,

    /**
     * Never increase order size to recover previous losses.
     */
    recoverySizing: {
      enabled: false,
    },
  },

  // ==========================================================
  // 15. LIQUIDITY FILTER
  // ==========================================================

  liquidity: {
    enabled: true,

    /**
     * Example starting values.
     *
     * We will later tune these depending on our chosen
     * stock universe.
     */
    minimumAverageDailyVolume: 500_000,

    minimumDollarVolume: 5_000_000,

    maximumSpreadPercent: 0.003,

    /**
     * Avoid entering a position that is too large relative
     * to normal traded volume.
     */
    maximumParticipationRate: 0.01,
  },

  // ==========================================================
  // 16. COST MODEL
  // ==========================================================

  costModel: {
    enabled: true,

    includeCommission: true,

    includeSpread: true,

    includeSlippage: true,

    includeShortBorrowCost: true,

    /**
     * Default paper assumptions until broker-specific
     * information is available.
     */
    commission: {
      perOrder: 0,
    },

    slippage: {
      defaultPercent: 0.001,

      /**
       * Volatile/illiquid stocks can receive higher estimated
       * slippage later.
       */
      dynamic: true,
    },

    spread: {
      useLiveBidAskWhenAvailable: true,
    },

    /**
     * Trade must make economic sense AFTER costs.
     */
    rejectIfNetRewardRiskBelow: 1.5,

    rejectNegativeExpectedNetProfit: true,
  },

  // ==========================================================
  // 17. EXECUTION SAFETY
  // ==========================================================

  execution: {
    /**
     * Limit entries generally provide more price control.
     *
     * Exit orders triggered by risk rules may behave
     * differently.
     */
    preferredEntryOrderType: "LIMIT",

    preventDuplicateOrders: true,

    requireOrderIdempotency: true,

    /**
     * Do not enter if price has moved too far from the price
     * used by the strategy.
     *
     * 0.0025 = 0.25%
     */
    maximumEntrySlippagePercent: 0.0025,

    cancelEntryIfSignalInvalidated: true,

    cancelEntryIfScoreFallsBelowMinimum: true,

    cancelEntryIfMarketRegimeChangesMaterially: true,

    /**
     * HARD SOFTWARE KILL SWITCH
     */
    killSwitchEnabled: true,

    /**
     * If important data feeds fail:
     *
     * no new positions.
     */
    blockNewEntriesOnDataFailure: true,

    /**
     * Always permit exits intended to reduce risk.
     */
    allowEmergencyExit: true,
  },

  // ==========================================================
  // 18. DATA QUALITY
  // ==========================================================

  dataQuality: {
    enabled: true,

    requireValidPrice: true,

    requireBidAsk: true,

    requireVolume: true,

    requireATR: true,

    rejectNaNValues: true,

    rejectZeroOrNegativePrices: true,

    rejectStaleData: true,

    maxPriceAgeSeconds: 10,
  },

  // ==========================================================
  // 19. BACKTEST / OPTIMIZATION
  // ==========================================================

  optimization: {
    enabled: true,

    /**
     * Never optimize exclusively for raw return.
     */
    objectives: {
      netReturn: true,

      expectancy: true,

      profitFactor: true,

      sharpeRatio: true,

      sortinoRatio: true,

      maximumDrawdown: true,

      tailLoss: true,

      tradingCosts: true,

      consistency: true,
    },

    /**
     * Protect against curve fitting.
     */
    validation: {
      requireTrainingPeriod: true,

      requireValidationPeriod: true,

      requireOutOfSamplePeriod: true,

      requireWalkForwardTesting: true,
    },

    /**
     * Parameters we explicitly expect to test.
     */
    parameterCandidates: {
      entryScores: [
        70,
        75,
        80,
        85,
        90,
      ],

      atrStopMultipliers: [
        1.0,
        1.25,
        1.5,
        1.75,
        2.0,
      ],

      baseRiskPerTrade: [
        0.0025,
        0.005,
        0.0075,
        0.01,
      ],

      trailingATRMultipliers: [
        1.0,
        1.25,
        1.5,
        2.0,
      ],
    },
  },
};

// ============================================================
// TRADE DIRECTIONS
// ============================================================

export const TRADE_SIDE = Object.freeze({
  LONG: "LONG",
  SHORT: "SHORT",
});

// ============================================================
// ORDER ACTIONS
// ============================================================

export const ORDER_ACTION = Object.freeze({
  BUY: "BUY",

  SELL: "SELL",

  SELL_SHORT: "SELL_SHORT",

  BUY_TO_COVER: "BUY_TO_COVER",
});

// ============================================================
// TRADE STATUS
// ============================================================

export const TRADE_STATUS = Object.freeze({
  CANDIDATE: "CANDIDATE",

  WATCH: "WATCH",

  POSSIBLE: "POSSIBLE",

  APPROVED: "APPROVED",

  STRONG: "STRONG",

  REJECTED: "REJECTED",

  OPEN: "OPEN",

  CLOSED: "CLOSED",
});

// ============================================================
// MARKET REGIMES
// ============================================================

export const MARKET_REGIME = Object.freeze({
  STRONG_BULL: "STRONG_BULL",

  BULL: "BULL",

  SIDEWAYS: "SIDEWAYS",

  BEAR: "BEAR",

  STRONG_BEAR: "STRONG_BEAR",

  HIGH_VOLATILITY: "HIGH_VOLATILITY",
});

// ============================================================
// EXIT REASONS
// ============================================================

export const EXIT_REASON = Object.freeze({
  INITIAL_STOP: "INITIAL_STOP",

  TRAILING_LOSS: "TRAILING_LOSS",

  TRAILING_GAIN: "TRAILING_GAIN",

  TAKE_PROFIT: "TAKE_PROFIT",

  SIGNAL_INVALIDATED: "SIGNAL_INVALIDATED",

  END_OF_SESSION: "END_OF_SESSION",

  DAILY_LOSS_LIMIT: "DAILY_LOSS_LIMIT",

  ACCOUNT_DRAWDOWN_LIMIT: "ACCOUNT_DRAWDOWN_LIMIT",

  MANUAL_EXIT: "MANUAL_EXIT",

  EMERGENCY_EXIT: "EMERGENCY_EXIT",
});

// ============================================================
// HELPERS
// ============================================================

export function normalizeTradeScore(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    RISK_CONFIG.scoring.maximumScore,
    Math.max(
      RISK_CONFIG.scoring.minimumScore,
      value,
    ),
  );
}

export function getTradeStatus(score) {
  const normalized = normalizeTradeScore(score);

  if (
    normalized >=
    RISK_CONFIG.scoring.levels.strong.min
  ) {
    return TRADE_STATUS.STRONG;
  }

  if (
    normalized >=
    RISK_CONFIG.entry.minimumScore
  ) {
    return TRADE_STATUS.APPROVED;
  }

  if (
    normalized >=
    RISK_CONFIG.scoring.levels.possible.min
  ) {
    return TRADE_STATUS.POSSIBLE;
  }

  if (
    normalized >=
    RISK_CONFIG.scoring.levels.watch.min
  ) {
    return TRADE_STATUS.WATCH;
  }

  return TRADE_STATUS.REJECTED;
}

export function isBaseEntryScoreApproved(score) {
  return (
    normalizeTradeScore(score) >=
    RISK_CONFIG.entry.minimumScore
  );
}

// ============================================================
// MARKET REGIME SCORE ADJUSTMENT
// ============================================================

export function getRequiredScoreForRegime(
  side,
  regime,
) {
  const baseScore =
    RISK_CONFIG.entry.minimumScore;

  const rules =
    RISK_CONFIG.marketRegime.rules[regime];

  if (!rules) {
    return baseScore;
  }

  if (side === TRADE_SIDE.LONG) {
    return (
      baseScore +
      Number(
        rules.additionalLongScoreRequired || 0,
      )
    );
  }

  if (side === TRADE_SIDE.SHORT) {
    return (
      baseScore +
      Number(
        rules.additionalShortScoreRequired || 0,
      )
    );
  }

  return baseScore;
}

// ============================================================
// MARKET REGIME POSITION MULTIPLIER
// ============================================================

export function getRegimePositionMultiplier(
  side,
  regime,
) {
  const rules =
    RISK_CONFIG.marketRegime.rules[regime];

  if (!rules) {
    return 1;
  }

  if (side === TRADE_SIDE.LONG) {
    return Number(
      rules.longSizeMultiplier ?? 1,
    );
  }

  if (side === TRADE_SIDE.SHORT) {
    return Number(
      rules.shortSizeMultiplier ?? 1,
    );
  }

  return 1;
}

// ============================================================
// SIDE POSITION MULTIPLIER
// ============================================================

export function getSidePositionMultiplier(side) {
  if (side === TRADE_SIDE.LONG) {
    return RISK_CONFIG.long.positionSizeMultiplier;
  }

  if (side === TRADE_SIDE.SHORT) {
    return RISK_CONFIG.short.positionSizeMultiplier;
  }

  return 0;
}

// ============================================================
// TRADE SIDE VALIDATION
// ============================================================

export function isTradeSideEnabled(side) {
  if (side === TRADE_SIDE.LONG) {
    return (
      RISK_CONFIG.trading.allowLong &&
      RISK_CONFIG.long.enabled
    );
  }

  if (side === TRADE_SIDE.SHORT) {
    return (
      RISK_CONFIG.trading.allowShort &&
      RISK_CONFIG.short.enabled
    );
  }

  return false;
}

// ============================================================
// FINAL SCORE QUALIFICATION
// ============================================================

export function isScoreApprovedForEnvironment({
  score,
  side,
  regime,
}) {
  if (!isTradeSideEnabled(side)) {
    return false;
  }

  const requiredScore =
    getRequiredScoreForRegime(
      side,
      regime,
    );

  return (
    normalizeTradeScore(score) >=
    requiredScore
  );
}

export default RISK_CONFIG;