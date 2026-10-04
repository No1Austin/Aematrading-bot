/**
 * AEMA — Solana Wallet Intelligence Engine v1.2
 *
 * Adds protocol/infrastructure identity filtering BEFORE whale-flow aggregation.
 * Research only. No execution authority.
 */

import { getWalletMintHistory } from "../data/providers/solanaFreeWalletHistoryProvider.js";
import { getAccountIdentity } from "../data/providers/solanaTokenSafetyProvider.js";
import { classifySolanaAccountIdentity } from "../data/providers/solanaWalletIdentityRegistry.js";

const VERSION = "1.2.0";
const number = v => (v == null || v === "") ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v,a=0,b=100) => Math.min(b,Math.max(a,Number(v)||0));
const round = (v,d=2) => Number.isFinite(Number(v)) ? Math.round(Number(v)*10**d)/10**d : null;

function aggregate(events){
  let inflowRaw=0,outflowRaw=0,inflowCount=0,outflowCount=0;
  for(const e of events??[]){
    const d=number(e?.deltaRaw); if(d===null) continue;
    if(d>0){inflowRaw+=d;inflowCount++;}
    else if(d<0){outflowRaw+=Math.abs(d);outflowCount++;}
  }
  return {
    inflowRaw,outflowRaw,
    grossFlowRaw:inflowRaw+outflowRaw,
    netFlowRaw:inflowRaw-outflowRaw,
    inflowCount,outflowCount
  };
}

function flowScore(s,supply){
  const total=number(supply); if(total===null||total<=0) return null;
  const net=s.netFlowRaw/total,gross=s.grossFlowRaw/total;
  if(gross<0.001) return null; // <0.10% observed supply = immaterial
  return round(clamp(50+net*1000)*.7 + clamp(gross*1500)*.3);
}

function flowClass(s,supply){
  const total=number(supply); if(total===null||total<=0) return "UNAVAILABLE";
  const net=s.netFlowRaw/total,gross=s.grossFlowRaw/total;
  if(gross<0.001) return "LOW_FLOW";
  if(net>=0.0025) return "ACCUMULATION";
  if(net<=-0.0025) return "DISTRIBUTION";
  return "MIXED_FLOW";
}

async function resolveIdentity(wallet){
  try{
    const account=await getAccountIdentity(wallet);
    return {
      account,
      ...classifySolanaAccountIdentity(account)
    };
  }catch(e){
    return {
      account:null,
      classification:"UNKNOWN",
      infrastructure:null,
      excludeFromWalletFlow:false,
      confidence:0,
      reasons:["ACCOUNT_IDENTITY_LOOKUP_FAILED"],
      error:e?.message??String(e)
    };
  }
}

export async function analyzeSolanaWalletForToken({
  wallet,mint,currentHoldingRaw=null,observedSupplyRaw=null,shareObservedPercent=null,
  signaturesPerAddress=15,maxTransactions=20,identity=null
}){
  const resolvedIdentity=identity??await resolveIdentity(wallet);

  // Known protocol/program infrastructure is deliberately NOT treated as a trader.
  if(resolvedIdentity?.excludeFromWalletFlow===true){
    return {
      engine:"SOLANA_WALLET_INTELLIGENCE",version:VERSION,status:"EXCLUDED_INFRASTRUCTURE",
      provider:null,wallet,mint,currentHoldingRaw:number(currentHoldingRaw),
      shareObservedPercent:number(shareObservedPercent),
      identity:resolvedIdentity,
      classifications:["PROTOCOL_INFRASTRUCTURE"],
      flow:{
        classification:"EXCLUDED_INFRASTRUCTURE",
        materialFlow:false,whaleFlowScore:null,
        inflowRaw:null,outflowRaw:null,grossFlowRaw:null,netFlowRaw:null,
        inflowCount:null,outflowCount:null,observedSupplyShareGross:null
      },
      history:null,smartWalletScore:null,walletPerformanceScore:null,
      warnings:["KNOWN_PROTOCOL_INFRASTRUCTURE_EXCLUDED_FROM_WHALE_FLOW"],
      errors:[],researchOnly:true,executionAuthority:false,liveExecution:false,
      observedAt:new Date().toISOString()
    };
  }

  const history=await getWalletMintHistory(wallet,mint,{signaturesPerAddress,maxTransactions});
  const s=aggregate(history.events);
  const score=flowScore(s,observedSupplyRaw);
  const share=number(shareObservedPercent),supply=number(observedSupplyRaw);
  const grossShare=supply&&supply>0?s.grossFlowRaw/supply:null;
  const classifications=[];

  if(share!==null&&share>=1) classifications.push("LARGE_HOLDER");
  if(grossShare!==null&&grossShare>=0.0025) classifications.push("LARGE_FLOW");
  if(share!==null&&share>=1&&grossShare!==null&&grossShare>=0.0025&&history.eventCount>=2)
    classifications.push("WHALE_CANDIDATE");

  const warnings=[];
  if(resolvedIdentity?.classification==="PROGRAM_OWNED_ACCOUNT_UNVERIFIED")
    warnings.push("PROGRAM_OWNED_ACCOUNT_IDENTITY_UNVERIFIED");
  if(!history.coverage.completeHistoricalReconstruction) warnings.push("HISTORY_IS_BOUNDED_AND_PARTIAL");
  if(history.errors.length) warnings.push("RPC_HISTORY_ERRORS_PRESENT");
  warnings.push("SMART_WALLET_REQUIRES_CROSS_TOKEN_PERFORMANCE_HISTORY",
    "REALIZED_PNL_NOT_YET_AVAILABLE","DEX_SWAP_PRICE_AT_EXECUTION_NOT_YET_RECONSTRUCTED");

  return {
    engine:"SOLANA_WALLET_INTELLIGENCE",version:VERSION,
    status:history.errors.length?"PARTIAL":"COMPLETE",provider:history.provider,wallet,mint,
    currentHoldingRaw:number(currentHoldingRaw),shareObservedPercent:share,
    identity:resolvedIdentity,classifications,
    flow:{
      classification:flowClass(s,observedSupplyRaw),
      materialFlow:grossShare!==null&&grossShare>=0.001,
      whaleFlowScore:score,...s,
      observedSupplyShareGross:grossShare===null?null:round(grossShare*100,6)
    },
    history:{
      tokenAccountCount:history.tokenAccounts.length,
      queriedAddressCount:history.queriedAddresses.length,
      signatureCount:history.signatureCount,
      relevantEventCount:history.eventCount,
      events:history.events,coverage:history.coverage
    },
    smartWalletScore:null,walletPerformanceScore:null,warnings,errors:history.errors,
    researchOnly:true,executionAuthority:false,liveExecution:false,
    observedAt:new Date().toISOString()
  };
}

