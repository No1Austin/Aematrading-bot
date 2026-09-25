/**
 * AEMA CRYPTO — ON-CHAIN ENGINE
 * Phase 6.42 — eight-family, multi-provider evidence contract
 */
import { complete, insufficient } from "./cryptoEngineUtils.js";
const DEFAULT_MAX_ONCHAIN_AGE_MS=15*60*1000;
const finite=(v)=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const parseTimestamp=(v)=>{if(!v)return null;const ms=Date.parse(v);return Number.isFinite(ms)?ms:null;};

export default async function run(context={},{
  finalIntelligence=null,freshness=null,supportingIntelligence=null,
  nowMs=Date.now(),maxEvidenceAgeMs=DEFAULT_MAX_ONCHAIN_AGE_MS,
}={}){
  const direction=context?.preferredDirection??"LONG";
  const supporting=supportingIntelligence?.onChain??context?.supportingIntelligence?.onChain??null;
  const measurement=context?.measurements?.onChain??null;
  const candidate=supporting??measurement??null;
  const score=finite(candidate?.score??context?.measurements?.onChainScore);
  const evidence=candidate?.evidence??candidate??{};
  const families=evidence?.families??null;
  const availableFamilies=families
    ? Object.values(families).filter(x=>x?.status==="AVAILABLE"&&finite(x?.score)!==null).length
    : 0;

  if(score===null || (families && availableFamilies===0)){
    return insufficient("CRYPTO_ON_CHAIN",
      {...evidence,reason:"APPLICABLE_ON_CHAIN_EVIDENCE_REQUIRED"},
      "APPLICABLE_ON_CHAIN_EVIDENCE_REQUIRED");
  }

  const timestamp=freshness?.sourceTimestamp??freshness?.fetchedAt??freshness?.timestamp??null;
  const timestampMs=parseTimestamp(timestamp);
  if(timestampMs===null){
    return insufficient("CRYPTO_ON_CHAIN",
      {...evidence,freshness:freshness??null,reason:"ONCHAIN_FRESHNESS_TIMESTAMP_REQUIRED"},
      "ONCHAIN_FRESHNESS_TIMESTAMP_REQUIRED");
  }
  const ageMs=Math.max(0,nowMs-timestampMs);
  if(ageMs>maxEvidenceAgeMs){
    return insufficient("CRYPTO_ON_CHAIN",
      {...evidence,freshness:{...freshness,timestamp,ageMs,maxEvidenceAgeMs,fresh:false},reason:"ONCHAIN_EVIDENCE_STALE"},
      "ONCHAIN_EVIDENCE_STALE");
  }

  return complete("CRYPTO_ON_CHAIN",score,direction,{
    ...evidence,
    coverage:finite(candidate?.coverage),
    freshness:{...freshness,timestamp,ageMs,maxEvidenceAgeMs,fresh:true},
    finalIntelligenceAvailable:Boolean(finalIntelligence),
    researchOnly:true,executionAuthority:false,liveExecution:false,
  });
}
