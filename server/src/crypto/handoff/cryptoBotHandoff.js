import {getCryptoIdentity} from "../identity/cryptoCandidateIdentity.js";
export function createCryptoBotHandoff({candidate,researchResult}={}){
 const identity=getCryptoIdentity(candidate),s=researchResult?.scoring??{},decision=s.decision??researchResult?.decision??null;
 const allowed=decision==="APPROVED"&&identity.candidateType==="CEX";
 return{version:"1.0",createdAt:new Date().toISOString(),candidateId:identity.canonicalKey,identity,research:{decision,totalScore:s.totalScore??s.score??null,availableWeight:s.availableWeight??null,coverage:s.coverage??null},botAnalysisEligible:allowed,executionEligible:false,authority:"BOT_ANALYSIS_ONLY",blockedReason:allowed?null:identity.candidateType!=="CEX"?"EMERGING_RESEARCH_ONLY":"DEEP_RESEARCH_NOT_APPROVED"};
}
