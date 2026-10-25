import test from 'node:test';
import assert from 'node:assert/strict';
import {planVolatilityPosition} from '../src/crypto/bot/risk/botVolatilityPositionPlanner.js';
test('BULL stop uses ATR and structure, resizes for risk',()=>{
 const p=planVolatilityPosition({direction:'BULL',entry:100,atr:1,structureStop:97,marginUsd:250,leverage:2,maxLossUsd:10,target:108});
 assert.equal(p.stop,97);assert.ok(p.plannedLossUsd<=10.00001);assert.equal(p.resizedForRisk,true);
});
test('BEAR stop above entry',()=>{
 const p=planVolatilityPosition({direction:'BEAR',entry:100,atr:1,structureStop:102,marginUsd:250,leverage:2,maxLossUsd:20,target:94});
 assert.equal(p.stop,102);assert.equal(p.direction,'BEAR');
});
test('reject wrong-side structural stop',()=>{
 assert.throws(()=>planVolatilityPosition({direction:'BULL',entry:100,atr:1,structureStop:101,marginUsd:250,leverage:2,maxLossUsd:10}));
});
