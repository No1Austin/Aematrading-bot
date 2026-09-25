import BOT_CONFIG from "../config/botConfig.js";
import getBotResearchMarketEvidence from "./botResearchMarketProvider.js";
import { runAllBotResearchEngines } from "./botResearchEngines.js";

export async function researchBotCandidate(candidate, options={}) {
  const evidence=await getBotResearchMarketEvidence(candidate.asset,options);
  const engines=runAllBotResearchEngines(candidate.asset,evidence);
  return {...candidate,researchEvidence:evidence,engines};
}

export async function researchBotTop20(candidates=[],options={}) {
  // Sequential on purpose: polite API usage and deterministic diagnostics.
  const researched=[];
  const failed=[];
  for(const candidate of candidates){
    try { researched.push(await researchBotCandidate(candidate,options)); }
    catch(error){ failed.push({candidate,error:error?.message||String(error)}); }
  }
  return {researched,failed,requested:candidates.length,completed:researched.length};
}
