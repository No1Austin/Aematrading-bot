import "dotenv/config";

console.log("\n==============================================");
console.log(" AEMA CRYPTO SCANNER DIAGNOSTIC");
console.log("==============================================\n");

let failures = 0;

function pass(message) {
  console.log(`✅ PASS: ${message}`);
}

function fail(message, error = null) {
  failures += 1;
  console.error(`❌ FAIL: ${message}`);

  if (error) {
    console.error(
      "   ",
      error instanceof Error
        ? error.message
        : String(error)
    );
  }
}

function info(message, value = undefined) {
  console.log(`ℹ️  ${message}`);

  if (value !== undefined) {
    console.dir(value, {
      depth: 5,
      colors: true,
    });
  }
}

/* ============================================================
   1. CHECK SCANNER ROUTE
============================================================ */

let createCryptoScannerRoutes = null;

try {
  const module = await import(
    "../routes/cryptoScannerRoutes.js"
  );

  createCryptoScannerRoutes =
    module.default ??
    module.createCryptoScannerRoutes;

  if (typeof createCryptoScannerRoutes === "function") {
    pass("cryptoScannerRoutes.js imports correctly");
  } else {
    fail(
      "cryptoScannerRoutes.js does not export createCryptoScannerRoutes"
    );
  }
} catch (error) {
  fail(
    "Unable to import cryptoScannerRoutes.js",
    error
  );
}

/* ============================================================
   2. CHECK SCANNER SERVICE FACTORY
============================================================ */

let createCryptoScannerService = null;

try {
  const module = await import(
    "../crypto/scanner/cryptoScannerService.js"
  );

  createCryptoScannerService =
    module.default ??
    module.createCryptoScannerService;

  if (typeof createCryptoScannerService === "function") {
    pass("cryptoScannerService.js imports correctly");
  } else {
    fail(
      "cryptoScannerService.js does not export a service factory"
    );
  }
} catch (error) {
  fail(
    "Unable to import cryptoScannerService.js",
    error
  );
}

/* ============================================================
   3. CHECK ENGINE ADAPTERS
============================================================ */

let adapters = null;

try {
  adapters = await import(
    "../crypto/scanner/cryptoScannerEngineAdapters.js"
  );

  pass("cryptoScannerEngineAdapters.js imports correctly");

  const expected = [
    "runCryptoScannerMomentum",
    "runCryptoScannerLiquidity",
    "runCryptoScannerOnChain",
    "runCryptoScannerNarrative",
    "runCryptoScannerNews",
    "runCryptoScannerRisk",
  ];

  for (const name of expected) {
    if (typeof adapters[name] === "function") {
      pass(`Engine adapter available: ${name}`);
    } else {
      fail(`Engine adapter missing: ${name}`);
    }
  }
} catch (error) {
  fail(
    "Unable to import cryptoScannerEngineAdapters.js",
    error
  );
}

/* ============================================================
   4. CHECK CRYPTO UNIVERSE PROVIDER
============================================================ */

let universeModule = null;

try {
  universeModule = await import(
    "../crypto/universe/cryptoUniverseProvider.js"
  );

  pass("cryptoUniverseProvider.js imports correctly");

  info(
    "Universe provider exports:",
    Object.keys(universeModule)
  );
} catch (error) {
  fail(
    "Unable to import cryptoUniverseProvider.js",
    error
  );
}

/* ============================================================
   5. TEST UNIVERSE
============================================================ */

let universe = null;

if (
  universeModule &&
  typeof universeModule.getCryptoUniverse === "function"
) {
  try {
    console.log("\n--- Testing getCryptoUniverse() ---");

    universe =
      await universeModule.getCryptoUniverse({
        refresh: false,
      });

    pass("getCryptoUniverse() executed");

    info("Universe result type:", {
      isArray: Array.isArray(universe),
      keys:
        universe &&
        typeof universe === "object"
          ? Object.keys(universe)
          : [],
    });

    if (Array.isArray(universe)) {
      info(
        `Universe contains ${universe.length} assets`
      );

      console.dir(
        universe.slice(0, 3),
        {
          depth: 3,
          colors: true,
        }
      );
    } else {
      info("Universe response:", universe);
    }
  } catch (error) {
    fail(
      "getCryptoUniverse() failed",
      error
    );
  }
} else {
  fail(
    "getCryptoUniverse() is not exported by cryptoUniverseProvider.js"
  );
}

/* ============================================================
   6. FIND BTC INSIDE UNIVERSE
============================================================ */

function extractAssets(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const candidates = [
    value?.assets,
    value?.universe,
    value?.tokens,
    value?.data,
    value?.results,
    value?.candidates,
  ];

  return (
    candidates.find(Array.isArray) ??
    []
  );
}

const assets = extractAssets(universe);

if (assets.length > 0) {
  const btc = assets.find((asset) => {
    const symbol = String(
      asset?.symbol ??
      asset?.ticker ??
      asset?.assetSymbol ??
      ""
    )
      .trim()
      .toUpperCase();

    return (
      symbol === "BTC" ||
      symbol === "BTC/USD" ||
      symbol === "BTCUSDT" ||
      symbol === "BTC-USD"
    );
  });

  if (btc) {
    pass("BTC can be found in crypto universe");

    info("BTC asset:", btc);
  } else {
    fail(
      "Universe loaded, but BTC could not be found"
    );
  }
} else {
  fail(
    "Could not extract any assets from crypto universe response"
  );
}

