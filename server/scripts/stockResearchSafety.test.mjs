import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const file = new URL('../src/crypto/bot/stock/botStockResearchEngine.js', import.meta.url);
let src = readFileSync(file, 'utf8')
  .replace(/^import .*?;\s*$/gm, '')
  .replace(/export function /g, 'function ')
  .replace(/export async function /g, 'async function ');
src += '\n globalThis.__test = { evaluateStockBars };';
const ctx = { Date, Map, Math, Number, String, Array, randomUUID: ()=>'test' };
const regimeSource=readFileSync(new URL('../src/crypto/bot/stock/botStockMarketRegimeEngine.js', import.meta.url),'utf8').replace(/export const /g,'const ').replace(/export function /g,'function ');
src=regimeSource+'\n'+src;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const { evaluateStockBars } = ctx.__test;
const t = Date.parse('2026-10-19T15:00:00Z');
const bars = Array.from({length: 80}, (_, i) => ({
  open: 100, high: 101, low: 99, close: 100, volume: 1000,
  timestamp: new Date(t - (79-i)*300000).toISOString()
}));
// Breakout bar immediately before retest: previous.close > pre-breakout resistance.
bars[78] = {...bars[78], open:100.5, high:103, low:100.3, close:102, volume:1600};
bars[79] = {...bars[79], open:101.2, high:102.5, low:100.8, close:102.1, volume:1400};
const result = evaluateStockBars({symbol:'TEST', bars, asOf:t});
assert.equal(result.assetClass, 'STOCK');
assert.ok([...result.setups,...result.rejected].some(x=>x.strategy==='BREAKOUT_RETEST'&&x.direction==='BULL'), 'bull retest should be detectable');
assert.equal(result.liveExecution, false);
const bad = evaluateStockBars({symbol:'TEST', bars:bars.map(b=>({...b,high:0})), asOf:t});
assert.equal(bad.status, 'INSUFFICIENT_DATA');
const stale = evaluateStockBars({symbol:'TEST', bars, asOf:t+5*86400000});
assert.equal(stale.status, 'STALE_DATA');
console.log('PASS: breakout retest, invalid bars, stale bars, research-only');
