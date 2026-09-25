import fs from "node:fs";
import path from "node:path";
import runTechnical from "../src/crypto/analysis/cryptoTechnicalEngine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fundamentalSource =
  fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/crypto/analysis/cryptoFundamentalEngine.js",
    ),
    "utf8",
  );

const neutralPlaceholderKeys = [
  "emissions",
  "unlocks",
  "burns",
  "staking",
  "tokenUtility",
  "holderConcentration",
  "fdvToRevenue",
  "marketCapToRevenue",
  "feesToValuation",
];

for (const key of neutralPlaceholderKeys) {
  const keyIndex =
    fundamentalSource.indexOf(
      `key: "${key}"`,
    );

  assert(
    keyIndex >= 0,
    `Could not locate metric block for ${key}.`,
  );

  const block =
    fundamentalSource.slice(
      keyIndex,
      keyIndex + 260,
    );

  assert(
    /score:\s*null\s*,/.test(block),
    `Unimplemented metric ${key} must use score: null, not neutral evidence.`,
  );

  assert(
    !/score:\s*50\s*,/.test(block),
    `Fake neutral score remains for ${key}.`,
  );
}

assert(
  /pillar\.configuredWeight\s*\*\s*\(pillar\.coverage\s*\/\s*100\)/m.test(
    fundamentalSource,
  ),
  "Fundamental representedWeight must include internal pillar coverage.",
);

const technical50 =
  await runTechnical({
    measurements: {
      change1hPercent: 2,
      change4hPercent: 4,
    },
    scannerScore: 70,
    directionEdge: 10,
    preferredDirection: "SHORT",
  });

assert(
  technical50?.approved === true,
  "Two-horizon Technical should complete.",
);

assert(
  Number(
    technical50?.evidence?.coverage,
  ) === 50,
  "Two horizons must equal 50% Technical coverage.",
);

assert(
  technical50?.direction === "LONG",
  "Technical direction must follow market evidence, not preferredDirection.",
);

assert(
  technical50?.evidence
    ?.discoveryDirectionAuthority === false,
  "Discovery direction must have no Technical direction authority.",
);

const technical100 =
  await runTechnical({
    measurements: {
      change1hPercent: -2,
      change4hPercent: -4,
      change24hPercent: -8,
      change7dPercent: -12,
    },
    scannerScore: 70,
    directionEdge: 10,
    preferredDirection: "LONG",
  });

assert(
  Number(
    technical100?.evidence?.coverage,
  ) === 100,
  "Four horizons must equal 100% Technical coverage.",
);

assert(
  technical100?.direction === "SHORT",
  "Bearish market evidence must produce SHORT regardless of discovery preference.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.24",
  technicalCoverage: {
    twoHorizons: 50,
    fourHorizons: 100,
    discoveryDirectionAuthority: false
  },
  fundamentalCoverage: {
    internalMetricCoverageWeighted: true,
    fakeNeutralFutureMetricsRemoved: true,
    correctedMetrics: neutralPlaceholderKeys
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage:
    "QUALIFICATION2_COVERAGE_CONTRACT_AUDIT"
}, null, 2));
