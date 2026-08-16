import WebSocket from "ws";

import {
  ingestLiveBar,
  ingestLiveQuote,
} from "../marketDataHub.js";

/**
 * ============================================================
 * ALPACA LIVE MARKET STREAM
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Connect to Alpaca's real-time stock market data WebSocket.
 *
 * This service:
 *
 * - authenticates with Alpaca
 * - subscribes to stock bars
 * - subscribes to quotes
 * - normalizes live data
 * - pushes live data into Market Data Hub
 * - reconnects after unexpected disconnects
 * - exposes connection state
 *
 * IMPORTANT
 * ---------
 *
 * MARKET DATA ONLY.
 *
 * This module does NOT place orders.
 */

/**
 * ============================================================
 * STREAM CONFIG
 * ============================================================
 */

export const ALPACA_STREAM_FEED =
  Object.freeze({
    IEX: "iex",
    SIP: "sip",
  });

export const ALPACA_STREAM_STATUS =
  Object.freeze({
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    AUTHENTICATING: "AUTHENTICATING",
    AUTHENTICATED: "AUTHENTICATED",
    SUBSCRIBING: "SUBSCRIBING",
    STREAMING: "STREAMING",
    RECONNECTING: "RECONNECTING",
    CLOSED: "CLOSED",
    ERROR: "ERROR",
  });

const DEFAULT_CONFIG =
  Object.freeze({
    feed:
      ALPACA_STREAM_FEED.IEX,

    reconnect: true,

    reconnectDelayMs: 3000,

    maximumReconnectDelayMs:
      30_000,

    heartbeatTimeoutMs:
      60_000,

    heartbeatOnlyDuringRegularSession:
      true,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  symbol,
) {
  return String(
    symbol ?? "",
  )
    .trim()
    .toUpperCase();
}

function normalizeSymbols(
  symbols,
) {
  if (
    !Array.isArray(symbols)
  ) {
    return [];
  }

  return [
    ...new Set(
      symbols
        .map(
          normalizeSymbol,
        )
        .filter(Boolean),
    ),
  ];
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

function now() {
  return new Date()
    .toISOString();
}

function getNewYorkClockParts(
  date = new Date(),
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",

        weekday:
          "short",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hourCycle:
          "h23",
      },
    ).formatToParts(
      date,
    );

  const values =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  return {
    weekday:
      values.weekday ?? "",

    hour:
      Number(
        values.hour ?? 0,
      ),

    minute:
      Number(
        values.minute ?? 0,
      ),
  };
}

function isLikelyUsEquitiesRegularSession(
  date = new Date(),
) {
  const {
    weekday,
    hour,
    minute,
  } =
    getNewYorkClockParts(
      date,
    );

  if (
    weekday === "Sat" ||
    weekday === "Sun"
  ) {
    return false;
  }

  const minutesSinceMidnight =
    hour * 60 +
    minute;

  const regularOpen =
    9 * 60 + 30;

  const regularClose =
    16 * 60;

  return (
    minutesSinceMidnight >=
      regularOpen &&
    minutesSinceMidnight <
      regularClose
  );
}

/**
 * ============================================================
 * LIVE STREAM CLASS
 * ============================================================
 */

