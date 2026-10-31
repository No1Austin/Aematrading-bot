import {analyzePrecision} from './precisionAnalysis.js';
import {planStructureExecution} from '../structure/structureExecutionPlan.js';
const good=x=>Number.isFinite(x)&&x>0;
const round=x=>Number(x.toPrecision(12));
export function precisionRefinement({direction,candles5m,candles15m,candles1h,liquidity=null,original=null}){
 const evidence=analyzePrecision({direction,candles5m,candles15m,candles1h,liquidity});
 const structural=planStructureExecution({direction,candles5m,candles15m,candles1h});
 const bull=direction==='BULL',sign=bull?1:-1,px=evidence.referencePrice,atr=evidence.volatility.atr15;
 const zones=[...(structural.diagnostics?.zones15m??[]),...(structural.diagnostics?.zones1h??[])];
 const sources=[{kind:'CURRENT_REFERENCE',price:px,weight:0}];
 for(const z of zones)if((bull?z.upper<px:z.lower>px))sources.push({kind:'STRUCTURE_RETEST',price:bull?z.upper:z.lower,zone:z,weight:z.strength??0});
 for(const z of evidence.fairValueGaps)if((bull?z.midpoint<px:z.midpoint>px))sources.push({kind:'FVG_RETEST',price:z.midpoint,zone:z,weight:1});
 if(evidence.liquiditySweep?.confirmed)sources.push({kind:'SWEEP_RETEST',price:evidence.liquiditySweep.level,weight:2});
 const highs=candles15m.slice(-24).map(x=>Number(x.high)),lows=candles15m.slice(-24).map(x=>Number(x.low));
 const recentHigh=Math.max(...highs),recentLow=Math.min(...lows);
 const sweep=evidence.liquiditySweep;
 const baseInvalidation=bull?Math.min(...lows):Math.max(...highs);
 const invalidation=sweep?(bull?Math.min(baseInvalidation,sweep.extreme):Math.max(baseInvalidation,sweep.extreme)):baseInvalidation;
 const buffer=Math.max(atr*.18,evidence.volatility.atr5*.35);
 const stop=bull?invalidation-buffer:invalidation+buffer;
 const opposing=zones.filter(z=>bull?z.lower>px:z.upper<px).sort((a,b)=>Math.abs(a.center-px)-Math.abs(b.center-px));
 const feesBps=12,slippageBps=8,estimatedCostBps=feesBps+slippageBps;
 const candidates=[];
 for(const src of sources){const entry=src.price;if(!good(entry)||!good(stop)||sign*(entry-stop)<=0||Math.abs(entry-px)>atr*2.5)continue;
 const risk=sign*(entry-stop),riskPct=risk/entry;
 if(riskPct>.045)continue;
 const opposingTarget=opposing.map(z=>bull?z.lower-atr*.1:z.upper+atr*.1).filter(x=>good(x)&&sign*(x-entry)>0).sort((a,b)=>sign*(a-b))[0];
 // No opposing level => illustrative 2R projection, explicitly not verified liquidity target.
 const target=opposingTarget??entry+sign*risk*2;
 if(!good(target)||sign*(target-entry)<=0)continue;
 const grossRR=sign*(target-entry)/risk,netRR=(sign*(target-entry)-entry*estimatedCostBps/10000)/risk;
 if(netRR<1.45)continue;
 const waiting=src.kind!=='CURRENT_REFERENCE';
 const evidenceCount=Number(Boolean(sweep?.confirmed))+Number(evidence.marketStructure.fiveMinute.supportsThesis)+Number(evidence.marketStructure.fifteenMinute.supportsThesis)+Number(evidence.volume.relativeVolume>=1.2);
 const score=netRR+Math.min(src.weight,3)*.08+evidenceCount*.12-(waiting?.1:0)-(evidence.volatility.largeCandle&& !waiting?.5:0);
 candidates.push({kind:src.kind,entry:round(entry),stop:round(stop),target:round(target),grossRR:round(grossRR),estimatedNetRR:round(netRR),riskPct:round(riskPct),distanceFromCurrentPct:round(Math.abs(entry-px)/px*100),score:round(score),zone:src.zone??null,targetSource:opposingTarget?'OPPOSING_STRUCTURE':'ILLUSTRATIVE_2R',requiresFreshConfirmation:true,fillProbabilityUnknown:true});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const best=candidates[0]??null;
 const conflict=[evidence.marketStructure.fiveMinute,evidence.marketStructure.fifteenMinute].some(x=>x.breakDirection&&x.breakDirection!==direction);
 const decision=conflict?'WAIT_FOR_STRUCTURE_CONFIRMATION':!best?'NO_VIABLE_ENTRY':best.kind==='CURRENT_REFERENCE'?'WAIT_FOR_CONFIRMATION':best.kind==='FVG_RETEST'?'WAIT_FOR_FVG_RETEST':'WAIT_FOR_PULLBACK';
 return {decision,reason:conflict?'OPPOSING_STRUCTURE_BREAK_REQUIRES_REVIEW':!best?'NO_CANDIDATE_WITH_ACCEPTABLE_STRUCTURE_AND_NET_RR':best.kind==='CURRENT_REFERENCE'?'ENTRY_REQUIRES_INDEPENDENT_CONFIRMATION':'HYPOTHETICAL_RETEST_ZONE_NOT_YET_FILLED',refined:conflict?null:best,candidates:conflict?[]:candidates.slice(0,5),evidence,baseline:original??null,structuralDecision:structural.decision,structuralReason:structural.reason,costAssumptions:{roundTripFeesBps:feesBps,roundTripSlippageBps:slippageBps,verified:false},qualification:'NOT_QUALIFIED',validatedForTrading:false,autoApplied:false,researchOnly:true,executionAuthority:false,liveExecution:false,caveats:['No entry fill or market depth verified','Re-evaluate on fresh closed candles','Indicators do not establish predictive edge']};
}
