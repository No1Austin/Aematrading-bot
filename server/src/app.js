import "dotenv/config";

import express from "express";
import cors from "cors";

const app = express();

const PORT =
  Number(process.env.PORT) || 8000;

/**
 * ============================================================
 * MIDDLEWARE
 * ============================================================
 */

app.use(cors());

app.use(express.json());

/**
 * ============================================================
 * ROOT
 * ============================================================
 */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "Trading Bot API",
    status: "RUNNING",
    tradingMode:
      process.env.TRADING_MODE ??
      "UNKNOWN",
    timestamp:
      new Date().toISOString(),
  });
});

/**
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 */

app.get(
  "/api/health",
  (req, res) => {
    const alpacaConfigured =
      Boolean(
        process.env.ALPACA_API_KEY &&
        process.env.ALPACA_SECRET_KEY,
      );

    res.status(200).json({
      success: true,
      status: "healthy",
      service:
        "Trading Bot API",
      tradingMode:
        process.env.TRADING_MODE ??
        "UNKNOWN",
      alpacaConfigured,
      timestamp:
        new Date().toISOString(),
    });
  },
);

/**
 * ============================================================
 * 404
 * ============================================================
 */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found.",
    method: req.method,
    path: req.originalUrl,
  });
});

/**
 * ============================================================
 * SAFE FAIL — EXPRESS ERROR HANDLER
 * ============================================================
 */

app.use(
  (error, req, res, next) => {
    console.error(
      "SERVER ERROR:",
      error,
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      success: false,
      error:
        "Internal server error.",
    });
  },
);

/**
 * ============================================================
 * START SERVER
 * ============================================================
 */

const server =
  app.listen(PORT, () => {
    const alpacaConfigured =
      Boolean(
        process.env.ALPACA_API_KEY &&
        process.env.ALPACA_SECRET_KEY,
      );

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
        process.env.TRADING_MODE ??
        "UNKNOWN"
      }`,
    );

    console.log(
      `Alpaca configured: ${
        alpacaConfigured
          ? "YES"
          : "NO"
      }`,
    );

    console.log(
      "====================================\n",
    );
  });

/**
 * ============================================================
 * SAFE SHUTDOWN
 * ============================================================
 */

function shutdown(signal) {
  console.log(
    `\n${signal} received. Shutting down safely...`,
  );

  server.close(() => {
    console.log(
      "Trading Bot API stopped.",
    );

    process.exit(0);
  });

  setTimeout(() => {
    console.error(
      "Forced shutdown after timeout.",
    );

    process.exit(1);
  }, 10_000).unref();
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT"),
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM"),
);

export default app;