export class AlpacaLiveMarketStream {
  constructor({
    symbols = [],

    feed =
      DEFAULT_CONFIG.feed,

    reconnect =
      DEFAULT_CONFIG.reconnect,

    reconnectDelayMs =
      DEFAULT_CONFIG
        .reconnectDelayMs,

    maximumReconnectDelayMs =
      DEFAULT_CONFIG
        .maximumReconnectDelayMs,

    heartbeatTimeoutMs =
      DEFAULT_CONFIG
        .heartbeatTimeoutMs,

    heartbeatOnlyDuringRegularSession =
      DEFAULT_CONFIG
        .heartbeatOnlyDuringRegularSession,

    onStatus = null,

    onBar = null,

    onQuote = null,

    onError = null,
  } = {}) {
    this.symbols =
      normalizeSymbols(
        symbols,
      );

    this.feed =
      feed;

    this.reconnect =
      reconnect;

    this.reconnectDelayMs =
      reconnectDelayMs;

    this.maximumReconnectDelayMs =
      maximumReconnectDelayMs;

    this.heartbeatTimeoutMs =
      heartbeatTimeoutMs;

    this.heartbeatOnlyDuringRegularSession =
      Boolean(
        heartbeatOnlyDuringRegularSession,
      );

    this.onStatus =
      onStatus;

    this.onBar =
      onBar;

    this.onQuote =
      onQuote;

    this.onError =
      onError;

    this.socket =
      null;

    this.status =
      ALPACA_STREAM_STATUS.IDLE;

    this.manualClose =
      false;

    this.reconnectAttempts =
      0;

    this.lastMessageAt =
      null;

    this.heartbeatTimer =
      null;

    this.authenticated =
      false;

    this.subscribed =
      false;
  }

  /**
   * ========================================================
   * URL
   * ========================================================
   */

  getStreamUrl() {
    return (
      `wss://stream.data.alpaca.markets/v2/${this.feed}`
    );
  }

  /**
   * ========================================================
   * CREDENTIALS
   * ========================================================
   */

  getCredentials() {
    const key =
      process.env
        .ALPACA_API_KEY;

    const secret =
      process.env
        .ALPACA_SECRET_KEY;

    if (
      !key ||
      !secret
    ) {
      throw new Error(
        "ALPACA_API_KEY and ALPACA_SECRET_KEY are required.",
      );
    }

    return {
      key,
      secret,
    };
  }

  /**
   * ========================================================
   * STATUS
   * ========================================================
   */

  async setStatus(
    status,
    details = {},
  ) {
    this.status =
      status;

    if (
      typeof this.onStatus ===
      "function"
    ) {
      try {
        await this.onStatus({
          status,
          symbols:
            this.symbols,
          feed:
            this.feed,
          timestamp:
            now(),
          ...details,
        });
      } catch {
        // Status callback must not break stream.
      }
    }
  }

  /**
   * ========================================================
   * ERROR CALLBACK
   * ========================================================
   */

  async emitError(
    error,
    context = {},
  ) {
    const message =
      safeErrorMessage(
        error,
      );

    if (
      typeof this.onError ===
      "function"
    ) {
      try {
        await this.onError({
          message,
          context,
          timestamp:
            now(),
        });
      } catch {
        // Error callback must not break stream.
      }
    }

    return message;
  }

  /**
   * ========================================================
   * CONNECT
   * ========================================================
   */

  async connect() {
    if (
      this.socket &&
      (
        this.socket.readyState ===
          WebSocket.OPEN ||
        this.socket.readyState ===
          WebSocket.CONNECTING
      )
    ) {
      return {
        approved: true,
        status:
          this.status,
        message:
          "Stream is already connected or connecting.",
      };
    }

    if (
      this.symbols.length ===
      0
    ) {
      return {
        approved: false,
        status:
          ALPACA_STREAM_STATUS.ERROR,
        errors: [
          "At least one symbol is required.",
        ],
      };
    }

    try {
      this.getCredentials();

      this.manualClose =
        false;

      this.authenticated =
        false;

      this.subscribed =
        false;

      await this.setStatus(
        ALPACA_STREAM_STATUS.CONNECTING,
      );

      this.socket =
        new WebSocket(
          this.getStreamUrl(),
        );

      this.socket.on(
        "open",
        async () => {
          await this.handleOpen();
        },
      );

      this.socket.on(
        "message",
        async (data) => {
          await this.handleMessage(
            data,
          );
        },
      );

      this.socket.on(
        "error",
        async (error) => {
          await this.handleSocketError(
            error,
          );
        },
      );

      this.socket.on(
        "close",
        async (
          code,
          reason,
        ) => {
          await this.handleClose(
            code,
            reason,
          );
        },
      );

      return {
        approved: true,
        status:
          ALPACA_STREAM_STATUS.CONNECTING,
        symbols:
          this.symbols,
        feed:
          this.feed,
        url:
          this.getStreamUrl(),
      };
    } catch (error) {
      await this.setStatus(
        ALPACA_STREAM_STATUS.ERROR,
      );

      return {
        approved: false,
        status:
          ALPACA_STREAM_STATUS.ERROR,
        errors: [
          safeErrorMessage(
            error,
          ),
        ],
      };
    }
  }

