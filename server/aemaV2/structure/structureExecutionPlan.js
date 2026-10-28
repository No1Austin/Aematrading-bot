/** AEMA V2 research-only structure-aware entry/stop/target planner.
 * Inputs: chronologically ascending, CLOSED OHLC candles. No order submission.
 * Never changes the direction selected by the caller.
 */
const finite = x => Number.isFinite(x);
const round = x => Number(x.toPrecision(12));
const median = a => {const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0;};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function validate(rows,label){
 if(!Array.isArray(rows)||rows.length<35)throw Error(`INSUFFICIENT_${label}_CANDLES`);
 const a=rows.map(x=>({t:Number(x.t??x.openTime??x.time),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
 if(a.some((c,i)=>![c.t,c.open,c.high,c.low,c.close].every(finite)||c.low<=0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)||(i&&c.t<=a[i-1].t)))throw Error(`INVALID_${label}_CANDLES`);
 return a;
}
function atr(a,n=14){let tr=[];for(let i=1;i<a.length;i++)tr.push(Math.max(a[i].high-a[i].low,Math.abs(a[i].high-a[i-1].close),Math.abs(a[i].low-a[i-1].close)));return tr.slice(-n).reduce((s,v)=>s+v,0)/Math.min(n,tr.length);}
function pivots(a,left=3,right=3){const p=[];for(let i=left;i<a.length-right;i++){
 const s=a.slice(i-left,i+right+1),c=a[i];
 if(s.every((x,j)=>j===left||c.high>x.high))p.push({price:c.high,type:'RESISTANCE',index:i});
 if(s.every((x,j)=>j===left||c.low<x.low))p.push({price:c.low,type:'SUPPORT',index:i});
 }return p;}
function zones(a,vol){
 const width=Math.max(vol*.3,median(a.slice(-40).map(x=>x.high-x.low))*.3);
 const points=pivots(a).sort((x,y)=>x.price-y.price),groups=[];
 for(const p of points){let g=groups.find(z=>Math.abs(z.center-p.price)<=width*1.4);
  if(!g){g={prices:[],points:[],center:p.price};groups.push(g);}
  g.prices.push(p.price);g.points.push(p);g.center=median(g.prices);
 }
 return groups.map(g=>{
  const center=median(g.prices),touches=g.points.length;
  const lastIndex=Math.max(...g.points.map(x=>x.index));
  const lower=Math.min(...g.prices)-width/2,upper=Math.max(...g.prices)+width/2;
  const age=a.length-1-lastIndex;
  const role=a.at(-1).close>upper?'SUPPORT':a.at(-1).close<lower?'RESISTANCE':'ACTIVE';
  return {lower:round(lower),upper:round(upper),center:round(center),touches,age,role,strength:round(touches/(1+age/60))};
 }).filter(z=>z.touches>=2).sort((x,y)=>y.strength-x.strength).slice(0,24);
}
const plan=(decision,reason,extra={})=>({decision,reason,...extra});
/** config values are illustrative defaults, not empirically optimized. */
export function planStructureExecution({direction,candles15m,candles5m,candles1h,config={}}){
 if(!['BULL','BEAR'].includes(direction))throw Error('INVALID_DIRECTION');
 const c15=validate(candles15m,'15M'),c5=validate(candles5m,'5M'),c1=validate(candles1h,'1H');
 const last=c5.at(-1),px=last.close,vol=atr(c15),vol5=atr(c5),vol1=atr(c1);
 if(!(vol>0&&vol5>0&&vol1>0))return plan('NO_SETUP','ZERO_VOLATILITY');
 const bullish=direction==='BULL',sign=bullish?1:-1;
 const z15=zones(c15,vol),z1=zones(c1,vol1);
 const all=[...z15.map(z=>({...z,tf:'15m'})),...z1.map(z=>({...z,tf:'1h'}))];
 const behind=all.filter(z=>bullish?z.upper<px:z.lower>px).sort((a,b)=>Math.abs(px-a.center)-Math.abs(px-b.center));
 const ahead=all.filter(z=>bullish?z.lower>px:z.upper<px).sort((a,b)=>Math.abs(px-a.center)-Math.abs(px-b.center));
 const nearestBehind=behind[0]??null,nearestAhead=ahead[0]??null;
 const recent15=c15.slice(-24,-1),recent5=c5.slice(-10,-1);
 const localLow=Math.min(...recent15.map(x=>x.low)),localHigh=Math.max(...recent15.map(x=>x.high));
 const swingLow=Math.min(...recent5.map(x=>x.low)),swingHigh=Math.max(...recent5.map(x=>x.high));
 const lastBody=Math.abs(last.close-last.open),lastRange=last.high-last.low;
 const wickBull=(Math.min(last.open,last.close)-last.low)/Math.max(lastRange,1e-12);
 const wickBear=(last.high-Math.max(last.open,last.close))/Math.max(lastRange,1e-12);
 const rejection=bullish?(last.close>last.open&&wickBull>=.30):(last.close<last.open&&wickBear>=.30);
 const buffer=Math.max(vol*.18,vol5*.35);
 const behindBoundary=nearestBehind?(bullish?nearestBehind.lower:nearestBehind.upper):null;
 // A structural stop must be on the invalidation side of the 15m swing, with ATR buffer.
 const invalidation=bullish?Math.min(localLow,behindBoundary??localLow):Math.max(localHigh,behindBoundary??localHigh);
 const stop=bullish?invalidation-buffer:invalidation+buffer;
 const risk=Math.abs(px-stop),riskPct=risk/px;
 const maxRiskPct=config.maxRiskPct??.045;
 const minRR=config.minGrossRR??1.6;
 const minRoomATR=config.minRoomATR??.5;
 const maxChaseATR=config.maxChaseATR??1.5;
 const feesBps=config.roundTripFeesBps??12;
 const slippageBps=config.roundTripSlippageBps??8;
 const costs=px*(feesBps+slippageBps)/10000;
 const diagnostics={atr15:round(vol),atr5:round(vol5),atr1h:round(vol1),nearestSupport:all.filter(z=>z.upper<px).sort((a,b)=>b.upper-a.upper)[0]??null,nearestResistance:all.filter(z=>z.lower>px).sort((a,b)=>a.lower-b.lower)[0]??null,nearestBehind,nearestAhead,zones15m:z15,zones1h:z1,stopInvalidation:round(invalidation),roundTripCostEstimate:round(costs),candleRejection:rejection,bodyRatio:round(lastBody/Math.max(lastRange,1e-12))};
 const common={direction,referencePrice:round(px),diagnostics,researchOnly:true,executionAuthority:false,liveExecution:false};
 if(!(risk>0)||riskPct>maxRiskPct)return {...common,...plan('NO_SETUP','STOP_TOO_WIDE_OR_INVALID',{stopReference:round(stop),riskPct:round(riskPct)})};
 // Avoid entering directly into an opposing 15m/1h level.
 const room=nearestAhead?Math.max(0,bullish?nearestAhead.lower-px:px-nearestAhead.upper):Infinity;
 if(room<Math.max(minRoomATR*vol,risk*minRR+costs))return {...common,...plan('WAIT_FOR_RETEST','OPPOSING_STRUCTURE_LIMITS_REWARD',{stopReference:round(stop),availableRoom:round(room)})};
 // A 5m trigger must not chase a price excessively distant from the 15m EMA21 proxy.
 const mean21=c15.slice(-21).reduce((s,x)=>s+x.close,0)/21;
 if(sign*(px-mean21)>maxChaseATR*vol)return {...common,...plan('WAIT_FOR_PULLBACK','ENTRY_EXTENDED_FROM_15M_BASE',{stopReference:round(stop),distanceATR:round(sign*(px-mean21)/vol)})};
 // Last 5m candle must have directional close; otherwise avoid market entry.
 const directional=bullish?last.close>last.open:last.close<last.open;
 if(!directional)return {...common,...plan('WAIT_FOR_RETEST','NO_DIRECTIONAL_5M_TRIGGER',{stopReference:round(stop)})};
 const targetRisk= Math.max(risk*minRR+costs,risk*2);
 const maxTarget=nearestAhead?(bullish?nearestAhead.lower-vol*.1:nearestAhead.upper+vol*.1):null;
 let target=px+sign*targetRisk;
 if(maxTarget!==null)target=bullish?Math.min(target,maxTarget):Math.max(target,maxTarget);
 const grossRR=sign*(target-px)/risk,netRR=(sign*(target-px)-costs)/risk;
 if(target<=0||grossRR<minRR||netRR<minRR-.15)return {...common,...plan('NO_SETUP','TARGET_AFTER_COSTS_INSUFFICIENT',{stopReference:round(stop),grossRR:round(grossRR),netRR:round(netRR)})};
 return {...common,...plan('ENTRY_CANDIDATE_UNVALIDATED','STRUCTURE_ROOM_AND_5M_TRIGGER_CONFIRMED',{entryReference:round(px),stopReference:round(stop),targetIllustration:round(target),grossRR:round(grossRR),netRR:round(netRR),riskPct:round(riskPct),requiresCostAndLiquidityValidation:true,requiresEntryPriceValidation:true})};
}
export default planStructureExecution;
