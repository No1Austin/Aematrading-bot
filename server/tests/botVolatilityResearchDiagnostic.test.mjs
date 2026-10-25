import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVolatilityResearchDiagnostic as run} from '../src/crypto/bot/risk/botVolatilityResearchDiagnostic.js';
test('BULL shadow keeps original stop and calculates $500 requested notional',()=>{
 const p=run({direction:'BULL',entry:100,atr:1,support:97,currentStop:98,target:108});
 assert.equal(p.status,'OBSERVED'); assert.equal(p.existingStop,98); assert.equal(p.proposedStop,97);
 assert.equal(p.requestedMarginUsd,250); assert.equal(p.leverage,2);
 assert.equal(p.shadowOnly,true); assert.equal(p.notionalUsd,500);
});
test('BEAR uses resistance and reduces size if loss cap exceeded',()=>{
 const p=run({direction:'BEAR',entry:100,atr:2,resistance:106,currentStop:104,target:90});
 assert.equal(p.proposedStop,106); assert.equal(p.resizedForRisk,true);
 assert.ok(p.plannedLossUsd <= 25.000001);
});
test('missing ATR fails closed',()=>assert.equal(run({direction:'BULL',entry:100}).status,'UNAVAILABLE'));
test('wrong-side structure fails closed',()=>assert.equal(run({direction:'BULL',entry:100,atr:1,support:102}).reason,'STRUCTURE_WRONG_SIDE'));
