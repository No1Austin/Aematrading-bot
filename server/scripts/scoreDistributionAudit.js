import "dotenv/config";

import fs from "node:fs/promises";

/**
 * ============================================================
 * AEMA SCORE DISTRIBUTION AUDIT
 * ============================================================
 *
 * PURPOSE
 * -------
 * Run real stocks through:
 *
 *   POST /api/analysis/stock
 *
 * and measure:
 *
 * - LONG score
 * - SHORT score
 * - preferred direction
 * - preferred score
 * - evidence coverage
 * - engine contributions
 * - missing required engines
 * - threshold failures
 * - ambiguity
 * - score distribution
 *
 * This script does NOT:
 *
 * - place trades
 * - modify scoring
 * - modify scanner state
 * - fabricate market data
 *
 * It is diagnostic only.
 */

const API_BASE =
  process.env.AEMA_API_BASE_URL ??
  "http://localhost:8000";

const ANALYSIS_ENDPOINT =
  `${API_BASE}/api/analysis/stock`;

const ALPACA_BASE =
  process.env.ALPACA_TRADING_BASE_URL ??
  "https://paper-api.alpaca.markets";

const SAMPLE_SIZE =
  Math.max(
    10,
    Number(
      process.env
        .AEMA_SCORE_AUDIT_SAMPLE_SIZE ??
      100,
    ),
  );

const CONCURRENCY =
  Math.max(
    1,
    Math.min(
      5,
      Number(
        process.env
          .AEMA_SCORE_AUDIT_CONCURRENCY ??
        2,
      ),
    ),
  );

const REQUEST_TIMEOUT_MS =
  Math.max(
    15_000,
    Number(
      process.env
        .AEMA_SCORE_AUDIT_TIMEOUT_MS ??
      120_000,
    ),
  );

const MAX_SYMBOLS_FROM_UNIVERSE =
  Math.max(
    SAMPLE_SIZE,
    Number(
      process.env
        .AEMA_SCORE_AUDIT_UNIVERSE_LIMIT ??
      5000,
    ),
  );

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function finite(
  value,
) {
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

function round(
  value,
  decimals = 2,
) {
  const number =
    finite(value);

  if (number === null) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
      factor,
    ) /
    factor
  );
}

function normalizeSide(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return (
    normalized === "LONG" ||
    normalized === "SHORT"
  )
    ? normalized
    : null;
}

function getAnalysisResults(
  root,
) {
  return (
    root
      ?.analysis
      ?.results ??
    root
      ?.runnerResult
      ?.analysis
      ?.results ??
    root
      ?.runnerResult
      ?.results ??
    root
      ?.result
      ?.analysis
      ?.results ??
    root
      ?.result
      ?.runnerResult
      ?.analysis
      ?.results ??
    null
  );
}

function getFinalDecision(
  root,
) {
  return (
    root
      ?.finalDecision ??
    root
      ?.runnerResult
      ?.finalDecision ??
    root
      ?.result
      ?.finalDecision ??
    root
      ?.result
      ?.runnerResult
      ?.finalDecision ??
    null
  );
}

function normalizeScorecard(
  scoring,
  side,
) {
  if (
    !scoring ||
    !side
  ) {
    return {};
  }

  const sideKey =
    side === "SHORT"
      ? "short"
      : "long";

  const direct =
    scoring
      ?.scorecard
      ?.[sideKey];

  if (
    direct &&
    typeof direct === "object"
  ) {
    return direct;
  }

  const components =
    scoring
      ?.[sideKey]
      ?.components;

  if (
    !Array.isArray(
      components,
    )
  ) {
    return {};
  }

  return Object.fromEntries(
    components
      .filter(
        component =>
          component &&
          component.name,
      )
      .map(
        component => [
          String(
            component.name,
          )
            .trim()
            .toUpperCase(),

          {
            points:
              component
                ?.points ??
              null,

            maximum:
              component
                ?.maximumPoints ??
              null,

            support:
              component
                ?.support ??
              null,

            available:
              component
                ?.available ===
              true,

            status:
              component
                ?.engineStatus ??
              null,

            source:
              component
                ?.source ??
              null,

            required:
              component
                ?.required ===
              true,

            neutralFallbackApplied:
              component
                ?.neutralFallbackApplied ===
              true,
          },
        ],
      ),
  );
}

