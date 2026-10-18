/** Append-only contemporaneous setup observations; NEVER grants execution authority. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const number = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export function makeSetupCaptureRows(shadows, {capturedAtMs=Date.now(), interval='5m', marketIdentities={}}={}) {
  const intervals={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000};
  const duration=intervals[interval];
  if(!duration || !Number.isFinite(capturedAtMs) || capturedAtMs>Date.now()+1000) throw Error('INVALID_CAPTURE_TIME_OR_INTERVAL');
  const capturedAt=new Date(capturedAtMs).toISOString();
  // First possible complete future bar begins at the NEXT interval boundary.
  // This is an observation-window anchor, not proof that a trade was entered.
  const outcomeStartMs=Math.ceil(capturedAtMs/duration)*duration;
  return (Array.isArray(shadows)?shadows:[]).map((s,index)=>{
    const direction=String(s.direction||'').toUpperCase();
    const entry=number(s.entry),stop=number(s.stop),target=number(s.target);
    const geometryValid=entry>0&&stop>0&&target>0&&(direction==='BULL'?stop<entry&&entry<target:direction==='BEAR'?target<entry&&entry<stop:false);
    const identity=marketIdentities[String(s.symbol||'')] || null;
    return {schemaVersion:'ema-quant-setup-observation-v1',observationId:crypto.createHash('sha256').update(`${capturedAt}|${index}|${s.symbol||''}|${direction}`).digest('hex'),capturedAt, outcomeStart:new Date(outcomeStartMs).toISOString(),symbol:String(s.symbol||''),instrumentType:'FUTURES',exchange:identity?.exchange||null,marketId:identity?.marketId||null,marketIdentitySource:identity?.source||null,candleInterval:interval,strategy:s.strategy||null,direction,entry,stop,target,setupApproved:s.setupApproved===true,geometryValid,reason:geometryValid?'AWAITING_MATCHED_FUTURES_OUTCOME':'NO_VALID_SETUP_GEOMETRY',pointInTimeVerified:false,trainingReady:false,executionAuthority:false,liveExecution:false};
  });
}
export function appendSetupCaptureRows(rows,{filePath}={}){
  if(!filePath) throw Error('CAPTURE_FILE_PATH_REQUIRED');
  if(!Array.isArray(rows)) throw Error('ROWS_REQUIRED');
  fs.mkdirSync(path.dirname(path.resolve(filePath)),{recursive:true});
  fs.appendFileSync(filePath,rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':''));
  return {saved:rows.length,filePath:path.resolve(filePath)};
}
