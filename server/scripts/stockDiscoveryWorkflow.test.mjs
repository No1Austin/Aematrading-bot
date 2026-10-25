import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file = new URL('../src/crypto/bot/stock/botStockDiscoveryWorkflow.js', import.meta.url);
let source=readFileSync(file,'utf8').replace(/^import .*;\n/gm,'');
const {runStockDiscoveryResearch}=await import('data:text/javascript,'+encodeURIComponent(source));
let calls=0;
const discover=async ({symbols,topN})=>{
  assert.equal(topN,2);assert.ok(symbols.length>0);
  return {universeSize:symbols.length,scanned:3,rankedCount:2,
    candidates:[{symbol:'AAPL'},{symbol:'MSFT'}],providerErrors:[]};
};
const research=async ({symbols})=>{
  calls++;assert.deepEqual(symbols,['AAPL','MSFT']);
  return {results:[],qualifiedSetups:[],counts:{researched:2,qualifiedSetups:0}};
};
const r=await runStockDiscoveryResearch({topN:2,discover,research});
assert.equal(r.counts.shortlisted,2);
assert.equal(r.counts.researched,2);
assert.equal(r.researchOnly,true);
assert.equal(r.liveExecution,false);
assert.equal(calls,1);
await assert.rejects(()=>runStockDiscoveryResearch({topN:13,discover,research}),/TOP_N/);
const empty=await runStockDiscoveryResearch({topN:2,discover:async()=>({candidates:[],scanned:0}),research});
assert.equal(empty.counts.shortlisted,0);
assert.equal(calls,1);
console.log('PASS: discovery workflow, shortlist integration, empty result, research-only');