  /**
   * ========================================================
   * OPEN → AUTHENTICATE
   * ========================================================
   */

  async handleOpen() {
    try {
      const {
        key,
        secret,
      } =
        this.getCredentials();

      await this.setStatus(
        ALPACA_STREAM_STATUS
          .AUTHENTICATING,
      );

      this.send({
        action:
          "auth",

        key,

        secret,
      });

      this.startHeartbeatMonitor();
    } catch (error) {
      await this.emitError(
        error,
        {
          phase:
            "AUTHENTICATION",
        },
      );

      await this.setStatus(
        ALPACA_STREAM_STATUS.ERROR,
      );

      this.close();
    }
  }

  /**
   * ========================================================
   * SEND
   * ========================================================
   */

  send(payload) {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      throw new Error(
        "WebSocket is not open.",
      );
    }

    this.socket.send(
      JSON.stringify(
        payload,
      ),
    );
  }

  /**
   * ========================================================
   * SUBSCRIBE
   * ========================================================
   */

  async subscribe() {
    if (
      !this.authenticated
    ) {
      throw new Error(
        "Cannot subscribe before authentication.",
      );
    }

    await this.setStatus(
      ALPACA_STREAM_STATUS
        .SUBSCRIBING,
    );

    this.send({
      action:
        "subscribe",

      bars:
        this.symbols,

      quotes:
        this.symbols,
    });
  }

  /**
   * ========================================================
   * MESSAGE HANDLER
   * ========================================================
   */

  async handleMessage(
    rawData,
  ) {
    this.lastMessageAt =
      Date.now();

    let messages;

    try {
      messages =
        JSON.parse(
          rawData.toString(),
        );
    } catch (error) {
      await this.emitError(
        error,
        {
          phase:
            "MESSAGE_PARSE",
        },
      );

      return;
    }

    if (
      !Array.isArray(
        messages,
      )
    ) {
      messages = [
        messages,
      ];
    }

    for (
      const message
      of messages
    ) {
      await this.processMessage(
        message,
      );
    }
  }

  /**
   * ========================================================
   * PROCESS ONE MESSAGE
   * ========================================================
   */

  async processMessage(
    message,
  ) {
    const type =
      message?.T;

    /**
     * ======================================================
     * SUCCESS / CONTROL
     * ======================================================
     */

    if (
      type === "success"
    ) {
      if (
        message.msg ===
        "authenticated"
      ) {
        this.authenticated =
          true;

        await this.setStatus(
          ALPACA_STREAM_STATUS
            .AUTHENTICATED,
        );

        await this.subscribe();

        return;
      }

      if (
        message.msg ===
        "connected"
      ) {
        return;
      }
    }

    /**
     * ======================================================
     * SUBSCRIPTION CONFIRMATION
     * ======================================================
     */

    if (
      type ===
      "subscription"
    ) {
      this.subscribed =
        true;

      this.reconnectAttempts =
        0;

      await this.setStatus(
        ALPACA_STREAM_STATUS
          .STREAMING,
        {
          subscriptions:
            message,
        },
      );

      return;
    }

    /**
     * ======================================================
     * ALPACA ERROR
     * ======================================================
     */

    if (
      type === "error"
    ) {
      await this.emitError(
        new Error(
          message.msg ??
          "Alpaca stream error.",
        ),
        {
          code:
            message.code ??
            null,

          message,
        },
      );

      return;
    }

    /**
     * ======================================================
     * BAR
     * ======================================================
     */

    if (
      type === "b"
    ) {
      const result =
        await ingestLiveBar({
          symbol:
            message.S,

          timestamp:
            message.t,

          open:
            message.o,

          high:
            message.h,

          low:
            message.l,

          close:
            message.c,

          volume:
            message.v,

          tradeCount:
            message.n,

          vwap:
            message.vw,

          source:
            "ALPACA_LIVE",
        });

      if (
        result.approved ===
        true &&
        typeof this.onBar ===
          "function"
      ) {
        try {
          await this.onBar(
            result.bar,
          );
        } catch {
          // Consumer errors do not break stream.
        }
      }

      return;
    }

    /**
     * ======================================================
     * QUOTE
     * ======================================================
     */

    if (
      type === "q"
    ) {
      const result =
        await ingestLiveQuote({
          symbol:
            message.S,

          timestamp:
            message.t,

          bid:
            message.bp,

          ask:
            message.ap,

          bidSize:
            message.bs,

          askSize:
            message.as,

          source:
            "ALPACA_LIVE",
        });

      if (
        result.approved ===
        true &&
        typeof this.onQuote ===
          "function"
      ) {
        try {
          await this.onQuote(
            result.quote,
          );
        } catch {
          // Consumer errors do not break stream.
        }
      }
    }
  }

  /**
   * ========================================================
   * SOCKET ERROR
   * ========================================================
   */

  async handleSocketError(
    error,
  ) {
    await this.emitError(
      error,
      {
        phase:
          "SOCKET",
      },
    );

    await this.setStatus(
      ALPACA_STREAM_STATUS.ERROR,
    );
  }

  /**
   * ========================================================
   * CLOSE
   * ========================================================
   */

  async handleClose(
    code,
    reason,
  ) {
    this.stopHeartbeatMonitor();

    this.authenticated =
      false;

    this.subscribed =
      false;

    this.socket =
      null;

    const reasonText =
      reason
        ? reason.toString()
        : "";

    if (
      this.manualClose
    ) {
      await this.setStatus(
        ALPACA_STREAM_STATUS.CLOSED,
        {
          code,
          reason:
            reasonText,
        },
      );

      return;
    }

    if (
      this.reconnect
    ) {
      await this.scheduleReconnect({
        code,
        reason:
          reasonText,
      });

      return;
    }

    await this.setStatus(
      ALPACA_STREAM_STATUS.CLOSED,
      {
        code,
        reason:
          reasonText,
      },
    );
  }

  /**
   * ========================================================
   * RECONNECT
   * ========================================================
   */

  async scheduleReconnect(
    details = {},
  ) {
    this.reconnectAttempts +=
      1;

    const delay =
      Math.min(
        this.reconnectDelayMs *
          2 **
            Math.min(
              this.reconnectAttempts -
                1,
              5,
            ),

        this.maximumReconnectDelayMs,
      );

    await this.setStatus(
      ALPACA_STREAM_STATUS
        .RECONNECTING,
      {
        reconnectAttempts:
          this.reconnectAttempts,

        reconnectDelayMs:
          delay,

        ...details,
      },
    );

    setTimeout(
      () => {
        if (
          !this.manualClose
        ) {
          this.connect();
        }
      },
      delay,
    );
  }

  /**
   * ========================================================
   * HEARTBEAT MONITOR
   * ========================================================
   */

  startHeartbeatMonitor() {
    this.stopHeartbeatMonitor();

    this.lastMessageAt =
      Date.now();

    this.heartbeatTimer =
      setInterval(
        () => {
          if (
            !this.lastMessageAt
          ) {
            return;
          }

          /**
           * Outside the regular U.S. equity session, an
           * authenticated stock stream may legitimately be
           * quiet. Do not force reconnects just because no
           * AAPL data arrived.
           */

          if (
            this
              .heartbeatOnlyDuringRegularSession &&
            !isLikelyUsEquitiesRegularSession()
          ) {
            return;
          }

          /**
           * Only enforce staleness after authentication and
           * subscription are complete.
           */

          if (
            !this.authenticated ||
            !this.subscribed ||
            this.status !==
              ALPACA_STREAM_STATUS
                .STREAMING
          ) {
            return;
          }

          const age =
            Date.now() -
            this.lastMessageAt;

          if (
            age <=
            this
              .heartbeatTimeoutMs
          ) {
            return;
          }

          this.emitError(
            new Error(
              "Alpaca stream appears stale during the regular equity session.",
            ),
            {
              ageMs:
                age,

              heartbeatTimeoutMs:
                this
                  .heartbeatTimeoutMs,

              regularSession:
                true,
            },
          );

          if (
            this.socket &&
            this.socket
              .readyState ===
              WebSocket.OPEN
          ) {
            this.socket.close();
          }
        },
        10_000,
      );
  }

  stopHeartbeatMonitor() {
    if (
      this.heartbeatTimer
    ) {
      clearInterval(
        this.heartbeatTimer,
      );

      this.heartbeatTimer =
        null;
    }
  }

  /**
   * ========================================================
   * ADD SYMBOL
   * ========================================================
   */

  async addSymbol(
    symbol,
  ) {
    const normalized =
      normalizeSymbol(
        symbol,
      );

    if (!normalized) {
      return false;
    }

    if (
      this.symbols.includes(
        normalized,
      )
    ) {
      return true;
    }

    this.symbols.push(
      normalized,
    );

    if (
      this.authenticated &&
      this.socket
        ?.readyState ===
        WebSocket.OPEN
    ) {
      this.send({
        action:
          "subscribe",

        bars: [
          normalized,
        ],

        quotes: [
          normalized,
        ],
      });
    }

    return true;
  }

  /**
   * ========================================================
   * REMOVE SYMBOL
   * ========================================================
   */

  async removeSymbol(
    symbol,
  ) {
    const normalized =
      normalizeSymbol(
        symbol,
      );

    this.symbols =
      this.symbols.filter(
        (item) =>
          item !==
          normalized,
      );

    if (
      this.authenticated &&
      this.socket
        ?.readyState ===
        WebSocket.OPEN
    ) {
      this.send({
        action:
          "unsubscribe",

        bars: [
          normalized,
        ],

        quotes: [
          normalized,
        ],
      });
    }

    return true;
  }

  /**
   * ========================================================
   * MANUAL CLOSE
   * ========================================================
   */

  close() {
    this.manualClose =
      true;

    this.stopHeartbeatMonitor();

    if (
      this.socket
    ) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors.
      }
    }

    this.socket =
      null;
  }

  /**
   * ========================================================
   * STATUS SNAPSHOT
   * ========================================================
   */

  getStatus() {
    return {
      provider:
        "ALPACA",

      status:
        this.status,

      feed:
        this.feed,

      symbols: [
        ...this.symbols,
      ],

      authenticated:
        this.authenticated,

      subscribed:
        this.subscribed,

      reconnectAttempts:
        this.reconnectAttempts,

      lastMessageAt:
        this.lastMessageAt
          ? new Date(
              this.lastMessageAt,
            ).toISOString()
          : null,

      heartbeatTimeoutMs:
        this.heartbeatTimeoutMs,

      heartbeatOnlyDuringRegularSession:
        this
          .heartbeatOnlyDuringRegularSession,

      likelyRegularSessionOpen:
        isLikelyUsEquitiesRegularSession(),

      timestamp:
        now(),
    };
  }
}

export default AlpacaLiveMarketStream;