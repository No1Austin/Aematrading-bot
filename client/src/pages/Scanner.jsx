import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  Globe2,
  Landmark,
  Newspaper,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";

import Sidebar from
  "../components/Sidebar.jsx";

import TradingChart from
  "../components/scanner/TradingChart.jsx";

import {
  loadScannerWorkspace,
} from "../services/scannerApi.js";

import "./Scanner.css";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function numberOrNull(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function firstNumber(
  ...values
) {
  for (
    const value
    of values
  ) {
    const number =
      numberOrNull(value);

    if (
      number !== null
    ) {
      return number;
    }
  }

  return null;
}

function formatPrice(
  value,
) {
  const number =
    numberOrNull(value);

  if (
    number === null
  ) {
    return "—";
  }

  return `$${number.toFixed(
    2,
  )}`;
}

function formatPercent(
  value,
) {
  const number =
    numberOrNull(value);

  if (
    number === null
  ) {
    return "—";
  }

  return `${number >= 0 ? "+" : ""}${number.toFixed(
    2,
  )}%`;
}

function formatNumber(
  value,
  decimals = 1,
) {
  const number =
    numberOrNull(value);

  if (
    number === null
  ) {
    return "—";
  }

  return number.toFixed(
    decimals,
  );
}

function formatVolume(
  value,
) {
  const number =
    numberOrNull(value);

  if (
    number === null
  ) {
    return "—";
  }

  if (
    number >=
    1_000_000_000
  ) {
    return `${(
      number /
      1_000_000_000
    ).toFixed(2)}B`;
  }

  if (
    number >=
    1_000_000
  ) {
    return `${(
      number /
      1_000_000
    ).toFixed(2)}M`;
  }

  if (
    number >=
    1_000
  ) {
    return `${(
      number /
      1_000
    ).toFixed(1)}K`;
  }

  return String(
    Math.round(number),
  );
}

function getAnalysisRoot(
  workspace,
) {
  return (
    workspace
      ?.analysis
      ?.analysis ??
    workspace
      ?.analysis ??
    null
  );
}

function getResults(
  workspace,
) {
  const analysis =
    getAnalysisRoot(
      workspace,
    );

  return (
    analysis
      ?.results ??
    analysis
      ?.analysis
      ?.results ??
    {}
  );
}

function getFinalDecision(
  workspace,
) {
  const analysis =
    getAnalysisRoot(
      workspace,
    );

  return (
    analysis
      ?.finalDecision ??
    analysis
      ?.analysis
      ?.finalDecision ??
    workspace
      ?.analysis
      ?.finalDecision ??
    null
  );
}

function getCandles(
  workspace,
) {
  return Array.isArray(
    workspace
      ?.candles
      ?.candles,
  )
    ? workspace
        .candles
        .candles
    : [];
}

function getNews(
  workspace,
) {
  return Array.isArray(
    workspace
      ?.news
      ?.news,
  )
    ? workspace
        .news
        .news
    : [];
}

function deriveStockSnapshot(
  workspace,
) {
  const candlePayload =
    workspace
      ?.candles ??
    {};

  const candles =
    getCandles(
      workspace,
    );

  const latest =
    candles.length
      ? candles[
          candles.length -
          1
        ]
      : candlePayload
          ?.latestBar ??
        null;

  const previous =
    candles.length >
    1
      ? candles[
          candles.length -
          2
        ]
      : null;

  const currentPrice =
    firstNumber(
      candlePayload
        ?.latestQuote
        ?.ask,
      candlePayload
        ?.latestQuote
        ?.bid,
      latest
        ?.close,
    );

  const previousClose =
    firstNumber(
      previous
        ?.close,
    );

  const changePercent =
    (
      currentPrice !==
        null &&
      previousClose !==
        null &&
      previousClose !==
        0
    )
      ? (
          (
            currentPrice -
            previousClose
          ) /
          previousClose
        ) *
        100
      : null;

  return {
    currentPrice,

    changePercent,

    open:
      firstNumber(
        latest?.open,
      ),

    high:
      firstNumber(
        latest?.high,
      ),

    low:
      firstNumber(
        latest?.low,
      ),

    volume:
      firstNumber(
        latest?.volume,
      ),

    bid:
      firstNumber(
        candlePayload
          ?.latestQuote
          ?.bid,
      ),

    ask:
      firstNumber(
        candlePayload
          ?.latestQuote
          ?.ask,
      ),

    quoteFresh:
      candlePayload
        ?.quoteFresh ===
      true,

    historicalLoaded:
      candlePayload
        ?.historicalLoaded ===
      true,
  };
}

function clamp01(
  value,
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number === null
  ) {
    return null;
  }

  return Math.min(
    1,
    Math.max(
      0,
      number,
    ),
  );
}

