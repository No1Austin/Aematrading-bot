/** Offline archive and setup-quality reporting. No provenance promotion or execution. */
import crypto from 'node:crypto';
const num = v => v === null || v === undefined || v === '' ? NaN : Number(v);
const finite = v => Number.isFinite(num(v));
export function inspectArchive(text) {
  const summary={records:0,validJson:0,parseErrors:0,hashMismatches:0,unverified:0,duplicates:0,bySymbol:{},byInterval:{},errors:[],researchOnly:true,readyForTraining:false};
  const seen=new Set();
  for(const [index,line] of text.split(/\r?\n/).entries()) {
    if(!line.trim()) continue;
    summary.records++;
    let r;
    try {r=JSON.parse(line);} catch {summary.parseErrors++;summary.errors.push({line:index+1,reason:'INVALID_JSON'});continue;}
    summary.validJson++;
    const clone=JSON.parse(JSON.stringify(r));
    const hash=clone.archiveMetadata?.sha256;
    if(clone.archiveMetadata)delete clone.archiveMetadata.sha256;
    if(!hash || crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex')!==hash) {summary.hashMismatches++;summary.errors.push({line:index+1,reason:'HASH_MISMATCH'});}
    if(r.pointInTimeVerified!==true)summary.unverified++;
    const symbol=String(r.market?.symbol||'UNKNOWN');
    summary.bySymbol[symbol]=(summary.bySymbol[symbol]||0)+1;
    const interval=String(r.candleInterval||'UNKNOWN');
    summary.byInterval[interval]=(summary.byInterval[interval]||0)+1;
    const key=`${r.timestamp}|${symbol}|${interval}`;
    if(seen.has(key))summary.duplicates++;seen.add(key);
  }
  return summary;
}
export function inspectSetup(s,{costBps=12}={}) {
  if(!Number.isFinite(costBps)||costBps<0)throw Error('INVALID_COST_BPS');
  const entry=num(s?.entry),stop=num(s?.stop),target=num(s?.target);
  const direction=String(s?.direction||'').toUpperCase();
  const valid=[entry,stop,target].every(x=>Number.isFinite(x)&&x>0) && (direction==='BULL'?stop<entry&&entry<target:direction==='BEAR'?target<entry&&entry<stop:false);
  const base={symbol:s?.symbol??null,direction:direction||null,strategy:s?.strategy??null,setupApproved:s?.setupApproved===true,geometryValid:valid,assumedRoundTripCostBps:costBps,probabilityTargetFirst:null,netExpectedR:null,executionAuthority:false,researchOnly:true};
  if(!valid)return {...base,reason:'MISSING_OR_INVALID_GEOMETRY'};
  const riskBps=Math.abs(entry-stop)/entry*10000;
  const rewardBps=Math.abs(target-entry)/entry*10000;
  const breakEvenProbability=(riskBps+costBps)/(riskBps+rewardBps);
  return {...base,riskBps,rewardBps,riskReward:rewardBps/riskBps,roundTripCostToRisk:costBps/riskBps,breakEvenTargetProbability:breakEvenProbability,reason:breakEvenProbability>=1?'COST_EXCEEDS_REWARD':'PROBABILITY_NOT_VALIDATED'};
}
export function summarizeSetups(setups,options={}) {
  const rows=setups.map(s=>inspectSetup(s,options));
  const byStrategy={};
  for(const row of rows){const key=row.strategy||'UNKNOWN';const b=byStrategy[key]??={total:0,approved:0,validGeometry:0,costExceedsReward:0};b.total++;if(row.setupApproved)b.approved++;if(row.geometryValid)b.validGeometry++;if(row.reason==='COST_EXCEEDS_REWARD')b.costExceedsReward++;}
  return {total:rows.length,validGeometry:rows.filter(r=>r.geometryValid).length,approved:rows.filter(r=>r.setupApproved).length,byStrategy,rows,status:'RESEARCH_ONLY_NO_PROBABILITY_MODEL'};
}
