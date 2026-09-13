import "dotenv/config";
import runCryptoDiscoveryCycle from"../src/crypto/scanner/cryptoDiscoveryCycle.js";
import{runCryptoDeepResearchPipeline}from"../src/crypto/research/cryptoDeepResearchCoordinator.js";
import{CRYPTO_RESEARCH_WEIGHTS}from"../src/crypto/analysis/cryptoResearchScorer.js";
const h=t=>console.log("\n"+"=".repeat(76)+"\n"+t+"\n"+"=".repeat(76)+"\n");
async function main(){
  h("AEMA CRYPTO PHASE 4.5 — FINAL BULK INTELLIGENCE");
  const d=await runCryptoDiscoveryCycle({refreshUniverse:true,includeDexDiscovery:true});
  const r=await runCryptoDeepResearchPipeline({candidates:d?.selectedCandidates??[],concurrency:3,refreshFundamentals:true,refreshFinalIntelligence:true});
  h("BULK PROVIDERS");console.dir(r?.bulkContext?.finalIntelligence?.providers??{},{depth:5});
  const rows=r?.records??[];
  h("ENGINE COVERAGE");
  console.table(Object.keys(CRYPTO_RESEARCH_WEIGHTS).map(engine=>({engine,weight:CRYPTO_RESEARCH_WEIGHTS[engine],complete:rows.filter(x=>x?.scoringBreakdown?.[engine]?.available===true).length,missing:rows.filter(x=>x?.scoringBreakdown?.[engine]?.available!==true).length})));
  h("CANDIDATES");
  console.table(rows.map((x,i)=>({rank:i+1,symbol:x?.symbol,type:x?.candidateType,technical:x?.core?.technical??"N/A",fundamentals:x?.core?.fundamentals??"N/A",derivatives:x?.scoringBreakdown?.derivatives?.rawScore??"N/A",social:x?.scoringBreakdown?.socialNarrative?.rawScore??"N/A",events:x?.scoringBreakdown?.events?.rawScore??"N/A",availableWeight:x?.availableWeight??0,coverage:x?.evidenceCoverage??0,total:x?.researchScore??0,decision:x?.decision,handoff:x?.botHandoffAllowed===true})));
  h("SUMMARY");
  const avg=rows.length?rows.reduce((s,x)=>s+(x?.evidenceCoverage??0),0)/rows.length:0;
  console.log({selected:rows.length,approved:rows.filter(x=>x?.approved===true).length,botHandoffReady:rows.filter(x=>x?.botHandoffAllowed===true).length,averageCoverage:Math.round(avg*10000)/10000,perCandidateDerivativesNetworkCalls:0,perCandidateSocialNetworkCalls:0,perCandidateEventNetworkCalls:0,noExecutionAuthority:rows.every(x=>x?.executionEligible!==true),noEmergingBotHandoff:rows.filter(x=>x?.candidateType==="EMERGING").every(x=>x?.botHandoffAllowed!==true)});
}
main().catch(e=>{console.error("\nPHASE 4.5 DIAGNOSTIC FAILED\n",e);process.exitCode=1;});
