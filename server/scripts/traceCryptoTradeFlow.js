/**
 * AEMA CRYPTO — SINGLE TOKEN END-TO-END TRACE
 *
 * Usage:
 *   node scripts/traceCryptoTradeFlow.js BTCUSDT
 *   node scripts/traceCryptoTradeFlow.js ETH
 *
 * Purpose:
 * - Push ONE real token through the existing crypto scanner/trading path.
 * - Do not fake missing evidence.
 * - Record where the token passes, blocks, or loses required fields.
 * - PAPER ONLY. No live execution path is enabled here.
 *
 * Output:
 *   logs/crypto-trace-<SYMBOL>-<timestamp>.json
 */

import fs from "node:fs/promises";
import path from "node:path";

import { getCryptoUniverse } from "../src/crypto/universe/cryptoUniverseProvider.js";
import { buildCryptoMeasurements } from "../src/crypto/scanner/cryptoMeasurementProvider.js";
import { buildCryptoDiscoveryIntelligence } from "../src/crypto/analysis/cryptoDiscoveryIntelligence.js";
import { scanCryptoMarket } from "../src/crypto/scanner/cryptoScanner.js";

import {
  cryptoPaperLedger,
  cryptoPaperRuntime,
  cryptoPaperExchange,
  cryptoTradingRuntimeSupervisor,
} from "../src/crypto/runtime/cryptoRuntimeContainer.js";

import {
  executeAuthorizedCryptoPaperCandidates,
} from "../src/crypto/execution/cryptoAuthorizedPaperOrderExecutor.js";

const requested = String(process.argv[2] ?? "BTCUSDT")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");

const EXECUTE_PAPER = process.argv.includes("--execute-paper");

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tokenBase(value) {
  let s = upper(value).replace(/[^A-Z0-9]/g, "");
  for (const quote of ["USDT", "USDC", "BUSD", "USD"]) {
    if (s.endsWith(quote) && s.length > quote.length) {
      return s.slice(0, -quote.length);
    }
  }
  return s;
}

function assetKeys(asset) {
  return new Set(
    [
      asset?.symbol,
      asset?.baseSymbol,
      asset?.baseAsset,
      asset?.ticker,
      asset?.code,
      asset?.id,
      asset?.marketSymbol,
      asset?.exchangeSymbol,
      asset?.binanceSymbol,
      asset?.canonicalSymbol,
    ]
      .filter(Boolean)
      .flatMap(value => {
        const v = upper(value).replace(/[^A-Z0-9]/g, "");
        return [v, tokenBase(v)];
      }),
  );
}

function matchesAsset(asset, query) {
  const q = upper(query).replace(/[^A-Z0-9]/g, "");
  const base = tokenBase(q);
  const keys = assetKeys(asset);
  return keys.has(q) || keys.has(base);
}

function candidateSymbol(candidate) {
  return upper(
    candidate?.paperExecutionGate?.symbol ??
    candidate?.symbol ??
    candidate?.marketSymbol ??
    candidate?.asset?.symbol ??
    candidate?.measurement?.symbol
  );
}

function pickToken(rows, query) {
  const list = Array.isArray(rows) ? rows : [];
  const q = upper(query).replace(/[^A-Z0-9]/g, "");
  const base = tokenBase(q);

  return (
    list.find(row => {
      const symbol = candidateSymbol(row).replace(/[^A-Z0-9]/g, "");
      return symbol === q;
    }) ??
    list.find(row => {
      const symbol = candidateSymbol(row).replace(/[^A-Z0-9]/g, "");
      return tokenBase(symbol) === base;
    }) ??
    null
  );
}

function blockersOf(value) {
  const possibilities = [
    value?.blockers,
    value?.reasons,
    value?.qualification2?.blockers,
    value?.qualification2?.reasons,
    value?.finalRevalidation?.blockers,
    value?.finalRevalidation?.reasons,
    value?.tradingIntelligence?.entryGate?.blockers,
    value?.tradingIntelligence?.riskPlan?.blockers,
    value?.paperExecutionGate?.blockers,
  ];

  return possibilities
    .filter(Array.isArray)
    .flat()
    .filter(Boolean);
}

