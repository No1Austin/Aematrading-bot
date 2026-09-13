import runOnChainFlow
  from "../src/crypto/trading/engines/cryptoTradingOnChainFlowEngine.js";

const scenarios = [
  {
    name:
      "STRONG_ACCUMULATION",

    measurements: {
      onChain: {
        exchangeNetflowPercent:
          -18,

        whaleAccumulationScore:
          82,

        activeAddressesChangePercent:
          22,

        transactionCountChangePercent:
          28,

        tvlChangePercent:
          17,

        stakingChangePercent:
          11,

        holderGrowthPercent:
          6,

        stablecoinFlowScore:
          74,
      },
    },
  },

  {
    name:
      "STRONG_DISTRIBUTION",

    measurements: {
      onChain: {
        exchangeNetflowPercent:
          21,

        whaleAccumulationScore:
          20,

        activeAddressesChangePercent:
          -24,

        transactionCountChangePercent:
          -31,

        tvlChangePercent:
          -18,

        stakingChangePercent:
          -12,

        holderGrowthPercent:
          -7,

        stablecoinFlowScore:
          24,
      },
    },
  },

  {
    name:
      "MIXED_FLOW",

    measurements: {
      onChain: {
        exchangeNetflowPercent:
          -8,

        whaleAccumulationScore:
          68,

        activeAddressesChangePercent:
          -10,

        transactionCountChangePercent:
          12,

        tvlChangePercent:
          -6,

        holderGrowthPercent:
          5,

        stablecoinFlowScore:
          53,
      },
    },
  },

  {
    name:
      "EXTREME_EXCHANGE_INFLOW",

    measurements: {
      onChain: {
        exchangeNetflowPercent:
          36,

        whaleAccumulationScore:
          28,

        activeAddressesChangePercent:
          -15,

        transactionCountChangePercent:
          -20,
      },
    },
  },

  {
    name:
      "EXTREME_EXCHANGE_OUTFLOW",

    measurements: {
      onChain: {
        exchangeNetflowPercent:
          -35,

        whaleAccumulationScore:
          80,

        activeAddressesChangePercent:
          18,

        transactionCountChangePercent:
          24,
      },
    },
  },

  {
    name:
      "INSUFFICIENT",

    measurements: {
      onChain: {
        tvlChangePercent:
          4,
      },
    },
  },
];

const rows = [];

for (
  const scenario
  of scenarios
) {
  const result =
    await runOnChainFlow(
      scenario,
    );

  rows.push({
    scenario:
      scenario.name,

    status:
      result.status,

    direction:
      result.direction,

    long:
      result.longSupport,

    short:
      result.shortSupport,

    confidence:
      result.confidence,

    quality:
      result.quality,

    risks:
      result.risks?.join(
        ", ",
      ) ||
      "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.5 — ON-CHAIN FLOW ENGINE\n",
);

console.table(
  rows,
);

const byName =
  Object.fromEntries(
    rows.map(
      row => [
        row.scenario,
        row,
      ],
    ),
  );

const invariants = {
  accumulationDetected:
    byName
      .STRONG_ACCUMULATION
      ?.direction ===
    "LONG",

  distributionDetected:
    byName
      .STRONG_DISTRIBUTION
      ?.direction ===
    "SHORT",

  mixedFlowNotOverconfident:
    (
      byName
        .MIXED_FLOW
        ?.confidence ??
      1
    ) <
    0.9,

  extremeInflowFlagged:
    byName
      .EXTREME_EXCHANGE_INFLOW
      ?.risks
      ?.includes(
        "EXTREME_EXCHANGE_INFLOW",
      ),

  extremeOutflowFlagged:
    byName
      .EXTREME_EXCHANGE_OUTFLOW
      ?.risks
      ?.includes(
        "EXTREME_EXCHANGE_OUTFLOW",
      ),

  insufficientDataHandled:
    byName
      .INSUFFICIENT
      ?.status ===
    "INSUFFICIENT_DATA",
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
  )
    .every(
      Boolean,
    );

if (!passed) {
  console.error(
    "\nPHASE 5.5 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.5 PASSED — on-chain flow behavior is valid.",
  );
}