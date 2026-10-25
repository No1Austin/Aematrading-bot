import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {makePassiveSetupObservations,appendPassiveSetupObservations} from '../src/crypto/bot/backtest/botVerifiedSetupCollector.js';
const base={startedAt:'2026-10-25T10:00:00.000Z',capturedAt:'2026-10-25T10:00:01.000Z',exchange:'EXAMPLE',marketType:'FUTURES'};
test('captures research without granting point-in-time verification or execution',()=>{
 const [r]=makePassiveSetupObservations({...base,setups:[{symbol:'BTC-PERP',setup:{direction:'LONG',strategy:'TREND_PULLBACK',entry:100,stop:98,target:105,volatilityResearch:{status:'OBSERVED',proposedStop:97}}}]});
 assert.equal(r.direction,'BULL');assert.equal(r.proposedStop,97);assert.equal(r.pointInTimeVerified,false);assert.equal(r.executionAuthority,false);assert.equal(r.timestamp,null);
});
test('never treats unknown provenance as verified',()=>{
 const [r]=makePassiveSetupObservations({...base,setups:[{symbol:'ETH',setup:{direction:'SHORT',entry:100,stop:102,target:95}}]});
 assert.equal(r.direction,'BEAR');assert.equal(r.proposedStop,null);assert.ok(r.evidenceWarnings.includes('MARKET_IDENTITY_UNVERIFIED'));
});
test('rejects future search-start timestamp',()=>assert.throws(()=>makePassiveSetupObservations({...base,startedAt:'2026-10-26T10:00:00Z'}),/INVALID_CAPTURE_TIMES/));
test('append-only output keeps both observations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ema-a4-'));try{
 const filePath=join(dir,'observations.jsonl');const obs=makePassiveSetupObservations({...base,setups:[{symbol:'BTC',setup:{direction:'BULL'}}]});
 await appendPassiveSetupObservations({filePath,observations:obs});await appendPassiveSetupObservations({filePath,observations:obs});
 const lines=(await readFile(filePath,'utf8')).trim().split('\n');assert.equal(lines.length,2);assert.equal(JSON.parse(lines[0]).pointInTimeVerified,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
