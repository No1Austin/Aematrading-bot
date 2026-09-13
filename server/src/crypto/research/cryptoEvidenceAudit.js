import {getCryptoIdentity} from "../identity/cryptoCandidateIdentity.js";
export function buildCryptoEvidenceAudit({candidate,researchResult,researchContext}={}){
 const engines=researchResult?.engines??{};
 return{candidateId:getCryptoIdentity(candidate).canonicalKey,createdAt:new Date().toISOString(),decision:researchResult?.scoring?.decision??null,snapshots:{fundamentals:researchContext?.fundamentalSnapshot?.createdAt??researchContext?.fundamentalSnapshot?.snapshotAt??null,finalIntelligence:researchContext?.finalIntelligenceSnapshot?.createdAt??researchContext?.finalIntelligenceSnapshot?.snapshotAt??null},evidence:Object.entries(engines).map(([engine,r])=>({engine,status:r?.status??"UNKNOWN",score:Number.isFinite(Number(r?.score))?Number(r.score):null,source:r?.evidence?.source??r?.source??null,observedAt:r?.evidence?.observedAt??r?.completedAt??null}))};
}
export function classifySnapshotFreshness(ts,{freshMs=900000,staleMs=3600000}={}){const t=Date.parse(ts??"");if(!Number.isFinite(t))return"UNKNOWN";const a=Math.max(0,Date.now()-t);return a<=freshMs?"FRESH":a<=staleMs?"AGING":"STALE";}
