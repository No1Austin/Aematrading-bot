import {
  buildExchangeExecutionRequest,
} from "../src/crypto/trading/execution/cryptoExchangeExecutionAdapter.js";

const rules = {
  tradeable: true,

  minQty:
    0.001,

  qtyStep:
    0.001,

  minNotional:
    5,

  tickSize:
    0.1,

  maximumLeverage:
    10,

  supportedOrderTypes: [
    "MARKET",
    "LIMIT",
    "STOP_MARKET",
  ],
};

function intent({
  symbol = "BTCUSDT",
  type,
  direction,
  side,
  quantity,
  price = 100,
  leverage = 3,
  orderType = "MARKET",
  stopPrice = null,
}) {
  return {
    approved: true,

    symbol,

    intent:
      type,

    direction,

    side,

    orderType,

    quantity,

    referencePrice:
      price,

    limitPrice:
      orderType ===
        "LIMIT"
        ? price
        : null,

    stopPrice,

    leverage,

    reduceOnly:
      [
        "REDUCE",
        "CLOSE",
        "EMERGENCY_CLOSE",
        "STOP_UPDATE",
      ].includes(type),

    postOnly: false,

    timeInForce:
      orderType ===
        "MARKET"
        ? "IOC"
        : "GTC",

    slippageTolerancePercent:
      0.25,
  };
}

