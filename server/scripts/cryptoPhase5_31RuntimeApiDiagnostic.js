/**
 * ============================================================
 * AEMA CRYPTO
 * Phase 5.31
 *
 * FRONTEND-FACING RUNTIME API DIAGNOSTIC
 * ============================================================
 *
 * Validates:
 *
 * - runtime health endpoint contract
 * - runtime state endpoint contract
 * - account snapshot exposure
 * - position exposure
 * - order exposure
 * - trade exposure
 * - persistence health exposure
 * - recovery state exposure
 * - dashboard aggregation
 * - supervisor evaluation endpoint behavior
 * - evaluation only; no execution
 * - no live execution authority
 */

import express
  from "express";

import createCryptoPaperAccountLedger
  from "../src/crypto/trading/account/cryptoPaperAccountLedger.js";

import createCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoPaperTradingRuntime.js";

import createPaperCryptoExchangeAdapter
  from "../src/crypto/trading/execution/paperCryptoExchangeAdapter.js";

import createCryptoRuntimeApiService
  from "../src/crypto/api/cryptoRuntimeApiService.js";

import createCryptoRuntimeRouter
  from "../src/routes/cryptoRuntimeRoutes.js";

import createCryptoTradingRuntimeSupervisor
  from "../src/crypto/trading/runtime/cryptoTradingRuntimeSupervisor.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.31 — FRONTEND-FACING RUNTIME API\n",
);


/**
 * ============================================================
 * MOCK HEALTH SUBSYSTEMS
 * ============================================================
 */