/**
 * ============================================================
 * TECHNICAL DISPLAY NORMALIZATION
 * ============================================================
 *
 * IMPORTANT
 * ---------
 * The production technical engine intentionally returns rich
 * evidence (trend, bias, indicators and confirmations) rather
 * than a generic top-level `score`.
 *
 * The trading scorer already normalizes this structure into
 * directional support. The UI mirrors that SAME normalization
 * for display only. It does not alter the backend result and
 * cannot authorize a trade.
 */

function deriveTechnicalSupport(
  technical,
  side,
) {
  if (
    !technical ||
    technical
      ?.approved !==
      true
  ) {
    return null;
  }

  const existingSupport =
    side === "LONG"
      ? technical
          ?.directionalSupport
          ?.long
      : technical
          ?.directionalSupport
          ?.short;

  if (
    numberOrNull(
      existingSupport,
    ) !==
    null
  ) {
    return clamp01(
      existingSupport,
    );
  }

  const trend =
    String(
      technical
        ?.trend
        ?.direction ??
      "",
    )
      .trim()
      .toUpperCase();

  const bias =
    String(
      technical
        ?.bias
        ?.direction ??
      "",
    )
      .trim()
      .toUpperCase();

  let score = 0;
  let parts = 0;

  /**
   * Trend contribution.
   */
  if (trend) {
    parts += 1;

    if (
      side === "LONG"
    ) {
      if (
        trend ===
        "STRONG_BULLISH"
      ) {
        score += 1;
      } else if (
        trend ===
        "BULLISH"
      ) {
        score += 0.8;
      } else if (
        trend ===
        "SIDEWAYS"
      ) {
        score += 0.4;
      }
    }

    if (
      side === "SHORT"
    ) {
      if (
        trend ===
        "STRONG_BEARISH"
      ) {
        score += 1;
      } else if (
        trend ===
        "BEARISH"
      ) {
        score += 0.8;
      } else if (
        trend ===
        "SIDEWAYS"
      ) {
        score += 0.4;
      }
    }
  }

  /**
   * Bias contribution.
   */
  if (bias) {
    parts += 1;

    if (
      side === "LONG" &&
      bias === "LONG"
    ) {
      score += 1;
    } else if (
      side === "SHORT" &&
      bias === "SHORT"
    ) {
      score += 1;
    } else if (
      bias === "NEUTRAL"
    ) {
      score += 0.35;
    }
  }

  /**
   * Confirmation contribution.
   */
  const confirmation =
    technical
      ?.confirmation;

  if (
    confirmation &&
    typeof confirmation ===
      "object"
  ) {
    parts += 1;

    let confirmationScore =
      0;

    let confirmationParts =
      0;

    if (
      side === "LONG"
    ) {
      confirmationParts += 1;

      if (
        confirmation
          .bullishTrend ===
        true
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .bullishMomentum ===
        true
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .aboveVWAP ===
        true
      ) {
        confirmationScore +=
          1;
      }
    }

    if (
      side === "SHORT"
    ) {
      confirmationParts += 1;

      if (
        confirmation
          .bearishTrend ===
        true
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .bearishMomentum ===
        true
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .belowVWAP ===
        true
      ) {
        confirmationScore +=
          1;
      }
    }

    confirmationParts += 1;

    if (
      confirmation
        .volume ===
      true
    ) {
      confirmationScore +=
        1;
    }

    if (
      confirmationParts >
      0
    ) {
      score +=
        confirmationScore /
        confirmationParts;
    }
  }

  if (
    parts <=
    0
  ) {
    return null;
  }

  return clamp01(
    score /
    parts,
  );
}

function deriveTechnicalDisplay(
  technical,
) {
  if (
    !technical ||
    typeof technical !==
      "object"
  ) {
    return {
      score: null,
      longSupport: null,
      shortSupport: null,
      direction: "UNAVAILABLE",
      status: "UNAVAILABLE",
    };
  }

  const longSupport =
    deriveTechnicalSupport(
      technical,
      "LONG",
    );

  const shortSupport =
    deriveTechnicalSupport(
      technical,
      "SHORT",
    );

  const dominantSupport =
    Math.max(
      longSupport ??
        0,
      shortSupport ??
        0,
    );

  let direction =
    String(
      technical
        ?.bias
        ?.direction ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    ![
      "LONG",
      "SHORT",
      "NEUTRAL",
    ].includes(
      direction,
    )
  ) {
    const trend =
      String(
        technical
          ?.trend
          ?.direction ??
        "",
      )
        .trim()
        .toUpperCase();

    if (
      trend.includes(
        "BULLISH",
      )
    ) {
      direction =
        "LONG";
    } else if (
      trend.includes(
        "BEARISH",
      )
    ) {
      direction =
        "SHORT";
    } else {
      direction =
        "NEUTRAL";
    }
  }

  return {
    score:
      technical
        ?.approved ===
        true &&
      (
        longSupport !==
          null ||
        shortSupport !==
          null
      )
        ? dominantSupport *
          100
        : null,

    longSupport,

    shortSupport,

    direction,

    status:
      technical
        ?.approved ===
        true
        ? direction
        : (
            technical
              ?.status ??
            "UNAVAILABLE"
          ),
  };
}

