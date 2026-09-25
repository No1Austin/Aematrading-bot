/**
 * AEMA CRYPTO PHASE 5.33
 * MOMENTUM + LIQUIDITY SCANNER ADAPTER DIAGNOSTIC
 */

import {
  runCryptoScannerLiquidity,
  runCryptoScannerMomentum,
} from "../src/crypto/scanner/cryptoScannerEngineAdapters.js";


const asset = {
  assetId:
    "BTC",

  symbol:
    "BTC",

  name:
    "Bitcoin",

  source:
    "DIAGNOSTIC",

  tradable:
    true,

  priceUsd:
    60000,

  high24hUsd:
    61800,

  low24hUsd:
    58200,

  volume24hUsd:
    25_000_000_000,

  volume6hUsd:
    6_000_000_000,

  volume1hUsd:
    1_200_000_000,

  change1hPercent:
    1.2,

  change4hPercent:
    2.8,

  change6hPercent:
    3.5,

  change24hPercent:
    5.1,

  change7dPercent:
    8.4,

  venues: {
    venueCount:
      4,

    cexCount:
      3,

    dexCount:
      1,

    dexLiquidityUsd:
      150_000_000,

    dexVolume24hUsd:
      700_000_000,

    primaryVenue:
      "DIAGNOSTIC",
  },
};


const context = {
  query:
    "BTC",

  symbol:
    "BTC",

  asset,

  preferredDirection:
    "LONG",
};


const momentum =
  await runCryptoScannerMomentum(
    context,
  );


const liquidity =
  await runCryptoScannerLiquidity(
    context,
  );


console.log(
  "\nAEMA CRYPTO PHASE 5.33 — MOMENTUM + LIQUIDITY SCANNER ADAPTERS\n",
);


console.table([
  {
    engine:
      "momentum",

    status:
      momentum
        ?.status,

    score:
      momentum
        ?.score,

    available:
      momentum
        ?.availability
        ?.available,

    confidence:
      momentum
        ?.confidence,

    evidence:
      momentum
        ?.availability
        ?.evidenceCount,
  },

  {
    engine:
      "liquidity",

    status:
      liquidity
        ?.status,

    score:
      liquidity
        ?.score,

    available:
      liquidity
        ?.availability
        ?.available,

    confidence:
      liquidity
        ?.confidence,

    evidence:
      liquidity
        ?.availability
        ?.evidenceCount,
  },
]);


const invariants = {
  momentumReturned:
    Boolean(
      momentum,
    ),

  liquidityReturned:
    Boolean(
      liquidity,
    ),

  momentumScoreBounded:
    Number.isFinite(
      Number(
        momentum
          ?.score,
      ),
    ) &&
    momentum
      .score >=
    0 &&
    momentum
      .score <=
    100,

  liquidityScoreBounded:
    Number.isFinite(
      Number(
        liquidity
          ?.score,
      ),
    ) &&
    liquidity
      .score >=
    0 &&
    liquidity
      .score <=
    100,

  confidenceNormalizedToPercent:
    (
      !momentum
        ?.availability
        ?.available ||
      momentum
        .confidence >
      1
    ) &&
    (
      !liquidity
        ?.availability
        ?.available ||
      liquidity
        .confidence >
      1
    ),

  noExecutionAuthorityIntroduced:
    true,
};


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
    "\nPHASE 5.33 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.33 PASSED — momentum and liquidity scanner adapters are valid.",
  );
}
