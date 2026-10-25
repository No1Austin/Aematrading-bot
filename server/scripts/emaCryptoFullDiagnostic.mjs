
/**
 * EMA Crypto Full Diagnostic
 * Run from server:
 * node scripts/emaCryptoFullDiagnostic.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

if (!existsSync(join(root, "src/crypto"))) {
  console.error("Run from the EMA server directory.");
  process.exit(2);
}

const runDiscovery = process.argv.includes("--discovery");

const report = {
  generatedAt: new Date().toISOString(),
  mode: "READ_ONLY_DIAGNOSTICS",
  stages: [],
  summary: {},
};

const stages = [
  ["Discovery policy", "scripts/cryptoPolicyDiagnostic.js"],
  ["BULL/BEAR direction", "scripts/cryptoPhase5_0DirectionalContractDiagnostic.js"],
  ["Market regime", "scripts/cryptoPhase5_3MarketRegimeDiagnostic.js"],
  ["Momentum", "scripts/cryptoPhase5_3MomentumDiagnostic.js"],
  ["Futures risk", "scripts/cryptoPhase5_9FuturesRiskDiagnostic.js"],
  ["Dynamic stop", "scripts/cryptoPhase5_10DynamicStopDiagnostic.js"],
  ["Quant setup economics", "scripts/emaQuantSetupEconomics.test.js"],
  ["Quant research readiness", "scripts/emaQuantResearchReadiness.test.js"],
  ["Quant market identity", "scripts/emaQuantMarketIdentity.test.js"],
  ["Quant feature smoke", "scripts/emaQuantFeatureSmokeTest.js"],
  ["Quant research cycle", "scripts/emaQuantResearchCycle.test.js"],
  ["Quant outcome batch", "scripts/emaQuantOutcomeBatch.test.js"],
];

if (runDiscovery) {
  stages.push([
    "Crypto discovery",
    "scripts/cryptoScannerDiagnostic.js",
  ]);
}

for (const [stage, file] of stages) {
  console.log("\n" + "=".repeat(60));
  console.log(stage);
  console.log(file);
  console.log("=".repeat(60));

  if (!existsSync(join(root, file))) {
    report.stages.push({
      stage,
      file,
      status: "MISSING",
    });
    console.log("Diagnostic script not found.");
    continue;
  }

  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    env: {
      ...process.env,
      LIVE_EXECUTION: "false",
      EXECUTION_AUTHORITY: "false",
      ENABLE_LIVE_TRADING: "false",
    },
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 5 * 1024 * 1024,
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (stdout) console.log(stdout.slice(-10000));
  if (stderr) console.error(stderr.slice(-5000));

  const status =
    result.error?.code === "ETIMEDOUT"
      ? "TIMEOUT"
      : result.status === 0
        ? "EXIT_OK"
        : "FAILED";

  report.stages.push({
    stage,
    file,
    status,
    exitCode: result.status,
    error: result.error?.message ?? null,
    stdout: stdout.slice(-30000),
    stderr: stderr.slice(-10000),
  });

  console.log("RESULT:", status);
}

report.summary = Object.fromEntries(
  ["EXIT_OK", "FAILED", "TIMEOUT", "MISSING"].map(
    (status) => [
      status,
      report.stages.filter((x) => x.status === status).length,
    ]
  )
);

const folder = join(root, "diagnostic-reports");
mkdirSync(folder, { recursive: true });

const path = join(
  folder,
  `ema-crypto-full-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`
);

writeFileSync(path, JSON.stringify(report, null, 2));

console.log("\nDIAGNOSTIC REPORT:", path);
console.log("SUMMARY:", report.summary);
console.log(
  "EXIT_OK only means a script exited successfully; it does not prove trade quality."
);

if (report.summary.FAILED || report.summary.TIMEOUT) {
  process.exitCode = 1;
}