const recoveryRuntime = {
  getRecoveryState() {
    return {
      state:
        "READY",

      ready:
        true,

      recovering:
        false,

      failed:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  },
};


const autoCheckpointManager = {
  getHealth() {
    return {
      dirty:
        false,

      degraded:
        false,

      failureCount:
        0,

      checkpointCount:
        5,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  },
};


const continuousRuntime = {
  getHealth() {
    return {
      status:
        "RUNNING",

      staleDataCount:
        0,

      errorCount:
        0,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  },
};


const crashSafeRuntime = {
  getHealth() {
    return {
      started:
        true,

      shuttingDown:
        false,

      processedCycles:
        3,

      mutationCount:
        2,

      persistenceFailureCount:
        0,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  },
};


/**
 * ============================================================
 * REAL PAPER COMPONENTS
 * ============================================================
 */

const ledger =
  createCryptoPaperAccountLedger({
    startingEquity:
      10_000,
  });


const runtime =
  createCryptoPaperTradingRuntime();


const exchange =
  createPaperCryptoExchangeAdapter({
    defaultPrice:
      100,
  });


/**
 * ============================================================
 * CREATE PAPER STATE
 * ============================================================
 */

await exchange.submitOrder({
  symbol:
    "BTCUSDT",

  side:
    "BUY",

  quantity:
    5,

  price:
    100,

  clientOrderId:
    "P531-BTC-OPEN",

  reduceOnly:
    false,
});


ledger.applyFill({
  fillId:
    "P531-BTC-FILL",

  symbol:
    "BTCUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    5,

  fillPrice:
    100,

  fee:
    1,
});


runtime.adoptExchangePosition({
  symbol:
    "BTCUSDT",

  exchangePosition:
    await exchange.getPosition(
      "BTCUSDT",
    ),
});


await exchange.submitOrder({
  symbol:
    "ETHUSDT",

  side:
    "BUY",

  quantity:
    10,

  price:
    200,

  clientOrderId:
    "P531-ETH-PARTIAL",

  reduceOnly:
    false,

  fillRatio:
    0.4,
});


ledger.applyFill({
  fillId:
    "P531-ETH-FILL",

  symbol:
    "ETHUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    4,

  fillPrice:
    200,

  fee:
    1,
});


runtime.adoptExchangePosition({
  symbol:
    "ETHUSDT",

  exchangePosition:
    await exchange.getPosition(
      "ETHUSDT",
    ),
});


/**
 * ============================================================
 * SUPERVISOR
 * ============================================================
 */

const supervisor =
  createCryptoTradingRuntimeSupervisor({
    recoveryRuntime,

    autoCheckpointManager,

    continuousRuntime,

    maximumMarketDataAgeMs:
      60_000,

    maximumRepeatedFailures:
      3,
  });


/**
 * ============================================================
 * API SERVICE
 * ============================================================
 */

const apiService =
  createCryptoRuntimeApiService({
    ledger,

    statefulRuntime:
      runtime,

    exchangeAdapter:
      exchange,

    supervisor,

    recoveryRuntime,

    autoCheckpointManager,

    crashSafeRuntime,
  });


/**
 * ============================================================
 * SERVICE-LEVEL TESTS
 * ============================================================
 */

const health =
  apiService
    .getRuntimeHealth();


const runtimeState =
  apiService
    .getRuntimeState();


const account =
  apiService
    .getAccount();


const positions =
  apiService
    .getPositions();


const btcOnly =
  apiService
    .getPositions({
      symbol:
        "BTCUSDT",
    });


const orders =
  await apiService
    .getOrders({
      limit:
        100,
    });


const openOrders =
  await apiService
    .getOrders({
      openOnly:
        true,

      limit:
        100,
    });


const trades =
  apiService
    .getTrades({
      limit:
        100,
    });


const persistence =
  apiService
    .getPersistenceHealth();


const recovery =
  apiService
    .getRecoveryState();


const dashboard =
  await apiService
    .getDashboardSnapshot();


const allowedEvaluation =
  apiService
    .evaluateAction({
      action:
        "OPEN_POSITION",

      marketDataFresh:
        true,

      marketDataAgeMs:
        1_000,
    });


const blockedEvaluation =
  apiService
    .evaluateAction({
      action:
        "OPEN_POSITION",

      marketDataFresh:
        false,

      marketDataAgeMs:
        120_000,
    });


const reductionEvaluation =
  apiService
    .evaluateAction({
      action:
        "REDUCE_EXPOSURE",

      marketDataFresh:
        false,

      marketDataAgeMs:
        120_000,
    });


/**
 * Restore healthy market data for final state.
 */

supervisor
  .setMarketDataHealth({
    fresh:
      true,

    ageMs:
      1_000,
  });


/**
 * ============================================================
 * EXPRESS ROUTER TEST
 * ============================================================
 *
 * We use a real ephemeral HTTP server here so the route layer
 * itself is exercised.
 */

const app =
  express();


app.use(
  express.json(),
);


app.use(
  "/api/crypto",
  createCryptoRuntimeRouter({
    runtimeApiService:
      apiService,
  }),
);


const server =
  await new Promise(
    (resolve) => {
      const instance =
        app.listen(
          0,
          "127.0.0.1",
          () =>
            resolve(
              instance,
            ),
        );
    },
  );


const address =
  server.address();


const port =
  address.port;


const baseUrl =
  `http://127.0.0.1:${port}/api/crypto`;


async function requestJson(
  path,
  options = {},
) {
  const response =
    await fetch(
      `${baseUrl}${path}`,
      options,
    );

  let body =
    null;

  try {
    body =
      await response.json();
  } catch {
    body =
      null;
  }

  return {
    statusCode:
      response.status,

    body,
  };
}


const routeStatus =
  await requestJson(
    "/status",
  );


const routeHealth =
  await requestJson(
    "/runtime/health",
  );


const routeState =
  await requestJson(
    "/runtime/state",
  );


const routeAccount =
  await requestJson(
    "/account",
  );


const routePositions =
  await requestJson(
    "/positions",
  );


const routeBtcPosition =
  await requestJson(
    "/positions?symbol=BTCUSDT",
  );


const routeOrders =
  await requestJson(
    "/orders?limit=10",
  );


const routeOpenOrders =
  await requestJson(
    "/orders?openOnly=true&limit=10",
  );


const routeTrades =
  await requestJson(
    "/trades?limit=10",
  );


const routePersistence =
  await requestJson(
    "/persistence",
  );


const routeRecovery =
  await requestJson(
    "/recovery",
  );


const routeDashboard =
  await requestJson(
    "/dashboard",
  );


const routeEvaluateAllowed =
  await requestJson(
    "/runtime/evaluate-action",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify({
          action:
            "OPEN_POSITION",

          marketDataFresh:
            true,

          marketDataAgeMs:
            1_000,
        }),
    },
  );


const routeEvaluateBlocked =
  await requestJson(
    "/runtime/evaluate-action",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify({
          action:
            "OPEN_POSITION",

          marketDataFresh:
            false,

          marketDataAgeMs:
            120_000,
        }),
    },
  );


const routeEvaluateReduction =
  await requestJson(
    "/runtime/evaluate-action",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify({
          action:
            "REDUCE_EXPOSURE",

          marketDataFresh:
            false,

          marketDataAgeMs:
            120_000,
        }),
    },
  );


const routeInvalidEvaluation =
  await requestJson(
    "/runtime/evaluate-action",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify({}),
    },
  );


