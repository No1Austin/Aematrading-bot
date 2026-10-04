/**
 * AEMA — Solana Emerging DEX Batch Validation Runner v1.2
 *
 * IMPORTANT:
 * - filters Solana BEFORE ranking/limiting
 * - prefers emergingResult.candidates, not topCandidates
 * - separates observed coverage metrics from broader confidence claims
 * - validation only; never mutates production Emerging DEX score
 */

import { runSolanaOnChainResearch } from "./solanaCombinedOnChainResearchEngine.js";

const VERSION = "1.2.0";
const num=v=>(v==null||v==="")?null:(Number.isFinite(Number(v))?Number(v):null);
const round=(v,d=2)=>Number.isFinite(Number(v))?Math.round(Number(v)*10**d)/10**d:null;
const clamp=v=>Math.max(0,Math.min(100,Number(v)||0));

function allCandidates(input){
  if(Array.isArray(input)) return input;
  // Current Emerging DEX contract: candidates contains every asset that passed prefilter.
  if(Array.isArray(input?.candidates)) return input.candidates;
  if(Array.isArray(input?.researchReady)) return input.researchReady;
  if(Array.isArray(input?.topCandidates)) return input.topCandidates;
  return [];
}
function networkOf(a){return String(a?.network??a?.chain??a?.chainId??"").trim().toLowerCase();}
function contractOf(a){return a?.contractAddress??a?.address??a?.mint??a?.tokenAddress??null;}
function scoreOf(a){return num(a?.emergingDex?.score??a?.emergingScore??a?.score??a?.researchScore??a?.totalScore);}
function riskOf(a){return num(a?.emergingDex?.riskScore);}
function qualityOf(a){return num(a?.emergingDex?.dataQualityScore);}

function compare(a,b){
  const s=(scoreOf(b)??-Infinity)-(scoreOf(a)??-Infinity);
  if(s!==0)return s;
  const r=(riskOf(a)??100)-(riskOf(b)??100);
  if(r!==0)return r;
  return (num(b?.liquidityUsd)??0)-(num(a?.liquidityUsd)??0);
}

function observedCoverage(result){
  const supply=num(result?.evidence?.supplyCoveragePercent);
  const holderComplete=result?.holders?.holderSnapshot?.complete;
  const analyzed=num(result?.flows?.analyzedHolderCount);
  const eligible=num(result?.flows?.eligibleWalletCount);
  const material=num(result?.flows?.materialFlowHolderCount);
  const completed=(result?.flows?.results??[]).filter(x=>x?.status==="COMPLETE").length;
  const requested=analyzed;

  return {
    supplyCoveragePercent:supply,
    holderSnapshotComplete:holderComplete===true,
    holdersInspected:analyzed,
    eligibleWallets:eligible,
    materialFlowWallets:material,
    walletHistorySuccessPercent:requested&&requested>0?round(completed/requested*100):null,
    tokenAccountParserComplete:
      result?.token2022?.isToken2022===true
        ? result?.token2022?.parserExposedExtensions===true
        : result?.token2022?.isToken2022===false ? true : null
  };
}

function evidenceCompleteness(result){
  const c=observedCoverage(result);
  let n=0,w=0;
  const add=(v,weight)=>{if(v!==null&&v!==undefined){n+=clamp(v)*weight;w+=weight;}};
  add(c.supplyCoveragePercent,.35);
  add(c.holderSnapshotComplete?100:50,.20);
  add(c.walletHistorySuccessPercent,.25);
  add(c.tokenAccountParserComplete===true?100:c.tokenAccountParserComplete===false?40:null,.20);
  return w?round(n/w):null;
}

function summarize(asset,result){
  const market=scoreOf(asset),preview=num(result?.preview?.score);
  return {
    symbol:asset?.symbol??asset?.baseSymbol??null,
    network:networkOf(asset),
    contractAddress:contractOf(asset),
    marketScore:market,
    marketDirection:asset?.emergingDex?.direction??asset?.direction??null,
    marketRisk:riskOf(asset),
    marketDataQuality:qualityOf(asset),
    whaleFlowScore:num(result?.evidence?.whaleFlowScore),
    whaleFlowDirection:result?.evidence?.whaleFlowDirection??null,
    whaleFlowEvidence:result?.evidence?.whaleFlowEvidence??null,
    excludedInfrastructure:result?.flows?.excludedInfrastructureCount??0,
    tokenAuthorityRisk:num(result?.evidence?.tokenAuthorityRisk?.score),
    token2022Risk:num(result?.evidence?.token2022Risk?.score),
    observedCoverage:observedCoverage(result),
    evidenceCompleteness:evidenceCompleteness(result),
    unmeasured:{
      liquidityLock:true,
      crossTokenWalletPerformance:true,
      realizedWalletPnl:true,
      completeHistoricalWalletReconstruction:true
    },
    previewScore:preview,
    previewDirection:result?.preview?.direction??null,
    previewDelta:market!==null&&preview!==null?round(preview-market):null,
    productionScoreChanged:false,
    status:result?.status??"UNKNOWN"
  };
}

export async function validateTopSolanaEmergingCandidates(
  emergingResult,
  {limit=5,holderLimit=5,signaturesPerAddress=8,maxTransactions=12}={}
){
  const all=allCandidates(emergingResult);
  const solanaPool=all.filter(a=>networkOf(a)==="solana"&&contractOf(a)).sort(compare);
  const selected=solanaPool.slice(0,Math.max(1,Number(limit)||5));
  const results=[];

  for(const asset of selected){
    try{
      const full=await runSolanaOnChainResearch({
        asset:{...asset,network:"solana",contractAddress:contractOf(asset),emergingScore:scoreOf(asset)},
        holderLimit,signaturesPerAddress,maxTransactions
      });
      results.push({summary:summarize(asset,full),full});
    }catch(e){
      results.push({summary:{
        symbol:asset?.symbol??null,network:"solana",contractAddress:contractOf(asset),
        marketScore:scoreOf(asset),status:"UNAVAILABLE",error:e?.message??String(e),
        productionScoreChanged:false
      },full:null});
    }
  }

  return {
    engine:"SOLANA_EMERGING_BATCH_VALIDATION",version:VERSION,
    status:results.some(x=>x.summary.status==="UNAVAILABLE")?"PARTIAL":"COMPLETE",
    sourceCandidateCount:all.length,
    solanaCandidateCount:solanaPool.length,
    requestedValidationCount:Math.max(1,Number(limit)||5),
    validatedCount:results.length,
    insufficientSolanaSample:solanaPool.length<Math.max(1,Number(limit)||5),
    selection:"FILTER_SOLANA_THEN_RANK_BY_EMERGING_SCORE",
    settings:{limit,holderLimit,signaturesPerAddress,maxTransactions},
    summaries:results.map(x=>x.summary),results,
    productionScoresChanged:false,
    note:"Validation only. Coverage/completeness metrics do not represent certainty that a token is safe.",
    generatedAt:new Date().toISOString()
  };
}

export default {validateTopSolanaEmergingCandidates};