function normalizeDisplayScore(
  value,
  {
    fractional =
      false,
  } = {},
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number ===
    null
  ) {
    return null;
  }

  if (
    fractional &&
    number >=
      0 &&
    number <=
      1
  ) {
    return number *
      100;
  }

  return number;
}

function deriveEngineScore(
  value,
  engineKey =
    null,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    engineKey ===
      "technical"
  ) {
    return deriveTechnicalDisplay(
      value,
    ).score;
  }

  if (
    typeof value ===
    "number"
  ) {
    return value;
  }

  if (
    typeof value !==
    "object"
  ) {
    return null;
  }

  /**
   * True score fields are used as-is because some engines
   * intentionally use their own score ranges.
   */
  const explicitScore =
    firstNumber(
      value.score,
      value.finalScore,
      value.overallScore,
      value.preferredScore,
      value.rawScore,
    );

  if (
    explicitScore !==
    null
  ) {
    return explicitScore;
  }

  /**
   * Confidence/quality/percentage values are commonly emitted
   * as 0..1. Normalize those to a readable 0..100 display.
   */
  const fractionalScore =
    firstNumber(
      value.confidence,
      value.qualityScore,
      value.rating,
      value.value,
      value.percent,
      value.percentage,
    );

  return normalizeDisplayScore(
    fractionalScore,
    {
      fractional:
        true,
    },
  );
}

function deriveEngineStatus(
  engine,
) {
  if (
    engine
      ?.key ===
    "technical"
  ) {
    return deriveTechnicalDisplay(
      engine.result,
    ).status;
  }

  return (
    engine
      ?.result
      ?.status ??
    engine
      ?.result
      ?.decision ??
    engine
      ?.result
      ?.signal ??
    engine
      ?.result
      ?.direction ??
    "AVAILABLE"
  );
}

function buildEngineCards(
  results,
) {
  return [
    {
      key:
        "technical",
      label:
        "Technical",
      icon:
        BarChart3,
      result:
        results
          ?.technical,
    },
    {
      key:
        "macro",
      label:
        "Macro",
      icon:
        Landmark,
      result:
        results
          ?.macro,
    },
    {
      key:
        "marketRegime",
      label:
        "Market Regime",
      icon:
        Gauge,
      result:
        results
          ?.marketRegime,
    },
    {
      key:
        "company",
      label:
        "Fundamental",
      icon:
        Building2,
      result:
        results
          ?.company,
    },
    {
      key:
        "institutional",
      label:
        "Institutional",
      icon:
        CircleDollarSign,
      result:
        results
          ?.institutional ??
        results
          ?.institutionalPosition ??
        null,
    },
    {
      key:
        "events",
      label:
        "Events",
      icon:
        CalendarDays,
      result:
        results
          ?.events,
    },
    {
      key:
        "social",
      label:
        "Social",
      icon:
        Users,
      result:
        results
          ?.social,
    },
    {
      key:
        "historical",
      label:
        "Historical",
      icon:
        Brain,
      result:
        results
          ?.historical,
    },
    {
      key:
        "liquidity",
      label:
        "Liquidity",
      icon:
        Waves,
      result:
        results
          ?.liquidity,
    },
    {
      key:
        "consensus",
      label:
        "Consensus",
      icon:
        Sparkles,
      result:
        results
          ?.consensus,
    },
  ];
}

/**
 * ============================================================
 * SCORE BLOCK
 * ============================================================
 */

function ScoreBlock({
  label,
  value,
  type,
}) {
  const normalized =
    numberOrNull(
      value,
    );

  return (
    <div
      className={`scanner-score-block ${type}`}
    >
      <span>
        {label}
      </span>

      <strong>
        {normalized ===
        null
          ? "—"
          : normalized.toFixed(
              1,
            )}
      </strong>
    </div>
  );
}

function formatCompactValue(
  value,
  decimals =
    2,
) {
  const number =
    numberOrNull(
      value,
    );

  return number ===
    null
    ? "—"
    : number.toFixed(
        decimals,
      );
}

