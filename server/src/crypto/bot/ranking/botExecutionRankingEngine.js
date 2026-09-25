/**
 * Comparative execution-quality ranking.
 * No arbitrary research-score gate.
 */
import BOT_CONFIG from "../config/botConfig.js";
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const inverseQuality=(v,best,worst)=>{
  v=n(v,Infinity); if(!Number.isFinite(v))return 0;
  if(v<=best)return 100;if(v>=worst)return 0;
  return 100*(1-(v-best)/(worst-best));
};
const logQuality=(v,min,max)=>{
  v=n(v);if(v<=min)return 0;if(v>=max)return 100;
  return 100*(Math.log10(v)-Math.log10(min))/(Math.log10(max)-Math.log10(min));
};

export function rankBotExecutionSetups(candidates=[],options={}){
  const weights={...BOT_CONFIG.executionRanking.weights,...(options.weights||{})};
  const evaluated=candidates.map(c=>{
    const s=c.setup||{}, d=c.directionDecision||{};
    if(!s.approved) return {...c,executionRankScore:null,executionQuality:null};
    const rr=clamp((n(s.riskReward)/3)*100);
    const q={
      research:clamp(n(c.researchRankScore)),
      directionSeparation:clamp(n(d.separation)*3),
      riskReward:rr,
      spread:inverseQuality(s.spreadPercent,0.005,0.35),
      slippage:inverseQuality(Math.abs(n(s.slippagePercent,Infinity)),0.01,0.50),
      depth:logQuality(n(s.depthNotional),100_000,100_000_000),
      freshness:inverseQuality(n(s.freshness?.ageMs,Infinity),0,n(s.freshness?.maximumAgeMs,120000)),
    };
    const score=Object.entries(weights).reduce((sum,[k,w])=>sum+n(q[k])*w,0);
    return {...c,executionQuality:q,executionRankScore:Number(score.toFixed(4))};
  });
  const executable=evaluated.filter(x=>Number.isFinite(x.executionRankScore))
    .sort((a,b)=>b.executionRankScore-a.executionRankScore)
    .map((x,i)=>({...x,executionRank:i+1}));
  return {evaluated,executable,best:executable[0]||null,
    executionAuthority:false,liveExecution:false};
}
export default rankBotExecutionSetups;
