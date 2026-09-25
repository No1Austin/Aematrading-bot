#!/usr/bin/env node
/**
 * AEMA Crypto Engine Profiler
 * Run from trading-bot root:
 *   node scripts/diagnoseCryptoEngines.js BTC
 *
 * Read-only diagnostic. No execution authority.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SYMBOL = String(process.argv[2] || "BTC").trim().toUpperCase();
const BASE_URL = process.env.AEMA_API_BASE_URL || "http://localhost:8000";

const p = (...parts) => path.join(ROOT, ...parts);
const mod = async (...parts) => import(pathToFileURL(p(...parts)).href);

function line(title) {
  console.log("\n" + "=".repeat(88));
  console.log(title);
  console.log("=".repeat(88));
}
function ms(n) { return `${Math.round(n)}ms`; }
function num(v) { const n=Number(v); return Number.isFinite(n) ? n : null; }
function summarize(r) {
  if (!r || typeof r !== "object") return { status:"NO_RESULT" };
  return {
    status: r.status ?? null,
    available: r?.availability?.available ?? r?.available ?? null,
    score: num(r.score),
    confidence: num(r.confidence),
    coverage: num(r.coverage ?? r.evidenceCoverage),
    direction: r.direction ?? null,
    evidenceCount:
      num(r?.availability?.evidenceCount) ??
      (Array.isArray(r.evidence) ? r.evidence.length : null),
    warning: Array.isArray(r.warnings) ? r.warnings[0] ?? null : null,
    error: Array.isArray(r.errors) ? r.errors[0] ?? null : null,
  };
}
async function timed(name, fn) {
  const start = performance.now();
  try {
    const result = await fn();
    return { name, elapsedMs: performance.now()-start, ok:true, result, summary:summarize(result) };
  } catch (error) {
    return {
      name, elapsedMs: performance.now()-start, ok:false, result:null,
      summary:{status:"ERROR", error:error instanceof Error ? error.message : String(error)}
    };
  }
}
function table(rows) {
  console.table(rows.map(x => ({
    engine:x.name,
    time:ms(x.elapsedMs),
    status:x.summary.status,
    available:x.summary.available,
    score:x.summary.score,
    confidence:x.summary.confidence,
    coverage:x.summary.coverage,
    direction:x.summary.direction,
    evidence:x.summary.evidenceCount,
    issue:x.summary.error ?? x.summary.warning ?? ""
  })));
}

line("1. LOAD CURRENT AEMA MODULES");

const adapterPath = ["server","src","crypto","scanner","cryptoScannerEngineAdapters.js"];
const universePath = ["server","src","crypto","universe","cryptoUniverseProvider.js"];
const evidencePath = ["server","src","crypto","data","providers","cryptoFundamentalEvidenceProvider.js"];
const gptPath = ["server","src","crypto","intelligence","cryptoGptIntelligenceProvider.js"];

for (const parts of [adapterPath, universePath, evidencePath, gptPath]) {
  try { await fs.access(p(...parts)); console.log("✓", parts.join("/")); }
  catch { console.log("✗", parts.join("/")); }
}

const adapters = await mod(...adapterPath);
const universe = await mod(...universePath);
const evidenceProvider = await mod(...evidencePath);
const gptProvider = await mod(...gptPath);

line("2. HTTP ENDPOINT BASELINE");

const httpRun = await timed("HTTP /scanner/engines", async () => {
  const response = await fetch(`${BASE_URL}/api/crypto/scanner/engines`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({query:SYMBOL}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP_${response.status}:${body?.error ?? body?.blocker ?? body?.status ?? "FAILED"}`);
  return body;
});
console.log({time:ms(httpRun.elapsedMs), ...httpRun.summary});

const http = httpRun.result ?? {};
const asset = http.asset;
if (!asset) throw new Error("HTTP response did not contain resolved asset; cannot profile adapters safely.");

const candidate = {
  ...asset,
  asset,
  assetId: asset.assetId ?? asset.coinGeckoId ?? asset.id ?? null,
  coinGeckoId: asset.coinGeckoId ?? asset.assetId ?? asset.id ?? null,
  symbol: asset.symbol ?? SYMBOL,
  name: asset.name ?? null,
  candidateType:
    asset.candidateType ??
    asset.type ??
    (asset.tradable === true || Number(asset?.venues?.cexCount ?? 0) > 0 ? "CEX" : "UNKNOWN"),
  query: SYMBOL,
  venues: asset.venues ?? {},
  researchOnly:true,
  executionAuthority:false,
  liveExecution:false,
};

line("3. SHARED PROVIDERS");

const fundamentalRun = await timed("Fundamental Evidence", () =>
  evidenceProvider.getCryptoFundamentalEvidence(candidate, {refresh:true})
);

const gptFn =
  gptProvider.getCryptoGptIntelligence ??
  gptProvider.default;

const gptRun = await timed("GPT Intelligence", async () => {
  if (typeof gptFn !== "function") throw new Error("GPT provider function export not found");
  return gptFn(candidate, {refresh:true});
});

console.table([
  {provider:fundamentalRun.name,time:ms(fundamentalRun.elapsedMs),status:fundamentalRun.result?.status,availableItems:fundamentalRun.result?.summary?.availableCount ?? null,error:fundamentalRun.summary.error ?? ""},
  {provider:gptRun.name,time:ms(gptRun.elapsedMs),status:gptRun.result?.status ?? null,available:gptRun.result?.approved ?? null,error:gptRun.summary.error ?? ""},
]);

const sharedFundamentalEvidence = fundamentalRun.result;
const sharedIntelligence = gptRun.result?.intelligence ?? gptRun.result ?? null;
const context = {
  ...candidate,
  sharedFundamentalEvidence,
  sharedIntelligence: {gpt: sharedIntelligence},
};

line("4. STAGE A — INDEPENDENT / SHARED BASE ENGINES");

const stageA = await Promise.all([
  timed("technical", () => adapters.runCryptoScannerTechnical(context)),
  timed("fundamental", () => adapters.runCryptoScannerFundamental(context)),
  timed("marketStructure", () => adapters.runCryptoScannerMarketStructure(context)),
  timed("liquidity", () => adapters.runCryptoScannerLiquidity(context)),
  timed("onChain", () => adapters.runCryptoScannerOnChain(context)),
  timed("narrative", () => adapters.runCryptoScannerNarrative(context)),
  timed("news", () => adapters.runCryptoScannerNews(context)),
  timed("events", () => adapters.runCryptoScannerEvents(context)),
]);
table(stageA);

const byName = Object.fromEntries(stageA.map(x => [x.name,x.result]));
const stageBContext = {
  ...context,
  sharedEngineResults:{
    technical:byName.technical,
    marketStructure:byName.marketStructure,
    liquidity:byName.liquidity,
    onChain:byName.onChain,
  }
};

line("5. STAGE B — DERIVED / SAFETY ENGINES");

const stageB = await Promise.all([
  timed("momentum", () => adapters.runCryptoScannerMomentum(stageBContext)),
  timed("risk", () => adapters.runCryptoScannerRisk(stageBContext)),
]);
table(stageB);

line("6. CANONICAL RESPONSE CHECK");

const canonical = {
  researchScore:http.researchScore ?? null,
  researchConfidence:http.researchConfidence ?? null,
  researchCoverage:http.researchCoverage ?? null,
  technical:summarize(http?.pillars?.technical),
  fundamental:summarize(http?.pillars?.fundamental),
  supporting:summarize(http?.pillars?.supporting),
  qualification2:http.qualification2 ?? null,
};
console.dir(canonical,{depth:5});

line("7. PERFORMANCE DIAGNOSIS");

const allRuns = [fundamentalRun,gptRun,...stageA,...stageB].sort((a,b)=>b.elapsedMs-a.elapsedMs);
table(allRuns);

const slow = allRuns.filter(x => x.elapsedMs >= 1000);
console.log("\nHTTP total:", ms(httpRun.elapsedMs));
console.log("Slow components (>=1s):");
if (!slow.length) console.log("  none");
for (const x of slow) console.log(`  ${x.name}: ${ms(x.elapsedMs)} — ${x.summary.status ?? "UNKNOWN"}`);

const unavailable = [...stageA,...stageB].filter(x => x.summary.available === false || x.summary.status === "EVIDENCE_UNAVAILABLE");
console.log("\nUnavailable/partial engines:");
if (!unavailable.length) console.log("  none");
for (const x of unavailable) {
  console.log(`  ${x.name}: ${x.summary.status}; ${x.summary.error ?? x.summary.warning ?? "evidence unavailable"}`);
}

const report = {
  generatedAt:new Date().toISOString(),
  symbol:SYMBOL,
  http:{elapsedMs:httpRun.elapsedMs, summary:httpRun.summary},
  candidate:{
    assetId:candidate.assetId, coinGeckoId:candidate.coinGeckoId,
    symbol:candidate.symbol,name:candidate.name,candidateType:candidate.candidateType
  },
  providers:{
    fundamentalEvidence:{elapsedMs:fundamentalRun.elapsedMs,summary:fundamentalRun.summary,availableCount:fundamentalRun.result?.summary?.availableCount ?? null},
    gpt:{elapsedMs:gptRun.elapsedMs,summary:gptRun.summary}
  },
  engines:Object.fromEntries([...stageA,...stageB].map(x=>[x.name,{elapsedMs:x.elapsedMs,summary:x.summary}])),
  canonical,
  ranking:allRuns.map(x=>({name:x.name,elapsedMs:x.elapsedMs,summary:x.summary})),
};

const outDir=p("diagnostics");
await fs.mkdir(outDir,{recursive:true});
const out=p("diagnostics",`crypto-engines-${SYMBOL.toLowerCase()}-profile.json`);
await fs.writeFile(out,JSON.stringify(report,null,2));

line("FINAL SUMMARY");
console.log(`HTTP total: ${ms(httpRun.elapsedMs)}`);
console.log(`Slowest component: ${allRuns[0]?.name ?? "none"} (${ms(allRuns[0]?.elapsedMs ?? 0)})`);
console.log(`Unavailable engines: ${unavailable.map(x=>x.name).join(", ") || "none"}`);
console.log(`Canonical score: ${http.researchScore ?? "N/A"}`);
console.log(`Canonical coverage: ${http.researchCoverage ?? "N/A"}`);
console.log(`Report: ${out}`);