const scenarios = [
  {
    name:
      "OPEN_LONG",

    tradeIntent:
      intent({
        type: "OPEN",
        direction: "LONG",
        side: "BUY",
        quantity: 1,
      }),
  },

  {
    name:
      "OPEN_SHORT",

    tradeIntent:
      intent({
        type: "OPEN",
        direction: "SHORT",
        side: "SELL",
        quantity: 1,
      }),
  },

  {
    name:
      "INCREASE_LONG",

    tradeIntent:
      intent({
        type: "INCREASE",
        direction: "LONG",
        side: "BUY",
        quantity: 0.5,
      }),
  },

  {
    name:
      "INCREASE_SHORT",

    tradeIntent:
      intent({
        type: "INCREASE",
        direction: "SHORT",
        side: "SELL",
        quantity: 0.5,
      }),
  },

  {
    name:
      "REDUCE_LONG",

    tradeIntent:
      intent({
        type: "REDUCE",
        direction: "LONG",
        side: "SELL",
        quantity: 0.4,
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "REDUCE_SHORT",

    tradeIntent:
      intent({
        type: "REDUCE",
        direction: "SHORT",
        side: "BUY",
        quantity: 0.4,
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "CLOSE_LONG",

    tradeIntent:
      intent({
        type: "CLOSE",
        direction: "LONG",
        side: "SELL",
        quantity: 2,
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "CLOSE_SHORT",

    tradeIntent:
      intent({
        type: "CLOSE",
        direction: "SHORT",
        side: "BUY",
        quantity: 2,
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "EMERGENCY_LONG",

    tradeIntent:
      intent({
        type:
          "EMERGENCY_CLOSE",
        direction: "LONG",
        side: "SELL",
        quantity: 5,
        orderType: "LIMIT",
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "EMERGENCY_SHORT",

    tradeIntent:
      intent({
        type:
          "EMERGENCY_CLOSE",
        direction: "SHORT",
        side: "BUY",
        quantity: 5,
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "QUANTITY_STEP",

    tradeIntent:
      intent({
        type: "OPEN",
        direction: "LONG",
        side: "BUY",
        quantity:
          1.23456,
      }),
  },

  {
    name:
      "PRICE_TICK",

    tradeIntent:
      intent({
        type: "OPEN",
        direction: "LONG",
        side: "BUY",
        quantity: 1,
        price:
          100.067,
        orderType:
          "LIMIT",
      }),
  },

  {
    name:
      "MIN_NOTIONAL_BLOCK",

    tradeIntent:
      intent({
        type: "OPEN",
        direction: "LONG",
        side: "BUY",
        quantity:
          0.01,
        price:
          100,
      }),
  },

  {
    name:
      "MAX_LEVERAGE_BLOCK",

    tradeIntent:
      intent({
        type: "OPEN",
        direction: "LONG",
        side: "BUY",
        quantity: 1,
        leverage:
          20,
      }),
  },

  {
    name:
      "UNTRADEABLE_SYMBOL",

    tradeIntent:
      intent({
        type: "OPEN",
        direction: "LONG",
        side: "BUY",
        quantity: 1,
      }),

    exchangeRules: {
      ...rules,
      tradeable: false,
    },
  },

  {
    name:
      "REDUCTION_NO_FLIP",

    tradeIntent:
      intent({
        type: "REDUCE",
        direction: "LONG",
        side: "SELL",
        quantity: 5,
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "CLOSE_NO_FLIP",

    tradeIntent:
      intent({
        type: "CLOSE",
        direction: "SHORT",
        side: "BUY",
        quantity: 5,
      }),

    position: {
      quantity: 1,
    },
  },

  {
    name:
      "STOP_UPDATE",

    tradeIntent:
      intent({
        type:
          "STOP_UPDATE",
        direction:
          "LONG",
        side: null,
        quantity: 1,
        stopPrice:
          98.73,
      }),

    position: {
      quantity: 1,
    },
  },
];

const outputs = {};

const rows = [];

let counter = 1;

for (
  const scenario
  of scenarios
) {
  const result =
    buildExchangeExecutionRequest({
      tradeIntent:
        scenario.tradeIntent,

      exchangeRules:
        scenario.exchangeRules ??
        rules,

      position:
        scenario.position ??
        {},

      nonce:
        counter++,
    });

  outputs[
    scenario.name
  ] =
    result;

  const request =
    result.executionRequest;

  rows.push({
    scenario:
      scenario.name,

    status:
      result.status,

    intent:
      request?.intent ??
      scenario.tradeIntent
        ?.intent,

    direction:
      request?.direction ??
      scenario.tradeIntent
        ?.direction,

    side:
      request?.side ??
      "N/A",

    quantity:
      request?.quantity ??
      0,

    price:
      request?.referencePrice ??
      0,

    stop:
      request?.stopPrice ??
      "N/A",

    reduceOnly:
      request?.reduceOnly ??
      false,

    approved:
      result.approved,

    blocker:
      result.blockers
        ?.join(", ") ||
      "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.14 — EXCHANGE EXECUTION ADAPTER CONTRACT\n",
);

console.table(
  rows,
);

const req = (name) =>
  outputs[name]
    ?.executionRequest;

const invariants = {
  longOpenMappingValid:
    req("OPEN_LONG")
      ?.side ===
      "BUY" &&
    req("OPEN_LONG")
      ?.reduceOnly ===
      false,

  shortOpenMappingValid:
    req("OPEN_SHORT")
      ?.side ===
      "SELL" &&
    req("OPEN_SHORT")
      ?.reduceOnly ===
      false,

  longReductionMappingValid:
    req("REDUCE_LONG")
      ?.side ===
      "SELL" &&
    req("REDUCE_LONG")
      ?.reduceOnly ===
      true,

  shortReductionMappingValid:
    req("REDUCE_SHORT")
      ?.side ===
      "BUY" &&
    req("REDUCE_SHORT")
      ?.reduceOnly ===
      true,

  closeIsReduceOnly:
    req("CLOSE_LONG")
      ?.reduceOnly ===
      true &&
    req("CLOSE_SHORT")
      ?.reduceOnly ===
      true,

  emergencyIsReduceOnly:
    req("EMERGENCY_LONG")
      ?.reduceOnly ===
      true &&
    req("EMERGENCY_SHORT")
      ?.reduceOnly ===
      true,

  emergencyUsesMarket:
    req("EMERGENCY_LONG")
      ?.orderType ===
      "MARKET" &&
    req("EMERGENCY_SHORT")
      ?.orderType ===
      "MARKET",

  quantityStepRespected:
    req("QUANTITY_STEP")
      ?.quantity ===
      1.234,

  priceTickRespected:
    req("PRICE_TICK")
      ?.referencePrice ===
      100.1,

  minimumNotionalEnforced:
    outputs
      .MIN_NOTIONAL_BLOCK
      ?.approved ===
      false,

  maximumLeverageEnforced:
    outputs
      .MAX_LEVERAGE_BLOCK
      ?.approved ===
      false,

  untradeableSymbolBlocked:
    outputs
      .UNTRADEABLE_SYMBOL
      ?.approved ===
      false,

  reductionCannotFlipPosition:
    req("REDUCTION_NO_FLIP")
      ?.quantity ===
      1,

  closeCannotFlipPosition:
    req("CLOSE_NO_FLIP")
      ?.quantity ===
      1,

  stopUpdateCannotIncreaseRisk:
    req("STOP_UPDATE")
      ?.reduceOnly ===
      true &&
    req("STOP_UPDATE")
      ?.quantity ===
      1,

  stopTickNormalized:
    req("STOP_UPDATE")
      ?.stopPrice ===
      98.7,

  clientOrderIdGenerated:
    Object.values(
      outputs,
    )
      .filter(
        (result) =>
          result.approved ===
          true,
      )
      .every(
        (result) =>
          typeof result
            ?.executionRequest
            ?.clientOrderId ===
            "string" &&
          result
            .executionRequest
            .clientOrderId
            .length > 0,
      ),

  noNetworkCalls:
    Object.values(
      outputs,
    ).every(
      (result) =>
        result.noNetworkCalls ===
        true,
    ),

  noExecutionAuthority:
    Object.values(
      outputs,
    ).every(
      (result) =>
        result
          .executionAuthority ===
        false,
    ),
};

console.log(
  "\nINVARIANTS",
);

console.log(
  invariants,
);

const passed =
  Object.values(
    invariants,
  ).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.14 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.14 PASSED — exchange execution contract behavior is valid.",
  );
}