/* ============================================================
   7. BUILD TEMPORARY RESOLVER FROM UNIVERSE
============================================================ */

async function diagnosticResolveAsset({ query }) {
  if (
    !universeModule ||
    typeof universeModule.getCryptoUniverse !== "function"
  ) {
    return null;
  }

  const result =
    await universeModule.getCryptoUniverse({
      refresh: false,
    });

  const rows = extractAssets(result);

  const normalized = String(query ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-/_]/g, "");

  const asset = rows.find((row) => {
    const candidates = [
      row?.symbol,
      row?.ticker,
      row?.assetSymbol,
      row?.id,
    ]
      .filter(Boolean)
      .map((value) =>
        String(value)
          .trim()
          .toUpperCase()
          .replace(/[-/_]/g, "")
      );

    return candidates.includes(normalized);
  });

  return asset ?? null;
}

/* ============================================================
   8. BUILD SCANNER SERVICE
============================================================ */

let scannerService = null;

if (
  createCryptoScannerService &&
  adapters
) {
  try {
    scannerService =
      createCryptoScannerService({
        engines: {
          momentum:
            adapters.runCryptoScannerMomentum,

          liquidity:
            adapters.runCryptoScannerLiquidity,

          onChain:
            adapters.runCryptoScannerOnChain,

          narrative:
            adapters.runCryptoScannerNarrative,

          news:
            adapters.runCryptoScannerNews,

          risk:
            adapters.runCryptoScannerRisk,
        },

        resolveAsset:
          diagnosticResolveAsset,
      });

    if (
      scannerService &&
      typeof scannerService.scan === "function"
    ) {
      pass("Scanner service instantiated");
    } else {
      fail(
        "Scanner service exists but .scan() is missing"
      );
    }

    if (
      typeof scannerService?.getCapabilities ===
      "function"
    ) {
      pass(
        "Scanner service exposes getCapabilities()"
      );

      info(
        "Scanner capabilities:",
        scannerService.getCapabilities()
      );
    }
  } catch (error) {
    fail(
      "Unable to instantiate scanner service",
      error
    );
  }
}

/* ============================================================
   9. TEST ROUTER CREATION
============================================================ */

if (
  createCryptoScannerRoutes &&
  scannerService
) {
  try {
    const router =
      createCryptoScannerRoutes({
        scannerService,
      });

    pass(
      "cryptoScannerRoutes successfully accepts scannerService"
    );

    const routeStack =
      router?.stack ?? [];

    const discoveredRoutes =
      routeStack
        .filter((layer) => layer.route)
        .map((layer) => ({
          path: layer.route.path,
          methods:
            Object.keys(
              layer.route.methods ?? {}
            ),
        }));

    info(
      "Routes exposed by cryptoScannerRoutes:",
      discoveredRoutes
    );

    const scanRoute =
      discoveredRoutes.find(
        (route) =>
          route.path === "/scan" &&
          route.methods.includes("post")
      );

    if (scanRoute) {
      pass("POST /scan exists inside scanner router");
    } else {
      fail(
        "POST /scan NOT found inside scanner router"
      );
    }

    const statusRoute =
      discoveredRoutes.find(
        (route) =>
          route.path === "/status" &&
          route.methods.includes("get")
      );

    if (statusRoute) {
      pass("GET /status exists inside scanner router");
    } else {
      fail(
        "GET /status NOT found inside scanner router"
      );
    }
  } catch (error) {
    fail(
      "cryptoScannerRoutes rejected scannerService",
      error
    );
  }
}

/* ============================================================
   10. TEST ACTUAL BTC SCAN
============================================================ */

if (
  scannerService &&
  typeof scannerService.scan === "function"
) {
  try {
    console.log(
      "\n--- Running scannerService.scan({ query: 'BTC' }) ---"
    );

    const result =
      await scannerService.scan({
        query: "BTC",

        metadata: {
          source:
            "DIAGNOSTIC_SCRIPT",
        },
      });

    pass("scannerService.scan() completed");

    info("BTC scan summary:", {
      approved:
        result?.approved,

      status:
        result?.status,

      symbol:
        result?.symbol,

      overallScore:
        result?.overallScore,

      bias:
        result?.bias,

      confidence:
        result?.confidence,

      availability:
        result?.availability,

      engineKeys:
        Object.keys(
          result?.engines ?? {}
        ),

      liveExecution:
        result?.liveExecution,

      executionAuthority:
        result?.executionAuthority,
    });
  } catch (error) {
    fail(
      "scannerService.scan({ query: 'BTC' }) failed",
      error
    );

    console.error(error?.stack);
  }
}

/* ============================================================
   RESULT
============================================================ */

console.log("\n==============================================");

if (failures === 0) {
  console.log(
    "✅ SCANNER INTERNAL CHAIN IS WORKING"
  );

  console.log(
    "\nIf the browser still receives:"
  );

  console.log(
    "POST /api/crypto/scanner/scan 404"
  );

  console.log(
    "\nthen the remaining problem is Express route mounting."
  );

  console.log(
    "\nExpected mount:"
  );

  console.log(
    'app.use("/api/crypto/scanner", cryptoScannerRoutes);'
  );
} else {
  console.log(
    `❌ ${failures} DIAGNOSTIC FAILURE(S) FOUND`
  );

  console.log(
    "Read the FIRST failure above. That is usually the root dependency problem."
  );
}

console.log("==============================================\n");

process.exitCode =
  failures > 0
    ? 1
    : 0;