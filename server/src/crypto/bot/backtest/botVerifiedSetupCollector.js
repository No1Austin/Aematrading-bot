/** A4 passive setup collector. No market data fetching, orders, or approval changes.
 * Observations are intentionally NOT point-in-time verified until an independent
 * market-identity / candle-provenance check is performed.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const finitePositive = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x)>0 ? Number(x) : null;
const iso = x => { const t=Date.parse(x); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const directionOf = s => ['BULL','LONG','BUY'].includes(String(s).toUpperCase()) ? 'BULL' : ['BEAR','SHORT','SELL'].includes(String(s).toUpperCase()) ? 'BEAR' : null;

export function makePassiveSetupObservations({setups=[], startedAt, exchange=null, marketType=null, capturedAt=new Date().toISOString(), runId=randomUUID()}={}) {
  if (!Array.isArray(setups)) throw Error('SETUPS_ARRAY_REQUIRED');
  const created=iso(capturedAt), runStarted=iso(startedAt);
  if(!created || !runStarted || Date.parse(runStarted)>Date.parse(created)) throw Error('INVALID_CAPTURE_TIMES');
  return setups.map((row,index)=>{
    const s=row?.setup ?? row ?? {};
    const d=s.volatilityResearch ?? s.volatilityDiagnostic ?? null;
    const entry=finitePositive(s.entry), stop=finitePositive(s.stop), target=finitePositive(s.target);
    const proposedStop=d?.status==='OBSERVED' ? finitePositive(d.proposedStop ?? d.stop) : null;
    const direction=directionOf(s.researchDirection ?? s.direction ?? s.setupType);
    const warnings=[];
    if(!exchange || !marketType || !s.marketId) warnings.push('MARKET_IDENTITY_UNVERIFIED');
    if(!s.candleInterval) warnings.push('CANDLE_INTERVAL_UNVERIFIED');
    if(!s.sourceCandleCloseTime) warnings.push('SOURCE_CANDLE_TIME_UNVERIFIED');
    if(!entry || !stop || !target || !direction) warnings.push('SETUP_GEOMETRY_INCOMPLETE');
    if(!proposedStop) warnings.push('PROPOSED_STOP_UNAVAILABLE');
    if(!finitePositive(s.atr)) warnings.push('ATR_PROVENANCE_UNVERIFIED');
    return {
      schemaVersion:1, observationId:randomUUID(), runId, capturedAt:created,
      // The original setup time is not known from the search start time.
      timestamp:iso(s.generatedAt ?? s.createdAt) ?? null,
      searchStartedAt:runStarted, symbol:row?.symbol ?? s.symbol ?? null,
      strategy:s.strategy ?? null, direction, entry, stop, target, proposedStop,
      atr:finitePositive(s.atr), exchange, instrumentType:marketType,
      marketId:s.marketId ?? null, candleInterval:s.candleInterval ?? null,
      sourceCandleCloseTime:iso(s.sourceCandleCloseTime),
      proposedStopVerifiedAt:null, pointInTimeVerified:false,
      proposedStopResearchOnly:true, executionAuthority:false,
      evidenceWarnings:[...new Set([...warnings,...(d?.evidenceWarnings ?? [])])],
      index
    };
  });
}

/** Append-only JSONL; caller explicitly opts in and chooses local output file. */
export async function appendPassiveSetupObservations({filePath, observations}={}) {
  if(typeof filePath!=='string' || !filePath.trim()) throw Error('COLLECTOR_FILE_PATH_REQUIRED');
  if(!Array.isArray(observations)) throw Error('OBSERVATIONS_ARRAY_REQUIRED');
  if(!observations.length) return {saved:0};
  const path=resolve(filePath);
  await mkdir(dirname(path),{recursive:true});
  await appendFile(path, observations.map(o=>JSON.stringify(o)).join('\n')+'\n',{encoding:'utf8',flag:'a'});
  return {saved:observations.length};
}
