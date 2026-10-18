/** Phase 5C: descriptive, research-only analytics. No execution or training authority. */
const FINISHED = new Set(['TARGET_FIRST', 'STOP_FIRST']);
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const round = (v, digits=6) => v === null || !Number.isFinite(v) ? null : Number(v.toFixed(digits));
function riskBps(row) {
  const entry=num(row.entry), stop=num(row.stop);
  return entry && stop && entry > 0 && stop > 0 && entry !== stop ? Math.abs(entry-stop)/entry*10000 : null;
}
function group(rows) {
  const wins=rows.filter(r=>r.status==='TARGET_FIRST').length;
  const losses=rows.length-wins;
  const grossProfit=rows.reduce((sum,r)=>sum+Math.max(0,r.netR),0);
  const grossLoss=rows.reduce((sum,r)=>sum+Math.max(0,-r.netR),0);
  const sorted=[...rows].sort((a,b)=>a.outcomeTimeMs-b.outcomeTimeMs || a.observationId.localeCompare(b.observationId));
  let equity=0, peak=0, maxDrawdownR=0;
  for(const row of sorted){equity+=row.netR;peak=Math.max(peak,equity);maxDrawdownR=Math.max(maxDrawdownR,peak-equity);}
  return {
    sampleSize:rows.length, wins, losses,
    winRate:rows.length?round(wins/rows.length):null,
    averageNetR:rows.length?round(rows.reduce((s,r)=>s+r.netR,0)/rows.length):null,
    totalNetR:rows.length?round(rows.reduce((s,r)=>s+r.netR,0)):null,
    profitFactor:rows.length && grossLoss>0?round(grossProfit/grossLoss):null,
    maxClosedTradeDrawdownR:rows.length?round(maxDrawdownR):null,
    // Wilson 95% interval describes uncertainty in the observed binary outcome rate, not future performance.
    winRateWilson95:rows.length?wilson(wins,rows.length):null,
    sufficientSample:rows.length>=30
  };
}
function wilson(wins,n){const z=1.959963984540054,p=wins/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;return {lower:round(Math.max(0,c-h)),upper:round(Math.min(1,c+h))};}
function partition(rows,key){const out={};for(const row of rows){const value=String(row[key]??'UNKNOWN');(out[value]??=[]).push(row);}return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,group(v)]));}
export function analyzeStrategyOutcomes(input,{minSample=30}={}){
 if(!Number.isInteger(minSample)||minSample<1)throw new Error('INVALID_MIN_SAMPLE');
 const source=Array.isArray(input)?input:input?.outcomes;
 if(!Array.isArray(source))throw new Error('OUTCOMES_ARRAY_REQUIRED');
 const excluded={},eligible=[],seen=new Set();
 for(const r of source){
  let reason=null;
  if(!r||!FINISHED.has(r.status))reason='NOT_RESOLVED_TARGET_OR_STOP';
  else if(r.pointInTimeVerified!==true)reason='UNVERIFIED_POINT_IN_TIME';
  else if(typeof r.observationId!=='string'||!r.observationId.trim())reason='MISSING_OBSERVATION_ID';
  else if(seen.has(r.observationId))reason='DUPLICATE_OBSERVATION_ID';
  else if(!['BULL','BEAR'].includes(r.direction))reason='INVALID_DIRECTION';
  else if(!num(r.outcomeTimeMs)||!num(r.decisionTimeMs)||r.outcomeTimeMs<r.decisionTimeMs)reason='INVALID_OUTCOME_TIME';
  else if(!num(r.netBps)||riskBps(r)===null)reason='MISSING_NET_RETURN_OR_RISK';
  else if((r.direction==='BULL' && !(r.stop<r.entry && r.entry<r.target))||(r.direction==='BEAR' && !(r.target<r.entry && r.entry<r.stop)))reason='INVALID_GEOMETRY';
  if(reason){excluded[reason]=(excluded[reason]??0)+1;continue;}
  seen.add(r.observationId);
  eligible.push({...r,netR:r.netBps/riskBps(r),strategy:r.strategy??'UNKNOWN'});
 }
 const overall=group(eligible);
 const byStrategy=partition(eligible,'strategy');
 const byDirection=partition(eligible,'direction');
 const bySymbol=partition(eligible,'symbol');
 // minSample is a reporting threshold, not a proof of statistical significance.
 for(const metrics of [overall,...Object.values(byStrategy),...Object.values(byDirection),...Object.values(bySymbol)])metrics.sufficientSample=metrics.sampleSize>=minSample;
 return {
  researchOnly:true,executionAuthority:false,liveExecution:false,trainingReady:false,
  methodology:{eligibleStatuses:['TARGET_FIRST','STOP_FIRST'],requiresPointInTimeVerified:true,netR:'netBps / (abs(entry-stop)/entry*10000)',minSample,profitFactor:'null when no losing net-R observations',drawdown:'closed-trade cumulative net-R drawdown, not intratrade drawdown'},
  observations:source.length,eligible:eligible.length,excluded,
  overall,byStrategy,byDirection,bySymbol,
  notes:['Only completed, verified point-in-time setup outcomes are included.','Unresolved, ambiguous, missing-data and unverified observations are excluded, not counted as losses.','Statistics are descriptive and do not establish a profitable edge or authorize live trading.']
 };
}
