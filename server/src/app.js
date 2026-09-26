import "dotenv/config";



import express from "express";

import cors from "cors";



import createCryptoRuntimeRouter

  from "./routes/cryptoRuntimeRoutes.js";



import {

  cryptoRuntimeApiService,

  startCryptoRuntimeServices,

  stopCryptoRuntimeServices,

} from "./crypto/runtime/cryptoRuntimeContainer.js";



import {

  DEFAULT_TRADING_ACCOUNT_ID,

  getOrCreateTradingSession,

} from "./services/tradingSessionRegistry.js";



import positionRoutes from

  "./routes/positionRoutes.js";



import scannerRoutes from

  "./routes/scannerRoutes.js";



import analysisRoutes from

  "./routes/analysisRoutes.js";



import marketRoutes from

  "./routes/marketRoutes.js";



import historyRoutes from

  "./routes/historyRoutes.js";



import researchRoutes from

  "./routes/researchRoutes.js";



import cryptoResearchRoutes from "./crypto/routes/cryptoResearchRoutes.js";



import createCexDiscoveryRoutes

  from "./crypto/bot/api/cexDiscoveryRoutes.js";





  import createBotPrivateRoutes

  from "./crypto/bot/api/botPrivateRoutes.js";







  import {

  startBotPositionRuntime,

  stopBotPositionRuntime,

} from "./crypto/bot/runtime/botRuntime.js";





import {

  startCexDiscoveryRuntime,

  stopCexDiscoveryRuntime,

} from "./crypto/bot/runtime/cexDiscoveryRuntime.js";



import continuousMarketScanner from

  "./scanner/continuousMarketScanner.js";





  import cryptoNewsRoutes

  from "./routes/cryptoNewsRoutes.js";







  const cryptoRuntimeRoutes =

  createCryptoRuntimeRouter({

    runtimeApiService:

      cryptoRuntimeApiService,

  });







/**

 * ============================================================

 * APPLICATION

 * ============================================================

 */

import cryptoMarketRoutes from "./routes/cryptoMarketRoutes.js";

import cryptoDiscoveryRoutes from "./routes/cryptoDiscoveryRoutes.js";

import createCryptoScannerRoutes from "./routes/cryptoScannerRoutes.js";

import createCryptoScannerService from "./crypto/scanner/cryptoScannerService.js";

import {

  runCryptoScannerMomentum,

  runCryptoScannerLiquidity,

  runCryptoScannerOnChain,

  runCryptoScannerNarrative,

  runCryptoScannerNews,

  runCryptoScannerRisk,

} from "./crypto/scanner/cryptoScannerEngineAdapters.js";

import { getCryptoUniverse } from "./crypto/universe/cryptoUniverseProvider.js";





function extractCryptoUniverseAssets(value) {

  if (Array.isArray(value)) return value;



  const candidates = [

    value?.assets,

    value?.universe,

    value?.tokens,

    value?.data,

    value?.results,

    value?.candidates,

  ];



  return candidates.find(Array.isArray) ?? [];

}



async function resolveCryptoScannerAsset({ query }) {

  const universeResult = await getCryptoUniverse({ refresh: false });

  const assets = extractCryptoUniverseAssets(universeResult);

  const rawQuery = String(query ?? "").trim();

  const normalizedQuery = rawQuery.toUpperCase().replace(/[-/_\s]/g, "");



  const asset = assets.find((row) => {

    const candidates = [

      row?.symbol,

      row?.ticker,

      row?.assetSymbol,

      row?.assetId,

      row?.id,

      row?.name,

      ...(Array.isArray(row?.venues?.cex)

        ? row.venues.cex.flatMap((venue) => [

            venue?.productId,

            venue?.altname,

            venue?.wsname,

          ])

        : []),

    ]

      .filter(Boolean)

      .map((value) =>

        String(value).trim().toUpperCase().replace(/[-/_\s]/g, ""),

      );



    return candidates.includes(normalizedQuery);

  });



  if (!asset) {

    return {

      approved: false,

      status: "CRYPTO_ASSET_NOT_FOUND",

      blocker: "ASSET_NOT_FOUND",

      query: rawQuery,

      asset: null,

      source: "CRYPTO_UNIVERSE",

    };

  }



  return {

    approved: true,

    status: "CRYPTO_ASSET_RESOLVED",

    query: rawQuery,

    asset,

    source: "CRYPTO_UNIVERSE",

  };

}



