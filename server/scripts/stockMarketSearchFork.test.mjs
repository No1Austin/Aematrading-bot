import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path = new URL('../src/crypto/bot/stock/orchestration/botStockMarketSearchCycle.js',import.meta.url);
const code = readFileSync(path,'utf8').replace(/^import .*from .*;\n/gm,'');
const {runBotStockMarketSearch} = await import('data:text/javascript,'+encodeURIComponent("const randomUUID=()=> 'test-id';\n"+code));
const symbols=['AAPL','MSFT'];
const deps={
 now:()=>Date.parse('2026-10-21T19:00:00Z'),
 discover:async({symbols})=>({scanned:symbols.length,rankedCount:2,candidates:[{symbol:'AAPL',score:90},{symbol:'MSFT',score:80}]}),
 fetchBatch:async()=>({barsBySymbol:{AAPL:[{close:100}],MSFT:[{close:200}]}}),
 evaluate:({symbol})=>({status:'RESEARCH_SETUPS_FOUND',setups:[{symbol,approved:true,direction:'BULL',riskReward:2}],rejected:[]})
};
const result=await runBotStockMarketSearch({symbols,maxQualified:1},deps);
assert.equal(result.counts.universe,2);
assert.equal(result.counts.researchCompleted,2);
assert.equal(result.counts.qualifiedSetups,1);
assert.equal(result.setupAccounting.rankingExcluded.length,1);
assert.equal(result.setups[0].symbol,'AAPL');
assert.equal(result.setups[0].executionAuthority,false);
assert.equal(result.qualificationEngine,'STOCK_PATTERN_V1_NOT_CRYPTO_FORK_PARITY');
await assert.rejects(()=>runBotStockMarketSearch({symbols,maxQualified:21},deps),/LIMIT/);
const blocked=await runBotStockMarketSearch({symbols}, {...deps,evaluate:({symbol})=>({status:'NO_QUALIFIED_SETUP',setups:[],blockers:['NO_PATTERN'],rejected:[]})});
assert.equal(blocked.setups.length,0);
assert.equal(blocked.noSetup.length,2);
console.log('PASS: independent stock search, 20-result ceiling, quality gating, no execution');
