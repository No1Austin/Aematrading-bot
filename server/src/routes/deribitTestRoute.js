import express from "express";

const router = express.Router();

const BASE_URL =
  "https://www.deribit.com/api/v2";

const TIMEOUT_MS = 12_000;


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function isoFromMs(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return null;
  }

  const date =
    new Date(number);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}


function ageSeconds(value) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return null;
  }

  return Math.max(
    0,
    (Date.now() - number) / 1000,
  );
}


/**
 * ============================================================
 * DERIBIT PUBLIC REQUEST
 * ============================================================
 */

async function deribitPublicRequest(
  method,
  params = {},
) {
  const url =
    new URL(
      `${BASE_URL}/public/${method}`,
    );

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    if (
      value !== null &&
      value !== undefined
    ) {
      url.searchParams.set(
        key,
        String(value),
      );
    }
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Accept:
              "application/json",
          },

          signal:
            controller.signal,
        },
      );

    const text =
      await response.text();

    let body =
      null;

    try {
      body =
        JSON.parse(text);
    } catch {
      body =
        text.slice(
          0,
          1000,
        );
    }


    if (
      !response.ok
    ) {
      return {
        success:
          false,

        status:
          response.status,

        result:
          null,

        error:
          body,
      };
    }


    if (
      body?.error
    ) {
      return {
        success:
          false,

        status:
          response.status,

        result:
          null,

        error:
          body.error,
      };
    }


    return {
      success:
        true,

      status:
        response.status,

      result:
        body?.result ??
        null,

      error:
        null,
    };
  } catch (error) {
    return {
      success:
        false,

      status:
        null,

      result:
        null,

      error:
        error?.name ===
        "AbortError"
          ? "REQUEST_TIMEOUT"
          : error?.message ??
            "UNKNOWN_ERROR",
    };
  } finally {
    clearTimeout(
      timer,
    );
  }
}


/**
 * ============================================================
 * GET /deribit-futures-test
 * ============================================================
 *
 * Tests genuine Deribit perpetual-futures market data.
 *
 * Research / diagnostics only.
 *
 * No authentication.
 * No account access.
 * No order authority.
 * No execution.
 */