await new Promise(
  (resolve) =>
    server.close(
      resolve,
    ),
);


/**
 * ============================================================
 * TABLE
 * ============================================================
 */

console.table([
  {
    scenario:
      "HEALTH",

    status:
      health.status,

    approved:
      health.approved,

    count:
      "",
  },

  {
    scenario:
      "ACCOUNT",

    status:
      account.status,

    approved:
      account.approved,

    count:
      account
        ?.account
        ?.openPositionCount ??
      "",
  },

  {
    scenario:
      "POSITIONS",

    status:
      positions.status,

    approved:
      positions.approved,

    count:
      positions.count,
  },

  {
    scenario:
      "ORDERS",

    status:
      orders.status,

    approved:
      orders.approved,

    count:
      orders.count,
  },

  {
    scenario:
      "OPEN_ORDERS",

    status:
      openOrders.status,

    approved:
      openOrders.approved,

    count:
      openOrders.count,
  },

  {
    scenario:
      "TRADES",

    status:
      trades.status,

    approved:
      trades.approved,

    count:
      trades.count,
  },

  {
    scenario:
      "DASHBOARD",

    status:
      dashboard.status,

    approved:
      dashboard.approved,

    count:
      dashboard
        ?.positions
        ?.count ??
      "",
  },

  {
    scenario:
      "ROUTE_STATUS",

    status:
      routeStatus
        ?.body
        ?.status,

    approved:
      routeStatus
        ?.body
        ?.approved,

    count:
      routeStatus
        .statusCode,
  },

  {
    scenario:
      "ROUTE_DASHBOARD",

    status:
      routeDashboard
        ?.body
        ?.status,

    approved:
      routeDashboard
        ?.body
        ?.approved,

    count:
      routeDashboard
        .statusCode,
  },
]);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const invariants = {
  healthServiceReady:
    health
      ?.approved ===
      true &&
    health
      ?.status ===
      "CRYPTO_RUNTIME_HEALTH_READY",

  runtimeStateAvailable:
    runtimeState
      ?.approved ===
      true &&
    Array.isArray(
      runtimeState
        ?.runtime
        ?.symbols,
    ),

  accountAvailable:
    account
      ?.approved ===
      true &&
    account
      ?.account
      ?.startingEquity ===
      10_000,

  positionsAvailable:
    positions
      ?.approved ===
      true &&
    positions
      ?.count ===
      2,

  btcFilterWorks:
    btcOnly
      ?.count ===
      1 &&
    btcOnly
      ?.positions
      ?.[0]
      ?.symbol ===
      "BTCUSDT",

  ordersAvailable:
    orders
      ?.approved ===
      true &&
    orders
      ?.count >=
      2,

  partialOrderVisible:
    orders
      ?.orders
      ?.some(
        order =>
          order?.symbol ===
            "ETHUSDT" &&
          order?.status ===
            "PARTIALLY_FILLED",
      ) === true,

  openOrdersAvailable:
    openOrders
      ?.approved ===
      true &&
    openOrders
      ?.orders
      ?.some(
        order =>
          order?.status ===
          "PARTIALLY_FILLED",
      ) === true,

  tradesAvailable:
    trades
      ?.approved ===
      true &&
    trades
      ?.count >=
      2,

  persistenceHealthAvailable:
    persistence
      ?.approved ===
      true &&
    persistence
      ?.persistence
      ?.dirty ===
      false,

  recoveryStateAvailable:
    recovery
      ?.approved ===
      true &&
    recovery
      ?.recovery
      ?.ready ===
      true,

  dashboardAggregatesState:
    dashboard
      ?.approved ===
      true &&
    dashboard
      ?.positions
      ?.count ===
      2 &&
    dashboard
      ?.account
      ?.approved ===
      true,

  supervisorAllowsHealthyNewRisk:
    allowedEvaluation
      ?.approved ===
      true &&
    allowedEvaluation
      ?.evaluatedOnly ===
      true,

  supervisorBlocksStaleNewRisk:
    blockedEvaluation
      ?.approved ===
      false &&
    blockedEvaluation
      ?.supervisorState ===
      "SAFE_MODE",

  supervisorAllowsReductionDuringSafeMode:
    reductionEvaluation
      ?.approved ===
      true &&
    reductionEvaluation
      ?.riskReducing ===
      true,

  routeStatusWorks:
    routeStatus
      ?.statusCode ===
      200 &&
    routeStatus
      ?.body
      ?.status ===
      "READY",

  routeHealthWorks:
    routeHealth
      ?.statusCode ===
      200 &&
    routeHealth
      ?.body
      ?.approved ===
      true,

  routeRuntimeStateWorks:
    routeState
      ?.statusCode ===
      200 &&
    routeState
      ?.body
      ?.approved ===
      true,

  routeAccountWorks:
    routeAccount
      ?.statusCode ===
      200 &&
    routeAccount
      ?.body
      ?.approved ===
      true,

  routePositionsWorks:
    routePositions
      ?.statusCode ===
      200 &&
    routePositions
      ?.body
      ?.count ===
      2,

  routePositionFilterWorks:
    routeBtcPosition
      ?.statusCode ===
      200 &&
    routeBtcPosition
      ?.body
      ?.count ===
      1,

  routeOrdersWorks:
    routeOrders
      ?.statusCode ===
      200 &&
    routeOrders
      ?.body
      ?.count >=
      2,

  routeOpenOrdersWorks:
    routeOpenOrders
      ?.statusCode ===
      200 &&
    routeOpenOrders
      ?.body
      ?.orders
      ?.some(
        order =>
          order?.status ===
          "PARTIALLY_FILLED",
      ) === true,

  routeTradesWorks:
    routeTrades
      ?.statusCode ===
      200 &&
    routeTrades
      ?.body
      ?.count >=
      2,

  routePersistenceWorks:
    routePersistence
      ?.statusCode ===
      200 &&
    routePersistence
      ?.body
      ?.approved ===
      true,

  routeRecoveryWorks:
    routeRecovery
      ?.statusCode ===
      200 &&
    routeRecovery
      ?.body
      ?.approved ===
      true,

  routeDashboardWorks:
    routeDashboard
      ?.statusCode ===
      200 &&
    routeDashboard
      ?.body
      ?.approved ===
      true,

  routeHealthyEvaluationWorks:
    routeEvaluateAllowed
      ?.statusCode ===
      200 &&
    routeEvaluateAllowed
      ?.body
      ?.approved ===
      true &&
    routeEvaluateAllowed
      ?.body
      ?.evaluatedOnly ===
      true,

  routeStaleEvaluationBlocked:
    routeEvaluateBlocked
      ?.statusCode ===
      403 &&
    routeEvaluateBlocked
      ?.body
      ?.approved ===
      false,

  routeReductionStillAllowed:
    routeEvaluateReduction
      ?.statusCode ===
      200 &&
    routeEvaluateReduction
      ?.body
      ?.approved ===
      true,

  invalidEvaluationRejected:
    routeInvalidEvaluation
      ?.statusCode ===
      400 &&
    routeInvalidEvaluation
      ?.body
      ?.approved ===
      false,

  apiNeverGetsExecutionAuthority:
    [
      health,
      runtimeState,
      account,
      positions,
      orders,
      trades,
      persistence,
      recovery,
      dashboard,
      allowedEvaluation,
      blockedEvaluation,
      reductionEvaluation,
    ].every(
      result =>
        result
          ?.executionAuthority ===
        false,
    ),

  apiNeverEnablesLiveExecution:
    [
      health,
      runtimeState,
      account,
      positions,
      orders,
      trades,
      persistence,
      recovery,
      dashboard,
      allowedEvaluation,
      blockedEvaluation,
      reductionEvaluation,
    ].every(
      result =>
        result
          ?.liveExecution ===
        false,
    ),
};


console.log(
  "\nINVARIANTS",
);

console.dir(
  invariants,
  {
    depth:
      null,
  },
);


const passed =
  Object
    .values(
      invariants,
    )
    .every(Boolean);


if (!passed) {
  console.error(
    "\nPHASE 5.31 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.31 PASSED — frontend-facing crypto runtime API behavior is valid.",
  );
}