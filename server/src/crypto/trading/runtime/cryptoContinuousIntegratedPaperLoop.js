/**
 * AEMA CRYPTO
 * Phase 5.24
 *
 * CONTINUOUS INTEGRATED PAPER LOOP
 *
 * Connects:
 *
 * universe
 *   ↓
 * market data
 *   ↓
 * real paper portfolio snapshot
 *   ↓
 * Phase 5.23 integrated runtime
 *   ↓
 * intelligence
 *   ↓
 * paper execution
 *   ↓
 * stateful runtime
 *
 * PAPER ONLY.
 */

import buildPaperPortfolioSnapshot
  from "./cryptoPaperPortfolioSnapshot.js";


const finite = (
  value,
  fallback = null,
) => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
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


function nowIso() {
  return new Date()
    .toISOString();
}


export function createContinuousIntegratedPaperLoop({
  statefulRuntime,

  integratedRuntime,

  marketDataProvider,

  candidateProvider,

  universeProvider,

  account = {},

  maxMarketDataAgeMs =
    30_000,

  persistenceHandler =
    null,

  cycleErrorCooldownMs =
    30_000,
} = {}) {
  if (!statefulRuntime) {
    throw new Error(
      "STATEFUL_RUNTIME_REQUIRED",
    );
  }

  if (!integratedRuntime) {
    throw new Error(
      "INTEGRATED_RUNTIME_REQUIRED",
    );
  }

  if (
    integratedRuntime
      .liveExecution === true
  ) {
    throw new Error(
      "LIVE_INTEGRATED_RUNTIME_NOT_ALLOWED",
    );
  }

  if (
    typeof marketDataProvider !==
    "function"
  ) {
    throw new Error(
      "MARKET_DATA_PROVIDER_REQUIRED",
    );
  }

  if (
    typeof candidateProvider !==
    "function"
  ) {
    throw new Error(
      "CANDIDATE_PROVIDER_REQUIRED",
    );
  }

  if (
    typeof universeProvider !==
    "function"
  ) {
    throw new Error(
      "UNIVERSE_PROVIDER_REQUIRED",
    );
  }

  const state = {
    running:
      false,

    shuttingDown:
      false,

    cycle:
      0,

    activeSymbols:
      new Set(),

    cooldowns:
      new Map(),

    marketPrices:
      {},

    health: {
      status:
        "STOPPED",

      startedAt:
        null,

      lastCycleAt:
        null,

      lastHeartbeatAt:
        null,

      totalUniverseCycles:
        0,

      totalSymbolCycles:
        0,

      completedSymbolCycles:
        0,

      failedSymbolCycles:
        0,

      staleMarketBlocks:
        0,

      cooldownBlocks:
        0,

      duplicateSymbolBlocks:
        0,
    },
  };


  function heartbeat() {
    state.health.lastHeartbeatAt =
      nowIso();

    if (
      state.shuttingDown
    ) {
      state.health.status =
        "SHUTTING_DOWN";
    } else if (
      state.running
    ) {
      state.health.status =
        "HEALTHY";
    }

    return clone(
      state.health,
    );
  }


  function marketIsFresh(
    market,
  ) {
    const timestamp =
      finite(
        market?.timestamp ??
        market?.timestampMs ??
        market?.fetchedAtMs,
      );

    if (
      timestamp === null
    ) {
      return false;
    }

    return (
      Date.now() -
      timestamp
    ) <=
      maxMarketDataAgeMs;
  }


  function cooldownFor(
    symbol,
  ) {
    const key =
      upper(symbol);

    const cooldown =
      state.cooldowns.get(
        key,
      );

    if (!cooldown) {
      return null;
    }

    if (
      Date.now() >=
      cooldown.until
    ) {
      state.cooldowns.delete(
        key,
      );

      return null;
    }

    return cooldown;
  }


  function setCooldown({
    symbol,
    reason,
    durationMs =
      cycleErrorCooldownMs,
  }) {
    const key =
      upper(symbol);

    state.cooldowns.set(
      key,
      {
        reason,

        until:
          Date.now() +
          Math.max(
            0,
            finite(
              durationMs,
              0,
            ),
          ),
      },
    );
  }


  async function persist(
    payload,
  ) {
    if (
      typeof persistenceHandler !==
      "function"
    ) {
      return;
    }

    await persistenceHandler(
      clone(payload),
    );
  }


  function portfolioSnapshot() {
    return buildPaperPortfolioSnapshot({
      statefulRuntime,

      marketPrices:
        state.marketPrices,

      accountEquity:
        account?.equity ??
        account?.accountEquity,

      drawdownPercent:
        account?.drawdownPercent ??
        0,

      marketStress:
        account?.marketStress ??
        false,
    });
  }


  async function processSymbol({
    symbol,
    cycleId,
    paperOverrides = {},
    forceEngineOverrides = null,
  } = {}) {
    const key =
      upper(symbol);

    if (!key) {
      return {
        approved:
          false,

        status:
          "INVALID_SYMBOL",

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }

    if (
      state.shuttingDown
    ) {
      return {
        approved:
          false,

        status:
          "LOOP_SHUTTING_DOWN",

        symbol:
          key,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }

    if (
      state.activeSymbols.has(
        key,
      )
    ) {
      state.health
        .duplicateSymbolBlocks +=
        1;

      return {
        approved:
          false,

        status:
          "SYMBOL_ALREADY_PROCESSING",

        symbol:
          key,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }

    const cooldown =
      cooldownFor(
        key,
      );

    if (cooldown) {
      state.health
        .cooldownBlocks +=
        1;

      return {
        approved:
          false,

        status:
          "COOLDOWN_ACTIVE",

        symbol:
          key,

        reason:
          cooldown.reason,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }

    state.activeSymbols.add(
      key,
    );

    state.health
      .totalSymbolCycles +=
      1;

    try {
      const market =
        await marketDataProvider(
          key,
        );

      if (
        !marketIsFresh(
          market,
        )
      ) {
        state.health
          .staleMarketBlocks +=
          1;

        return {
          approved:
            false,

          status:
            "STALE_MARKET_DATA",

          symbol:
            key,

          liveExecution:
            false,

          executionAuthority:
            false,
        };
      }

      const currentPrice =
        finite(
          market?.price ??
          market?.markPrice ??
          market?.lastPrice,
        );

      if (
        currentPrice !== null &&
        currentPrice > 0
      ) {
        state.marketPrices[
          key
        ] =
          currentPrice;
      }

      const candidate =
        await candidateProvider({
          symbol:
            key,

          market,
        });

      if (!candidate) {
        return {
          approved:
            false,

          status:
            "CANDIDATE_UNAVAILABLE",

          symbol:
            key,

          liveExecution:
            false,

          executionAuthority:
            false,
        };
      }

      /**
       * ======================================================
       * REAL PAPER PORTFOLIO
       * ======================================================
       *
       * This snapshot includes positions already opened earlier
       * in this SAME paper runtime.
       */

      const portfolio =
        portfolioSnapshot();

      const result =
        await integratedRuntime
          .processMarketSnapshot({
            symbol:
              key,

            candidate,

            market,

            cycleKey:
              `${cycleId}:${key}`,

            paperOverrides,

            forceEngineOverrides,

            /**
             * This field is intentionally attached for
             * diagnostics/persistence. Portfolio injection into
             * Phase 5.23 is handled by its portfolio provider.
             */
            runtimePortfolioSnapshot:
              portfolio,
          });

      if (
        result?.approved ===
        false &&
        result?.status ===
        "INTEGRATED_PAPER_CYCLE_FAILED"
      ) {
        setCooldown({
          symbol:
            key,

          reason:
            "INTEGRATED_CYCLE_FAILURE",
        });
      }

      if (
        result?.approved ===
        true
      ) {
        state.health
          .completedSymbolCycles +=
          1;
      } else {
        state.health
          .failedSymbolCycles +=
          1;
      }

      await persist({
        cycleId,

        symbol:
          key,

        market,

        candidate,

        portfolioBefore:
          portfolio,

        result,

        portfolioAfter:
          portfolioSnapshot(),

        timestamp:
          nowIso(),
      });

      heartbeat();

      return {
        ...result,

        portfolioBefore:
          portfolio,

        portfolioAfter:
          portfolioSnapshot(),

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    } catch (error) {
      state.health
        .failedSymbolCycles +=
        1;

      setCooldown({
        symbol:
          key,

        reason:
          "SYMBOL_RUNTIME_ERROR",
      });

      return {
        approved:
          false,

        status:
          "SYMBOL_RUNTIME_ERROR",

        symbol:
          key,

        error:
          String(
            error?.message ??
            error,
          ),

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    } finally {
      state.activeSymbols.delete(
        key,
      );
    }
  }


  async function runUniverseCycle({
    symbols = null,

    overridesBySymbol = {},

    paperOverridesBySymbol = {},
  } = {}) {
    state.cycle += 1;

    state.health
      .totalUniverseCycles +=
      1;

    state.health.lastCycleAt =
      nowIso();

    const cycleId =
      `PAPER-CYCLE-${state.cycle}`;

    const universe =
      Array.isArray(symbols)
        ? symbols
        : await universeProvider();

    const results = [];

    /**
     * Sequential processing is deliberate for now.
     *
     * Why?
     *
     * Portfolio state changes after each fill.
     *
     * Symbol #2 should see the position opened by symbol #1
     * before portfolio risk evaluates symbol #2.
     */

    for (
      const symbol
      of universe
    ) {
      const key =
        upper(symbol);

      const result =
        await processSymbol({
          symbol:
            key,

          cycleId,

          forceEngineOverrides:
            overridesBySymbol?.[
              key
            ] ??
            null,

          paperOverrides:
            paperOverridesBySymbol?.[
              key
            ] ??
            {},
        });

      results.push(
        result,
      );
    }

    heartbeat();

    return {
      cycleId,

      results,

      portfolio:
        portfolioSnapshot(),

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  function start() {
    state.running =
      true;

    state.shuttingDown =
      false;

    state.health.status =
      "HEALTHY";

    state.health.startedAt =
      state.health.startedAt ??
      nowIso();

    heartbeat();

    return {
      started:
        true,

      mode:
        "PAPER",

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  async function shutdown() {
    state.shuttingDown =
      true;

    heartbeat();

    while (
      state.activeSymbols.size >
      0
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            10,
          ),
      );
    }

    state.running =
      false;

    state.shuttingDown =
      false;

    state.health.status =
      "STOPPED";

    return {
      stopped:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  function getHealth() {
    return {
      ...clone(
        state.health,
      ),

      activeSymbols: [
        ...state
          .activeSymbols,
      ],

      cooldowns: [
        ...state
          .cooldowns
          .entries(),
      ].map(
        ([
          symbol,
          value,
        ]) => ({
          symbol,

          reason:
            value.reason,

          until:
            new Date(
              value.until,
            ).toISOString(),
        }),
      ),

      portfolio:
        portfolioSnapshot(),

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  return {
    start,

    shutdown,

    runUniverseCycle,

    processSymbol,

    getHealth,

    portfolioSnapshot,

    setCooldown,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  createContinuousIntegratedPaperLoop;