function stage(name, status, details = {}) {
  const row = {
    stage: name,
    status,
    at: new Date().toISOString(),
    ...details,
  };

  const icon =
    status === "PASS" ? "✓" :
    status === "BLOCKED" ? "✗" :
    status === "MISSING" ? "!" :
    "•";

  console.log(`\n${icon} ${name}: ${status}`);

  const compact = {
    symbol: row.symbol,
    decision: row.decision,
    approved: row.approved,
    reason: row.reason,
    blockers: row.blockers,
    entryPrice: row.entryPrice,
    stopPrice: row.stopPrice,
    targetPrice: row.targetPrice,
    riskReward: row.riskReward,
    positionSizeUsd: row.positionSizeUsd,
    quantity: row.quantity,
    equity: row.equity,
    leverage: row.leverage,
  };

  for (const [key, value] of Object.entries(compact)) {
    if (value !== undefined && value !== null &&
        !(Array.isArray(value) && value.length === 0)) {
      console.log(`  ${key}:`, value);
    }
  }

  return row;
}

async function resolveFreshCandidateProvider() {
  const mod = await import(
    "../src/crypto/revalidation/cryptoCanonicalFreshMarketProvider.js"
  );

  const preferred = [
    "refreshCanonicalCryptoCandidate",
    "getCanonicalFreshCryptoMarket",
    "getCryptoCanonicalFreshMarket",
    "refreshCryptoCandidateAsset",
    "refreshCandidateAsset",
    "default",
  ];

  for (const name of preferred) {
    if (typeof mod[name] === "function") {
      return { fn: mod[name], exportName: name };
    }
  }

  const firstFunction = Object.entries(mod)
    .find(([, value]) => typeof value === "function");

  if (firstFunction) {
    return { fn: firstFunction[1], exportName: firstFunction[0] };
  }

  throw new Error(
    `NO_REFRESH_FUNCTION_EXPORTED. Available exports: ${Object.keys(mod).join(", ")}`
  );
}

function summarizeRiskPlan(candidate) {
  const risk =
    candidate?.riskPlan ??
    candidate?.tradingIntelligence?.riskPlan ??
    null;

  return {
    present: Boolean(risk),
    approved: risk?.approved === true,
    status: risk?.status ?? null,
    direction: risk?.direction ?? null,
    entryPrice: finite(risk?.entryPrice),
    accountEquity: finite(risk?.accountEquity),
    accountRiskPercent: finite(risk?.accountRiskPercent),
    positionSizeUsd: finite(risk?.sizing?.positionSizeUsd),
    riskBudgetUsd: finite(risk?.sizing?.riskBudgetUsd),
    rawNotionalUsd: finite(risk?.sizing?.rawNotionalUsd),
    maximumNotionalUsd: finite(risk?.sizing?.maximumNotionalUsd),
    leverage: finite(risk?.leverage?.recommended),
    stopPrice: finite(
      risk?.stop?.initialStopPrice ??
      risk?.stop?.currentStopPrice
    ),
    stopDistancePercent: finite(risk?.stop?.stopDistancePercent),
    targets: risk?.targets ?? null,
    blockers: Array.isArray(risk?.blockers) ? risk.blockers : [],
    evidence: risk?.evidence ?? null,
    raw: risk,
  };
}