function buildTechnicalSummary(
  technical,
) {
  if (
    !technical ||
    typeof technical !==
      "object"
  ) {
    return "Technical analysis is unavailable.";
  }

  const display =
    deriveTechnicalDisplay(
      technical,
    );

  const indicators =
    technical
      ?.indicators ??
    {};

  const ema =
    indicators
      ?.ema ??
    {};

  const sma =
    indicators
      ?.sma ??
    {};

  const rsi =
    indicators
      ?.rsi ??
    {};

  const macd =
    indicators
      ?.macd ??
    {};

  const atr =
    indicators
      ?.atr ??
    {};

  const volume =
    indicators
      ?.volume ??
    {};

  const rsiValue =
    firstNumber(
      rsi?.value,
      rsi?.rsi,
      typeof rsi ===
        "number"
        ? rsi
        : null,
    );

  const macdRaw =
    macd
      ?.raw ??
    {};

  const lines = [
    "TECHNICAL ENGINE",
    "────────────────────────────────────────",
    `Status: ${
      technical?.approved === true
        ? "APPROVED"
        : String(
            technical?.status ??
            "UNAVAILABLE",
          )
    }`,
    `Direction: ${display.direction}`,
    `Technical strength: ${
      display.score === null
        ? "—"
        : `${display.score.toFixed(1)} / 100`
    }`,
    `Long support: ${
      display.longSupport === null
        ? "—"
        : `${(
            display.longSupport *
            100
          ).toFixed(1)}%`
    }`,
    `Short support: ${
      display.shortSupport === null
        ? "—"
        : `${(
            display.shortSupport *
            100
          ).toFixed(1)}%`
    }`,
    "",
    "PRICE / TREND",
    "────────────────────────────────────────",
    `Price: ${formatPrice(technical?.price)}`,
    `Trend: ${
      technical?.trend?.direction ??
      "—"
    }`,
    `Bias: ${
      technical?.bias?.direction ??
      "—"
    }`,
    "",
    "MOVING AVERAGES",
    "────────────────────────────────────────",
    `EMA 9: ${formatPrice(ema?.ema9)}`,
    `EMA 20: ${formatPrice(ema?.ema20)}`,
    `EMA 50: ${formatPrice(ema?.ema50)}`,
    `SMA 200: ${formatPrice(sma?.sma200)}`,
    `VWAP: ${formatPrice(indicators?.vwap)}`,
    "",
    "MOMENTUM",
    "────────────────────────────────────────",
    `RSI 14: ${formatCompactValue(rsiValue, 2)}`,
    `RSI state: ${
      rsi?.direction ??
      rsi?.status ??
      rsi?.classification ??
      "—"
    }`,
    `MACD: ${formatCompactValue(macdRaw?.macd, 4)}`,
    `MACD signal: ${formatCompactValue(macdRaw?.signal, 4)}`,
    `MACD histogram: ${formatCompactValue(macdRaw?.histogram, 4)}`,
    `MACD direction: ${
      macd?.analysis?.direction ??
      "—"
    }`,
    "",
    "VOLATILITY / VOLUME",
    "────────────────────────────────────────",
    `ATR: ${formatCompactValue(atr?.value, 4)}`,
    `ATR %: ${
      numberOrNull(
        atr?.percent,
      ) === null
        ? "—"
        : `${(
            Number(
              atr.percent,
            ) *
            (
              Math.abs(
                Number(
                  atr.percent,
                ),
              ) <=
              1
                ? 100
                : 1
            )
          ).toFixed(2)}%`
    }`,
    `Volume confirmation: ${
      technical?.confirmation?.volume === true
        ? "YES"
        : technical?.confirmation?.volume === false
          ? "NO"
          : "UNKNOWN"
    }`,
    `Relative volume: ${formatCompactValue(
      volume?.relativeVolume ??
      volume?.ratio,
      2,
    )}`,
    "",
    "CONFIRMATIONS",
    "────────────────────────────────────────",
    `Bullish trend: ${
      technical?.confirmation?.bullishTrend === true
        ? "YES"
        : "NO"
    }`,
    `Bearish trend: ${
      technical?.confirmation?.bearishTrend === true
        ? "YES"
        : "NO"
    }`,
    `Bullish momentum: ${
      technical?.confirmation?.bullishMomentum === true
        ? "YES"
        : "NO"
    }`,
    `Bearish momentum: ${
      technical?.confirmation?.bearishMomentum === true
        ? "YES"
        : "NO"
    }`,
    `Above VWAP: ${
      technical?.confirmation?.aboveVWAP === true
        ? "YES"
        : technical?.confirmation?.aboveVWAP === false
          ? "NO"
          : "UNKNOWN"
    }`,
    `Below VWAP: ${
      technical?.confirmation?.belowVWAP === true
        ? "YES"
        : technical?.confirmation?.belowVWAP === false
          ? "NO"
          : "UNKNOWN"
    }`,
  ];

  if (
    Array.isArray(
      technical?.errors,
    ) &&
    technical.errors.length >
      0
  ) {
    lines.push(
      "",
      "ERRORS",
      "────────────────────────────────────────",
      ...technical.errors.map(
        item =>
          `• ${String(item)}`,
      ),
    );
  }

  return lines.join(
    "\n",
  );
}

