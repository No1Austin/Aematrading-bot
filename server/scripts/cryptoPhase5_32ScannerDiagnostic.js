/**
 * AEMA CRYPTO PHASE 5.32
 * TOKEN SCANNER ORCHESTRATION DIAGNOSTIC
 */

import createCryptoScannerService
  from "../src/crypto/scanner/cryptoScannerService.js";


function fakeAvailableEngine(
  score,
  confidence,
  source,
) {
  return async () => ({
    approved:
      true,

    status:
      "READY",

    score,

    confidence,

    availability: {
      available:
        true,

      source,

      evidenceCount:
        3,
    },

    evidence: [
      {
        type:
          "DIAGNOSTIC",
      },
    ],
  });
}


const scanner =
  createCryptoScannerService({
    engines: {
      momentum:
        fakeAvailableEngine(
          82,
          80,
          "TEST_MOMENTUM",
        ),

      liquidity:
        fakeAvailableEngine(
          74,
          72,
          "TEST_LIQUIDITY",
        ),

      onChain:
        fakeAvailableEngine(
          68,
          65,
          "TEST_ONCHAIN",
        ),

      narrative:
        fakeAvailableEngine(
          61,
          60,
          "TEST_NARRATIVE",
        ),

      news:
        fakeAvailableEngine(
          77,
          70,
          "TEST_NEWS",
        ),

      /**
       * risk intentionally not configured
       * to validate neutral-unavailable semantics.
       */
    },

    resolveAsset:
      async ({
        query,
      }) => ({
        symbol:
          String(
            query,
          )
            .toUpperCase(),

        venue:
          "DIAGNOSTIC",
      }),

    resolveMarketContext:
      async ({
        asset,
      }) => ({
        symbol:
          asset
            ?.symbol,

        type:
          "CEX",

        venue:
          "DIAGNOSTIC",
      }),
  });


const result =
  await scanner
    .scan({
      query:
        "BTC",
    });


console.log(
  "\nAEMA CRYPTO PHASE 5.32 — TOKEN SCANNER ORCHESTRATION\n",
);


console.table(
  Object.entries(
    result
      .engines,
  )
    .map(
      ([
        engine,
        value,
      ]) => ({
        engine,
        score:
          value
            ?.score,

        available:
          value
            ?.availability
            ?.available,

        confidence:
          value
            ?.confidence,

        status:
          value
            ?.status,
      }),
    ),
);


const invariants = {
  scanApproved:
    result
      ?.approved ===
    true,

  scanCompleted:
    result
      ?.status ===
    "CRYPTO_SCAN_COMPLETE",

  allSixEnginesReturned:
    Object.keys(
      result
        ?.engines ??
      {},
    ).length ===
    6,

  unavailableRiskIsNeutral:
    result
      ?.engines
      ?.risk
      ?.score ===
    50,

  unavailableRiskExplicit:
    result
      ?.engines
      ?.risk
      ?.availability
      ?.available ===
    false,

  partialAvailabilityReported:
    result
      ?.availability
      ?.status ===
    "PARTIAL",

  completenessCorrect:
    result
      ?.availability
      ?.availableEngineCount ===
    5,

  scoreBounded:
    Number.isFinite(
      result
        ?.overallScore,
    ) &&
    result
      .overallScore >=
    0 &&
    result
      .overallScore <=
    100,

  biasReturned:
    [
      "BULLISH",
      "BEARISH",
      "NEUTRAL",
    ].includes(
      result
        ?.bias,
    ),

  confidenceReturned:
    [
      "HIGH",
      "MODERATE",
      "LOW",
    ].includes(
      result
        ?.confidence,
    ),

  noExecutionAuthority:
    result
      ?.executionAuthority ===
    false,

  liveExecutionDisabled:
    result
      ?.liveExecution ===
    false,
};


console.log(
  "\nSCAN SUMMARY",
);

console.dir(
  {
    symbol:
      result
        ?.symbol,

    overallScore:
      result
        ?.overallScore,

    evidenceAdjustedScore:
      result
        ?.evidenceAdjustedScore,

    bias:
      result
        ?.bias,

    confidence:
      result
        ?.confidence,

    availability:
      result
        ?.availability,
  },
  {
    depth:
      5,
  },
);


console.log(
  "\nINVARIANTS",
);

console.dir(
  invariants,
  {
    depth:
      3,
  },
);


const passed =
  Object.values(
    invariants,
  )
    .every(
      Boolean,
    );


if (
  !passed
) {
  console.error(
    "\nPHASE 5.32 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.32 PASSED — scanner orchestration and unavailable-evidence semantics are valid.",
  );
}
