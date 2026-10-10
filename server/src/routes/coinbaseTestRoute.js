import express from "express";

const router = express.Router();

const BASE_URL =
  "https://api.international.coinbase.com/api/v1";

async function test(path) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    12000
  );

  try {
    const response = await fetch(
      `${BASE_URL}${path}`,
      {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    const text = await response.text();

    let body = null;

    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }

    return {
      success: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      success: false,
      status: null,
      error:
        error?.name === "AbortError"
          ? "REQUEST_TIMEOUT"
          : error?.message || "UNKNOWN_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}

router.get("/coinbase-futures-test", async (req, res) => {
  try {
    const [
      instruments,
      btcPerpetual,
      btcQuote,
    ] = await Promise.all([
      test("/instruments"),
      test("/instruments/BTC-PERP"),
      test("/instruments/BTC-PERP/quote"),
    ]);

    res.json({
      environment: "RENDER_BACKEND",
      observedAt: new Date().toISOString(),

      instruments: {
        success: instruments.success,
        status: instruments.status,
      },

      btcPerpetual: {
        success: btcPerpetual.success,
        status: btcPerpetual.status,
        symbol:
          btcPerpetual.body?.symbol ?? null,
        type:
          btcPerpetual.body?.type ?? null,
        tradingState:
          btcPerpetual.body?.trading_state ?? null,
      },

      btcQuote: {
        success: btcQuote.success,
        status: btcQuote.status,
        timestamp:
          btcQuote.body?.timestamp ?? null,
        markPrice:
          btcQuote.body?.mark_price ?? null,
        indexPrice:
          btcQuote.body?.index_price ?? null,
        bestBid:
          btcQuote.body?.best_bid_price ?? null,
        bestAsk:
          btcQuote.body?.best_ask_price ?? null,
        predictedFunding:
          btcQuote.body?.predicted_funding ?? null,
      },

      errors: {
        instruments:
          instruments.error ?? null,
        btcPerpetual:
          btcPerpetual.error ?? null,
        btcQuote:
          btcQuote.error ?? null,
      },

      executionAuthority: false,
      liveExecution: false,
    });
  } catch (error) {
    res.status(500).json({
      error:
        error?.message ||
        "COINBASE_TEST_FAILED",
    });
  }
});

export default router;