/**
 * ============================================================
 * ENGINE CARD
 * ============================================================
 */

function EngineCard({
  engine,
  onClick,
}) {
  const Icon =
    engine.icon;

  const score =
    deriveEngineScore(
      engine.result,
      engine.key,
    );

  const status =
    deriveEngineStatus(
      engine,
    );

  const technical =
    engine.key ===
      "technical"
      ? engine.result
      : null;

  const rsi =
    technical
      ?.indicators
      ?.rsi;

  const rsiValue =
    firstNumber(
      rsi?.value,
      rsi?.rsi,
      typeof rsi ===
        "number"
        ? rsi
        : null,
    );

  const technicalMeta =
    engine.key ===
      "technical"
      ? [
          rsiValue !==
            null
            ? `RSI ${rsiValue.toFixed(0)}`
            : null,
          technical
            ?.indicators
            ?.macd
            ?.analysis
            ?.direction ??
            null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <button
      type="button"
      className="scanner-engine-card"
      onClick={() =>
        onClick(
          engine,
        )
      }
    >
      <div className="scanner-engine-card-top">
        <Icon size={16} />

        <ChevronRight
          size={14}
        />
      </div>

      <span>
        {engine.label}
      </span>

      <strong>
        {score ===
        null
          ? "—"
          : score.toFixed(
              1,
            )}
      </strong>

      <small>
        {String(
          status,
        ).replaceAll(
          "_",
          " ",
        )}

        {technicalMeta
          ? ` · ${technicalMeta}`
          : ""}
      </small>
    </button>
  );
}

/**
 * ============================================================
 * ENGINE MODAL
 * ============================================================
 */