async function main() {
  const trace = {
    requested,
    base: tokenBase(requested),
    mode: "PAPER_DIAGNOSTIC",
    executePaper: EXECUTE_PAPER,
    liveExecution: false,
    startedAt: new Date().toISOString(),
    stages: [],
  };

  console.log("\n======================================================");
  console.log(" AEMA CRYPTO — SINGLE TOKEN END-TO-END TRACE");
  console.log("======================================================");
  console.log(" Token:", requested);
  console.log(" Paper execution:", EXECUTE_PAPER ? "ENABLED FOR THIS TRACE" : "DRY TRACE");
  console.log(" Live execution: DISABLED");

  // 01 — shared account before trace
  const accountBefore = cryptoPaperLedger.getSnapshot();
  trace.accountBefore = accountBefore;
  trace.stages.push(stage("01 PAPER ACCOUNT BEFORE", "PASS", {
    equity: finite(accountBefore?.equity),
    positions: cryptoPaperLedger.getOpenPositions?.() ?? [],
  }));

  // 02 — universe
  let universe;
  try {
    universe = await getCryptoUniverse({
      refresh: true,
      maximumAssets: 500,
      includeDexDiscovery: true,
    });
  } catch (error) {
    trace.stages.push(stage("02 UNIVERSE", "BLOCKED", {
      reason: error?.message ?? String(error),
    }));
    throw Object.assign(new Error("TRACE_STOPPED_AT_UNIVERSE"), { trace });
  }

  const assets = Array.isArray(universe?.assets) ? universe.assets : [];
  const asset = assets.find(row => matchesAsset(row, requested)) ?? null;

  trace.stages.push(stage("02 UNIVERSE", asset ? "PASS" : "BLOCKED", {
    symbol: asset?.symbol ?? requested,
    universeAssets: assets.length,
    reason: asset ? null : "TOKEN_NOT_FOUND_IN_CANONICAL_UNIVERSE",
    selectedAsset: asset,
  }));

  if (!asset) {
    throw Object.assign(new Error("TOKEN_NOT_FOUND_IN_CANONICAL_UNIVERSE"), { trace });
  }

  // 03 — measurement
  const measurements = buildCryptoMeasurements({ assets: [asset] });
  const measurement = measurements?.[0] ?? null;

  if (measurement) {
    const intelligence = buildCryptoDiscoveryIntelligence(measurement);
    measurements[0] = {
      ...measurement,
      discoveryIntelligence: intelligence,
      integrity: {
        score: intelligence?.projectIntegrity?.score ?? null,
        criticalFlags: intelligence?.projectIntegrity?.criticalFlags ?? [],
      },
    };
  }

  trace.stages.push(stage("03 MEASUREMENT", measurement ? "PASS" : "BLOCKED", {
    symbol: measurement?.symbol ?? asset?.symbol,
    reason: measurement ? null : "NO_SCANNER_MEASUREMENT",
    measurement: measurements?.[0] ?? null,
  }));

  if (!measurement) {
    throw Object.assign(new Error("NO_SCANNER_MEASUREMENT"), { trace });
  }

  // 04 — final revalidation refresh provider
  const freshProvider = await resolveFreshCandidateProvider();
  trace.stages.push(stage("04 FRESH REFRESH PROVIDER", "PASS", {
    providerExport: freshProvider.exportName,
  }));

  // 05 onward — canonical scanner path, but only this token is supplied.
  // maximumCandidates=1 ensures this diagnostic does not introduce another asset.
  let scanner;
  try {
    scanner = await scanCryptoMarket({
      measurements,
      maximumCandidates: 1,
      refreshCandidateAsset: freshProvider.fn,

      paperLedger: cryptoPaperLedger,
      paperRuntime: cryptoPaperRuntime,
      runtimeSupervisor: cryptoTradingRuntimeSupervisor,

      executableOpportunityOptions: {
        maximumSelections: 1,

        // Supply the SAME ledger equity to the executable/risk path.
        accountProvider: async () => {
          const account = cryptoPaperLedger.getSnapshot();
          return {
            ...account,
            accountEquity: account?.equity,
            source: "TRACE_SHARED_PAPER_LEDGER",
            paperExecution: true,
            executionAuthority: false,
            liveExecution: false,
          };
        },
      },
    });
  } catch (error) {
    trace.stages.push(stage("05 SCANNER PIPELINE", "BLOCKED", {
      reason: error?.message ?? String(error),
      stack: error?.stack ?? null,
    }));
    throw Object.assign(new Error("SCANNER_PIPELINE_FAILED"), { trace });
  }

  trace.scannerSummary = {
    opportunityRanking: scanner?.opportunityRanking ?? null,
    finalRevalidation: scanner?.finalRevalidation ?? null,
    executableOpportunityCoordination:
      scanner?.executableOpportunityCoordination ?? null,
    paperExecutionAuthorityGate:
      scanner?.paperExecutionAuthorityGate ?? null,
  };

  const q1 = pickToken(scanner?.allResults, requested);
  trace.stages.push(stage("05 Q1 QUALIFICATION", q1?.qualified === true ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(q1) || requested,
    approved: q1?.qualified === true,
    reason: q1 ? null : "TOKEN_MISSING_FROM_Q1_RESULTS",
    blockers: blockersOf(q1),
    raw: q1,
  }));

  const researched = pickToken(scanner?.deepResearchCandidates, requested);
  trace.stages.push(stage("06 DEEP RESEARCH", researched ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(researched) || requested,
    reason: researched ? null : "TOKEN_NOT_SELECTED_FOR_DEEP_RESEARCH",
    researchStatus: researched?.researchStatus ?? null,
    raw: researched,
  }));

  const q2 =
    pickToken(scanner?.qualification2QualifiedCandidates, requested) ??
    researched;

  const q2Approved = q2?.qualification2?.qualified === true;
  trace.stages.push(stage("07 Q2 QUALIFICATION", q2Approved ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(q2) || requested,
    approved: q2Approved,
    decision: q2?.qualification2?.decision ?? null,
    blockers: blockersOf(q2),
    raw: q2?.qualification2 ?? null,
  }));

  const revalidated =
    pickToken(scanner?.revalidatedCandidates, requested) ??
    pickToken(scanner?.finalRevalidatedCandidates, requested) ??
    null;

  const finalApproved = revalidated?.finalRevalidation?.approved === true;
  trace.stages.push(stage("08 FINAL REVALIDATION", finalApproved ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(revalidated) || requested,
    approved: finalApproved,
    decision: revalidated?.finalRevalidation?.decision ?? null,
    reason: revalidated?.finalRevalidation?.reason ?? null,
    blockers: blockersOf(revalidated),
    raw: revalidated?.finalRevalidation ?? null,
    freshness: revalidated?.freshRevalidationEvidence ?? null,
  }));

  const evaluated =
    pickToken(scanner?.executableEvaluatedCandidates, requested) ??
    pickToken(
      (scanner?.executableOpportunityEvaluations ?? []).map(row => row?.candidate ?? row),
      requested
    ) ??
    null;

  const trading = evaluated?.tradingIntelligence ?? null;
  const executionMarket =
    evaluated?.executionMarketEvidence ??
    trading?.executionMarketEvidence ??
    null;
  const preEntry =
    evaluated?.preEntrySetup ??
    trading?.preEntrySetup ??
    null;

  trace.stages.push(stage("09 FUTURES EXECUTION MARKET", executionMarket?.approved === true ? "PASS" : "MISSING", {
    symbol: candidateSymbol(evaluated) || requested,
    approved: executionMarket?.approved === true,
    reason: executionMarket?.reason ?? executionMarket?.blocker ?? null,
    spreadPercent: finite(executionMarket?.executionContext?.spreadPercent),
    liquidityScore: finite(executionMarket?.executionContext?.liquidityScore),
    slippagePercent: finite(executionMarket?.executionContext?.slippagePercent),
    markPrice: finite(executionMarket?.market?.markPrice),
    raw: executionMarket,
  }));

  trace.stages.push(stage("10 PRE-ENTRY SETUP", preEntry?.approved === true ? "PASS" : "MISSING", {
    symbol: candidateSymbol(evaluated) || requested,
    approved: preEntry?.approved === true,
    direction: preEntry?.direction ?? null,
    reason: preEntry?.reason ?? preEntry?.blocker ?? null,
    entryPrice: finite(preEntry?.entryPrice),
    stopPrice: finite(preEntry?.stopPrice ?? preEntry?.entryRiskContext?.stopPrice),
    targetPrice: finite(preEntry?.targetPrice ?? preEntry?.entryRiskContext?.targetPrice),
    riskReward: finite(preEntry?.riskReward ?? preEntry?.entryRiskContext?.riskReward),
    raw: preEntry,
  }));

  const entryGate =
    trading?.entryGate ??
    evaluated?.entryQualification ??
    null;

  trace.stages.push(stage("11 ENTRY QUALIFICATION", entryGate?.approved === true ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(evaluated) || requested,
    approved: entryGate?.approved === true,
    direction: entryGate?.direction ?? null,
    blockers: entryGate?.blockers ?? [],
    entryQuality: finite(entryGate?.entryQuality),
    raw: entryGate,
  }));

  const risk = summarizeRiskPlan(evaluated ?? {});
  trace.stages.push(stage("12 FUTURES RISK PLAN", risk.approved ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(evaluated) || requested,
    approved: risk.approved,
    reason: risk.status,
    blockers: risk.blockers,
    decision: risk.direction,
    entryPrice: risk.entryPrice,
    stopPrice: risk.stopPrice,
    positionSizeUsd: risk.positionSizeUsd,
    equity: risk.accountEquity,
    leverage: risk.leverage,
    riskPlan: risk,
  }));

  const selected = pickToken(scanner?.executableSelectedCandidates, requested);
  trace.stages.push(stage("13 EXECUTABLE SELECTION", selected ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(selected) || requested,
    approved: Boolean(selected),
    decision:
      selected?.tradingIntelligence?.decision?.direction ??
      selected?.finalRevalidation?.decision ??
      null,
    reason: selected
      ? null
      : scanner?.executableOpportunityCoordination?.status ??
        "NO_EXECUTABLE_QUALIFIED_OPPORTUNITY",
    raw: selected,
  }));

  const authorized = pickToken(scanner?.paperAuthorizedCandidates, requested);
  trace.stages.push(stage("14 PAPER AUTHORITY", authorized ? "PASS" : "BLOCKED", {
    symbol: candidateSymbol(authorized) || requested,
    approved: authorized?.paperExecutionGate?.approved === true,
    decision: authorized?.paperExecutionGate?.decision ?? null,
    reason:
      authorized?.paperExecutionGate?.reason ??
      (authorized ? null : "PAPER_AUTHORITY_NOT_GRANTED"),
    riskPlanPresent: Boolean(
      authorized?.riskPlan ??
      authorized?.tradingIntelligence?.riskPlan
    ),
    raw: authorized?.paperExecutionGate ?? null,
  }));

  // Critical handoff comparison.
  if (authorized) {
    const authorizedRisk = summarizeRiskPlan(authorized);
    const gatePrice = finite(
      authorized?.freshRevalidationEvidence?.measurements?.priceUsd ??
      authorized?.finalRevalidation?.market?.priceUsd
    );

    trace.stages.push(stage("15 EXECUTOR HANDOFF AUDIT",
      authorizedRisk.approved ? "PASS" : "MISSING", {
        symbol: candidateSymbol(authorized),
        riskPlanPresent: authorizedRisk.present,
        riskPlanApproved: authorizedRisk.approved,
        riskPlanEntryPrice: authorizedRisk.entryPrice,
        executorLegacyPrice: gatePrice,
        riskPlanPositionSizeUsd: authorizedRisk.positionSizeUsd,
        executorCurrentlyUsesRiskPlanSizing: false,
        finding:
          "Current executor still derives quantity from maximumPositionNotionalPercent instead of riskPlan.sizing.positionSizeUsd.",
      }
    ));
  } else {
    trace.stages.push(stage("15 EXECUTOR HANDOFF AUDIT", "BLOCKED", {
      reason: "NO_AUTHORIZED_CANDIDATE_REACHED_EXECUTOR",
    }));
  }

  // Optional actual PAPER execution. Default is dry trace.
  if (EXECUTE_PAPER && authorized) {
    const execution = await executeAuthorizedCryptoPaperCandidates({
      candidates: [authorized],
      ledger: cryptoPaperLedger,
      runtime: cryptoPaperRuntime,
      exchange: cryptoPaperExchange,
      maximumOrdersPerScan: 1,
    });

    trace.paperExecution = execution;

    trace.stages.push(stage("16 PAPER ORDER / FILL",
      execution?.results?.[0]?.approved === true ? "PASS" : "BLOCKED", {
        symbol: candidateSymbol(authorized),
        approved: execution?.results?.[0]?.approved === true,
        reason:
          execution?.results?.[0]?.reason ??
          execution?.results?.[0]?.status ??
          null,
        quantity: finite(execution?.results?.[0]?.sizing?.requestedQuantity),
        raw: execution,
      }
    ));
  } else {
    trace.stages.push(stage("16 PAPER ORDER / FILL", "SKIPPED", {
      reason: EXECUTE_PAPER
        ? "NO_AUTHORIZED_CANDIDATE"
        : "DRY_TRACE_USE_--execute-paper_TO_SUBMIT_TO_PAPER_ADAPTER",
    }));
  }

  const accountAfter = cryptoPaperLedger.getSnapshot();
  trace.accountAfter = accountAfter;
  trace.stages.push(stage("17 LEDGER AFTER", "PASS", {
    equity: finite(accountAfter?.equity),
    positions: cryptoPaperLedger.getOpenPositions?.() ?? [],
  }));

  trace.runtimeState = cryptoPaperRuntime.getRuntimeState?.() ?? null;
  trace.exchangeSnapshot = cryptoPaperExchange.getSnapshot?.() ?? null;
  trace.completedAt = new Date().toISOString();

  return trace;
}

async function writeTrace(trace) {
  const logsDir = path.resolve(process.cwd(), "logs");
  await fs.mkdir(logsDir, { recursive: true });

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const file = path.join(
    logsDir,
    `crypto-trace-${requested}-${stamp}.json`
  );

  await fs.writeFile(
    file,
    JSON.stringify(trace, null, 2),
    "utf8"
  );

  console.log("\n======================================================");
  console.log(" TRACE SAVED");
  console.log("======================================================");
  console.log(file);
  return file;
}

let trace = null;

try {
  trace = await main();
  await writeTrace(trace);

  console.log("\nTrace complete.");
  console.log(
    "Next: send me the terminal output and the generated JSON trace."
  );
} catch (error) {
  trace = error?.trace ?? trace ?? {
    requested,
    mode: "PAPER_DIAGNOSTIC",
    liveExecution: false,
    stages: [],
  };

  trace.fatalError = {
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
  trace.completedAt = new Date().toISOString();

  try {
    await writeTrace(trace);
  } catch (writeError) {
    console.error("TRACE_WRITE_FAILED:", writeError);
  }

  console.error("\nTRACE FAILED:", error?.message ?? error);
  process.exitCode = 1;
}