const cryptoScannerService = createCryptoScannerService({

  engines: {

    momentum: runCryptoScannerMomentum,

    liquidity: runCryptoScannerLiquidity,

    onChain: runCryptoScannerOnChain,

    narrative: runCryptoScannerNarrative,

    news: runCryptoScannerNews,

    risk: runCryptoScannerRisk,

  },

  resolveAsset: resolveCryptoScannerAsset,

});



const cryptoScannerRoutes = createCryptoScannerRoutes({

  scannerService: cryptoScannerService,

});





const botPrivateRoutes =

  createBotPrivateRoutes();





const cexDiscoveryRoutes =

  createCexDiscoveryRoutes();



const app = express();



/**

 * ============================================================

 * SERVER CONFIGURATION

 * ============================================================

 */



function resolvePort() {

  const parsed =

    Number(

      process.env.PORT,

    );



  if (

    Number.isInteger(parsed) &&

    parsed > 0 &&

    parsed <= 65_535

  ) {

    return parsed;

  }



  return 8000;

}



const PORT =

  resolvePort();



/**

 * ============================================================

 * ENVIRONMENT HELPERS

 * ============================================================

 */



function booleanFromEnv(

  value,

  fallback = false,

) {

  if (

    value === undefined ||

    value === null ||

    value === ""

  ) {

    return fallback;

  }



  const normalized =

    String(value)

      .trim()

      .toLowerCase();



  if (

    [

      "1",

      "true",

      "yes",

      "on",

    ].includes(normalized)

  ) {

    return true;

  }



  if (

    [

      "0",

      "false",

      "no",

      "off",

    ].includes(normalized)

  ) {

    return false;

  }



  return fallback;

}



function scannerAutoStartEnabled() {

  /**

   * Never implicitly start a background scanner

   * while automated tests are running.

   */

  if (

    process.env.NODE_ENV ===

    "test"

  ) {

    return false;

  }



  return booleanFromEnv(

    process.env

      .AEMA_SCANNER_AUTO_START,

    false,

  );

}



function alpacaIsConfigured() {

  /**

   * The project currently contains providers using

   * both naming conventions.

   *

   * Support either pair here so the health endpoint

   * does not incorrectly report Alpaca as unavailable.

   */



  const key =

    process.env

      .ALPACA_API_KEY ||

    process.env

      .APCA_API_KEY_ID;



  const secret =

    process.env

      .ALPACA_SECRET_KEY ||

    process.env

      .APCA_API_SECRET_KEY;



  return Boolean(

    key &&

    secret,

  );

}



/**

 * ============================================================

 * DEVELOPMENT TRADING SESSION

 * ============================================================

 *

 * Temporary single-account runtime bootstrap.

 *

 * Later, authenticated SaaS users can create or restore

 * account-scoped sessions.

 */



let developmentTradingSession =

  null;



try {

  developmentTradingSession =

    getOrCreateTradingSession({

      accountId:

        DEFAULT_TRADING_ACCOUNT_ID,

    });

} catch (error) {

  /**

   * Do not prevent the entire HTTP API from starting merely

   * because development-session initialization failed.

   *

   * The failure remains visible in server logs.

   */

  console.error(

    "[TRADING_SESSION_BOOTSTRAP_FAILED]",

    error instanceof Error

      ? error.message

      : error,

  );

}



void developmentTradingSession;



/**

 * ============================================================

 * MIDDLEWARE

 * ============================================================

 */



app.disable(

  "x-powered-by",

);



// Explicitly allow the production frontend and local development origins.
// Additional trusted origins can be supplied as comma-separated CORS_ORIGINS.
const allowedCorsOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://aematrading-bot.vercel.app",
  ...(process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
]);

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser requests (e.g. server-to-server/health checks) lack Origin.
      if (!origin || allowedCorsOrigins.has(origin)) {
        return callback(null, true);
      }
      // Return no CORS headers for unapproved browser origins.
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // cors reflects requested headers when allowedHeaders is omitted.
    optionsSuccessStatus: 204,
  }),
);



app.use(

  express.json({

    limit:

      "1mb",

  }),

);



/**

 * Gracefully handle malformed JSON.

 *

 * Express will forward JSON parsing errors to the global

 * error handler below.

 */



/**

 * ============================================================

 * ROOT

 * ============================================================

 */



app.get(

  "/",

  (req, res) => {

    return res

      .status(200)

      .json({

        success:

          true,



        service:

          "Trading Bot API",



        status:

          "RUNNING",



        tradingMode:

          process.env

            .TRADING_MODE ??

          "UNKNOWN",



        timestamp:

          new Date()

            .toISOString(),

      });

  },

);



