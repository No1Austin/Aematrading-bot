/**
 * Comparative Top-10 ranking. No "score >= 75" admission rule.
 */
import BOT_CONFIG from "../config/botConfig.js";

const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));

export function rankBotResearchCandidates(candidates=[],options={}) {
  const topN=Number(options.topN??BOT_CONFIG.research.topN);

  const ranked=candidates.map(candidate=>{
    const d=candidate.directionDecision||{};
    const directionalStrength=Math.max(Number(d.longScore)||0,Number(d.shortScore)||0);
    const separation=Number(d.separation)||0;
    const confidence=Number(d.confidence)||0;
    const coverage=clamp((Number(d.availableWeight)||0)*100);

    // Comparative quality only. It is not a trade-approval score.
    const researchRankScore=
      directionalStrength*.45 +
      clamp(separation*3)*.20 +
      confidence*.20 +
      coverage*.15;

    return {...candidate,researchRankScore:Number(researchRankScore.toFixed(4))};
  }).filter(x=>x.directionDecision?.direction==="LONG"||x.directionDecision?.direction==="SHORT")
    .sort((a,b)=>b.researchRankScore-a.researchRankScore)
    .map((x,i)=>({...x,researchRank:i+1}));

  return {
    ranked,
    top10:ranked.slice(0,topN),
    topN,
    executionAuthority:false,
    liveExecution:false,
  };
}

export default rankBotResearchCandidates;
