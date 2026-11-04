import test from 'node:test';
import assert from 'node:assert/strict';
import {runStockDualMarketSearch} from './botStockDualMarketSearch.js';
const loadUniverse=async()=>({symbols:['AAPL','MSFT','XYZ'],totalEligible:300,offset:0,source:'TEST'});
const rankCandidates=async()=>({scanned:3,rankedCount:2,candidates:[
 {symbol:'MSFT',score:90,averageDollarVolume:2e7,relativeVolume:1.5,movePct:2},
 {symbol:'AAPL',score:80,averageDollarVolume:1e7,relativeVolume:1.2,movePct:1}]});
test('ranked mode feeds highest ranked symbols into both independent tracks',async()=>{
 const calls=[];
 const result=await runStockDualMarketSearch({universeMode:'RANKED',rankedLimit:1},
 {loadUniverse,rankCandidates,runSearch:async opts=>{calls.push(opts);return {status:'NO_SETUP',setups:[]}}});
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(x=>x.symbols),[['MSFT'],['MSFT']]);
 assert.equal(result.universe.mode,'RANKED');
 assert.equal(result.ranking.selected,1);
 assert.equal(result.executionDisabled,true);
});
test('ranked mode fails closed when no symbols qualify',async()=>{
 await assert.rejects(runStockDualMarketSearch({universeMode:'RANKED'},
 {loadUniverse,rankCandidates:async()=>({candidates:[]}),runSearch:async()=>({setups:[]})}),/NO_ELIGIBLE/);
});
test('ranked mode rejects explicit symbols and invalid limits',async()=>{
 await assert.rejects(runStockDualMarketSearch({universeMode:'RANKED',symbols:['AAPL']},
 {runSearch:async()=>({setups:[]})}),/CONFLICT/);
 await assert.rejects(runStockDualMarketSearch({universeMode:'RANKED',rankedLimit:51},
 {loadUniverse,runSearch:async()=>({setups:[]})}),/LIMIT_INVALID/);
});
test('fixed mode does not invoke discovery or ranking',async()=>{
 await runStockDualMarketSearch({}, {loadUniverse:()=>{throw Error('unexpected')},rankCandidates:()=>{throw Error('unexpected')},runSearch:async()=>({setups:[]})});
});
