/** Offline, research-only post-decision outcome tracking. No execution or model training. */
const n=v=>v===null||v===undefined||v===''?NaN:Number(v);
const stamp=v=>{if(typeof v==='string'&&!/^\d+(\.\d+)?$/.test(v))return Date.parse(v);const x=n(v);return x<1e11?x*1000:x;};
export const INTERVAL_MS={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000};
export function trackOutcome(setup,candles,{interval='5m',maxBars=72,costBps=12}={}){
 const duration=INTERVAL_MS[interval];if(!duration||!Number.isInteger(maxBars)||maxBars<1||!Number.isFinite(costBps)||costBps<0)throw Error('INVALID_OPTIONS');
 const direction=String(setup.direction||'').toUpperCase(), entry=n(setup.entry),stop=n(setup.stop),target=n(setup.target),decision=stamp(setup.timestamp);
 const valid=Number.isFinite(decision)&&[entry,stop,target].every(x=>Number.isFinite(x)&&x>0)&&(direction==='BULL'?stop<entry&&entry<target:direction==='BEAR'?target<entry&&entry<stop:false);
 const base={symbol:setup.symbol??null,strategy:setup.strategy??null,direction,entry,stop,target,decisionTimeMs:decision,assumedRoundTripCostBps:costBps,researchOnly:true,executionAuthority:false,trainingReady:false};
 if(!valid)return {...base,status:'INVALID_SETUP'};
 if(!Array.isArray(candles)||!candles.length)return {...base,status:'MISSING_FUTURE_CANDLES'};
 const bars=candles.map(c=>({...c,t:stamp(c.openTime??c.time??c.timestamp??c.t),o:n(c.open??c.o),h:n(c.high??c.h),l:n(c.low??c.l),c:n(c.close??c.c)})).sort((a,b)=>a.t-b.t);
 if(bars.some(c=>![c.t,c.o,c.h,c.l,c.c].every(Number.isFinite)||c.l<=0||c.h<c.l||c.o<c.l||c.o>c.h||c.c<c.l||c.c>c.h))return {...base,status:'INVALID_CANDLES'};
 if(bars.some((c,i)=>i>0&&c.t===bars[i-1].t))return {...base,status:'DUPLICATE_CANDLES'};
 const future=bars.filter(c=>c.t>=decision).slice(0,maxBars);
 if(!future.length)return {...base,status:'MISSING_FUTURE_CANDLES'};
 // Candle must open at/after decision; any gap invalidates the outcome.
 if(future[0].t!==decision||future.some((c,i)=>i>0&&c.t-future[i-1].t!==duration))return {...base,status:'DATA_GAP'};
 let entered=false,entryTime=null;
 for(const [i,c] of future.entries()){
  const touchedEntry=c.l<=entry&&c.h>=entry;
  if(!entered){if(!touchedEntry)continue;entered=true;entryTime=c.t;}
  const hitStop=direction==='BULL'?c.l<=stop:c.h>=stop;
  const hitTarget=direction==='BULL'?c.h>=target:c.l<=target;
  // Without tick data, cannot determine whether entry preceded either exit within entry candle.
  if(i===future.findIndex(b=>b.t===entryTime)&&(hitStop||hitTarget))return {...base,status:'AMBIGUOUS_ENTRY_BAR',entered:true,entryTimeMs:entryTime};
  if(hitStop&&hitTarget)return {...base,status:'AMBIGUOUS_BOTH_HIT',entered:true,entryTimeMs:entryTime};
  if(hitStop||hitTarget){const grossBps=hitTarget?Math.abs(target-entry)/entry*10000:-Math.abs(stop-entry)/entry*10000;return {...base,status:hitTarget?'TARGET_FIRST':'STOP_FIRST',entered:true,entryTimeMs:entryTime,outcomeTimeMs:c.t,grossBps,netBps:grossBps-costBps};}
 }
 return {...base,status:entered?'UNRESOLVED':'NO_ENTRY',entered,entryTimeMs:entryTime,observedBars:future.length};
}
export function summarizeOutcomes(rows){const byStatus={},byStrategy={};for(const r of rows){byStatus[r.status]=(byStatus[r.status]||0)+1;const k=r.strategy||'UNKNOWN';const s=byStrategy[k]??={total:0,byStatus:{}};s.total++;s.byStatus[r.status]=(s.byStatus[r.status]||0)+1;}return {total:rows.length,byStatus,byStrategy,trainingReady:false,reason:'REQUIRES_VERIFIED_POINT_IN_TIME_SETUPS_AND_MARKET_DATA'};}
