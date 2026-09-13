// server/src/regime/marketRegimeEngine.test.js

import analyzeMarketRegime from "./marketRegimeEngine.js";
import {
  MARKET_REGIME,
} from "../config/riskConfig.js";

const RECESSION_RISK =
  Object.freeze({
    LOW: "LOW",
    MODERATE: "MODERATE",
    ELEVATED: "ELEVATED",
    HIGH: "HIGH",
    CONFIRMED: "CONFIRMED",
    UNKNOWN: "UNKNOWN",
  });

function assertCondition(
  condition,
  message,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function runScenario(
  name,
  input,
  validate,
) {
  console.log(
    "\n====================================",
  );

  console.log(
    `TEST: ${name}`,
  );

  console.log(
    "====================================",
  );

  const result =
    analyzeMarketRegime(
      input,
    );

  console.dir(
    result,
    {
      depth: null,
    },
  );

  assertCondition(
    result &&
      result.engine ===
        "MARKET_REGIME",
    `${name}: invalid MARKET_REGIME result.`,
  );

  assertCondition(
    Number.isFinite(
      Number(
        result.confidence,
      ),
    ),
    `${name}: confidence must be numeric.`,
  );

  assertCondition(
    Number(
      result.confidence,
    ) >= 0 &&
      Number(
        result.confidence,
      ) <= 1,
    `${name}: confidence must stay between 0 and 1.`,
  );

  const longSupport =
    Number(
      result
        ?.directionalSupport
        ?.long,
    );

  const shortSupport =
    Number(
      result
        ?.directionalSupport
        ?.short,
    );

  assertCondition(
    Number.isFinite(
      longSupport,
    ) &&
      longSupport >= 0 &&
      longSupport <= 1,
    `${name}: LONG support must stay between 0 and 1.`,
  );

  assertCondition(
    Number.isFinite(
      shortSupport,
    ) &&
      shortSupport >= 0 &&
      shortSupport <= 1,
    `${name}: SHORT support must stay between 0 and 1.`,
  );

  if (
    result.approved === true
  ) {
    assertCondition(
      Math.abs(
        (
          longSupport +
          shortSupport
        ) -
        1,
      ) <
        0.0002,
      `${name}: LONG + SHORT support should equal approximately 1.`,
    );
  }

  if (
    typeof validate ===
    "function"
  ) {
    validate(
      result,
    );
  }

  console.log(
    `PASS: ${name}`,
  );

  return result;
}

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function technical(
  direction,
) {
  return {
    approved: true,

    trend: {
      direction,
    },
  };
}

function macro(
  direction,
  recessionLevel =
    RECESSION_RISK.LOW,
) {
  return {
    approved: true,

    direction,

    recessionRisk: {
      level:
        recessionLevel,
    },
  };
}

function breadth(
  score,
  confidence = 1,
) {
  return {
    score,

    confidence,

    evidence: [
      "TEST_BREADTH",
    ],
  };
}

function liquidity(
  score,
  direction =
    "STABLE",
) {
  return {
    score,

    direction,
  };
}

function volatility({
  score = 0.2,
  level = "LOW",
  extreme = false,
} = {}) {
  return {
    score,
    level,
    extreme,
  };
}

/**
 * ============================================================
 * 1. STRONG BULL
 * ============================================================
 */

runScenario(
  "Strong bull regime",
  {
    technical:
      technical(
        "STRONG_BULLISH",
      ),

    macro:
      macro(
        "BULLISH",
        RECESSION_RISK.LOW,
      ),

    breadth:
      breadth(
        1,
      ),

    liquidity:
      liquidity(
        1,
        "EXPANDING",
      ),

    volatility:
      volatility({
        score: 0.15,
        level: "LOW",
      }),
  },
  (result) => {
    assertCondition(
      result.approved === true,
      "Strong bull should be approved.",
    );

    assertCondition(
      result.regime ===
        MARKET_REGIME
          .STRONG_BULL,
      "Expected STRONG_BULL regime.",
    );

    assertCondition(
      result.direction ===
        "LONG",
      "Strong bull should prefer LONG.",
    );

    assertCondition(
      result
        ?.strategy
        ?.preferredSide ===
        "LONG",
      "Strong bull should prefer LONG strategy.",
    );

    assertCondition(
      result
        .directionalSupport
        .long >
        result
          .directionalSupport
          .short,
      "Strong bull should have more LONG support than SHORT support.",
    );
  },
);

/**
 * ============================================================
 * 2. BULL
 * ============================================================
 */

runScenario(
  "Bull regime",
  {
    technical:
      technical(
        "BULLISH",
      ),

    macro:
      macro(
        "SLIGHTLY_BULLISH",
        RECESSION_RISK.LOW,
      ),

    breadth:
      breadth(
        0.45,
      ),

    liquidity:
      liquidity(
        0.4,
        "EXPANDING",
      ),

    volatility:
      volatility({
        score: 0.25,
        level: "NORMAL",
      }),
  },
  (result) => {
    assertCondition(
      [
        MARKET_REGIME.BULL,
        MARKET_REGIME
          .STRONG_BULL,
      ].includes(
        result.regime,
      ),
      "Expected bullish regime.",
    );

    assertCondition(
      result
        .directionalSupport
        .long >
        0.5,
      "Bull regime should provide more than 50% LONG support.",
    );
  },
);

/**
 * ============================================================
 * 3. SIDEWAYS
 * ============================================================
 */

runScenario(
  "Sideways regime",
  {
    technical:
      technical(
        "SIDEWAYS",
      ),

    macro:
      macro(
        "NEUTRAL",
        RECESSION_RISK.LOW,
      ),

    breadth:
      breadth(
        0,
      ),

    liquidity:
      liquidity(
        0,
        "STABLE",
      ),

    volatility:
      volatility({
        score: 0.2,
        level: "NORMAL",
      }),
  },
  (result) => {
    assertCondition(
      result.regime ===
        MARKET_REGIME
          .SIDEWAYS,
      "Expected SIDEWAYS regime.",
    );

    assertCondition(
      result.direction ===
        "NEUTRAL",
      "Sideways regime should be NEUTRAL.",
    );
  },
);

/**
 * ============================================================
 * 4. BEAR
 * ============================================================
 */

runScenario(
  "Bear regime",
  {
    technical:
      technical(
        "BEARISH",
      ),

    macro:
      macro(
        "SLIGHTLY_BEARISH",
        RECESSION_RISK.MODERATE,
      ),

    breadth:
      breadth(
        -0.45,
      ),

    liquidity:
      liquidity(
        -0.4,
        "CONTRACTING",
      ),

    volatility:
      volatility({
        score: 0.3,
        level: "NORMAL",
      }),
  },
  (result) => {
    assertCondition(
      [
        MARKET_REGIME.BEAR,
        MARKET_REGIME
          .STRONG_BEAR,
      ].includes(
        result.regime,
      ),
      "Expected bearish regime.",
    );

    assertCondition(
      result
        .directionalSupport
        .short >
        result
          .directionalSupport
          .long,
      "Bear regime should have more SHORT support.",
    );
  },
);

/**
 * ============================================================
 * 5. STRONG BEAR
 * ============================================================
 */

runScenario(
  "Strong bear regime",
  {
    technical:
      technical(
        "STRONG_BEARISH",
      ),

    macro:
      macro(
        "BEARISH",
        RECESSION_RISK.HIGH,
      ),

    breadth:
      breadth(
        -1,
      ),

    liquidity:
      liquidity(
        -1,
        "CONTRACTING",
      ),

    volatility:
      volatility({
        score: 0.35,
        level: "HIGH",
      }),
  },
  (result) => {
    assertCondition(
      result.regime ===
        MARKET_REGIME
          .STRONG_BEAR,
      "Expected STRONG_BEAR regime.",
    );

    assertCondition(
      result.direction ===
        "SHORT",
      "Strong bear should prefer SHORT.",
    );

    assertCondition(
      result
        ?.strategy
        ?.preferredSide ===
        "SHORT",
      "Strong bear strategy should prefer SHORT.",
    );
  },
);

/**
 * ============================================================
 * 6. EXTREME VOLATILITY OVERRIDES DIRECTION
 * ============================================================
 */

runScenario(
  "Extreme volatility overrides bullish direction",
  {
    technical:
      technical(
        "STRONG_BULLISH",
      ),

    macro:
      macro(
        "BULLISH",
        RECESSION_RISK.LOW,
      ),

    breadth:
      breadth(
        1,
      ),

    liquidity:
      liquidity(
        1,
        "EXPANDING",
      ),

    volatility:
      volatility({
        score: 1,
        level: "EXTREME",
        extreme: true,
      }),
  },
  (result) => {
    assertCondition(
      result.regime ===
        MARKET_REGIME
          .HIGH_VOLATILITY,
      "Extreme volatility must override ordinary directional regime.",
    );

    assertCondition(
      result
        ?.strategy
        ?.preferredStrategy ===
        "DEFENSIVE",
      "High volatility should use DEFENSIVE strategy.",
    );
  },
);

/**
 * ============================================================
 * 7. RECESSION PRESSURE WEAKENS A BULLISH ENVIRONMENT
 * ============================================================
 */

const lowRecession =
  runScenario(
    "Bullish regime with low recession risk",
    {
      technical:
        technical(
          "BULLISH",
        ),

      macro:
        macro(
          "BULLISH",
          RECESSION_RISK.LOW,
        ),

      breadth:
        breadth(
          0.5,
        ),

      liquidity:
        liquidity(
          0.5,
          "EXPANDING",
        ),

      volatility:
        volatility({
          score: 0.2,
        }),
    },
  );

const highRecession =
  runScenario(
    "Same bullish regime with high recession risk",
    {
      technical:
        technical(
          "BULLISH",
        ),

      macro:
        macro(
          "BULLISH",
          RECESSION_RISK.HIGH,
        ),

      breadth:
        breadth(
          0.5,
        ),

      liquidity:
        liquidity(
          0.5,
          "EXPANDING",
        ),

      volatility:
        volatility({
          score: 0.2,
        }),
    },
  );

assertCondition(
  Number(
    highRecession
      .compositeScore,
  ) <
    Number(
      lowRecession
        .compositeScore,
    ),
  "Higher recession risk should reduce the bullish composite score.",
);

/**
 * ============================================================
 * 8. MISSING BREADTH
 * ============================================================
 */

runScenario(
  "Missing breadth data",
  {
    technical:
      technical(
        "BULLISH",
      ),

    macro:
      macro(
        "SLIGHTLY_BULLISH",
      ),

    breadth: null,

    liquidity:
      liquidity(
        0.4,
      ),

    volatility:
      volatility(),
  },
  (result) => {
    assertCondition(
      result.warnings.some(
        (item) =>
          String(item)
            .toLowerCase()
            .includes(
              "breadth",
            ),
      ),
      "Missing breadth should produce a warning.",
    );
  },
);

/**
 * ============================================================
 * 9. MISSING LIQUIDITY
 * ============================================================
 */

runScenario(
  "Missing liquidity data",
  {
    technical:
      technical(
        "BULLISH",
      ),

    macro:
      macro(
        "SLIGHTLY_BULLISH",
      ),

    breadth:
      breadth(
        0.3,
      ),

    liquidity: null,

    volatility:
      volatility(),
  },
  (result) => {
    assertCondition(
      result.warnings.some(
        (item) =>
          String(item)
            .toLowerCase()
            .includes(
              "liquidity",
            ),
      ),
      "Missing liquidity should produce a warning.",
    );
  },
);

/**
 * ============================================================
 * 10. CONFLICTING ENGINES
 * ============================================================
 *
 * This scenario is intentionally important.
 *
 * It helps expose whether confidence is too high when strong
 * signals disagree with one another.
 */

const conflict =
  runScenario(
    "Conflicting strong engines",
    {
      technical:
        technical(
          "STRONG_BULLISH",
        ),

      macro:
        macro(
          "BEARISH",
          RECESSION_RISK.HIGH,
        ),

      breadth:
        breadth(
          1,
        ),

      liquidity:
        liquidity(
          -1,
          "CONTRACTING",
        ),

      volatility:
        volatility({
          score: 0.25,
        }),
    },
  );

console.log(
  "\nCONFLICT DIAGNOSTIC",
);

console.log(
  "Regime:",
  conflict.regime,
);

console.log(
  "Composite:",
  conflict.compositeScore,
);

console.log(
  "Confidence:",
  conflict.confidence,
);

if (
  conflict.confidence >
  0.75
) {
  console.warn(
    "WARNING: Conflicting strong signals produced high confidence. Confidence logic should later incorporate signal agreement.",
  );
}

/**
 * ============================================================
 * 11. ALL DATA MISSING
 * ============================================================
 */

runScenario(
  "All market regime inputs missing",
  {},
  (result) => {
    assertCondition(
      result.approved === true,
      "Missing inputs should be handled without throwing.",
    );

    assertCondition(
      result.regime ===
        MARKET_REGIME
          .SIDEWAYS,
      "All missing data should not produce a directional regime.",
    );

    assertCondition(
      result.direction ===
        "NEUTRAL",
      "All missing inputs should result in NEUTRAL direction.",
    );

    assertCondition(
      result.warnings.length >
        0,
      "Missing inputs should produce warnings.",
    );
  },
);

/**
 * ============================================================
 * FINAL
 * ============================================================
 */

console.log(
  "\n====================================",
);

console.log(
  "SUCCESS — MARKET REGIME ENGINE TESTS PASSED",
);

console.log(
  "====================================\n",
);