router.get(
  "/deribit-futures-test",

  async (
    req,
    res,
  ) => {
    try {
      const observedAt =
        new Date()
          .toISOString();


      /**
       * ------------------------------------------------------
       * 1. BTC FUTURES UNIVERSE
       * ------------------------------------------------------
       */

      const instruments =
        await deribitPublicRequest(
          "get_instruments",
          {
            currency:
              "BTC",

            kind:
              "future",

            expired:
              false,
          },
        );


      const instrumentRows =
        Array.isArray(
          instruments.result,
        )
          ? instruments.result
          : [];


      const perpetuals =
        instrumentRows.filter(
          (instrument) => {
            const name =
              String(
                instrument
                  ?.instrument_name ??
                "",
              ).toUpperCase();

            return (
              name.includes(
                "PERPETUAL",
              ) ||
              instrument
                ?.settlement_period ===
                "perpetual"
            );
          },
        );


      const activePerpetuals =
        perpetuals.filter(
          (instrument) =>
            instrument
              ?.is_active ===
            true,
        );


      const selectedInstrument =
        activePerpetuals.find(
          (instrument) =>
            String(
              instrument
                ?.instrument_name ??
              "",
            ).toUpperCase() ===
            "BTC-PERPETUAL",
        ) ??
        activePerpetuals[0] ??
        null;


      if (
        !selectedInstrument
      ) {
        return res
          .status(502)
          .json({
            success:
              false,

            source:
              "DERIBIT_PUBLIC_API_V2",

            environment:
              process.env.RENDER
                ? "RENDER"
                : "LOCAL_OR_OTHER",

            observedAt,

            marketType:
              "PERPETUAL",

            universe: {
              requestSuccess:
                instruments.success,

              httpStatus:
                instruments.status,

              futures:
                instrumentRows.length,

              perpetuals:
                perpetuals.length,

              activePerpetuals:
                activePerpetuals.length,
            },

            error:
              instruments.error ??
              "NO_ACTIVE_PERPETUAL_FOUND",

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }


      const instrumentName =
        selectedInstrument
          .instrument_name;


      /**
       * ------------------------------------------------------
       * 2. LIVE MARKET EVIDENCE
       * ------------------------------------------------------
       */

      const now =
        Date.now();

      const candleStart =
        now -
        24 *
          60 *
          60 *
          1000;


      const [
        ticker,
        orderBook,
        candles,
        fundingHistory,
      ] =
        await Promise.all([
          deribitPublicRequest(
            "ticker",
            {
              instrument_name:
                instrumentName,
            },
          ),

          deribitPublicRequest(
            "get_order_book",
            {
              instrument_name:
                instrumentName,

              depth:
                20,
            },
          ),

          deribitPublicRequest(
            "get_tradingview_chart_data",
            {
              instrument_name:
                instrumentName,

              start_timestamp:
                candleStart,

              end_timestamp:
                now,

              resolution:
                "15",
            },
          ),

          deribitPublicRequest(
            "get_funding_rate_history",
            {
              instrument_name:
                instrumentName,

              start_timestamp:
                candleStart,

              end_timestamp:
                now,
            },
          ),
        ]);


      const tickerResult =
        ticker.result ?? {};


      const orderBookResult =
        orderBook.result ?? {};


      const candleResult =
        candles.result ?? {};


      const tickerTimestamp =
        finiteNumber(
          tickerResult
            ?.timestamp,
        );


      const orderBookTimestamp =
        finiteNumber(
          orderBookResult
            ?.timestamp,
        );


      const tickerAge =
        ageSeconds(
          tickerTimestamp,
        );


      const orderBookAge =
        ageSeconds(
          orderBookTimestamp,
        );


      const bids =
        Array.isArray(
          orderBookResult
            ?.bids,
        )
          ? orderBookResult.bids
          : [];


      const asks =
        Array.isArray(
          orderBookResult
            ?.asks,
        )
          ? orderBookResult.asks
          : [];


      const ticks =
        Array.isArray(
          candleResult
            ?.ticks,
        )
          ? candleResult.ticks
          : [];


      const fundingRows =
        Array.isArray(
          fundingHistory.result,
        )
          ? fundingHistory.result
          : [];


      /**
       * ------------------------------------------------------
       * 3. RESULT
       * ------------------------------------------------------
       */

      const success =
        instruments.success &&
        ticker.success &&
        orderBook.success &&
        candles.success;


      return res
        .status(
          success
            ? 200
            : 502,
        )
        .json({
          success,

          environment:
            process.env.RENDER
              ? "RENDER"
              : "LOCAL_OR_OTHER",

          source:
            "DERIBIT_PUBLIC_API_V2",

          marketType:
            "PERPETUAL",

          observedAt,


          universe: {
            success:
              instruments.success,

            httpStatus:
              instruments.status,

            futures:
              instrumentRows.length,

            perpetuals:
              perpetuals.length,

            activePerpetuals:
              activePerpetuals.length,

            selectedInstrument:
              instrumentName,

            selectedActive:
              selectedInstrument
                ?.is_active ??
              null,

            settlementPeriod:
              selectedInstrument
                ?.settlement_period ??
              null,

            baseCurrency:
              selectedInstrument
                ?.base_currency ??
              null,

            quoteCurrency:
              selectedInstrument
                ?.quote_currency ??
              null,

            settlementCurrency:
              selectedInstrument
                ?.settlement_currency ??
              null,
          },


          ticker: {
            success:
              ticker.success,

            httpStatus:
              ticker.status,

            timestamp:
              isoFromMs(
                tickerTimestamp,
              ),

            ageSeconds:
              tickerAge,

            state:
              tickerResult
                ?.state ??
              null,

            lastPrice:
              finiteNumber(
                tickerResult
                  ?.last_price,
              ),

            markPrice:
              finiteNumber(
                tickerResult
                  ?.mark_price,
              ),

            indexPrice:
              finiteNumber(
                tickerResult
                  ?.index_price,
              ),

            bestBid:
              finiteNumber(
                tickerResult
                  ?.best_bid_price,
              ),

            bestAsk:
              finiteNumber(
                tickerResult
                  ?.best_ask_price,
              ),

            openInterest:
              finiteNumber(
                tickerResult
                  ?.open_interest,
              ),

            currentFunding:
              finiteNumber(
                tickerResult
                  ?.current_funding,
              ),

            funding8h:
              finiteNumber(
                tickerResult
                  ?.funding_8h,
              ),
          },


          orderBook: {
            success:
              orderBook.success,

            httpStatus:
              orderBook.status,

            timestamp:
              isoFromMs(
                orderBookTimestamp,
              ),

            ageSeconds:
              orderBookAge,

            bidLevels:
              bids.length,

            askLevels:
              asks.length,

            bestBid:
              Array.isArray(
                bids[0],
              )
                ? finiteNumber(
                    bids[0][0],
                  )
                : null,

            bestAsk:
              Array.isArray(
                asks[0],
              )
                ? finiteNumber(
                    asks[0][0],
                  )
                : null,
          },


          candles: {
            success:
              candles.success,

            httpStatus:
              candles.status,

            status:
              candleResult
                ?.status ??
              null,

            count:
              ticks.length,

            firstTimestamp:
              ticks.length > 0
                ? isoFromMs(
                    ticks[0],
                  )
                : null,

            lastTimestamp:
              ticks.length > 0
                ? isoFromMs(
                    ticks[
                      ticks.length - 1
                    ],
                  )
                : null,

            lastClose:
              Array.isArray(
                candleResult
                  ?.close,
              ) &&
              candleResult
                .close.length > 0
                ? finiteNumber(
                    candleResult
                      .close[
                        candleResult
                          .close
                          .length -
                        1
                      ],
                  )
                : null,
          },


          fundingHistory: {
            success:
              fundingHistory.success,

            httpStatus:
              fundingHistory.status,

            count:
              fundingRows.length,

            latest:
              fundingRows.length > 0
                ? fundingRows[
                    fundingRows.length -
                    1
                  ]
                : null,
          },


          dataFreshness: {
            tickerFresh:
              tickerAge !== null
                ? tickerAge < 300
                : false,

            orderBookFresh:
              orderBookAge !== null
                ? orderBookAge < 300
                : false,
          },


          errors: {
            instruments:
              instruments.error,

            ticker:
              ticker.error,

            orderBook:
              orderBook.error,

            candles:
              candles.error,

            fundingHistory:
              fundingHistory.error,
          },


          executionAuthority:
            false,

          liveExecution:
            false,
        });
    } catch (error) {
      console.error(
        "[DERIBIT_DIAGNOSTIC_ERROR]",
        error,
      );

      return res
        .status(500)
        .json({
          success:
            false,

          environment:
            process.env.RENDER
              ? "RENDER"
              : "LOCAL_OR_OTHER",

          source:
            "DERIBIT_PUBLIC_API_V2",

          error:
            error instanceof Error
              ? error.message
              : "DERIBIT_DIAGNOSTIC_FAILED",

          observedAt:
            new Date()
              .toISOString(),

          executionAuthority:
            false,

          liveExecution:
            false,
        });
    }
  },
);


export default router;