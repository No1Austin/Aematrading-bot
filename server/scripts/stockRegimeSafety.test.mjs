import assert from 'node:assert/strict';
import {classifyStockMarketRegime,STOCK_STRATEGIES} from '../src/crypto/bot/stock/botStockMarketRegimeEngine.js';
const start=Date.parse('2026-10-15T13:30:00Z');
function bars({trend=0,breakout=false,sweep=false}={}){
 return Array.from({length:80},(_,i)=>{const base=100+i*trend+Math.sin(i*.4)*.3;return {open:base-.08,high:base+.45,low:base-.45,close:base+.08,volume:1000,timestamp:new Date(start+i*300000).toISOString()};}).map((b,i)=>i===79?{...b,high:breakout?125:sweep?125:b.high,low:sweep?90:b.low,close:breakout?124:sweep?101:b.close,volume:breakout?2500:b.volume}:b);
}
const normal=classifyStockMarketRegime(bars());
assert.equal(normal.researchOnly,true);
assert.equal(normal.liveExecution,false);
assert.deepEqual(Object.keys(normal.strategyDiagnostics),STOCK_STRATEGIES);
const expansion=classifyStockMarketRegime(bars({breakout:true}));
assert.equal(expansion.evidence.confirmedExpansion,true);
assert.ok(expansion.eligibleStrategies.includes('MOMENTUM_BREAKOUT'));
const sweep=classifyStockMarketRegime(bars({sweep:true}));
assert.equal(sweep.evidence.liquiditySweep,true);
assert.ok(sweep.eligibleStrategies.includes('LIQUIDITY_SWEEP'));
assert.throws(()=>classifyStockMarketRegime([]),/MINIMUM_65/);
console.log('PASS: stock five-regime classification, strategy eligibility, invalid bars, research-only');
