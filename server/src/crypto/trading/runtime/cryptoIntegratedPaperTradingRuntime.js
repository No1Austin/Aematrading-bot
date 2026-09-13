/**
 * AEMA CRYPTO
 * Phase 5.23 / 5.24
 *
 * INTEGRATED CONTINUOUS PAPER TRADING RUNTIME
 *
 * Connects:
 * - Phase 5.20 stateful runtime
 * - Phase 5.22 trading intelligence pipeline
 * - Phase 5.19 paper trading orchestrator
 * - Phase 5.18 paper exchange adapter
 * - Phase 5.24 real runtime portfolio snapshot
 *
 * IMPORTANT
 * ---------
 * PAPER EXECUTION ONLY.
 *
 * liveExecution = false
 * executionAuthority = false
 */

import {
  runCryptoTradingIntelligencePipeline,
} from "../orchestration/cryptoTradingIntelligencePipeline.js";

import {
  runCryptoPaperTradeCycle,
} from "../orchestration/cryptoPaperTradingOrchestrator.js";


/**
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

const finite = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
};


const upper = (
  value,
  fallback = "",
) => {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
};


function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


function clamp01(
  value,
  fallback = 1,
) {
  const n =
    finite(value);

  if (n === null) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      1,
      n,
    ),
  );
}


function positionIsOpen(
  position,
) {
  const quantity =
    Math.max(
      0,
      finite(
        position?.quantity,
      ) ?? 0,
    );

  const direction =
    upper(
      position?.direction,
      "FLAT",
    );

  return (
    quantity > 0 &&
    (
      direction === "LONG" ||
      direction === "SHORT"
    )
  );
}


function riskPlanReady(
  riskPlan,
) {
  return (
    riskPlan &&
    riskPlan.approved === true
  );
}


/**
 * ============================================================
 * ENTRY LIFECYCLE NORMALIZATION
 * ============================================================
 *
 * Phase 5.22 can return:
 *
 * entryGate = ENTRY_ALLOWED
 * lifecycle = HOLD
 *
 * For a FLAT symbol that has genuinely passed the entry gate,
 * the integrated runtime must convert that into:
 *
 * OPEN_POSITION
 *
 * before execution planning.
 */

function normalizeEntryLifecycle({
  intelligence,
  currentPosition,
}) {
  const entryGate =
    intelligence?.entryGate;

  const decision =
    intelligence?.decision;

  const existingLifecycle =
    intelligence?.lifecycle ??
    {};

  const flat =
    !positionIsOpen(
      currentPosition,
    );

  if (
    !flat ||
    entryGate?.approved !== true
  ) {
    return existingLifecycle;
  }

  const direction =
    upper(
      entryGate?.direction ??
      decision?.preferredDirection,
      "NEUTRAL",
    );

  if (
    direction !== "LONG" &&
    direction !== "SHORT"
  ) {
    return existingLifecycle;
  }

  const exposure =
    clamp01(
      entryGate
        ?.exposureMultiplier ??
      decision
        ?.risk
        ?.exposureMultiplier,
      1,
    );

  return {
    ...existingLifecycle,

    state:
      "OPEN",

    action:
      "OPEN_POSITION",

    approved:
      true,

    direction,

    currentExposure:
      0,

    targetExposure:
      exposure,

    exposureChange:
      exposure,

    urgency:
      existingLifecycle
        ?.urgency ??
      "NORMAL",

    reasons: [
      ...new Set([
        ...(
          existingLifecycle
            ?.reasons ??
          []
        ),

        "ENTRY_GATE_APPROVED_OPEN_POSITION",
      ]),
    ],

    noExecutionAuthority:
      true,
  };
}


/**
 * ============================================================
 * MANAGEMENT LIFECYCLE NORMALIZATION
 * ============================================================
 */

