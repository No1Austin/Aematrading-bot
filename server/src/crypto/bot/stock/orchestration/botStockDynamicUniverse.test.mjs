import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStockUniverse,getStockDynamicUniverse} from '../providers/botStockDynamicUniverse.js';
import {runStockDualMarketSearch} from './botStockDualMarketSearch.js';
const assets=[{symbol:'MSFT',status:'active',tradable:true,class:'us_equity',exchange:'NASDAQ'},
{symbol:'AAPL',status:'active',tradable:true,class:'us_equity',exchange:'NASDAQ'},
{symbol:'BTC/USD',status:'active',tradable:true,class:'crypto',exchange:'NASDAQ'},
{symbol:'BAD',status:'inactive',tradable:true,class:'us_equity',exchange:'NYSE'}];
test('only active tradable US equities; deterministic pagination',()=>{
 assert.deepEqual(selectStockUniverse(assets,{limit:1,offset:1}).symbols,['MSFT']);
 assert.equal(selectStockUniverse(assets).totalEligible,2);
});
test('credentials required before any request',async()=>{
 await assert.rejects(getStockDynamicUniverse({env:{},fetchImpl:()=>{throw Error('called')}}),/CREDENTIALS_MISSING/);
});
test('dynamic symbols passed to both independent research tracks',async()=>{
 const calls=[];
 const result=await runStockDualMarketSearch({universeMode:'DYNAMIC',universeLimit:2},{
  loadUniverse:async()=>({symbols:['AAPL','MSFT'],totalEligible:500,offset:0,source:'TEST'}),
  runSearch:async(options)=>{calls.push(options);return {status:'NO_SETUP',setups:[]};}
 });
 assert.equal(calls.length,2);assert.deepEqual(calls[0].symbols,['AAPL','MSFT']);
 assert.equal(result.universe.mode,'DYNAMIC');assert.equal(result.executionDisabled,true);
});
test('fixed mode never calls asset listing',async()=>{
 await runStockDualMarketSearch({}, {loadUniverse:()=>{throw Error('unexpected')},runSearch:async()=>({setups:[]})});
});
