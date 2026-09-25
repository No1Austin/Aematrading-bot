import fs from "node:fs";
import path from "node:path";

const target =
  path.resolve(
    process.cwd(),
    "src/crypto/analysis/cryptoFundamentalEngine.js",
  );

let source =
  fs.readFileSync(
    target,
    "utf8",
  );

source =
  source.replace(
    "Phase 6.7",
    "Phase 6.24",
  );

/*
 * Remove hard-coded neutral 50 scoring for future evidence.
 * An available metric without an implemented scoring model must remain
 * unavailable to scoring rather than becoming fake neutral evidence.
 */
const neutralMetricKeys = [
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

for (const key of neutralMetricKeys) {
  const pattern =
    new RegExp(
      `(key:\\s*"${key}"[\\\\s\\\\S]*?metric:\\s*area\\\\.${key},[\\\\s\\\\S]*?score:)\\\\s*50,`,
      "m",
    );

  source =
    source.replace(
      pattern,
      `$1 null,`,
    );
}

/*
 * Pillar-level availability alone must not overstate represented evidence.
 * representedWeight now reflects the configured pillar weight multiplied
 * by the actual metric coverage inside that pillar.
 */
source =
  source.replace(
`  const representedWeight = available.reduce(
    (sum, pillar) => sum + pillar.configuredWeight,
    0,
  );`,
`  const representedWeight = available.reduce(
    (sum, pillar) =>
      sum +
      pillar.configuredWeight *
        (pillar.coverage / 100),
    0,
  );`,
  );

/*
 * Score should still be calculated from available pillar assessments.
 * Keep scoreWeight separate from evidence representedWeight.
 */
source =
  source.replace(
`  const score =
    available.reduce(
      (sum, pillar) =>
        sum + pillar.score * pillar.configuredWeight,
      0,
    ) / representedWeight;`,
`  const scoreWeight =
    available.reduce(
      (sum, pillar) =>
        sum + pillar.configuredWeight,
      0,
    );

  const score =
    scoreWeight > 0
      ? available.reduce(
          (sum, pillar) =>
            sum +
            pillar.score *
              pillar.configuredWeight,
          0,
        ) / scoreWeight
      : null;`,
  );

source =
  source.replace(
`  const directionalWeight = directional.reduce(
    (sum, pillar) => sum + pillar.configuredWeight,
    0,
  );`,
`  const directionalWeight = directional.reduce(
    (sum, pillar) =>
      sum +
      pillar.configuredWeight *
        (pillar.coverage / 100),
    0,
  );

  const directionalScoreWeight =
    directional.reduce(
      (sum, pillar) =>
        sum + pillar.configuredWeight,
      0,
    );`,
  );

source =
  source.replace(
`  const bullishStrength =
    directionalWeight > 0
      ? directional.reduce(
          (sum, pillar) =>
            sum +
            (finite(pillar.bullishStrength) ?? 50) *
              pillar.configuredWeight,
          0,
        ) / directionalWeight
      : null;`,
`  const bullishStrength =
    directionalScoreWeight > 0
      ? directional.reduce(
          (sum, pillar) =>
            sum +
            (finite(pillar.bullishStrength) ?? 50) *
              pillar.configuredWeight,
          0,
        ) / directionalScoreWeight
      : null;`,
  );

source =
  source.replace(
`  const bearishStrength =
    directionalWeight > 0
      ? directional.reduce(
          (sum, pillar) =>
            sum +
            (finite(pillar.bearishStrength) ?? 50) *
              pillar.configuredWeight,
          0,
        ) / directionalWeight
      : null;`,
`  const bearishStrength =
    directionalScoreWeight > 0
      ? directional.reduce(
          (sum, pillar) =>
            sum +
            (finite(pillar.bearishStrength) ?? 50) *
              pillar.configuredWeight,
          0,
        ) / directionalScoreWeight
      : null;`,
  );

source =
  source.replace(
`  const directionalCoverage =
    clamp(directionalWeight * 100);`,
`  const directionalCoverage =
    clamp(directionalWeight * 100);`,
  );

source =
  source.replace(
    'version: "6.7"',
    'version: "6.24"',
  );

fs.writeFileSync(
  target,
  source,
);

console.log(
  "Patched cryptoFundamentalEngine.js for Phase 6.24",
);
