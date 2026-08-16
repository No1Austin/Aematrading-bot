import "dotenv/config";

import AlpacaLiveMarketStream from "./alpacaLiveMarketStream.js";

console.log(
  "\n====================================",
);
console.log(
  "ALPACA LIVE MARKET STREAM TEST",
);
console.log(
  "====================================\n",
);

/**
 * ------------------------------------------------------------
 * SAFETY CHECK
 * ------------------------------------------------------------
 *
 * This test only connects to Alpaca MARKET DATA.
 * It does NOT submit orders.
 */

if (!process.env.ALPACA_API_KEY) {
  console.error(
    "FAILED: ALPACA_API_KEY is missing.",
  );

  process.exit(1);
}

if (!process.env.ALPACA_SECRET_KEY) {
  console.error(
    "FAILED: ALPACA_SECRET_KEY is missing.",
  );

  process.exit(1);
}

/**
 * ------------------------------------------------------------
 * CREATE STREAM
 * ------------------------------------------------------------
 */

const stream =
  new AlpacaLiveMarketStream({
    symbols: ["AAPL"],

    feed: "iex",

    /**
     * Connection-status updates.
     */
    onStatus({
      status,
      symbols,
      feed,
    }) {
      console.log(
        `[STATUS] ${status}`,
      );

      if (symbols) {
        console.log(
          "Symbols:",
          symbols,
        );
      }

      if (feed) {
        console.log(
          "Feed:",
          feed,
        );
      }
    },

    /**
     * Real completed market bars.
     */
    onBar(bar) {
      console.log(
        "\n========== REAL BAR ==========",
      );

      console.log({
        symbol:
          bar.symbol,

        timestamp:
          bar.timestamp,

        open:
          bar.open,

        high:
          bar.high,

        low:
          bar.low,

        close:
          bar.close,

        volume:
          bar.volume,

        source:
          bar.source,
      });
    },

    /**
     * Real market quotes.
     */
    onQuote(quote) {
      console.log(
        "\n========== REAL QUOTE ==========",
      );

      console.log({
        symbol:
          quote.symbol,

        timestamp:
          quote.timestamp,

        bid:
          quote.bid,

        ask:
          quote.ask,

        midpoint:
          quote.midpoint,

        spread:
          quote.spread,

        source:
          quote.source,
      });
    },

    /**
     * Stream errors.
     */
    onError(error) {
      console.error(
        "\n========== STREAM ERROR ==========",
      );

      console.error(
        error,
      );
    },
  });

/**
 * ------------------------------------------------------------
 * RUN TEST
 * ------------------------------------------------------------
 */

async function run() {
  try {
    console.log(
      "Connecting to Alpaca real-time market data...\n",
    );

    const result =
      await stream.connect();

    console.log(
      "\nCONNECT RESULT:",
    );

    console.log(result);

    if (
      result.approved !== true
    ) {
      console.error(
        "\nFAILED TO START STREAM",
      );

      console.error(
        result.errors ?? [],
      );

      process.exitCode = 1;

      return;
    }

    console.log(
      "\nConnection initiated successfully.",
    );

    console.log(
      "Waiting up to 60 seconds for market data...\n",
    );

    /**
     * Keep Node alive long enough to receive
     * authentication/subscription responses.
     */
    setTimeout(
      () => {
        console.log(
          "\n====================================",
        );

        console.log(
          "FINAL STREAM STATUS",
        );

        console.log(
          "====================================",
        );

        console.log(
          stream.getStatus(),
        );

        console.log(
          "\nClosing test stream...",
        );

        stream.close();

        setTimeout(
          () => {
            process.exit(0);
          },
          500,
        );
      },
      60_000,
    );
  } catch (error) {
    console.error(
      "\nUNHANDLED LIVE STREAM TEST ERROR:",
    );

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    stream.close();

    process.exitCode = 1;
  }
}

/**
 * ------------------------------------------------------------
 * CLEAN SHUTDOWN
 * ------------------------------------------------------------
 */

process.on(
  "SIGINT",
  () => {
    console.log(
      "\nStopping Alpaca live stream...",
    );

    stream.close();

    process.exit(0);
  },
);

process.on(
  "SIGTERM",
  () => {
    stream.close();

    process.exit(0);
  },
);

run();