function EngineModal({
  engine,
  onClose,
}) {
  if (!engine) {
    return null;
  }

  const content =
    engine.key ===
      "technical"
      ? buildTechnicalSummary(
          engine.result,
        )
      : JSON.stringify(
          engine.result ??
            {
              status:
                "Unavailable",
            },
          null,
          2,
        );

  return (
    <div
      className="scanner-modal-backdrop"
      onClick={
        onClose
      }
    >
      <div
        className="scanner-modal"
        onClick={
          event =>
            event
              .stopPropagation()
        }
      >
        <div className="scanner-modal-header">
          <div>
            <span>
              Engine Breakdown
            </span>

            <h2>
              {engine.label}
            </h2>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
          >
            ×
          </button>
        </div>

        <pre>
          {content}
        </pre>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * MANUAL SCANNER WORKSPACE PERSISTENCE
 * ============================================================
 *
 * IMPORTANT
 * ---------
 * This storage belongs ONLY to the manual /scanner page.
 * It is completely independent from the autonomous market
 * scanner used by Markets / continuousMarketScanner.
 *
 * Rules:
 * - opening this page NEVER starts a scan
 * - leaving this page NEVER clears the last successful result
 * - a failed new scan NEVER replaces the last successful result
 * - corrupted / incompatible storage fails closed and is removed
 * - storage quota/security failures never break the scanner UI
 */

const MANUAL_SCANNER_STORAGE_KEY =
  "aema.manual-scanner.workspace.v1";

const MANUAL_SCANNER_STORAGE_VERSION =
  1;

function normalizeStoredSymbol(
  value,
) {
  const normalized =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return normalized ||
    null;
}

function readRetainedScannerWorkspace() {
  if (
    typeof window ===
      "undefined" ||
    !window.localStorage
  ) {
    return null;
  }

  try {
    const raw =
      window.localStorage
        .getItem(
          MANUAL_SCANNER_STORAGE_KEY,
        );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      parsed.version !==
        MANUAL_SCANNER_STORAGE_VERSION ||
      !parsed.workspace ||
      typeof parsed.workspace !==
        "object"
    ) {
      window.localStorage
        .removeItem(
          MANUAL_SCANNER_STORAGE_KEY,
        );

      return null;
    }

    const symbol =
      normalizeStoredSymbol(
        parsed.symbol ??
        parsed.workspace
          ?.symbol,
      );

    if (!symbol) {
      window.localStorage
        .removeItem(
          MANUAL_SCANNER_STORAGE_KEY,
        );

      return null;
    }

    return {
      version:
        MANUAL_SCANNER_STORAGE_VERSION,

      symbol,

      query:
        normalizeStoredSymbol(
          parsed.query,
        ) ??
        symbol,

      workspace:
        parsed.workspace,

      savedAt:
        typeof parsed.savedAt ===
          "string"
          ? parsed.savedAt
          : null,
    };
  } catch {
    try {
      window.localStorage
        .removeItem(
          MANUAL_SCANNER_STORAGE_KEY,
        );
    } catch {
      // Storage may be unavailable. The scanner remains usable.
    }

    return null;
  }
}

function retainScannerWorkspace({
  symbol,
  query,
  workspace,
}) {
  if (
    typeof window ===
      "undefined" ||
    !window.localStorage ||
    !workspace ||
    typeof workspace !==
      "object"
  ) {
    return null;
  }

  const normalizedSymbol =
    normalizeStoredSymbol(
      symbol ??
      workspace?.symbol,
    );

  if (!normalizedSymbol) {
    return null;
  }

  const payload = {
    version:
      MANUAL_SCANNER_STORAGE_VERSION,

    symbol:
      normalizedSymbol,

    query:
      normalizeStoredSymbol(
        query,
      ) ??
      normalizedSymbol,

    workspace,

    savedAt:
      new Date()
        .toISOString(),
  };

  try {
    window.localStorage
      .setItem(
        MANUAL_SCANNER_STORAGE_KEY,
        JSON.stringify(
          payload,
        ),
      );

    return payload;
  } catch {
    /**
     * Do not clear the currently displayed result if persistence
     * fails (quota, private browsing policy, serialization issue,
     * etc.). The analysis itself is still valid for this session.
     */
    return null;
  }
}

/**
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function Scanner() {
  const [
    retainedInitialState,
  ] =
    useState(
      () =>
        readRetainedScannerWorkspace(),
    );

  const [
    query,
    setQuery,
  ] =
    useState(
      () =>
        retainedInitialState
          ?.query ??
        retainedInitialState
          ?.symbol ??
        "AAPL",
    );

  const [
    workspace,
    setWorkspace,
  ] =
    useState(
      () =>
        retainedInitialState
          ?.workspace ??
        null,
    );

  const [
    retainedAt,
    setRetainedAt,
  ] =
    useState(
      () =>
        retainedInitialState
          ?.savedAt ??
        null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      null,
    );

  const [
    selectedEngine,
    setSelectedEngine,
  ] =
    useState(
      null,
    );

  /**
   * Keep the retained timestamp synchronized when the browser
   * restores a valid manual workspace. This effect deliberately
   * performs NO network request and NO autonomous scanner action.
   */
  useEffect(
    () => {
      if (
        workspace &&
        !retainedAt
      ) {
        const restored =
          readRetainedScannerWorkspace();

        if (
          restored
            ?.savedAt
        ) {
          setRetainedAt(
            restored.savedAt,
          );
        }
      }
    },
    [
      workspace,
      retainedAt,
    ],
  );

  const symbol =
    workspace
      ?.symbol ??
    null;

  const analysis =
    getAnalysisRoot(
      workspace,
    );

  const results =
    getResults(
      workspace,
    );

  const finalDecision =
    getFinalDecision(
      workspace,
    );

  const candles =
    getCandles(
      workspace,
    );

  const news =
    getNews(
      workspace,
    );

  const snapshot =
    useMemo(
      () =>
        deriveStockSnapshot(
          workspace,
        ),
      [
        workspace,
      ],
    );

  const engines =
    useMemo(
      () =>
        buildEngineCards(
          results,
        ),
      [
        results,
      ],
    );

  const longScore =
    firstNumber(
      finalDecision
        ?.longScore,
      results
        ?.scoring
        ?.longScore,
    );

  const shortScore =
    firstNumber(
      finalDecision
        ?.shortScore,
      results
        ?.scoring
        ?.shortScore,
    );

  const overallScore =
    firstNumber(
      finalDecision
        ?.preferredScore,
      finalDecision
        ?.score,
      results
        ?.scoring
        ?.score,
    );

  const direction =
    finalDecision
      ?.preferredSide ??
    finalDecision
      ?.decision ??
    "NO DECISION";

  const riskApproval =
    results
      ?.riskApproval ??
    {};

  const proposedEntry =
    firstNumber(
      riskApproval
        ?.entryPrice,
      riskApproval
        ?.proposedEntry,
      snapshot
        ?.currentPrice,
    );

  const stopLoss =
    firstNumber(
      riskApproval
        ?.stopPrice,
      riskApproval
        ?.stopLoss,
      riskApproval
        ?.initialStop,
    );

  const target =
    firstNumber(
      riskApproval
        ?.targetPrice,
      riskApproval
        ?.target,
      riskApproval
        ?.takeProfit,
    );

  const riskPercent =
    firstNumber(
      riskApproval
        ?.riskPercent,
      riskApproval
        ?.positionRiskPercent,
    );

  const social =
    results
      ?.social ??
    null;

  const socialScore =
    deriveEngineScore(
      social,
    );

  async function handleAnalyze(
    event,
  ) {
    event
      ?.preventDefault();

    const normalized =
      String(
        query ?? "",
      )
        .trim()
        .toUpperCase();

    if (!normalized) {
      setError(
        "Enter a stock symbol.",
      );

      return;
    }

    setLoading(
      true,
    );

    setError(
      null,
    );

    try {
      const result =
        await loadScannerWorkspace(
          normalized,
          {
            newsLimit:
              8,

            candleLimit:
              200,

            useLiveSocial:
              true,
          },
        );

      /**
       * Atomic manual-result replacement:
       * only a successfully returned workspace may replace the
       * previous retained analysis. Request failures leave the
       * existing workspace untouched.
       */
      setWorkspace(
        result,
      );

      const retained =
        retainScannerWorkspace({
          symbol:
            result
              ?.symbol ??
            normalized,

          query:
            normalized,

          workspace:
            result,
        });

      setRetainedAt(
        retained
          ?.savedAt ??
        new Date()
          .toISOString(),
      );
    } catch (
      requestError
    ) {
      setError(
        requestError
          ?.message ??
        "Stock analysis could not be completed.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content scanner-page">
        <div className="scanner-page-header">
          <div>
            <p className="eyebrow">
              AI market research workstation
            </p>

            <h1>
              Stock Scanner
            </h1>

            <p>
              Search a stock, inspect its chart, and run the full
              research engine.
            </p>
          </div>

          <span className="scanner-research-only">
            Research Only
          </span>
        </div>

        <form
          className="scanner-search"
          onSubmit={
            handleAnalyze
          }
        >
          <Search size={19} />

          <input
            value={
              query
            }
            onChange={
              event =>
                setQuery(
                  event
                    .target
                    .value,
                )
            }
            placeholder="Search ticker, e.g. AAPL, NVDA, TSLA..."
          />

          <button
            type="submit"
            disabled={
              loading
            }
          >
            {loading
              ? "Analyzing..."
              : "Analyze"}

            <ArrowRight
              size={16}
            />
          </button>
        </form>

        {error && (
          <div className="scanner-error">
            {error}
          </div>
        )}

        <div className="scanner-upper-grid">
          <TradingChart
            symbol={
              symbol
            }
            candles={
              candles
            }
            loading={
              loading
            }
          />

          <section className="scanner-panel scanner-snapshot-panel">
            <div className="scanner-panel-heading">
              <div>
                <span>
                  Stock Snapshot
                </span>

                <h2>
                  {symbol ??
                    "No symbol"}
                </h2>
              </div>

              <Activity
                size={18}
              />
            </div>

            <div className="scanner-current-price">
              <strong>
                {formatPrice(
                  snapshot
                    .currentPrice,
                )}
              </strong>

              <span
                className={
                  numberOrNull(
                    snapshot
                      .changePercent,
                  ) !==
                    null &&
                  snapshot
                    .changePercent >=
                    0
                    ? "scanner-positive"
                    : "scanner-negative"
                }
              >
                {formatPercent(
                  snapshot
                    .changePercent,
                )}
              </span>
            </div>

            <div className="scanner-snapshot-grid">
              <div>
                <span>
                  Open
                </span>

                <strong>
                  {formatPrice(
                    snapshot
                      .open,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  High
                </span>

                <strong>
                  {formatPrice(
                    snapshot
                      .high,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Low
                </span>

                <strong>
                  {formatPrice(
                    snapshot
                      .low,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Volume
                </span>

                <strong>
                  {formatVolume(
                    snapshot
                      .volume,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Bid
                </span>

                <strong>
                  {formatPrice(
                    snapshot
                      .bid,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Ask
                </span>

                <strong>
                  {formatPrice(
                    snapshot
                      .ask,
                  )}
                </strong>
              </div>
            </div>

            <div className="scanner-market-status">
              <span>
                Quote
              </span>

              <strong>
                {snapshot
                  .quoteFresh
                  ? "LIVE"
                  : "NOT LIVE"}
              </strong>
            </div>

            <div className="scanner-market-status">
              <span>
                Historical Data
              </span>

              <strong>
                {snapshot
                  .historicalLoaded
                  ? "READY"
                  : "UNAVAILABLE"}
              </strong>
            </div>
          </section>
        </div>

        <section className="scanner-panel scanner-analysis-panel">
          <div className="scanner-panel-heading">
            <div>
              <span>
                Bot Analysis
              </span>

              <h2>
                Overall Decision
              </h2>
            </div>

            <ShieldCheck
              size={18}
            />
          </div>

          <div className="scanner-score-grid">
            <ScoreBlock
              label="Long Score"
              value={
                longScore
              }
              type="long"
            />

            <div className="scanner-overall-score">
              <span>
                Overall
              </span>

              <strong>
                {overallScore ===
                null
                  ? "—"
                  : overallScore.toFixed(
                      1,
                    )}
              </strong>

              <small>
                {String(
                  direction,
                ).replaceAll(
                  "_",
                  " ",
                )}
              </small>
            </div>

            <ScoreBlock
              label="Short Score"
              value={
                shortScore
              }
              type="short"
            />
          </div>

          <div className="scanner-execution-warning">
            <ShieldCheck
              size={15}
            />

            Scanner analysis cannot place an order. Execution
            remains behind the bot/account execution layer.
          </div>
        </section>

        <section className="scanner-panel">
          <div className="scanner-panel-heading">
            <div>
              <span>
                Engine Intelligence
              </span>

              <h2>
                Score Breakdown
              </h2>
            </div>

            <Brain
              size={18}
            />
          </div>

          <div className="scanner-engine-grid">
            {engines.map(
              engine => (
                <EngineCard
                  key={
                    engine.key
                  }
                  engine={
                    engine
                  }
                  onClick={
                    setSelectedEngine
                  }
                />
              ),
            )}
          </div>
        </section>

        <div className="scanner-bottom-grid">
          <section className="scanner-panel">
            <div className="scanner-panel-heading">
              <div>
                <span>
                  Trade Plan
                </span>

                <h2>
                  Proposed Setup
                </h2>
              </div>

              <Target
                size={18}
              />
            </div>

            <div className="scanner-plan-grid">
              <div>
                <span>
                  Proposed Entry
                </span>

                <strong>
                  {formatPrice(
                    proposedEntry,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Stop Loss
                </span>

                <strong>
                  {formatPrice(
                    stopLoss,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Target
                </span>

                <strong>
                  {formatPrice(
                    target,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Risk
                </span>

                <strong>
                  {riskPercent ===
                  null
                    ? "—"
                    : `${(
                        riskPercent *
                        (
                          riskPercent <=
                          1
                            ? 100
                            : 1
                        )
                      ).toFixed(
                        2,
                      )}%`}
                </strong>
              </div>
            </div>

            <div className="scanner-plan-status">
              <span>
                Risk Approval
              </span>

              <strong>
                {riskApproval
                  ?.canExecute ===
                true
                  ? "APPROVED"
                  : "NOT APPROVED"}
              </strong>
            </div>

            <div className="scanner-plan-status">
              <span>
                Paper Execution Eligible
              </span>

              <strong>
                {finalDecision
                  ?.canProceedToPaperExecution ===
                true
                  ? "YES"
                  : "NO"}
              </strong>
            </div>
          </section>

          <section className="scanner-panel scanner-news-panel">
            <div className="scanner-panel-heading">
              <div>
                <span>
                  Market Intelligence
                </span>

                <h2>
                  Stock News
                </h2>
              </div>

              <Newspaper
                size={18}
              />
            </div>

            <div className="scanner-news-list">
              {news.length ===
              0 ? (
                <div className="scanner-empty">
                  No stock-specific news loaded.
                </div>
              ) : (
                news.map(
                  item => (
                    <a
                      key={
                        item.id
                      }
                      className="scanner-news-item"
                      href={
                        item.url
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div>
                        <span>
                          {String(
                            item
                              ?.source ??
                            "NEWS",
                          ).toUpperCase()}
                        </span>

                        <h3>
                          {
                            item.headline
                          }
                        </h3>

                        {item.summary && (
                          <p>
                            {
                              item.summary
                            }
                          </p>
                        )}
                      </div>

                      <ChevronRight
                        size={15}
                      />
                    </a>
                  ),
                )
              )}
            </div>
          </section>
        </div>

        <section className="scanner-panel scanner-social-panel">
          <div className="scanner-panel-heading">
            <div>
              <span>
                Sentiment
              </span>

              <h2>
                Social Intelligence
              </h2>
            </div>

            <Globe2
              size={18}
            />
          </div>

          <div className="scanner-social-content">
            <div className="scanner-social-score">
              <strong>
                {socialScore ===
                null
                  ? "—"
                  : formatNumber(
                      socialScore,
                      1,
                    )}
              </strong>

              <span>
                Social Score
              </span>
            </div>

            <div className="scanner-social-details">
              <span>
                {social
                  ?.summary ??
                  social
                    ?.status ??
                  "Social intelligence is unavailable for this analysis."}
              </span>
            </div>
          </div>
        </section>

        {workspace
          ?.warnings
          ?.length >
          0 && (
          <section className="scanner-warning-panel">
            {workspace.warnings.map(
              (
                warning,
                index,
              ) => (
                <p
                  key={`${index}-${warning}`}
                >
                  {warning}
                </p>
              ),
            )}
          </section>
        )}

        <EngineModal
          engine={
            selectedEngine
          }
          onClose={() =>
            setSelectedEngine(
              null,
            )
          }
        />
      </main>
    </div>
  );
}