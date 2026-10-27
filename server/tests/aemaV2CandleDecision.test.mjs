import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateV2CandleDecision} from '../src/aemaV2/candles/candleDecisionEngine.js';
const end=Date.parse('2026-10-27T18:00:00Z');
function candles(interval,count,delta){const duration=interval*60000;return Array.from({length:count},(_,i)=>{const open=100+i*delta,close=open+delta*.7;return {openTime:end-count*duration+i*duration,open,high:Math.max(open,close)+.15,low:Math.min(open,close)-.15,close};});}
const sample=(a,b,c)=>({candles15m:candles(15,60,a),candles5m:candles(5,60,b),candles1h:candles(60,60,c),asOf:end});
test('15m bullish with 5m bullish and 1h bearish remains bullish candidate',()=>{const x=evaluateV2CandleDecision(sample(.25,.1,-.2));assert.equal(x.direction,'BULL');assert.equal(x.status,'RESEARCH_CANDIDATE');assert.equal(x.executionAuthority,false);});
test('15m and 5m conflict => no setup',()=>{const x=evaluateV2CandleDecision(sample(-.2,.2,-.2));assert.equal(x.status,'NO_SETUP');assert.equal(x.reason,'15M_5M_DIRECTION_CONFLICT');});
test('still-open candle excluded',()=>{const x=sample(.2,.1,.2);x.candles15m.push({openTime:end,open:100,high:200,low:1,close:190});const r=evaluateV2CandleDecision(x);assert.equal(r.diagnostics.candleCounts['15m'],60);});
test('stale candles fail closed',()=>{const x=sample(.2,.1,.2);x.asOf+=4*3600000;assert.equal(evaluateV2CandleDecision(x).reason,'STALE_CANDLES');});
test('missing timeframe fails closed',()=>{const x=sample(.2,.1,.2);delete x.candles5m;assert.equal(evaluateV2CandleDecision(x).reason,'CANDLES_REQUIRED');});
