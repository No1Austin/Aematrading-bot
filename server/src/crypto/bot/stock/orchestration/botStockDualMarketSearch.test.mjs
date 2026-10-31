import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runStockDualMarketSearch} from './botStockDualMarketSearch.js';
test('independent intraday and swing configs and same-symbol publication',async()=>{
 const calls=[];
 const result=await runStockDualMarketSearch({symbols:['AAPL']},{runSearch:async o=>{
  calls.push(o);return {status:'SETUPS_FOUND',setups:[{symbol:'AAPL',setup:{approved:true}}]};
 }});
 assert.deepEqual(calls.map(x=>x.timeframe),['5Min','1Day']);
 assert.deepEqual(calls.map(x=>x.lookbackDays),[20,90]);
 assert.equal(result.setups.length,2);
 assert.deepEqual(result.setups.map(x=>x.horizon),['INTRADAY','SWING']);
 assert.equal(result.liveExecution,false);
});
test('one track failure preserves the other',async()=>{
 let i=0;
 const result=await runStockDualMarketSearch({}, {runSearch:async()=>{if(i++===0)throw Error('DATA_UNAVAILABLE');return {status:'NO_SETUP',setups:[]};}});
 assert.equal(result.status,'PARTIAL');assert.equal(result.counts.failedTracks,1);
});
test('invalid horizons fail closed',async()=>{
 await assert.rejects(runStockDualMarketSearch({horizons:['CRYPTO']},{runSearch:async()=>({})}),/STOCK_HORIZONS_INVALID/);
});