export async function analyzeTopSolanaHolders(onChainResult,{
  holderLimit=5,signaturesPerAddress=15,maxTransactions=20
}={}){
  const holders=Array.isArray(onChainResult?.largeHolders)
    ? onChainResult.largeHolders.slice(0,Math.max(1,Number(holderLimit)||5)) : [];
  const mint=onChainResult?.mint;
  const supply=onChainResult?.holderSnapshot?.observedAmountRaw??null;
  const results=[];

  // Sequential intentionally: safer for free-tier RPC usage.
  for(const h of holders){
    try{
      const identity=await resolveIdentity(h.wallet);
      results.push(await analyzeSolanaWalletForToken({
        wallet:h.wallet,mint,currentHoldingRaw:h.amountRaw,observedSupplyRaw:supply,
        shareObservedPercent:h.shareObservedPercent,signaturesPerAddress,maxTransactions,identity
      }));
    }catch(e){
      results.push({
        status:"UNAVAILABLE",wallet:h.wallet,mint,smartWalletScore:null,
        errors:[e?.message??String(e)]
      });
    }
  }

  const excluded=results.filter(r=>r.status==="EXCLUDED_INFRASTRUCTURE");
  const eligible=results.filter(r=>r.status!=="EXCLUDED_INFRASTRUCTURE"&&r.status!=="UNAVAILABLE");
  const material=eligible.filter(r=>r?.flow?.materialFlow===true);
  const scores=material.map(r=>number(r?.flow?.whaleFlowScore)).filter(v=>v!==null);

  return {
    engine:"SOLANA_TOP_HOLDER_INTELLIGENCE",version:VERSION,
    status:results.some(r=>r.status==="UNAVAILABLE")?"PARTIAL":"COMPLETE",
    mint,
    analyzedHolderCount:results.length,
    eligibleWalletCount:eligible.length,
    excludedInfrastructureCount:excluded.length,
    excludedInfrastructureWallets:excluded.map(r=>({
      wallet:r.wallet,
      classification:r.identity?.classification??null,
      protocol:r.identity?.protocol??null,
      reasons:r.identity?.reasons??[]
    })),
    materialFlowHolderCount:material.length,
    tokenWhaleFlowScore:scores.length
      ? round(scores.reduce((a,b)=>a+b,0)/scores.length)
      : null,
    whaleFlowEvidence:scores.length
      ? "MATERIAL_ELIGIBLE_WALLET_FLOW_OBSERVED"
      : "INSUFFICIENT_MATERIAL_ELIGIBLE_WALLET_FLOW",
    smartWalletScore:null,
    results,
    limitations:[
      "CURRENT_TOKEN_ACCOUNTS_ONLY",
      "CLOSED_HISTORICAL_TOKEN_ACCOUNTS_MAY_BE_MISSED",
      "SMART_WALLET_SCORE_REQUIRES_PERSISTENT_CROSS_TOKEN_HISTORY",
      "UNKNOWN_PROGRAM_OWNED_ACCOUNTS_ARE_FLAGGED_NOT_AUTOMATICALLY_EXCLUDED"
    ],
    researchOnly:true,executionAuthority:false,generatedAt:new Date().toISOString()
  };
}

export default { analyzeSolanaWalletForToken, analyzeTopSolanaHolders };
