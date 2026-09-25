import PHASE6 from "../config/botPhase6Config.js";
import {getTradeMemory} from "./botTradeMemoryStore.js";
import buildSetupFingerprint from "./botSetupFingerprint.js";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Number.isFinite(Number(v));
const similarityNumber=(a,b,scale=100)=>{
  if(!finite(a)||!finite(b)) return null;
  return clamp(1-Math.abs(Number(a)-Number(b))/Math.max(scale,Math.abs(Number(a)),Math.abs(Number(b)),1),0,1);
};
function similarity(current,past,cfg){
  let sum=0,w=0;
  for(const [key,weight] of Object.entries(cfg.dimensions)){
    let sim=null;
    if(key==="direction") sim=current.direction&&past.direction ? (current.direction===past.direction?1:0) : null;
    else if(key==="riskReward") sim=similarityNumber(current[key],past[key],4);
    else if(key==="spread") sim=similarityNumber(current[key],past[key],0.25);
    else if(key==="volatility") sim=similarityNumber(current[key],past[key],5);
    else sim=similarityNumber(current[key],past[key],100);
    if(sim!==null){sum+=sim*weight;w+=weight}
  }
  return w?sum/w:0;
}
const recencyWeight=(iso,halfLifeDays)=>{
  const age=Math.max(0,(Date.now()-new Date(iso).getTime())/86400000);
  return Math.pow(0.5,age/halfLifeDays);
};
export function evaluateHistoricalSetup(candidate,options={}){
  const cfg={...PHASE6.learning,...options};
  const current=buildSetupFingerprint(candidate);
  const records=getTradeMemory().records;
  const matches=records.map(r=>{
    const sim=similarity(current,r.fingerprint||{},cfg);
    return {...r,_similarity:sim,_weight:sim*recencyWeight(r.closedAt||r.recordedAt,cfg.recencyHalfLifeDays)};
  }).filter(r=>r._similarity>=cfg.minimumSimilarity);

  const weight=matches.reduce((s,r)=>s+r._weight,0);
  const weightedWins=matches.reduce((s,r)=>s+(r.outcome==="WIN"?r._weight:0),0);
  const weightedR=matches.reduce((s,r)=>s+(Number(r.rMultiple)||0)*r._weight,0);
  const weightedReturn=matches.reduce((s,r)=>s+(Number(r.returnPercent)||0)*r._weight,0);
  const winRate=weight?weightedWins/weight:null;
  const expectancyR=weight?weightedR/weight:null;
  const avgReturn=weight?weightedReturn/weight:null;
  const sample=matches.length;
  const reliability=clamp(sample/cfg.strongSample,0,1);
  // Historical memory is an influence, never an absolute trade gate.
  const edge=expectancyR===null?0:clamp(expectancyR/2,-1,1);
  const influence=edge*reliability*cfg.maximumInfluencePoints;

  return {
    fingerprint:current,sampleSize:sample,effectiveSampleWeight:Number(weight.toFixed(3)),
    winRate:winRate===null?null:Number((winRate*100).toFixed(2)),
    expectancyR:expectancyR===null?null:Number(expectancyR.toFixed(4)),
    averageReturnPercent:avgReturn===null?null:Number(avgReturn.toFixed(4)),
    reliability:Number(reliability.toFixed(4)),
    influencePoints:Number(influence.toFixed(4)),
    evidenceLevel:sample===0?"NONE":sample<cfg.minimumComparableSample?"EARLY":sample<cfg.strongSample?"DEVELOPING":"ESTABLISHED",
    similarTrades:matches.sort((a,b)=>b._similarity-a._similarity).slice(0,10).map(r=>({
      tradeId:r.tradeId,symbol:r.symbol,direction:r.direction,outcome:r.outcome,
      rMultiple:r.rMultiple,similarity:Number(r._similarity.toFixed(4)),closedAt:r.closedAt
    })),
    isTradeGate:false
  };
}
export function applyTradeLearning(executionCandidates,options={}){
  const rows=executionCandidates.map(c=>{
    const learning=evaluateHistoricalSetup(c,options);
    return {...c,tradeLearning:learning,
      learnedExecutionScore:Number((Number(c.executionRankScore||0)+learning.influencePoints).toFixed(4))};
  }).sort((a,b)=>b.learnedExecutionScore-a.learnedExecutionScore)
    .map((x,i)=>({...x,preLearningExecutionRank:x.executionRank,executionRank:i+1}));
  return {ranked:rows,best:rows[0]||null};
}
export default applyTradeLearning;
