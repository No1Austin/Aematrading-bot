import test from 'node:test';
import assert from 'node:assert/strict';
import {planStructureExecution} from '../aemaV2/structure/structureExecutionPlan.js';
const base=1700000000000;
const candles=(n,ms,drift)=>Array.from({length:n},(_,i)=>{const close=100+i*drift+Math.sin(i*.35)*.6;return {t:base+i*ms,open:close-.15,high:close+.7,low:close-.8,close};});
test('BULL never places stop above entry or target below entry',()=>{
 const x=planStructureExecution({direction:'BULL',candles15m:candles(100,900000,.03),candles5m:candles(100,300000,.03),candles1h:candles(100,3600000,.03)});
 if(x.entryReference!==undefined){assert.ok(x.stopReference<x.entryReference);assert.ok(x.targetIllustration>x.entryReference);}
 assert.equal(x.executionAuthority,false);
});
test('BEAR never places stop below entry or target above entry',()=>{
 const x=planStructureExecution({direction:'BEAR',candles15m:candles(100,900000,-.03),candles5m:candles(100,300000,-.03),candles1h:candles(100,3600000,-.03)});
 if(x.entryReference!==undefined){assert.ok(x.stopReference>x.entryReference);assert.ok(x.targetIllustration<x.entryReference);}
 assert.equal(x.executionAuthority,false);
});
test('rejects invalid and insufficient candles',()=>assert.throws(()=>planStructureExecution({direction:'BULL',candles15m:[],candles5m:[],candles1h:[]})));