function normalizeManagementLifecycle({
  intelligence,
  position,
}) {
  const lifecycle =
    intelligence?.lifecycle ??
    {};

  const monitorAction =
    upper(
      intelligence
        ?.liveMonitor
        ?.action,
    );

  const lifecycleAction =
    upper(
      lifecycle?.action,
    );

  /**
   * If lifecycle already produced a real action,
   * trust it.
   */

  if (
    lifecycleAction &&
    lifecycleAction !== "NONE"
  ) {
    return lifecycle;
  }

  const actionMap = {
    HOLD:
      "HOLD",

    ADD_EXPOSURE:
      "ADD_EXPOSURE",

    REDUCE_EXPOSURE:
      "REDUCE_EXPOSURE",

    TIGHTEN_STOP:
      "PROTECT_POSITION",

    MOVE_STOP_TO_BREAKEVEN:
      "PROTECT_POSITION",

    TRAIL_PROFIT:
      "PROTECT_POSITION",

    EXIT:
      "EXIT_POSITION",

    EMERGENCY_EXIT:
      "EMERGENCY_EXIT",
  };

  const mapped =
    actionMap[
      monitorAction
    ] ??
    "HOLD";

  const currentExposure =
    clamp01(
      position?.exposure ??
      position?.currentExposure,
      1,
    );

  let targetExposure =
    finite(
      lifecycle
        ?.targetExposure,
    );

  /**
   * Any full exit must explicitly target zero.
   */

  if (
    mapped ===
      "EXIT_POSITION" ||
    mapped ===
      "EMERGENCY_EXIT"
  ) {
    targetExposure =
      0;
  }

  if (
    targetExposure === null
  ) {
    targetExposure =
      currentExposure;
  }

  targetExposure =
    clamp01(
      targetExposure,
      currentExposure,
    );

  return {
    ...lifecycle,

    state:
      mapped ===
        "EXIT_POSITION" ||
      mapped ===
        "EMERGENCY_EXIT"
        ? "EXIT_PENDING"
        : (
            position
              ?.lifecycleState ??
            position?.state ??
            "OPEN"
          ),

    action:
      mapped,

    approved:
      true,

    direction:
      position?.direction,

    currentExposure,

    targetExposure,

    exposureChange:
      targetExposure -
      currentExposure,

    noExecutionAuthority:
      true,
  };
}


/**
 * ============================================================
 * INTELLIGENCE POSITION
 * ============================================================
 *
 * Builds the position structure consumed by:
 *
 * - live monitor
 * - dynamic stop manager
 * - lifecycle coordinator
 */

function buildIntelligencePosition({
  runtimePosition,
  market,
  storedEntryEngines,
}) {
  if (
    !positionIsOpen(
      runtimePosition,
    )
  ) {
    return null;
  }

  const currentPrice =
    finite(
      market?.price ??
      market?.markPrice ??
      market?.lastPrice,
    );

  const entryPrice =
    finite(
      runtimePosition
        ?.entryPrice ??
      runtimePosition
        ?.averageEntryPrice,
    );

  const currentStopPrice =
    finite(
      runtimePosition
        ?.currentStopPrice ??
      runtimePosition
        ?.stopPrice,
    );

  const currentExposure =
    clamp01(
      runtimePosition
        ?.currentExposure ??
      runtimePosition
        ?.exposure,
      1,
    );

  return {
    ...runtimePosition,

    entryPrice,

    currentPrice,

    currentStopPrice,

    currentExposure,

    exposure:
      currentExposure,

    entryEngines:
      storedEntryEngines ??
      runtimePosition
        ?.entryEngines ??
      null,
  };
}


/**
 * ============================================================
 * POSITION FOR EXECUTION PLANNING
 * ============================================================
 *
 * Trade intent / execution planning needs more than exchange
 * quantity.
 *
 * Especially for:
 *
 * - REDUCE_EXPOSURE
 * - EXIT_POSITION
 * - EMERGENCY_EXIT
 *
 * we preserve:
 *
 * quantity
 * direction
 * currentPrice
 * currentExposure
 * exposure
 * notionalUsd
 */

