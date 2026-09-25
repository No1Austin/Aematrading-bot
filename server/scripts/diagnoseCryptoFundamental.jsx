#!/usr/bin/env node
/**
 * AEMA Crypto — Fundamental Pipeline Diagnostic
 *
 * Run from PROJECT ROOT:
 *   node scripts/diagnoseCryptoFundamental.js BTC
 *
 * Optional:
 *   AEMA_API_BASE=http://localhost:8000 node scripts/diagnoseCryptoFundamental.js ETH
 *
 * Purpose:
 * - checks backend HTTP endpoint
 * - resolves the candidate/asset identity
 * - calls CoinGecko provider directly
 * - calls DefiLlama provider directly
 * - calls normalized Fundamental Evidence Provider directly
 * - calls scanner engine endpoint
 * - prints exactly where evidence disappears
 *
 * Read-only diagnostic. No execution/trading authority.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SERVER = path.join(ROOT, "server");
const SRC = path.join(SERVER, "src");

const query = String(process.argv[2] || "BTC").trim().toUpperCase();
const API_BASE = String(
  process.env.AEMA_API_BASE || "http://localhost:8000"
).replace(/\/+$/, "");

const paths = {
  app: path.join(SRC, "app.js"),
  universe: path.join(SRC, "crypto", "universe", "cryptoUniverseProvider.js"),
  coinGecko: path.join(
    SRC, "crypto", "data", "providers", "coinGeckoFundamentalProvider.js"
  ),
  defiLlama: path.join(
    SRC, "crypto", "data", "providers", "defiLlamaFundamentalProvider.js"
  ),
  evidence: path.join(
    SRC, "crypto", "data", "providers", "cryptoFundamentalEvidenceProvider.js"
  ),
  adapter: path.join(
    SRC, "crypto", "scanner", "cryptoScannerEngineAdapters.js"
  ),
};

const report = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  query,
  apiBase: API_BASE,
  files: {},
  http: {},
  candidate: null,
  providers: {},
  normalizedEvidence: null,
  scannerFundamental: null,
  diagnosis: [],
  errors: [],
};

function section(title) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function exists(label, file) {
  const ok = fs.existsSync(file);
  report.files[label] = { path: file, exists: ok };
  console.log(`${ok ? "✓" : "✗"} ${label}: ${path.relative(ROOT, file)}`);
  return ok;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compactProvider(result) {
  return {
    approved: result?.approved ?? null,
    status: result?.status ?? null,
    reason: result?.reason ?? null,
    provider: result?.provider ?? null,
    id: result?.id ?? result?.evidence?.id ?? null,
    symbol: result?.evidence?.symbol ?? null,
    name: result?.evidence?.name ?? null,
    marketCapUsd: safeNumber(result?.evidence?.marketCapUsd),
    fdvUsd: safeNumber(result?.evidence?.fdvUsd),
    volume24hUsd: safeNumber(result?.evidence?.volume24hUsd),
    circulatingSupply: safeNumber(result?.evidence?.circulatingSupply),
    totalSupply: safeNumber(result?.evidence?.totalSupply),
    maxSupply: safeNumber(result?.evidence?.maxSupply),
    tvlUsd: safeNumber(result?.evidence?.tvlUsd),
  };
}

function countArea(area) {
  const rows = Object.values(area || {});
  return {
    available: rows.filter((x) => x?.available === true).length,
    unavailable: rows.filter((x) => x?.available === false).length,
    total: rows.length,
  };
}

function summarizeAreas(areas) {
  return Object.fromEntries(
    Object.entries(areas || {}).map(([key, value]) => [key, countArea(value)])
  );
}

async function importFile(file) {
  return import(`${pathToFileURL(file).href}?diag=${Date.now()}`);
}

async function postJson(url, body) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      json,
      rawPreview: json ? null : text.slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function deriveCandidateFromHttp(result) {
  const j = result?.json || {};
  const asset = j?.asset && typeof j.asset === "object" ? j.asset : {};

  return {
    ...asset,
    assetId:
      j?.assetId ??
      asset?.assetId ??
      asset?.coinGeckoId ??
      asset?.id ??
      null,
    coinGeckoId:
      j?.coinGeckoId ??
      asset?.coinGeckoId ??
      asset?.assetId ??
      asset?.id ??
      null,
    symbol: j?.symbol ?? asset?.symbol ?? query,
    name: j?.name ?? asset?.name ?? null,
    candidateType:
      j?.candidateType ??
      asset?.candidateType ??
      asset?.type ??
      (asset?.tradable === true || Number(asset?.venues?.cexCount || 0) > 0
        ? "CEX"
        : "UNKNOWN"),
    venues: j?.venues ?? asset?.venues ?? null,
    marketCapUsd: j?.marketCapUsd ?? asset?.marketCapUsd ?? null,
    volume24hUsd: j?.volume24hUsd ?? asset?.volume24hUsd ?? null,
  };
}

section("1. PROJECT / FILE CHECK");
const required = Object.entries(paths).filter(([key]) => key !== "app");
let missing = false;
exists("app", paths.app);
for (const [label, file] of required) {
  if (!exists(label, file)) missing = true;
}

if (missing) {
  report.errors.push(
    "One or more required files were not found. Run this script from the trading-bot project root."
  );
}

section("2. HTTP SCANNER ENDPOINT");
const httpResult = await postJson(
  `${API_BASE}/api/crypto/scanner/engines`,
  { query }
);

report.http.scannerEngines = {
  ok: httpResult.ok,
  status: httpResult.status,
  elapsedMs: httpResult.elapsedMs,
  error: httpResult.error ?? null,
};

console.log(report.http.scannerEngines);

if (httpResult.json) {
  const f = httpResult.json?.engines?.fundamental ?? null;

  report.scannerFundamental = f
    ? {
        status: f?.status ?? null,
        score: f?.score ?? null,
        confidence: f?.confidence ?? null,
        coverage: f?.coverage ?? null,
        direction: f?.direction ?? null,
        pillarsType:
          f?.pillars === null
            ? "null"
            : Array.isArray(f?.pillars)
              ? "array"
              : typeof f?.pillars,
        evidenceType:
          f?.evidence === null
            ? "null"
            : Array.isArray(f?.evidence)
              ? "array"
              : typeof f?.evidence,
        evidenceLength: Array.isArray(f?.evidence)
          ? f.evidence.length
          : null,
        evidencePreview: Array.isArray(f?.evidence)
          ? f.evidence.slice(0, 3)
          : f?.evidence ?? null,
      }
    : null;

  console.log("researchScore:", httpResult.json?.researchScore ?? null);
  console.log("researchCoverage:", httpResult.json?.researchCoverage ?? null);
  console.log("fundamental:", report.scannerFundamental);
}

report.candidate = deriveCandidateFromHttp(httpResult);

section("3. RESOLVED CANDIDATE IDENTITY");
console.log(JSON.stringify(report.candidate, null, 2));

if (!report.candidate?.assetId && query === "BTC") {
  report.diagnosis.push(
    "FAIL: scanner response did not provide an assetId/coinGeckoId for BTC."
  );
}

section("4. DIRECT COINGECKO PROVIDER");
try {
  if (!fs.existsSync(paths.coinGecko)) throw new Error("provider file missing");

  const mod = await importFile(paths.coinGecko);
  const fn =
    mod.getCoinGeckoFundamentals ??
    mod.default;

  if (typeof fn !== "function") {
    throw new Error("CoinGecko default/named export is not callable");
  }

  const result = await fn(report.candidate, { refresh: true });
  report.providers.coinGecko = compactProvider(result);
  console.log(JSON.stringify(report.providers.coinGecko, null, 2));

  if (result?.approved !== true) {
    report.diagnosis.push(
      `FAIL: CoinGecko direct provider: ${result?.reason || result?.status || "unknown error"}`
    );
  } else {
    report.diagnosis.push("PASS: CoinGecko direct provider returned evidence.");
  }
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  report.providers.coinGecko = { error: message };
  report.diagnosis.push("FAIL: CoinGecko provider could not execute.");
  report.errors.push(message);
  console.error(message);
}

section("5. DIRECT DEFILLAMA PROVIDER");
try {
  if (!fs.existsSync(paths.defiLlama)) throw new Error("provider file missing");

  const mod = await importFile(paths.defiLlama);
  const fn =
    mod.getDefiLlamaFundamentals ??
    mod.default;

  if (typeof fn !== "function") {
    throw new Error("DefiLlama default/named export is not callable");
  }

  const result = await fn(report.candidate, { refresh: true });
  report.providers.defiLlama = compactProvider(result);
  console.log(JSON.stringify(report.providers.defiLlama, null, 2));

  if (result?.approved === true) {
    report.diagnosis.push("PASS: DefiLlama direct provider returned protocol evidence.");
  } else if (query === "BTC") {
    report.diagnosis.push(
      "INFO: DefiLlama may legitimately have no protocol row for BTC; this alone must not zero the Fundamental engine."
    );
  } else {
    report.diagnosis.push(
      `INFO: DefiLlama provider unavailable: ${result?.reason || result?.status || "unknown"}`
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  report.providers.defiLlama = { error: message };
  report.errors.push(message);
  console.error(message);
}

section("6. NORMALIZED FUNDAMENTAL EVIDENCE PROVIDER");
try {
  if (!fs.existsSync(paths.evidence)) throw new Error("evidence provider file missing");

  const mod = await importFile(paths.evidence);
  const fn =
    mod.getCryptoFundamentalEvidence ??
    mod.default;

  if (typeof fn !== "function") {
    throw new Error("Fundamental evidence provider export is not callable");
  }

  if (typeof mod.clearCryptoFundamentalEvidenceCache === "function") {
    mod.clearCryptoFundamentalEvidenceCache();
  }

  const result = await fn(report.candidate, { refresh: true });

  report.normalizedEvidence = {
    approved: result?.approved ?? null,
    status: result?.status ?? null,
    version: result?.version ?? null,
    identity: result?.identity ?? null,
    summary: result?.summary ?? null,
    providers: result?.providers ?? null,
    areaCounts: summarizeAreas(result?.areas),
    areas: result?.areas ?? null,
  };

  console.log(
    JSON.stringify(
      {
        approved: report.normalizedEvidence.approved,
        status: report.normalizedEvidence.status,
        version: report.normalizedEvidence.version,
        identity: report.normalizedEvidence.identity,
        summary: report.normalizedEvidence.summary,
        providers: report.normalizedEvidence.providers,
        areaCounts: report.normalizedEvidence.areaCounts,
      },
      null,
      2
    )
  );

  const available =
    Number(result?.summary?.availableCount ?? 0);

  if (available > 0) {
    report.diagnosis.push(
      `PASS: normalized Fundamental Evidence contains ${available} available evidence items.`
    );
  } else {
    report.diagnosis.push(
      "FAIL: direct providers may have data, but normalized Fundamental Evidence contains zero available items."
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  report.normalizedEvidence = { error: message };
  report.diagnosis.push("FAIL: normalized Fundamental Evidence provider could not execute.");
  report.errors.push(message);
  console.error(message);
}

section("7. PIPELINE COMPARISON");
const directCgOk =
  report.providers?.coinGecko?.approved === true;

const normalizedCount =
  Number(report.normalizedEvidence?.summary?.availableCount ?? 0);

const scannerUnavailable =
  report.scannerFundamental?.status === "EVIDENCE_UNAVAILABLE" ||
  Number(report.scannerFundamental?.coverage ?? 0) === 0;

if (directCgOk && normalizedCount === 0) {
  report.diagnosis.push(
    "ROOT CAUSE ZONE: CoinGecko has evidence, but cryptoFundamentalEvidenceProvider loses it."
  );
} else if (normalizedCount > 0 && scannerUnavailable) {
  report.diagnosis.push(
    "ROOT CAUSE ZONE: normalized evidence is healthy, but cryptoScannerEngineAdapters / cryptoFundamentalEngine is losing or rejecting it."
  );
} else if (!directCgOk) {
  report.diagnosis.push(
    "ROOT CAUSE ZONE: fix candidate identity / CoinGecko provider/API before changing the Fundamental engine."
  );
} else if (normalizedCount > 0 && !scannerUnavailable) {
  report.diagnosis.push(
    "PASS: evidence reaches the scanner Fundamental engine. Inspect individual pillar scoring only if values still look wrong."
  );
}

for (const line of report.diagnosis) {
  console.log("-", line);
}

section("8. WRITE REPORT");
const outputDir = path.join(ROOT, "diagnostics");
fs.mkdirSync(outputDir, { recursive: true });

const output = path.join(
  outputDir,
  `crypto-fundamental-${query.toLowerCase()}-diagnostic.json`
);

fs.writeFileSync(
  output,
  JSON.stringify(report, null, 2)
);

console.log(`Diagnostic report written to:\n${output}`);

console.log("\nFINAL SUMMARY");
console.log(JSON.stringify({
  http: report.http.scannerEngines,
  candidate: {
    assetId: report.candidate?.assetId ?? null,
    coinGeckoId: report.candidate?.coinGeckoId ?? null,
    symbol: report.candidate?.symbol ?? null,
    name: report.candidate?.name ?? null,
    candidateType: report.candidate?.candidateType ?? null,
  },
  coinGecko: report.providers?.coinGecko ?? null,
  defiLlama: report.providers?.defiLlama ?? null,
  normalizedEvidence: report.normalizedEvidence
    ? {
        status: report.normalizedEvidence.status ?? null,
        availableCount: report.normalizedEvidence.summary?.availableCount ?? null,
        areaCounts: report.normalizedEvidence.areaCounts ?? null,
      }
    : null,
  scannerFundamental: report.scannerFundamental,
  diagnosis: report.diagnosis,
}, null, 2));
