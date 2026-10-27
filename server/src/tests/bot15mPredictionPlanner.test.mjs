import test from "node:test";
import assert from "node:assert/strict";
import { plan15mScenario } from "../bot/setup/bot15mPredictionPlanner.js";
const candles=Array.from({length:60},(_,i)=>{const close=100+i*0.2;return {open:close-0.1,high:close+0.6,low:close-0.6,close,volume:1000+i};});
test("missing strategy geometry yields technical diagnostics without a trade",()=>{
 const r=plan15mScenario({candles,direction:"BULL",interval:"15m"});
 assert.equal(r.status,"AWAITING_STRATEGY_GEOMETRY");
 assert.ok(r.indicators.atr14>0);
 assert.equal(r.missing.entry,true);
 assert.equal(r.executionAuthority,false);
 assert.equal(r.applied,false);
});
test("valid strategy geometry remains diagnostic-only",()=>{
 const r=plan15mScenario({candles,direction:"BULL",interval:"15m",strategyEntry:111.8,strategyStop:109,strategyTarget:118,currentPrice:111.8});
 assert.equal(r.status,"SCENARIO_READY");
 assert.equal(r.applied,false);
 assert.equal(r.executionAuthority,false);
});
test("wrong timeframe fails closed",()=>{
 const r=plan15mScenario({candles,direction:"BULL",interval:"5m"});
 assert.equal(r.status,"UNAVAILABLE");
 assert.equal(r.reason,"TIMEFRAME_NOT_15M");
});
test("invalid directional geometry cannot publish",()=>{
 const r=plan15mScenario({candles,direction:"BEAR",interval:"15m",strategyEntry:110,strategyStop:109,strategyTarget:105});
 assert.equal(r.status,"UNAVAILABLE");
 assert.equal(r.reason,"INVALID_STRATEGY_GEOMETRY");
 assert.equal(r.applied,false);
});