function componentValue(
  scorecard,
  key,
) {
  const component =
    scorecard
      ?.[key] ??
    null;

  return {
    points:
      finite(
        component
          ?.points,
      ),

    maximum:
      finite(
        component
          ?.maximum ??
        component
          ?.maximumPoints,
      ),

    support:
      finite(
        component
          ?.support,
      ),

    available:
      component
        ?.available ===
      true,

    status:
      component
        ?.status ??
      component
        ?.engineStatus ??
      null,

    neutralFallbackApplied:
      component
        ?.neutralFallbackApplied ===
      true,
  };
}

function calculatePercentile(
  values,
  percentile,
) {
  const numbers =
    values
      .filter(
        value =>
          Number.isFinite(
            value,
          ),
      )
      .sort(
        (a, b) =>
          a - b,
      );

  if (
    numbers.length === 0
  ) {
    return null;
  }

  const position =
    (
      numbers.length -
      1
    ) *
    percentile;

  const lower =
    Math.floor(
      position,
    );

  const upper =
    Math.ceil(
      position,
    );

  if (
    lower === upper
  ) {
    return numbers[
      lower
    ];
  }

  const weight =
    position -
    lower;

  return (
    numbers[
      lower
    ] *
      (
        1 -
        weight
      )
  ) +
    (
      numbers[
        upper
      ] *
      weight
    );
}

function average(
  values,
) {
  const numbers =
    values.filter(
      value =>
        Number.isFinite(
          value,
        ),
    );

  if (
    numbers.length === 0
  ) {
    return null;
  }

  return (
    numbers.reduce(
      (
        total,
        value,
      ) =>
        total +
        value,
      0,
    ) /
    numbers.length
  );
}

/**
 * ============================================================
 * ALPACA UNIVERSE
 * ============================================================
 */

function getAlpacaCredentials() {
  const key =
    process.env
      .APCA_API_KEY_ID ??
    process.env
      .ALPACA_API_KEY ??
    null;

  const secret =
    process.env
      .APCA_API_SECRET_KEY ??
    process.env
      .ALPACA_SECRET_KEY ??
    null;

  return {
    key,
    secret,
  };
}

async function loadUniverse() {
  const {
    key,
    secret,
  } =
    getAlpacaCredentials();

  if (
    !key ||
    !secret
  ) {
    throw new Error(
      "Alpaca credentials are not configured.",
    );
  }

  const response =
    await fetch(
      `${ALPACA_BASE}/v2/assets?status=active&asset_class=us_equity`,
      {
        headers: {
          "APCA-API-KEY-ID":
            key,

          "APCA-API-SECRET-KEY":
            secret,
        },
      },
    );

  if (
    !response.ok
  ) {
    const body =
      await response.text();

    throw new Error(
      `Alpaca asset request failed (${response.status}): ${body.slice(
        0,
        500,
      )}`,
    );
  }

  const assets =
    await response.json();

  if (
    !Array.isArray(
      assets,
    )
  ) {
    throw new Error(
      "Alpaca assets response was not an array.",
    );
  }

  return assets
    .filter(
      asset =>
        asset &&
        asset.tradable ===
          true &&
        asset.status ===
          "active" &&
        (
          asset.exchange ===
            "NYSE" ||
          asset.exchange ===
            "NASDAQ" ||
          asset.exchange ===
            "ARCA" ||
          asset.exchange ===
            "AMEX"
        ) &&
        typeof asset.symbol ===
          "string" &&
        asset.symbol.length >
          0,
    )
    .slice(
      0,
      MAX_SYMBOLS_FROM_UNIVERSE,
    );
}

/**
 * ============================================================
 * DETERMINISTIC SAMPLE
 * ============================================================
 *
 * Spread sampling across the universe rather than simply using
 * the first N alphabetically.
 */

function selectSample(
  assets,
  size,
) {
  if (
    assets.length <=
    size
  ) {
    return assets;
  }

  const result = [];

  const step =
    assets.length /
    size;

  for (
    let index = 0;
    index < size;
    index += 1
  ) {
    const selectedIndex =
      Math.floor(
        index *
        step,
      );

    result.push(
      assets[
        selectedIndex
      ],
    );
  }

  return result;
}

/**
 * ============================================================
 * ANALYZE ONE STOCK
 * ============================================================
 */

