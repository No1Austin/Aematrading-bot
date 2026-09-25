/**
 * ============================================================
 * AEMA CRYPTO
 * TECHNICAL ENGINE
 * Phase 6.36
 * ============================================================
 *
 * Canonical Technical score is derived ONLY from technical
 * market-movement evidence represented by Technical coverage.
 *
 * scannerScore and directionEdge are preserved as diagnostic
 * upstream context only. They have zero canonical score authority.
 *
 * Missing horizons are excluded, not converted to zero/neutral evidence.
 * Direction is derived from market movement, not preferredDirection.
 * Research only. No execution authority.
 */

import {
  clamp,
  complete,
  insufficient,
} from "./cryptoEngineUtils.js";

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const PERIODS = Object.freeze([
  { key:"1h", field:"change1hPercent", scoreMultiplier:3, directionalWeight:0.35 },
  { key:"4h", field:"change4hPercent", scoreMultiplier:2, directionalWeight:0.30 },
  { key:"24h", field:"change24hPercent", scoreMultiplier:1, directionalWeight:0.25 },
  { key:"7d", field:"change7dPercent", scoreMultiplier:0.35, directionalWeight:0.10 },
]);

export default async function run(c) {
  const m=c?.measurements ?? {};

  const available=PERIODS
    .map(period=>({...period,value:finiteOrNull(m?.[period.field])}))
    .filter(period=>period.value!==null);

  const evidenceCoverage=available.length/PERIODS.length;
  const coverage=clamp(evidenceCoverage*100);

  const availableHorizons=available.map(period=>period.key);
  const missingHorizons=PERIODS
    .filter(period=>!available.some(row=>row.key===period.key))
    .map(period=>period.key);

  if(available.length<2){
    return insufficient("CRYPTO_TECHNICAL",{
      available:available.length,
      totalHorizons:PERIODS.length,
      coverage,
      evidenceCoverage,
      availableHorizons,
      missingHorizons,
      canonicalScoreSource:"AVAILABLE_MARKET_MOVEMENT_EVIDENCE_ONLY",
      executionAuthority:false,
      liveExecution:false,
    });
  }

  const availableDirectionalWeight=available.reduce(
    (sum,period)=>sum+period.directionalWeight,0
  );

  const directionalSignal=availableDirectionalWeight>0
    ? available.reduce(
        (sum,period)=>
          sum+period.value*period.scoreMultiplier*period.directionalWeight,
        0
      )/availableDirectionalWeight
    : 0;

  const bullishStrength=clamp(50+directionalSignal);
  const bearishStrength=clamp(50-directionalSignal);
  const directionalEdge=bullishStrength-bearishStrength;

  const direction=directionalEdge>=8
    ? "LONG"
    : directionalEdge<=-8
      ? "SHORT"
      : "NEUTRAL";

  const directionStrength=clamp(Math.abs(directionalEdge)*2);

  /*
   * Phase 6.36 canonical score:
   * movement conviction only.
   *
   * This keeps the score aligned with the same evidence represented
   * by Technical coverage and removes upstream discovery/scanner
   * double counting from the canonical Technical 20%.
   */
  const movementConviction=clamp(50+Math.abs(directionalSignal));
  const score=movementConviction;

  const scannerScore=finiteOrNull(c?.scannerScore);
  const discoveryEdge=finiteOrNull(c?.directionEdge);

  const confidence=clamp(35+evidenceCoverage*55);

  return complete(
    "CRYPTO_TECHNICAL",
    score,
    direction,
    {
      change1hPercent:m.change1hPercent ?? null,
      change4hPercent:m.change4hPercent ?? null,
      change24hPercent:m.change24hPercent ?? null,
      change7dPercent:m.change7dPercent ?? null,

      coverage,
      evidenceCoverage,
      availableHorizons,
      missingHorizons,

      directionalCoverage:coverage,
      bullishStrength,
      bearishStrength,
      directionStrength,
      directionSource:"AVAILABLE_MARKET_MOVEMENT_EVIDENCE",

      canonicalScoreSource:"AVAILABLE_MARKET_MOVEMENT_EVIDENCE_ONLY",

      discoveryPreferredDirection:c?.preferredDirection ?? null,
      discoveryDirectionAuthority:false,

      scoreContext:{
        movementConviction,
        scannerScore,
        discoveryEdge,
        scannerScoreCanonicalAuthority:false,
        discoveryEdgeCanonicalAuthority:false,
        handling:"DIAGNOSTIC_ONLY_NOT_INCLUDED_IN_TECHNICAL_SCORE",
      },

      executionAuthority:false,
      liveExecution:false,
    },
    confidence,
  );
}