function buildExecutionPosition({
  runtimePosition,
  market,
}) {
  const position =
    runtimePosition ??
    {};

  const quantity =
    Math.max(
      0,
      finite(
        position?.quantity,
      ) ?? 0,
    );

  const currentPrice =
    finite(
      market?.price ??
      market?.markPrice ??
      market?.lastPrice ??
      position?.currentPrice ??
      position?.averageEntryPrice,
    );

  const currentExposure =
    positionIsOpen(
      position,
    )
      ? clamp01(
          position
            ?.currentExposure ??
          position
            ?.exposure,
          1,
        )
      : 0;

  const notionalUsd =
    (
      quantity > 0 &&
      currentPrice !== null &&
      currentPrice > 0
    )
      ? quantity *
        currentPrice
      : (
          finite(
            position?.notionalUsd,
          ) ??
          0
        );

  return {
    ...position,

    quantity,

    direction:
      positionIsOpen(
        position,
      )
        ? upper(
            position?.direction,
          )
        : "FLAT",

    currentPrice,

    currentExposure,

    exposure:
      currentExposure,

    notionalUsd,
  };
}


/**
 * ============================================================
 * PHASE 5.24 PORTFOLIO CONTEXT NORMALIZATION
 * ============================================================
 *
 * Phase 5.23 previously relied on:
 *
 * portfolioContextProvider()
 *
 * which often returned:
 *
 * { positions: [] }
 *
 * Phase 5.24 can now inject the actual paper runtime portfolio.
 *
 * Runtime portfolio truth takes priority over fallback provider
 * data for positions/account-level runtime metrics.
 */