async function analyzeSymbol(
  symbol,
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  const startedAt =
    Date.now();

  try {
    const response =
      await fetch(
        ANALYSIS_ENDPOINT,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              symbol,
            }),

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
        text
          ? JSON.parse(
              text,
            )
          : null;
    } catch {
      body =
        null;
    }

    if (
      !response.ok ||
      !body
    ) {
      return {
        symbol,

        ok:
          false,

        httpStatus:
          response.status,

        durationMs:
          Date.now() -
          startedAt,

        error:
          body
            ?.error ??
          body
            ?.errors
            ?.[0] ??
          text
            ?.slice(
              0,
              500,
            ) ??
          "Unknown analysis error.",
      };
    }

    const results =
      getAnalysisResults(
        body,
      );

    const scoring =
      results
        ?.scoring ??
      null;

    const finalDecision =
      getFinalDecision(
        body,
      );

    const preferredSide =
      normalizeSide(
        finalDecision
          ?.preferredSide ??
        scoring
          ?.preferredSide,
      );

    const preferredScore =
      finite(
        finalDecision
          ?.preferredScore ??
        scoring
          ?.preferredScore,
      );

    const longScore =
      finite(
        scoring
          ?.long
          ?.score ??
        scoring
          ?.longScore,
      );

    const shortScore =
      finite(
        scoring
          ?.short
          ?.score ??
        scoring
          ?.shortScore,
      );

    const scorecard =
      normalizeScorecard(
        scoring,
        preferredSide,
      );

    const technical =
      componentValue(
        scorecard,
        "TECHNICAL",
      );

    const company =
      componentValue(
        scorecard,
        "COMPANY",
      );

    const macro =
      componentValue(
        scorecard,
        "MACRO_REGIME",
      );

    const events =
      componentValue(
        scorecard,
        "EVENTS",
      );

    const institutional =
      componentValue(
        scorecard,
        "INSTITUTIONAL",
      );

    const historical =
      componentValue(
        scorecard,
        "HISTORICAL",
      );

    const social =
      componentValue(
        scorecard,
        "SOCIAL",
      );

    const country =
      componentValue(
        scorecard,
        "COUNTRY",
      );

    const scoreDifference =
      (
        longScore !== null &&
        shortScore !== null
      )
        ? Math.abs(
            longScore -
            shortScore,
          )
        : null;

    return {
      symbol,

      ok:
        true,

      httpStatus:
        response.status,

      durationMs:
        Date.now() -
        startedAt,

      analysisStatus:
        body
          ?.status ??
        null,

      preferredSide,

      preferredScore,

      longScore,

      shortScore,

      scoreDifference,

      tradeEligible:
        finalDecision
          ?.tradeEligible ===
        true,

      decision:
        finalDecision
          ?.decision ??
        null,

      riskStatus:
        finalDecision
          ?.riskStatus ??
        null,

      minimumRequiredScore:
        finite(
          finalDecision
            ?.minimumRequiredScore ??
          scoring
            ?.minimumRequiredScore,
        ),

      evidenceCoveragePercent:
        finite(
          preferredSide ===
            "LONG"
            ? scoring
                ?.long
                ?.evidenceCoveragePercent
            : scoring
                ?.short
                ?.evidenceCoveragePercent,
        ),

      missingRequired:
        preferredSide ===
          "LONG"
          ? (
              scoring
                ?.long
                ?.missingRequired ??
              []
            )
          : (
              scoring
                ?.short
                ?.missingRequired ??
              []
            ),

      technical,

      company,

      macro,

      events,

      institutional,

      historical,

      social,

      country,
    };
  } catch (error) {
    return {
      symbol,

      ok:
        false,

      durationMs:
        Date.now() -
        startedAt,

      error:
        error
          ?.name ===
        "AbortError"
          ? `Timed out after ${REQUEST_TIMEOUT_MS}ms`
          : (
              error
                ?.message ??
              String(
                error,
              )
            ),
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/**
 * ============================================================
 * CONCURRENCY WORKER
 * ============================================================
 */

async function mapWithConcurrency(
  items,
  concurrency,
  mapper,
) {
  const results =
    new Array(
      items.length,
    );

  let cursor = 0;

  async function worker(
    workerId,
  ) {
    while (
      true
    ) {
      const index =
        cursor;

      cursor += 1;

      if (
        index >=
        items.length
      ) {
        return;
      }

      const item =
        items[
          index
        ];

      console.log(
        `[${index + 1}/${items.length}] Worker ${workerId}: ${item.symbol}`,
      );

      results[
        index
      ] =
        await mapper(
          item.symbol,
        );

      const result =
        results[
          index
        ];

      if (
        result.ok
      ) {
        console.log(
          `    ${result.preferredSide ?? "—"} ${result.preferredScore ?? "—"} | LONG ${result.longScore ?? "—"} | SHORT ${result.shortScore ?? "—"}`,
        );
      } else {
        console.log(
          `    FAILED: ${result.error}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          concurrency,
      },
      (
        _,
        index,
      ) =>
        worker(
          index + 1,
        ),
    ),
  );

  return results;
}

/**
 * ============================================================
 * REPORTING
 * ============================================================
 */

function countAtLeast(
  rows,
  threshold,
) {
  return rows.filter(
    row =>
      Number.isFinite(
        row.preferredScore,
      ) &&
      row.preferredScore >=
        threshold,
  ).length;
}

function buildEngineStats(
  successful,
  key,
) {
  const points =
    successful
      .map(
        row =>
          finite(
            row
              ?.[key]
              ?.points,
          ),
      )
      .filter(
        value =>
          value !==
          null,
      );

  const supports =
    successful
      .map(
        row =>
          finite(
            row
              ?.[key]
              ?.support,
          ),
      )
      .filter(
        value =>
          value !==
          null,
      );

  const maximum =
    successful
      .map(
        row =>
          finite(
            row
              ?.[key]
              ?.maximum,
          ),
      )
      .find(
        value =>
          value !==
          null,
      ) ??
    null;

  const fallbackCount =
    successful.filter(
      row =>
        row
          ?.[key]
          ?.neutralFallbackApplied ===
        true,
    ).length;

  return {
    engine:
      key,

    maximum,

    averagePoints:
      round(
        average(
          points,
        ),
        3,
      ),

    averageSupportPercent:
      round(
        (
          average(
            supports,
          ) ??
          0
        ) *
        100,
        2,
      ),

    fallbackCount,

    fallbackPercent:
      successful.length
        ? round(
            fallbackCount /
              successful.length *
              100,
            2,
          )
        : 0,
  };
}

function csvEscape(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const string =
    String(value);

  if (
    string.includes(",") ||
    string.includes("\"") ||
    string.includes("\n")
  ) {
    return `"${string.replaceAll(
      "\"",
      "\"\"",
    )}"`;
  }

  return string;
}

function toCsv(
  rows,
) {
  if (
    rows.length === 0
  ) {
    return "";
  }

  const headers =
    Object.keys(
      rows[0],
    );

  return [
    headers
      .map(
        csvEscape,
      )
      .join(","),

    ...rows.map(
      row =>
        headers
          .map(
            header =>
              csvEscape(
                row[
                  header
                ],
              ),
          )
          .join(","),
    ),
  ].join(
    "\n",
  );
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log(
    "\n==========================================",
  );

  console.log(
    "AEMA SCORE DISTRIBUTION AUDIT",
  );

  console.log(
    "==========================================",
  );

  console.log({
    api:
      ANALYSIS_ENDPOINT,

    sampleSize:
      SAMPLE_SIZE,

    concurrency:
      CONCURRENCY,

    timeoutMs:
      REQUEST_TIMEOUT_MS,
  });

  console.log(
    "\nLoading Alpaca stock universe...",
  );

  const universe =
    await loadUniverse();

  console.log(
    `Universe loaded: ${universe.length}`,
  );

  const sample =
    selectSample(
      universe,
      SAMPLE_SIZE,
    );

  console.log(
    `Selected sample: ${sample.length}`,
  );

  const results =
    await mapWithConcurrency(
      sample,
      CONCURRENCY,
      analyzeSymbol,
    );

  const successful =
    results.filter(
      row =>
        row?.ok ===
        true,
    );

  const failed =
    results.filter(
      row =>
        row?.ok !==
        true,
    );

  const scores =
    successful
      .map(
        row =>
          finite(
            row.preferredScore,
          ),
      )
      .filter(
        value =>
          value !==
          null,
      );

  console.log(
    "\n==========================================",
  );

  console.log(
    "SCORE DISTRIBUTION",
  );

  console.log(
    "==========================================",
  );

  const summary = {
    requested:
      sample.length,

    completed:
      successful.length,

    failed:
      failed.length,

    average:
      round(
        average(
          scores,
        ),
        2,
      ),

    minimum:
      scores.length
        ? round(
            Math.min(
              ...scores,
            ),
            2,
          )
        : null,

    maximum:
      scores.length
        ? round(
            Math.max(
              ...scores,
            ),
            2,
          )
        : null,

    p25:
      round(
        calculatePercentile(
          scores,
          0.25,
        ),
        2,
      ),

    median:
      round(
        calculatePercentile(
          scores,
          0.50,
        ),
        2,
      ),

    p75:
      round(
        calculatePercentile(
          scores,
          0.75,
        ),
        2,
      ),

    p90:
      round(
        calculatePercentile(
          scores,
          0.90,
        ),
        2,
      ),

    score50Plus:
      countAtLeast(
        successful,
        50,
      ),

    score60Plus:
      countAtLeast(
        successful,
        60,
      ),

    score65Plus:
      countAtLeast(
        successful,
        65,
      ),

    score70Plus:
      countAtLeast(
        successful,
        70,
      ),

    score75Plus:
      countAtLeast(
        successful,
        75,
      ),

    score80Plus:
      countAtLeast(
        successful,
        80,
      ),

    score85Plus:
      countAtLeast(
        successful,
        85,
      ),

    actualTradeEligible:
      successful.filter(
        row =>
          row.tradeEligible ===
          true,
      ).length,
  };

  console.table(
    [
      summary,
    ],
  );

  console.log(
    "\n==========================================",
  );

  console.log(
    "ENGINE BEHAVIOUR",
  );

  console.log(
    "==========================================",
  );

  const engineStats =
    [
      "technical",
      "company",
      "macro",
      "events",
      "institutional",
      "historical",
      "social",
      "country",
    ].map(
      key =>
        buildEngineStats(
          successful,
          key,
        ),
    );

  console.table(
    engineStats,
  );

  console.log(
    "\n==========================================",
  );

  console.log(
    "TOP 20 SCORES",
  );

  console.log(
    "==========================================",
  );

  console.table(
    [...successful]
      .sort(
        (
          a,
          b,
        ) =>
          (
            b
              .preferredScore ??
            -Infinity
          ) -
          (
            a
              .preferredScore ??
            -Infinity
          ),
      )
      .slice(
        0,
        20,
      )
      .map(
        row => ({
          symbol:
            row.symbol,

          side:
            row.preferredSide,

          score:
            row.preferredScore,

          long:
            row.longScore,

          short:
            row.shortScore,

          difference:
            row.scoreDifference,

          coverage:
            row.evidenceCoveragePercent,

          eligible:
            row.tradeEligible,
        }),
      ),
  );

  console.log(
    "\n==========================================",
  );

  console.log(
    "FAILURE / BOTTLENECK COUNTS",
  );

  console.log(
    "==========================================",
  );

  const missingRequiredCounts =
    new Map();

  for (
    const row
    of successful
  ) {
    for (
      const name
      of (
        row
          .missingRequired ??
        []
      )
    ) {
      missingRequiredCounts.set(
        name,
        (
          missingRequiredCounts.get(
            name,
          ) ??
          0
        ) +
        1,
      );
    }
  }

  console.table(
    [...missingRequiredCounts.entries()]
      .map(
        (
          [
            engine,
            count,
          ],
        ) => ({
          engine,
          count,
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.count -
          a.count,
      ),
  );

  /**
   * Flatten results for CSV.
   */
  const csvRows =
    results.map(
      row => ({
        symbol:
          row.symbol,

        ok:
          row.ok,

        preferredSide:
          row.preferredSide ??
          "",

        preferredScore:
          row.preferredScore ??
          "",

        longScore:
          row.longScore ??
          "",

        shortScore:
          row.shortScore ??
          "",

        scoreDifference:
          row.scoreDifference ??
          "",

        evidenceCoveragePercent:
          row
            .evidenceCoveragePercent ??
          "",

        tradeEligible:
          row.tradeEligible ??
          false,

        decision:
          row.decision ??
          "",

        riskStatus:
          row.riskStatus ??
          "",

        technical:
          row
            .technical
            ?.points ??
          "",

        company:
          row
            .company
            ?.points ??
          "",

        macro:
          row
            .macro
            ?.points ??
          "",

        events:
          row
            .events
            ?.points ??
          "",

        institutional:
          row
            .institutional
            ?.points ??
          "",

        historical:
          row
            .historical
            ?.points ??
          "",

        social:
          row
            .social
            ?.points ??
          "",

        country:
          row
            .country
            ?.points ??
          "",

        error:
          row.error ??
          "",
      }),
    );

  const timestamp =
    new Date()
      .toISOString()
      .replaceAll(
        ":",
        "-",
      );

  const jsonPath =
    `score-audit-${timestamp}.json`;

  const csvPath =
    `score-audit-${timestamp}.csv`;

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt:
          new Date()
            .toISOString(),

        config: {
          sampleSize:
            SAMPLE_SIZE,

          concurrency:
            CONCURRENCY,
        },

        summary,

        engineStats,

        results,
      },
      null,
      2,
    ),
  );

  await fs.writeFile(
    csvPath,
    toCsv(
      csvRows,
    ),
  );

  console.log(
    "\nSaved:",
  );

  console.log(
    jsonPath,
  );

  console.log(
    csvPath,
  );

  console.log(
    "\nAudit complete.",
  );
}

main()
  .catch(
    error => {
      console.error(
        "\nAUDIT FAILED:",
        error,
      );

      process.exitCode =
        1;
    },
  );