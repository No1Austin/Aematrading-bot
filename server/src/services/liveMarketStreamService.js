// server/src/services/liveMarketStreamService.js

import AlpacaLiveMarketStream, {
  ALPACA_STREAM_FEED,
  ALPACA_STREAM_STATUS,
} from "../data/providers/alpacaLiveMarketStream.js";

import {
  getLatestQuote,
  isQuoteFresh,
} from "../data/marketDataHub.js";

const DEFAULT_QUOTE_WAIT_MS =
  8_000;

const DEFAULT_POLL_MS =
  100;

let stream =
  null;

let connectingPromise =
  null;

function normalizeSymbol(
  value,
) {
  const symbol =
    String(
      value ??
      "",
    )
      .trim()
      .toUpperCase();

  return symbol ||
    null;
}

function sleep(
  ms,
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms,
      ),
  );
}

/**
 * ============================================================
 * CREATE STREAM ONCE
 * ============================================================
 */

function getOrCreateStream(
  initialSymbol,
) {
  if (stream) {
    return stream;
  }

  stream =
    new AlpacaLiveMarketStream({
      symbols: [
        initialSymbol,
      ],

      feed:
        ALPACA_STREAM_FEED.IEX,

      reconnect:
        true,

      onStatus({
        status,
        symbols,
      }) {
        console.log(
          "[LIVE MARKET STREAM]",
          status,
          symbols ?? [],
        );
      },

      onQuote(
        quote,
      ) {
        console.log(
          `[LIVE QUOTE] ${quote.symbol} bid=${quote.bid} ask=${quote.ask}`,
        );
      },

      onBar(
        bar,
      ) {
        console.log(
          `[LIVE BAR] ${bar.symbol} close=${bar.close}`,
        );
      },

      onError(
        error,
      ) {
        console.error(
          "[LIVE MARKET STREAM ERROR]",
          error,
        );
      },
    });

  return stream;
}

/**
 * ============================================================
 * ENSURE STREAM CONNECTED
 * ============================================================
 */

async function ensureConnected(
  symbol,
) {
  const liveStream =
    getOrCreateStream(
      symbol,
    );

  /**
   * Existing connection.
   */
  if (
    liveStream.authenticated ===
      true &&
    liveStream.socket
  ) {
    await liveStream
      .addSymbol(
        symbol,
      );

    return liveStream;
  }

  /**
   * Avoid opening two connections if two HTTP requests arrive
   * at nearly the same time.
   */
  if (
    connectingPromise
  ) {
    await connectingPromise;

    await liveStream
      .addSymbol(
        symbol,
      );

    return liveStream;
  }

  connectingPromise =
    (async () => {
      await liveStream
        .addSymbol(
          symbol,
        );

      const result =
        await liveStream
          .connect();

      if (
        result?.approved !==
        true
      ) {
        throw new Error(
          result?.errors?.[0] ??
          "Unable to connect to Alpaca live market stream.",
        );
      }

      return liveStream;
    })();

  try {
    await connectingPromise;
  } finally {
    connectingPromise =
      null;
  }

  return liveStream;
}

/**
 * ============================================================
 * WAIT FOR FRESH QUOTE
 * ============================================================
 */

async function waitForFreshQuote({
  symbol,

  timeoutMs =
    DEFAULT_QUOTE_WAIT_MS,

  pollMs =
    DEFAULT_POLL_MS,
}) {
  const started =
    Date.now();

  while (
    Date.now() -
      started <
    timeoutMs
  ) {
    const quote =
      getLatestQuote(
        symbol,
      );

    const fresh =
      isQuoteFresh(
        symbol,
      );

    if (
      quote &&
      fresh ===
        true &&
      Number.isFinite(
        Number(
          quote.bid,
        ),
      ) &&
      Number.isFinite(
        Number(
          quote.ask,
        ),
      ) &&
      Number(
        quote.bid,
      ) > 0 &&
      Number(
        quote.ask,
      ) > 0 &&
      Number(
        quote.ask,
      ) >=
        Number(
          quote.bid,
        )
    ) {
      return {
        approved:
          true,

        status:
          "QUOTE_READY",

        symbol,

        quote,

        quoteFresh:
          true,

        waitedMs:
          Date.now() -
          started,
      };
    }

    await sleep(
      pollMs,
    );
  }

  return {
    approved:
      false,

    status:
      "QUOTE_TIMEOUT",

    symbol,

    quote:
      getLatestQuote(
        symbol,
      ),

    quoteFresh:
      isQuoteFresh(
        symbol,
      ),

    waitedMs:
      Date.now() -
      started,

    warnings: [
      "A fresh live Alpaca quote was not received before timeout.",
    ],
  };
}

/**
 * ============================================================
 * PUBLIC API
 * ============================================================
 */

export async function ensureLiveMarketData({
  symbol,

  quoteWaitMs =
    DEFAULT_QUOTE_WAIT_MS,
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (!normalizedSymbol) {
    return {
      approved:
        false,

      status:
        "INVALID_REQUEST",

      symbol:
        null,

      errors: [
        "A valid symbol is required.",
      ],
    };
  }

  try {
    const liveStream =
      await ensureConnected(
        normalizedSymbol,
      );

    await liveStream
      .addSymbol(
        normalizedSymbol,
      );

    const quoteResult =
      await waitForFreshQuote({
        symbol:
          normalizedSymbol,

        timeoutMs:
          quoteWaitMs,
      });

    return {
      approved:
        quoteResult
          .approved ===
        true,

      status:
        quoteResult
          .status,

      symbol:
        normalizedSymbol,

      streamStatus:
        liveStream
          .status,

      authenticated:
        liveStream
          .authenticated ===
        true,

      subscribed:
        liveStream
          .subscribed ===
        true,

      quote:
        quoteResult
          .quote ??
        null,

      quoteFresh:
        quoteResult
          .quoteFresh ===
        true,

      waitedMs:
        quoteResult
          .waitedMs,

      warnings:
        quoteResult
          .warnings ??
        [],

      errors: [],
    };
  } catch (
    error
  ) {
    return {
      approved:
        false,

      status:
        "ERROR",

      symbol:
        normalizedSymbol,

      quote:
        null,

      quoteFresh:
        false,

      warnings: [],

      errors: [
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      ],
    };
  }
}

export function getLiveMarketStreamState() {
  if (!stream) {
    return {
      status:
        ALPACA_STREAM_STATUS.IDLE,

      connected:
        false,

      authenticated:
        false,

      subscribed:
        false,

      symbols: [],
    };
  }

  return {
    status:
      stream.status,

    connected:
      Boolean(
        stream.socket,
      ),

    authenticated:
      stream.authenticated ===
      true,

    subscribed:
      stream.subscribed ===
      true,

    symbols: [
      ...stream.symbols,
    ],
  };
}

export default
  ensureLiveMarketData;