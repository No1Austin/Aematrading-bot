/** Research-only export of contemporaneous archived observations.
 * Archived records are NOT independently verified historical strategy replays.
 */
import crypto from 'node:crypto';
import { trackOutcome, summarizeOutcomes } from './quantOutcomeTracking.js';
const parseMs = s => Date.parse(s);
export function archiveIntegrity(record) {
  const meta=record?.archiveMetadata;
  if(!meta?.sha256) return 'MISSING_HASH';
  const clone=structuredClone(record);
  delete clone.archiveMetadata.sha256;
  const digest=crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');
  return digest===meta.sha256?'OK':'HASH_MISMATCH';
}
export function extractArchivedObservations(records) {
 const observations=[], rejected=[], seen=new Set();
 for(let i=0;i<records.length;i++) {
  const r=records[i];const integrity=archiveIntegrity(r);
  if(integrity!=='OK'){rejected.push({index:i,reason:integrity});continue;}
  const symbol=r.candidate?.symbol, decision=r.timestamp;
  if(!symbol||!Number.isFinite(parseMs(decision))||r.market?.symbol!==symbol){rejected.push({index:i,reason:'INVALID_IDENTITY'});continue;}
  const key=`${symbol}|${decision}|${r.candleInterval}`;
  if(seen.has(key)){rejected.push({index:i,reason:'DUPLICATE'});continue;}seen.add(key);
  const s=r.candidate?.setup || r.setup || null;
  observations.push({timestamp:decision,symbol,instrumentType:r.market?.instrumentType||null,interval:r.candleInterval,strategy:s?.strategy||null,direction:s?.researchDirection||r.candidate?.directionDecision?.direction||null,entry:s?.entry??null,stop:s?.stop??null,target:s?.target??null,setupApproved:s?.approved===true,source:'CONTEMPORANEOUS_ARCHIVE',pointInTimeVerified:r.pointInTimeVerified===true,archiveHash:r.archiveMetadata.sha256,trainingReady:false});
 }
 return {observations,rejected};
}
export function evaluateExternalOutcomes(setups,markets,{interval='5m',costBps=12,maxBars=72}={}){
 const rows=setups.map(s=>{
  if(s.pointInTimeVerified!==true)return {symbol:s.symbol,timestamp:s.timestamp,status:'UNVERIFIED_SETUP',trainingReady:false};
  const match=markets[s.symbol];
  if(!match || match.instrumentType!==s.instrumentType || match.interval!==interval || match.sourceVerified!==true)
   return {symbol:s.symbol,timestamp:s.timestamp,status:'UNVERIFIED_OR_MISMATCHED_FUTURE_MARKET',trainingReady:false};
  return trackOutcome(s,match.candles,{interval,costBps,maxBars});
 });
 return {...summarizeOutcomes(rows),rows,researchOnly:true,trainingReady:false};
}
