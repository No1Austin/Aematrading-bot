/** AEMA private stock research, historical bars only. No brokerage order APIs. */
import { randomUUID } from 'node:crypto';
import { getHistoricalBars } from '../../../data/providers/alpacaHistoricalDataService.js';
import { classifyStockMarketRegime } from './botStockMarketRegimeEngine.js';

const MAX_SYMBOLS=12;
const MAX_HISTORY=400;
const MIN_BARS=65;
const MAX_AGE_MS=4*24*60*60*1000; // hard limit only; see data freshness diagnostics
const history=[];
const num=v=>v===null||v===undefined||v===''?NaN:Number.isFinite(Number(v))?Number(v):NaN;
const round=n=>Number.isFinite(n)?Number(n.toPrecision(9)):null;
const average=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const finitePositive=n=>Number.isFinite(n)&&n>0;
function normalizeBar(b){
  const open=num(b.open??b.o),high=num(b.high??b.h),low=num(b.low??b.l),close=num(b.close??b.c),volume=num(b.volume??b.v),timestamp=b.timestamp??b.t;
  const ms=typeof timestamp==='number'?timestamp:Date.parse(timestamp);
  if(![open,high,low,close,volume].every(Number.isFinite)||!finitePositive(open)||!finitePositive(close)||low<=0||high<low||high<Math.max(open,close)||low>Math.min(open,close)||volume<0||!Number.isFinite(ms))return null;
  return {open,high,low,close,volume,timestamp:new Date(ms).toISOString(),ms};
}
function normalizeBars(raw){
  const unique=new Map();
  for(const b of raw??[]){const v=normalizeBar(b);if(v)unique.set(v.ms,v);}
  return [...unique.values()].sort((a,b)=>a.ms-b.ms).slice(-MAX_HISTORY);
}
function atr(bars,period=14){
  const x=bars.slice(-period);if(x.length<period)return NaN;
  return average(x.map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-(bars[bars.length-period+i-1]?.close??b.open)),Math.abs(b.low-(bars[bars.length-period+i-1]?.close??b.open)))));
}
function detect(bars,r){
  const last=bars.at(-1),previous=bars.at(-2);
  // Breakout compares against previous 20 completed bars; retest compares
  // the previous candle against the 20 bars BEFORE that candle.
  const prior=bars.slice(-21,-1),retestPrior=bars.slice(-22,-2);
  const top=Math.max(...prior.map(b=>b.high)),bottom=Math.min(...prior.map(b=>b.low));
  const retestTop=Math.max(...retestPrior.map(b=>b.high));
  const retestBottom=Math.min(...retestPrior.map(b=>b.low));
  const mid=average(bars.slice(-20).map(b=>b.close));
  const avgVol=average(bars.slice(-21,-1).map(b=>b.volume));
  const v=avgVol>0?last.volume/avgVol:0;
  const candidates=[];
  const add=(strategy,direction,entry,stop,target,reason)=>candidates.push({strategy,direction,entry,stop,target,reason});
  if(last.close>top&&v>=1.3&&last.close>last.open)add('MOMENTUM_BREAKOUT','BULL',last.close,Math.min(previous.low,top)-0.15*r.atr,last.close+2.2*r.atr,'VOLUME_CONFIRMED_BREAKOUT');
  if(last.close<bottom&&v>=1.3&&last.close<last.open)add('MOMENTUM_BREAKOUT','BEAR',last.close,Math.max(previous.high,bottom)+0.15*r.atr,last.close-2.2*r.atr,'VOLUME_CONFIRMED_BREAKDOWN');
  if(previous.close>retestTop&&last.low<=retestTop&&last.close>retestTop&&last.close>last.open)add('BREAKOUT_RETEST','BULL',last.close,Math.min(last.low,retestTop)-0.2*r.atr,last.close+2.2*r.atr,'RETEST_CONFIRMED');
  if(previous.close<retestBottom&&last.high>=retestBottom&&last.close<retestBottom&&last.close<last.open)add('BREAKOUT_RETEST','BEAR',last.close,Math.max(last.high,retestBottom)+0.2*r.atr,last.close-2.2*r.atr,'RETEST_CONFIRMED');
  if(r.change>0.018&&last.low<=mid&&last.close>mid&&last.close>last.open)add('TREND_PULLBACK','BULL',last.close,Math.min(last.low,previous.low)-0.15*r.atr,last.close+2.2*r.atr,'TREND_PULLBACK_RECLAIM');
  if(r.change< -0.018&&last.high>=mid&&last.close<mid&&last.close<last.open)add('TREND_PULLBACK','BEAR',last.close,Math.max(last.high,previous.high)+0.15*r.atr,last.close-2.2*r.atr,'TREND_PULLBACK_REJECTION');
  if(last.low<bottom&&last.close>bottom&&last.close>last.open)add('LIQUIDITY_SWEEP','BULL',last.close,last.low-0.15*r.atr,last.close+2.2*r.atr,'LOW_SWEEP_RECLAIM');
  if(last.high>top&&last.close<top&&last.close<last.open)add('LIQUIDITY_SWEEP','BEAR',last.close,last.high+0.15*r.atr,last.close-2.2*r.atr,'HIGH_SWEEP_REJECTION');
  if(r.activeRegimes.includes('RANGING')&&last.low<=bottom+0.25*r.atr&&last.close>last.open)add('RANGE_ROTATION','BULL',last.close,last.low-0.15*r.atr,top,'RANGE_LOWER_EDGE_REJECTION');
  if(r.activeRegimes.includes('RANGING')&&last.high>=top-0.25*r.atr&&last.close<last.open)add('RANGE_ROTATION','BEAR',last.close,last.high+0.15*r.atr,bottom,'RANGE_UPPER_EDGE_REJECTION');
  return candidates;
}
export function evaluateStockBars({symbol,bars,asOf=Date.now(),timeframe='5Min',minRiskReward=1.5}={}){
  const candles=normalizeBars(bars);const base={assetClass:'STOCK',symbol,timeframe,executionAuthority:false,liveExecution:false,researchOnly:true,marketDataType:'HISTORICAL_BARS',generatedAt:new Date(asOf).toISOString()};
  if(!Number.isFinite(asOf))throw new Error('STOCK_AS_OF_INVALID');
  if(candles.length<MIN_BARS)return {...base,status:'INSUFFICIENT_DATA',blockers:['MINIMUM_65_VALID_BARS'],setups:[]};
  const last=candles.at(-1);if(asOf-last.ms>MAX_AGE_MS||last.ms>asOf+60000)return {...base,status:'STALE_DATA',blockers:['LAST_BAR_TOO_OLD_OR_FUTURE'],lastBarAt:last.timestamp,setups:[]};
  const r=classifyStockMarketRegime(candles);if(!finitePositive(r.atr))return {...base,status:'INVALID_VOLATILITY',blockers:['ATR_UNAVAILABLE'],setups:[]};
  const minRR=Number.isFinite(Number(minRiskReward))?Math.max(1.5,Number(minRiskReward)):1.5;
  const rejected=[];const accepted=[];
  const detected=detect(candles,r);
  const strategyEvaluations=[];
  for(const x of detected){
    const regimeEligible=r.eligibleStrategies.includes(x.strategy);
    strategyEvaluations.push({strategy:x.strategy,direction:x.direction,detected:true,regimeEligible,reason:regimeEligible?'PATTERN_DETECTED_REGIME_ELIGIBLE':'PATTERN_DETECTED_REGIME_NOT_ELIGIBLE'});
    const signedRisk=x.direction==='BULL'?x.entry-x.stop:x.stop-x.entry;
    const risk=signedRisk, reward=x.direction==='BULL'?x.target-x.entry:x.entry-x.target;
    const rr=risk>0?reward/risk:NaN;
    const blockers=[];
    if(!regimeEligible)blockers.push('STRATEGY_REGIME_NOT_ELIGIBLE');
    if(!finitePositive(x.entry)||!finitePositive(x.stop)||!finitePositive(risk)||!finitePositive(reward)||!finitePositive(x.target))blockers.push('INVALID_SETUP_GEOMETRY');
    if(risk<0.3*r.atr)blockers.push('STOP_TOO_TIGHT_FOR_ATR');
    if(risk>3*r.atr)blockers.push('STOP_TOO_WIDE_FOR_ATR');
    if(!Number.isFinite(rr)||rr<minRR)blockers.push('REWARD_BELOW_MINIMUM');
    const setup={assetClass:'STOCK',symbol,direction:x.direction,strategy:x.strategy,marketRegime:r.name,regimeEvidence:r.evidence,entry:round(x.entry),stop:round(x.stop),target:round(x.target),targets:[round(x.target)],riskReward:Number.isFinite(rr)?round(rr):null,signalEvidence:x.reason,barTimestamp:last.timestamp,setupStatus:'HISTORICAL_PATTERN_DETECTED',executionAuthority:false,liveExecution:false,approved:blockers.length===0,blockers};
    (blockers.length?rejected:accepted).push(setup);
  }
  return {...base,status:accepted.length?'RESEARCH_SETUPS_FOUND':'NO_QUALIFIED_SETUP',lastBarAt:last.timestamp,marketRegime:r.name,marketRegimeDiagnostics:r,strategyDiagnostics:{...r.strategyDiagnostics,detectedPatterns:strategyEvaluations},barCount:candles.length,setups:accepted,rejected,blockers:accepted.length?[]:rejected.length?['CANDIDATES_REJECTED_BY_RISK_VALIDATION']:['NO_CONFIRMED_STRATEGY_PATTERN']};
}
export function listPublishedStockSetups(){return history.map(x=>({...x}));}
export async function runStockResearch({symbols,timeframe='5Min',lookbackDays=20,feed='iex',minRiskReward=1.5}={}){
  if(!Array.isArray(symbols)||!symbols.length||symbols.length>MAX_SYMBOLS||symbols.some(x=>typeof x!=='string'||!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x.toUpperCase())))throw new Error('STOCK_SYMBOLS_INVALID_MAX_12');
  if(!['1Min','5Min','15Min','1Hour','1Day'].includes(timeframe))throw new Error('STOCK_TIMEFRAME_INVALID');
  if(!['iex','sip'].includes(feed))throw new Error('STOCK_FEED_INVALID');
  const days=Number(lookbackDays);if(!Number.isInteger(days)||days<5||days>90)throw new Error('STOCK_LOOKBACK_INVALID');
  const end=new Date(),start=new Date(end.getTime()-days*86400000),results=[];
  for(const symbol of [...new Set(symbols.map(x=>x.toUpperCase()))]){
    try{
      const data=await getHistoricalBars({symbol,start:start.toISOString(),end:end.toISOString(),timeframe,feed,maximumBars:5000});
      if(!data.approved){results.push({symbol,status:'PROVIDER_ERROR',errors:data.errors??[],setups:[]});continue;}
      const result=evaluateStockBars({symbol,bars:data.bars,timeframe,asOf:end.getTime(),minRiskReward});
      const published=result.setups.map(setup=>({setupId:`stock_${randomUUID()}`,...setup,publishedAt:end.toISOString(),researchOnly:true}));
      history.unshift(...published);history.length=Math.min(history.length,250);
      results.push({...result,setups:published,feed});
    }catch(e){results.push({symbol,status:'PROVIDER_ERROR',errors:[String(e?.message??e)],setups:[]});}
  }
  return {assetClass:'STOCK',researchOnly:true,executionAuthority:false,liveExecution:false,provider:'ALPACA_HISTORICAL',generatedAt:end.toISOString(),results,qualifiedSetups:results.flatMap(r=>r.setups??[]),counts:{requested:symbols.length,researched:results.filter(r=>!['PROVIDER_ERROR','INSUFFICIENT_DATA'].includes(r.status)).length,qualifiedSetups:results.reduce((n,r)=>n+(r.setups?.length??0),0)}};
}
