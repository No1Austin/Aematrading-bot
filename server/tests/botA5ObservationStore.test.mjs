import test from 'node:test';
import assert from 'node:assert/strict';
import {a5CollectorConfig,persistA5Observations} from '../src/crypto/bot/backtest/botA5ObservationStore.js';
test('collector disabled by default and request cannot enable it',()=>{
 assert.equal(a5CollectorConfig({}).enabled,false);
 assert.equal(a5CollectorConfig({EMA_A5_COLLECTOR_ENABLED:'true'}).enabled,true);
});
test('missing credentials fail closed',async()=>{
 await assert.rejects(persistA5Observations([{observationId:'x'}],{env:{}}),/NOT_CONFIGURED/);
});
test('server-only write preserves unverified and no execution authority',async()=>{
 let sent;
 const o={observationId:'8eb93d91-c4b5-4712-939f-3d4163f8c312',runId:'c623ae29-01b7-4e9e-bd8f-f7d6a6461b12',capturedAt:'2026-10-25T12:00:00Z',symbol:'BTC-USD',pointInTimeVerified:true,executionAuthority:true};
 const r=await persistA5Observations([o],{env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret'},fetchImpl:async (url,options)=>{sent={url,options};return {ok:true,status:201};}});
 assert.equal(r.saved,1);
 const p=JSON.parse(sent.options.body)[0];
 assert.equal(p.point_in_time_verified,false);
 assert.equal(p.execution_authority,false);
 assert.match(sent.url,/ema_research_observations/);
});
test('failed writes report failure',async()=>{
 await assert.rejects(persistA5Observations([{observationId:'x'}],{env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},fetchImpl:async()=>({ok:false,status:403})}),/WRITE_FAILED_403/);
});