/**

 * ============================================================

 * HEALTH CHECK

 * ============================================================

 */



app.get(

  "/api/health",

  (req, res) => {

    let scannerState =

      null;



    try {

      scannerState =

        continuousMarketScanner

          .getState();

    } catch (error) {

      scannerState = {

        status:

          "UNKNOWN",



        active:

          false,



        runningCycle:

          false,



        error:

          error instanceof Error

            ? error.message

            : String(error),

      };

    }



    return res

      .status(200)

      .json({

        success:

          true,



        status:

          "healthy",



        service:

          "Trading Bot API",



        tradingMode:

          process.env

            .TRADING_MODE ??

          "UNKNOWN",



        alpacaConfigured:

          alpacaIsConfigured(),



        scanner: {

          autoStartEnabled:

            scannerAutoStartEnabled(),



          status:

            scannerState

              ?.status ??

            "UNKNOWN",



          active:

            scannerState

              ?.active ===

            true,



          runningCycle:

            scannerState

              ?.runningCycle ===

            true,



          cycleCount:

            scannerState

              ?.cycleCount ??

            0,



          skippedCycles:

            scannerState

              ?.skippedCycles ??

            0,



          startedAt:

            scannerState

              ?.startedAt ??

            null,



          lastCycleStartedAt:

            scannerState

              ?.lastCycleStartedAt ??

            null,



          lastCycleCompletedAt:

            scannerState

              ?.lastCycleCompletedAt ??

            null,



          nextCycleAt:

            scannerState

              ?.nextCycleAt ??

            null,



          lastError:

            scannerState

              ?.lastError ??

            null,

        },



        timestamp:

          new Date()

            .toISOString(),

      });

  },

);



/**

 * ============================================================

 * API ROUTES

 * ============================================================

 *

 * IMPORTANT:

 *

 * All API routers must remain ABOVE the 404 handler.

 */



/**

 * Scanner

 *

 * GET  /api/scanner/status

 * GET  /api/scanner/candidates

 * GET  /api/scanner/snapshot

 * POST /api/scanner/start

 * POST /api/scanner/stop

 * POST /api/scanner/run-once

 */



app.use(

  "/api/scanner",

  scannerRoutes,

);



/**

 * Stock analysis

 */



app.use(

  "/api/analysis",

  analysisRoutes,

);



/**

 * Market overview / news / status

 */



app.use(

  "/api/markets",

  marketRoutes,

);



/**

 * Trading positions

 */



app.use(

  "/api/positions",

  positionRoutes,

);



/**

 * Historical records

 */



app.use(

  "/api/history",

  historyRoutes,

);



/**

 * Deep research

 */



app.use(

  "/api/research",

  researchRoutes,

);



/**

 * Crypto runtime

 *

 * Frontend-facing paper crypto runtime API.

 *

 * IMPORTANT:

 * - paper execution only

 * - no live execution authority

 * - must remain above the 404 handler

 */



app.use(

  "/api/crypto/scanner",

  cryptoScannerRoutes,

);



app.use(

  "/api/crypto",

  cryptoMarketRoutes,

);



app.use(

  "/api/crypto",

  cryptoDiscoveryRoutes,

);



app.use(

  "/api/crypto",

  cryptoRuntimeRoutes,

);





app.use(

  "/api/crypto/news",

  cryptoNewsRoutes,

);





app.use(

  "/api/crypto/research",

  cryptoResearchRoutes,

);



/**

 * Independent CEX Discovery

 *

 * Public research-facing discovery telemetry.

 * Runs independently from the private /bot trading application.

 *

 * GET /api/crypto/bot-discovery/state

 */

app.use(

  "/api/crypto/bot-discovery",

  cexDiscoveryRoutes,

);





/**

 * ============================================================

 * PRIVATE AEMA BOT

 * ============================================================

 *

 * POST /api/crypto/bot/auth/login

 * POST /api/crypto/bot/auth/logout

 * GET  /api/crypto/bot/auth/status

 * GET  /api/crypto/bot/dashboard

 */



app.use(

  "/api/crypto/bot",

  botPrivateRoutes,

);

/**

 * ============================================================

 * 404

 * ============================================================

 *

 * MUST remain after every actual application route.

 */



app.use(

  (req, res) => {

    return res

      .status(404)

      .json({

        success:

          false,



        error:

          "Route not found.",



        method:

          req.method,



        path:

          req.originalUrl,



        timestamp:

          new Date()

            .toISOString(),

      });

  },

);



