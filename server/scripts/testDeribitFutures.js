/**
 * Deribit perpetual-futures connectivity diagnostic.
 *
 * Research / diagnostics only.
 * No authentication.
 * No order authority.
 * No live execution.
 *
 * Run:
 *   node scripts/testDeribitFutures.jsx
 */

const BASE_URL = "https://www.deribit.com/api/v2";

async function get(method, params = {}) {
  const url = new URL(`${BASE_URL}/public/${method}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const text = await response.text();

    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 1000);
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        result: null,
        error: body,
      };
    }

    if (body?.error) {
      return {
        success: false,
        status: response.status,
        result: null,
        error: body.error,
      };
    }

    return {
      success: true,
      status: response.status,
      result: body?.result ?? null,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      status: null,
      result: null,
      error:
        error?.name === "AbortError"
          ? "REQUEST_TIMEOUT"
          : error?.message ?? "UNKNOWN_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoFromMs(value) {
  const n = finiteNumber(value);
  if (n === null) return null;

  const date = new Date(n);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ageSeconds(timestampMs) {
  const n = finiteNumber(timestampMs);
  if (n === null) return null;
  return Math.max(0, (Date.now() - n) / 1000);
}

async function main() {
  const observedAt = new Date().toISOString();

  console.log("============================================");
  console.log("DERIBIT PERPETUAL FUTURES CONNECTIVITY TEST");
  console.log("============================================");
  console.log(`Observed at: ${observedAt}`);
  console.log("");

  // Retrieve genuine BTC futures instruments and select an active perpetual.
  const instruments = await get("get_instruments", {
    currency: "BTC",
    kind: "future",
    expired: false,
  });

  const instrumentRows = Array.isArray(instruments.result)
    ? instruments.result
    : [];

  const perpetuals = instrumentRows.filter((row) => {
    const name = String(row?.instrument_name ?? "").toUpperCase();
    return name.includes("PERPETUAL");
  });

  const activePerpetuals = perpetuals.filter(
    (row) => row?.is_active === true,
  );

  const preferred =
    activePerpetuals.find(
      (row) =>
        String(row?.instrument_name ?? "").toUpperCase() ===
        "BTC-PERPETUAL",
    ) ??
    activePerpetuals[0] ??
    perpetuals[0] ??
    null;

  const instrumentName = preferred?.instrument_name ?? null;

  if (!instrumentName) {
    console.log(
      JSON.stringify(
        {
          success: false,
          source: "DERIBIT_PUBLIC_API_V2",
          marketType: "PERPETUAL",
          observedAt,
          instruments: {
            success: instruments.success,
            status: instruments.status,
            total: instrumentRows.length,
            perpetuals: perpetuals.length,
            activePerpetuals: activePerpetuals.length,
          },
          error:
            instruments.error ??
            "NO_PERPETUAL_INSTRUMENT_FOUND",
          executionAuthority: false,
          liveExecution: false,
        },
        null,
        2,
      ),
    );

    process.exitCode = 1;
    return;
  }

  const now = Date.now();
  const candleStart = now - 24 * 60 * 60 * 1000;

  const [ticker, orderBook, candles, fundingHistory] =
    await Promise.all([
      get("ticker", {
        instrument_name: instrumentName,
      }),

      get("get_order_book", {
        instrument_name: instrumentName,
        depth: 20,
      }),

      get("get_tradingview_chart_data", {
        instrument_name: instrumentName,
        start_timestamp: candleStart,
        end_timestamp: now,
        resolution: "15",
      }),

      get("get_funding_rate_history", {
        instrument_name: instrumentName,
        start_timestamp: candleStart,
        end_timestamp: now,
      }),
    ]);

  const tickerResult = ticker.result ?? {};
  const orderBookResult = orderBook.result ?? {};
  const candleResult = candles.result ?? {};

  const tickerTimestamp =
    finiteNumber(tickerResult?.timestamp);

  const orderBookTimestamp =
    finiteNumber(orderBookResult?.timestamp);

  const bids = Array.isArray(orderBookResult?.bids)
    ? orderBookResult.bids
    : [];

  const asks = Array.isArray(orderBookResult?.asks)
    ? orderBookResult.asks
    : [];

  const ticks = Array.isArray(candleResult?.ticks)
    ? candleResult.ticks
    : [];

  const fundingRows = Array.isArray(fundingHistory.result)
    ? fundingHistory.result
    : [];

  const report = {
    success:
      instruments.success &&
      ticker.success &&
      orderBook.success &&
      candles.success,

    source: "DERIBIT_PUBLIC_API_V2",
    marketType: "PERPETUAL",
    observedAt,

    universe: {
      requestSuccess: instruments.success,
      httpStatus: instruments.status,
      btcFutureInstruments: instrumentRows.length,
      perpetuals: perpetuals.length,
      activePerpetuals: activePerpetuals.length,
      selectedInstrument: instrumentName,
      selectedActive: preferred?.is_active ?? null,
      settlementPeriod: preferred?.settlement_period ?? null,
      baseCurrency: preferred?.base_currency ?? null,
      quoteCurrency: preferred?.quote_currency ?? null,
      settlementCurrency: preferred?.settlement_currency ?? null,
    },

    ticker: {
      success: ticker.success,
      httpStatus: ticker.status,
      timestamp: isoFromMs(tickerTimestamp),
      ageSeconds: ageSeconds(tickerTimestamp),
      lastPrice: finiteNumber(tickerResult?.last_price),
      markPrice: finiteNumber(tickerResult?.mark_price),
      indexPrice: finiteNumber(tickerResult?.index_price),
      bestBid: finiteNumber(tickerResult?.best_bid_price),
      bestAsk: finiteNumber(tickerResult?.best_ask_price),
      openInterest: finiteNumber(tickerResult?.open_interest),
      currentFunding: finiteNumber(tickerResult?.current_funding),
      funding8h: finiteNumber(tickerResult?.funding_8h),
      state: tickerResult?.state ?? null,
    },

    orderBook: {
      success: orderBook.success,
      httpStatus: orderBook.status,
      timestamp: isoFromMs(orderBookTimestamp),
      ageSeconds: ageSeconds(orderBookTimestamp),
      bidLevels: bids.length,
      askLevels: asks.length,
      bestBid:
        Array.isArray(bids[0]) ? finiteNumber(bids[0][0]) : null,
      bestAsk:
        Array.isArray(asks[0]) ? finiteNumber(asks[0][0]) : null,
    },

    candles: {
      success: candles.success,
      httpStatus: candles.status,
      status: candleResult?.status ?? null,
      count: ticks.length,
      firstTimestamp:
        ticks.length > 0 ? isoFromMs(ticks[0]) : null,
      lastTimestamp:
        ticks.length > 0 ? isoFromMs(ticks[ticks.length - 1]) : null,
      lastClose:
        Array.isArray(candleResult?.close) &&
        candleResult.close.length > 0
          ? finiteNumber(
              candleResult.close[candleResult.close.length - 1],
            )
          : null,
    },

    fundingHistory: {
      success: fundingHistory.success,
      httpStatus: fundingHistory.status,
      count: fundingRows.length,
      latest:
        fundingRows.length > 0
          ? fundingRows[fundingRows.length - 1]
          : null,
    },

    errors: {
      instruments: instruments.error,
      ticker: ticker.error,
      orderBook: orderBook.error,
      candles: candles.error,
      fundingHistory: fundingHistory.error,
    },

    dataFreshness: {
      tickerFresh:
        ageSeconds(tickerTimestamp) !== null
          ? ageSeconds(tickerTimestamp) < 300
          : false,

      orderBookFresh:
        ageSeconds(orderBookTimestamp) !== null
          ? ageSeconds(orderBookTimestamp) < 300
          : false,
    },

    executionAuthority: false,
    liveExecution: false,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
        observedAt: new Date().toISOString(),
        executionAuthority: false,
        liveExecution: false,
      },
      null,
      2,
    ),
  );

  process.exitCode = 1;
});