function buildEffectivePortfolioContext({
  providerPortfolioContext,
  runtimePortfolioSnapshot,
}) {
  const provider =
    providerPortfolioContext ??
    {};

  if (
    !runtimePortfolioSnapshot
  ) {
    return provider;
  }

  return {
    ...provider,

    /**
     * Actual runtime positions take priority.
     */
    positions:
      runtimePortfolioSnapshot
        ?.positions ??
      provider?.positions ??
      [],

    /**
     * Preserve calculated portfolio metrics.
     */
    metrics:
      runtimePortfolioSnapshot
        ?.metrics ??
      provider?.metrics ??
      null,

    accountEquity:
      runtimePortfolioSnapshot
        ?.accountEquity ??
      provider?.accountEquity,

    drawdownPercent:
      runtimePortfolioSnapshot
        ?.drawdownPercent ??
      provider?.drawdownPercent,

    marketStress:
      runtimePortfolioSnapshot
        ?.marketStress ??
      provider?.marketStress,

    /**
     * Useful metadata for diagnostics.
     */
    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


/**
 * ============================================================
 * PAPER RESULT → STATEFUL RUNTIME
 * ============================================================
 */

async function adoptPaperResult({
  statefulRuntime,
  adapter,
  symbol,
  paperCycle,
  intelligence,
}) {
  if (!paperCycle) {
    return null;
  }

  /**
   * Exchange truth owns:
   *
   * - actual quantity
   * - actual direction
   */

  const exchangePosition =
    await adapter.getPosition(
      symbol,
    );

  const lifecycle =
    intelligence?.lifecycle ??
    {};

  const targetExposure =
    positionIsOpen(
      exchangePosition,
    )
      ? (
          finite(
            lifecycle
              ?.targetExposure,
          ) ??
          finite(
            exchangePosition
              ?.exposure,
          ) ??
          1
        )
      : 0;

  statefulRuntime
    .adoptExchangePosition({
      symbol,

      exchangePosition: {
        ...exchangePosition,

        exposure:
          targetExposure,
      },
    });


  /**
   * ==========================================================
   * EXECUTION STATE
   * ==========================================================
   */

  const executionState =
    paperCycle
      ?.executionState;

  if (executionState) {
    const clientOrderId =
      paperCycle
        ?.executionAdapter
        ?.executionRequest
        ?.clientOrderId;

    const currentRuntimeState =
      statefulRuntime
        .getSymbolState(
          symbol,
        );

    const activeOrder =
      currentRuntimeState
        ?.activeOrder;

    /**
     * Register only if runtime is not already tracking
     * an active order.
     */

    if (
      !activeOrder &&
      clientOrderId
    ) {
      const registration =
        statefulRuntime
          .registerOrder({
            symbol,

            order: {
              clientOrderId,

              status:
                executionState
                  ?.status ??
                "CREATED",

              requestedQuantity:
                executionState
                  ?.requestedQuantity,

              filledQuantity:
                executionState
                  ?.filledQuantity,

              remainingQuantity:
                executionState
                  ?.remainingQuantity,
            },
          });

      /**
       * Duplicate registration is not fatal.
       * Exchange truth remains authoritative.
       */

      void registration;
    }

    statefulRuntime
      .updateOrderState({
        symbol,

        executionState,
      });

    const terminal =
      [
        "FILLED",
        "CANCELLED",
        "REJECTED",
        "EXPIRED",
        "FAILED",
      ].includes(
        upper(
          executionState
            ?.status,
        ),
      );

    if (terminal) {
      const runtimeAfterOrder =
        statefulRuntime
          .getSymbolState(
            symbol,
          );

      if (
        runtimeAfterOrder
          ?.activeOrder
      ) {
        const clearResult =
          statefulRuntime
            .clearTerminalOrder({
              symbol,
            });

        void clearResult;
      }
    }
  }


  /**
   * ==========================================================
   * LIFECYCLE STATE
   * ==========================================================
   *
   * IMPORTANT:
   *
   * If exchange confirms FLAT, adoptExchangePosition()
   * has already converted the runtime position to CLOSED
   * and cleared exitPending.
   *
   * Never reapply EXIT_PENDING after exchange truth says FLAT.
   */

  if (
    positionIsOpen(
      exchangePosition,
    )
  ) {
    statefulRuntime
      .setLifecycleState({
        symbol,

        state:
          lifecycle?.state,

        action:
          lifecycle?.action,

        targetExposure:
          targetExposure,
      });
  }


  /**
   * ==========================================================
   * PROTECTIVE STOP
   * ==========================================================
   *
   * Protective stops belong only to an open position.
   */

  const stopPrice =
    finite(
      paperCycle
        ?.paperResult
        ?.stop
        ?.stopPrice ??
      intelligence
        ?.stopPlan
        ?.stopPrice,
    );

  if (
    stopPrice !== null &&
    stopPrice > 0 &&
    positionIsOpen(
      exchangePosition,
    )
  ) {
    statefulRuntime
      .updateProtectiveStop({
        symbol,

        stopPrice,
      });
  }

  return (
    statefulRuntime
      .getSymbolState(
        symbol,
      )
  );
}


/**
 * ============================================================
 * FACTORY
 * ============================================================
 */

export function createIntegratedCryptoPaperTradingRuntime({
  statefulRuntime,

  adapter,

  account = {},

  exchangeRules = {},

  portfolioContextProvider =
    null,

  finalIntelligenceProvider =
    null,

  engineContextProvider =
    null,

  executionContextProvider =
    null,

  entryRiskContextProvider =
    null,

  riskContextProvider =
    null,

  engineOverridesProvider =
    null,

  preferences = {},
} = {}) {
  if (!statefulRuntime) {
    throw new Error(
      "STATEFUL_RUNTIME_REQUIRED",
    );
  }

  if (!adapter) {
    throw new Error(
      "PAPER_EXCHANGE_ADAPTER_REQUIRED",
    );
  }

  /**
   * This integration layer is PAPER ONLY.
   */

  if (
    adapter.liveExecution ===
    true
  ) {
    throw new Error(
      "LIVE_EXCHANGE_ADAPTER_NOT_ALLOWED",
    );
  }

  if (
    statefulRuntime
      .liveExecutionEnabled ===
    true
  ) {
    throw new Error(
      "LIVE_STATEFUL_RUNTIME_NOT_ALLOWED",
    );
  }


  /**
   * ==========================================================
   * PROVIDER RESOLUTION
   * ==========================================================
   */

  async function resolveProvider(
    provider,
    context,
    fallback = {},
  ) {
    if (
      typeof provider ===
      "function"
    ) {
      const value =
        await provider(
          context,
        );

      return (
        value ??
        fallback
      );
    }

    return fallback;
  }


  /**
   * ==========================================================
   * PROCESS ONE MARKET SNAPSHOT
   * ==========================================================
   */

  async function processMarketSnapshot({
    symbol,

    candidate,

    market,

    cycleKey = null,

    paperOverrides = {},

    forceEngineOverrides = null,

    /**
     * Phase 5.24
     *
     * Real portfolio snapshot constructed from the current
     * stateful paper runtime.
     */
    runtimePortfolioSnapshot = null,
  } = {}) {
    const normalizedSymbol =
      upper(
        symbol ??
        candidate?.symbol,
      );

    if (!normalizedSymbol) {
      return {
        approved:
          false,

        status:
          "INTEGRATED_RUNTIME_BLOCKED",

        blocker:
          "SYMBOL_REQUIRED",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    /**
     * ========================================================
     * CURRENT RUNTIME STATE
     * ========================================================
     */

    const before =
      statefulRuntime
        .getSymbolState(
          normalizedSymbol,
        );

    const open =
      positionIsOpen(
        before?.position,
      );

    const initialAction =
      open
        ? "HOLD"
        : "OPEN_POSITION";

    const requestedDirection =
      open
        ? before
            ?.position
            ?.direction
        : "FLAT";

    const resolvedCycleKey =
      cycleKey ??
      `${normalizedSymbol}:${Date.now()}`;


    /**
     * ========================================================
     * STATEFUL CYCLE LOCK
     * ========================================================
     */

    const cycle =
      statefulRuntime
        .beginCycle({
          symbol:
            normalizedSymbol,

          cycleKey:
            resolvedCycleKey,

          action:
            initialAction,

          requestedDirection,
        });

    if (
      cycle?.approved !==
      true
    ) {
      return {
        approved:
          false,

        status:
          cycle?.status ??
          "INTEGRATED_RUNTIME_BLOCKED",

        blocker:
          cycle?.blocker,

        runtimeCycle:
          cycle,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    try {
      /**
       * ======================================================
       * PROVIDER CONTEXT
       * ======================================================
       */

      const providerContext = {
        symbol:
          normalizedSymbol,

        candidate,

        market,

        runtimeState:
          before,

        position:
          before?.position,

        runtimePortfolioSnapshot,
      };


      /**
       * ======================================================
       * LOAD PROVIDER CONTEXT
       * ======================================================
       */

      const [
        portfolioContext,
        finalIntelligence,
        engineContext,
        executionContext,
        entryRiskContext,
        riskContext,
        providedOverrides,
      ] =
        await Promise.all([
          resolveProvider(
            portfolioContextProvider,
            providerContext,
            {
              positions: [],
            },
          ),

          resolveProvider(
            finalIntelligenceProvider,
            providerContext,
            null,
          ),

          resolveProvider(
            engineContextProvider,
            providerContext,
            {},
          ),

          resolveProvider(
            executionContextProvider,
            providerContext,
            {},
          ),

          resolveProvider(
            entryRiskContextProvider,
            providerContext,
            {},
          ),

          resolveProvider(
            riskContextProvider,
            providerContext,
            {},
          ),

          resolveProvider(
            engineOverridesProvider,
            providerContext,
            {},
          ),
        ]);


      /**
       * ======================================================
       * PHASE 5.24 REAL PORTFOLIO CONTEXT
       * ======================================================
       */

      const effectivePortfolioContext =
        buildEffectivePortfolioContext({
          providerPortfolioContext:
            portfolioContext,

          runtimePortfolioSnapshot,
        });


      const engineOverrides =
        forceEngineOverrides ??
        providedOverrides ??
        {};


      /**
       * ======================================================
       * BUILD INTELLIGENCE POSITION
       * ======================================================
       */

      const intelligencePosition =
        buildIntelligencePosition({
          runtimePosition:
            before?.position,

          market,

          storedEntryEngines:
            before?.entryEngines,
        });


      /**
       * ======================================================
       * PHASE 5.22 INTELLIGENCE
       * ======================================================
       */

      const intelligence =
        await runCryptoTradingIntelligencePipeline({
          candidate,

          position:
            intelligencePosition,

          entryEngines:
            before
              ?.entryEngines ??
            intelligencePosition
              ?.entryEngines ??
            null,

          existingRiskPlan:
            before
              ?.riskPlan ??
            null,

          finalIntelligence,

          market,

          account,

          executionContext,

          entryRiskContext,

          riskContext,

          engineContext,

          engineOverrides,
        });


      /**
       * ======================================================
       * LIFECYCLE NORMALIZATION
       * ======================================================
       */

      const lifecycle =
        open
          ? normalizeManagementLifecycle({
              intelligence,

              position:
                intelligencePosition,
            })
          : normalizeEntryLifecycle({
              intelligence,

              currentPosition:
                before?.position,
            });

      intelligence.lifecycle =
        lifecycle;

      intelligence.action =
        lifecycle?.action ??
        intelligence?.action ??
        "HOLD";

      const lifecycleAction =
        upper(
          lifecycle?.action,
          "HOLD",
        );


      /**
       * ======================================================
       * NO EXECUTION REQUIRED
       * ======================================================
       */

      if (
        [
          "HOLD",
          "WAIT",
          "NONE",
        ].includes(
          lifecycleAction,
        )
      ) {
        statefulRuntime
          .completeCycle({
            symbol:
              normalizedSymbol,

            cycleKey:
              resolvedCycleKey,

            decision: {
              action:
                lifecycleAction,

              intelligence:
                clone(
                  intelligence
                    ?.decision,
                ),
            },
          });

        return {
          approved:
            true,

          status:
            "INTEGRATED_CYCLE_NO_EXECUTION",

          symbol:
            normalizedSymbol,

          intelligence,

          lifecycle,

          paperCycle:
            null,

          portfolioContext:
            effectivePortfolioContext,

          resultingState:
            statefulRuntime
              .getSymbolState(
                normalizedSymbol,
              ),

          paperExecution:
            true,

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }


      /**
       * ======================================================
       * ENTRY SAFETY
       * ======================================================
       */

      if (
        lifecycleAction ===
          "OPEN_POSITION" &&
        (
          intelligence
            ?.entryGate
            ?.approved !==
            true ||
          !riskPlanReady(
            intelligence
              ?.riskPlan,
          )
        )
      ) {
        statefulRuntime
          .completeCycle({
            symbol:
              normalizedSymbol,

            cycleKey:
              resolvedCycleKey,

            decision: {
              action:
                "ENTRY_BLOCKED",
            },
          });

        return {
          approved:
            false,

          status:
            "ENTRY_BLOCKED_BEFORE_EXECUTION",

          symbol:
            normalizedSymbol,

          intelligence,

          lifecycle,

          paperCycle:
            null,

          portfolioContext:
            effectivePortfolioContext,

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }


      /**
       * ======================================================
       * EXECUTION POSITION NORMALIZATION
       * ======================================================
       */

      const executionPosition =
        buildExecutionPosition({
          runtimePosition:
            before?.position,

          market,
        });


      /**
       * ======================================================
       * PHASE 5.19 PAPER EXECUTION
       * ======================================================
       *
       * IMPORTANT:
       *
       * We now pass effectivePortfolioContext,
       * not the original provider portfolio.
       *
       * This allows portfolio risk to see positions opened
       * earlier in this same paper runtime.
       */

      const paperCycle =
        await runCryptoPaperTradeCycle({
          adapter,

          symbol:
            normalizedSymbol,

          lifecycle,

          riskPlan:
            intelligence
              ?.riskPlan,

          portfolioContext:
            effectivePortfolioContext,

          position:
            executionPosition,

          market,

          stopPlan:
            intelligence
              ?.stopPlan ??
            {},

          exchangeRules,

          preferences,

          paperOverrides,
        });


      /**
       * ======================================================
       * VERIFY EXECUTION COMPLETION
       * ======================================================
       */

      const paperSucceeded =
        [
          "PAPER_CYCLE_COMPLETE",
          "STOP_UPDATED",
          "NO_ACTION",
        ].includes(
          upper(
            paperCycle?.status,
          ),
        );


      /**
       * Execution planning or execution was blocked.
       *
       * Do not pretend the lifecycle action completed.
       */

      if (!paperSucceeded) {
        statefulRuntime
          .completeCycle({
            symbol:
              normalizedSymbol,

            cycleKey:
              resolvedCycleKey,

            decision: {
              action:
                lifecycleAction,

              executionStatus:
                paperCycle?.status,

              completed:
                false,
            },
          });

        return {
          approved:
            false,

          status:
            "INTEGRATED_EXECUTION_NOT_COMPLETED",

          symbol:
            normalizedSymbol,

          intelligence,

          lifecycle,

          paperCycle,

          portfolioContext:
            effectivePortfolioContext,

          resultingState:
            statefulRuntime
              .getSymbolState(
                normalizedSymbol,
              ),

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }


      /**
       * ======================================================
       * ADOPT EXCHANGE TRUTH
       * ======================================================
       */

      const resultingState =
        await adoptPaperResult({
          statefulRuntime,

          adapter,

          symbol:
            normalizedSymbol,

          paperCycle,

          intelligence,
        });


      const exchangePosition =
        await adapter.getPosition(
          normalizedSymbol,
        );


      /**
       * Was this a new position successfully opened?
       */

      const opened =
        !open &&
        positionIsOpen(
          exchangePosition,
        );


      /**
       * ======================================================
       * STORE ENTRY THESIS / RISK PLAN
       * ======================================================
       *
       * Only store them on initial successful position opening.
       */

      statefulRuntime
        .completeCycle({
          symbol:
            normalizedSymbol,

          cycleKey:
            resolvedCycleKey,

          decision: {
            action:
              lifecycleAction,

            decision:
              clone(
                intelligence
                  ?.decision,
              ),

            entryEngines:
              opened
                ? clone(
                    intelligence
                      ?.engineResults,
                  )
                : null,

            riskPlan:
              opened
                ? clone(
                    intelligence
                      ?.riskPlan,
                  )
                : null,

            executionStatus:
              paperCycle
                ?.executionState
                ?.status ??
              paperCycle
                ?.paperResult
                ?.status ??
              paperCycle
                ?.status,

            completed:
              true,
          },
        });


      /**
       * ======================================================
       * FINAL SUCCESS RESULT
       * ======================================================
       */

      return {
        approved:
          true,

        status:
          "INTEGRATED_PAPER_CYCLE_COMPLETE",

        symbol:
          normalizedSymbol,

        intelligence,

        lifecycle,

        paperCycle,

        portfolioContext:
          effectivePortfolioContext,

        resultingState,

        exchangePosition,

        opened,

        paperExecution:
          true,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    } catch (error) {
      /**
       * Always release the stateful cycle on failure.
       */

      statefulRuntime
        .failCycle({
          symbol:
            normalizedSymbol,

          cycleKey:
            resolvedCycleKey,

          error,
        });

      return {
        approved:
          false,

        status:
          "INTEGRATED_PAPER_CYCLE_FAILED",

        symbol:
          normalizedSymbol,

        error:
          String(
            error?.message ??
            error,
          ),

        paperExecution:
          true,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }
  }


  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  return {
    processMarketSnapshot,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  createIntegratedCryptoPaperTradingRuntime;