/**

 * ============================================================

 * EXPRESS ERROR HANDLER

 * ============================================================

 *

 * MUST remain the final Express middleware.

 */



app.use(

  (

    error,

    req,

    res,

    next,

  ) => {

    console.error(

      "[EXPRESS_ERROR]",

      {

        method:

          req.method,



        path:

          req.originalUrl,



        message:

          error instanceof Error

            ? error.message

            : String(error),

      },

    );



    if (

      res.headersSent

    ) {

      return next(

        error,

      );

    }



    /**

     * Malformed JSON should be a client error,

     * not an internal server error.

     */

    if (

      error?.type ===

        "entity.parse.failed" ||

      (

        error instanceof SyntaxError &&

        error?.status === 400

      )

    ) {

      return res

        .status(400)

        .json({

          success:

            false,



          error:

            "Invalid JSON request body.",



          timestamp:

            new Date()

              .toISOString(),

        });

    }



    return res

      .status(500)

      .json({

        success:

          false,



        error:

          "Internal server error.",



        timestamp:

          new Date()

            .toISOString(),

      });

  },

);



/**

 * ============================================================

 * BACKGROUND RUNTIME STARTUP

 * ============================================================

 */



async function startRuntimeServices() {

  if (

    !scannerAutoStartEnabled()

  ) {

    console.log(

      "[AEMA_SCANNER_AUTO_START_DISABLED]",

      {

        configuredValue:

          process.env

            .AEMA_SCANNER_AUTO_START ??

          null,

      },

    );



    return;

  }



  console.log(

    "[AEMA_SCANNER_AUTO_START_REQUESTED]",

  );



  try {

    /**

     * start() is already idempotent inside the scanner.

     *

     * It may run the first discovery cycle before resolving.

     * This function is intentionally launched without blocking

     * the Express listener below.

     */

    const state =

      await continuousMarketScanner

        .start();



    console.log(

      "[AEMA_SCANNER_AUTO_START_COMPLETE]",

      {

        status:

          state

            ?.status ??

          null,



        active:

          state

            ?.active ===

          true,



        cycleCount:

          state

            ?.cycleCount ??

          0,



        nextCycleAt:

          state

            ?.nextCycleAt ??

          null,

      },

    );

  } catch (error) {

    /**

     * Fail safely.

     *

     * A scanner failure must remain visible, but it must not

     * take down unrelated APIs such as markets/news/history.

     */

    console.error(

      "[AEMA_SCANNER_AUTO_START_FAILED]",

      error instanceof Error

        ? {

            name:

              error.name,



            message:

              error.message,



            stack:

              error.stack,

          }

        : error,

    );

  }

}



/**

 * ============================================================

 * START HTTP SERVER

 * ============================================================

 */



const server =

  app.listen(

    PORT,

    () => {

      console.log(

        "\n====================================",

      );



      console.log(

        "TRADING BOT SERVER",

      );



      console.log(

        "====================================",

      );



      console.log(

        `Server: http://localhost:${PORT}`,

      );



      console.log(

        `Mode: ${

          process.env

            .TRADING_MODE ??

          "UNKNOWN"

        }`,

      );



      console.log(

        `Alpaca configured: ${

          alpacaIsConfigured()

            ? "YES"

            : "NO"

        }`,

      );



      console.log(

        `Scanner auto-start: ${

          scannerAutoStartEnabled()

            ? "ENABLED"

            : "DISABLED"

        }`,

      );



      console.log(

        "Scanner API: /api/scanner",

      );



      console.log(

        "Analysis API: /api/analysis",

      );



      console.log(

        "Markets API: /api/markets",

      );



      console.log(

        "Positions API: /api/positions",

      );



      console.log(

        "History API: /api/history",

      );



      console.log(

        "Research API: /api/research",

      );



      console.log(

        "Crypto API: /api/crypto",

      );



      console.log(

        "Crypto Scanner API: /api/crypto/scanner",

      );



      console.log(

        "Crypto News API: /api/crypto/news",

      );



      console.log(

        "CEX Discovery API: /api/crypto/bot-discovery",

      );



      console.log(

        "====================================\n",

      );



      /**

       * CRITICAL:

       *

       * Do not await this from app.listen().

       *

       * The first scanner cycle can be expensive. Express

       * should remain available while that work runs.

       */

      void startRuntimeServices();



      void startCryptoRuntimeServices();

      // Independent bot: optional automatic startup.

// Disabled unless explicitly enabled in .env.

if (process.env.AEMA_BOT_AUTO_START === "true") {

  const result = startBotPositionRuntime();



  console.log("[AEMA_BOT_RUNTIME]", result);

}



      void startCexDiscoveryRuntime()

        .then(() => {

          console.log(

            "[CEX_DISCOVERY_RUNTIME_STARTED]",

          );

        })

        .catch(error => {

          console.error(

            "[CEX_DISCOVERY_RUNTIME_START_FAILED]",

            error instanceof Error

              ? error.message

              : error,

          );

        });

    },

  );



