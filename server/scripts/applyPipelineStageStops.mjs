// server/scripts/applyPipelineStageStops.mjs
//
// One-time migration for stage-specific integration tests.
// It adds a stopAfter boundary to runTradingAnalysis({...}) calls so
// each suite tests the stage named by the file instead of every
// downstream engine added later.
//
// Safe to run repeatedly: files already containing stopAfter are skipped.

import fs from "node:fs";
import path from "node:path";

const mappings = [
  [
    "src/tests/portfolioRiskPipeline.integration.test.js",
    "PORTFOLIO_RISK",
  ],
  [
    "src/tests/correlationExposurePipeline.integration.test.js",
    "CORRELATION_EXPOSURE",
  ],
  [
    "src/tests/volatilityRiskPipeline.integration.test.js",
    "VOLATILITY_RISK",
  ],
  [
    "src/tests/drawdownRecoveryPipeline.integration.test.js",
    "DRAWDOWN_RECOVERY",
  ],
  [
    "src/tests/liquidityStressPipeline.integration.test.js",
    "LIQUIDITY_STRESS",
  ],
  [
    "src/tests/executionTimingPipeline.integration.test.js",
    "EXECUTION_TIMING",
  ],
  [
    "src/tests/marketShockHaltPipeline.integration.test.js",
    "MARKET_SHOCK_HALT",
  ],
  [
    "src/tests/orderExecutionQualityPipeline.integration.test.js",
    "ORDER_EXECUTION_QUALITY",
  ],
];

let changed = 0;

for (
  const [
    relativePath,
    stage,
  ] of mappings
) {
  const filePath =
    path.resolve(relativePath);

  if (
    !fs.existsSync(filePath)
  ) {
    console.log(
      `SKIP missing: ${relativePath}`,
    );
    continue;
  }

  let source =
    fs.readFileSync(
      filePath,
      "utf8",
    );

  if (
    source.includes(
      `stopAfter: "${stage}"`,
    )
  ) {
    console.log(
      `OK already patched: ${relativePath}`,
    );
    continue;
  }

  const callPattern =
    /runTradingAnalysis\s*\(\s*\{/g;

  if (
    !callPattern.test(source)
  ) {
    console.log(
      `SKIP no runTradingAnalysis call: ${relativePath}`,
    );
    continue;
  }

  source =
    source.replace(
      /runTradingAnalysis\s*\(\s*\{/g,
      (match) =>
        `${match}\n    stopAfter: "${stage}",`,
    );

  fs.writeFileSync(
    filePath,
    source,
  );

  changed += 1;

  console.log(
    `PATCHED ${relativePath} -> ${stage}`,
  );
}

console.log(
  `Done. Patched ${changed} integration test file(s).`,
);