/**

 * ============================================================

 * HTTP SERVER ERROR VISIBILITY

 * ============================================================

 */



server.on(

  "error",

  error => {

    console.error(

      "[HTTP_SERVER_ERROR]",

      error,

    );

  },

);



/**

 * ============================================================

 * SAFE SHUTDOWN

 * ============================================================

 */



let shutdownStarted =

  false;



async function shutdown(

  signal,

) {

  if (

    shutdownStarted

  ) {

    return;

  }



  shutdownStarted =

    true;



  console.log(

    `\n${signal} received. Shutting down safely...`,

  );



  /**

   * The scanner can be performing network-heavy discovery.

   *

   * Give shutdown a bounded amount of time so Render/local

   * development cannot remain stuck indefinitely.

   */

  const forcedShutdownTimer =

    setTimeout(

      () => {

        console.error(

          "[FORCED_SHUTDOWN] Timeout exceeded.",

        );



        process.exit(1);

      },

      15_000,

    );



  forcedShutdownTimer

    .unref();



  try {

    /**

     * --------------------------------------------------------

     * 1. STOP SCANNER

     * --------------------------------------------------------

     */



    try {

      await continuousMarketScanner

        .stop({

          waitForCurrentCycle:

            true,

        });



      console.log(

        "Continuous market scanner stopped.",

      );

    } catch (error) {

      console.error(

        "[SCANNER_SHUTDOWN_ERROR]",

        error instanceof Error

          ? error.message

          : error,

      );

    }



    /**

     * --------------------------------------------------------

     * 2. STOP CRYPTO RUNTIME

     * --------------------------------------------------------

     */



    try {

      await stopCryptoRuntimeServices();



      console.log(

        "Crypto runtime services stopped.",

      );

    } catch (error) {

      console.error(

        "[CRYPTO_RUNTIME_SHUTDOWN_ERROR]",

        error instanceof Error

          ? error.message

          : error,

      );

    }



    /**

     * --------------------------------------------------------

     * 3. STOP CEX DISCOVERY RUNTIME

     * --------------------------------------------------------

     */



    try {

      await stopCexDiscoveryRuntime();



      console.log(

        "CEX Discovery runtime stopped.",

      );

    } catch (error) {

      console.error(

        "[CEX_DISCOVERY_SHUTDOWN_ERROR]",

        error instanceof Error

          ? error.message

          : error,

      );

    }



    /**

     * --------------------------------------------------------

     * 4. STOP ACCEPTING NEW HTTP CONNECTIONS

     * --------------------------------------------------------

     */



    await new Promise(

      resolve => {

        server.close(

          error => {

            if (

              error

            ) {

              console.error(

                "[HTTP_SHUTDOWN_ERROR]",

                error,

              );

            }



            resolve();

          },

        );

      },

    );



    clearTimeout(

      forcedShutdownTimer,

    );



    console.log(

      "Trading Bot API stopped.",

    );



    process.exit(0);

  } catch (error) {

    clearTimeout(

      forcedShutdownTimer,

    );



    console.error(

      "[SHUTDOWN_FAILURE]",

      error,

    );



    process.exit(1);

  }

}



/**

 * ============================================================

 * OPERATING SYSTEM SIGNALS

 * ============================================================

 */



process.on(

  "SIGINT",

  () => {

    void shutdown(

      "SIGINT",

    );

  },

);



process.on(

  "SIGTERM",

  () => {

    void shutdown(

      "SIGTERM",

    );

  },

);







/**

 * ============================================================

 * PROCESS FAILURE VISIBILITY

 * ============================================================

 */



process.on(

  "unhandledRejection",

  reason => {

    console.error(

      "[UNHANDLED_PROMISE_REJECTION]",

      reason,

    );

  },

);



process.on(

  "uncaughtException",

  error => {

    console.error(

      "[UNCAUGHT_EXCEPTION]",

      error,

    );



    void shutdown(

      "UNCAUGHT_EXCEPTION",

    );

  },

);



export default app;