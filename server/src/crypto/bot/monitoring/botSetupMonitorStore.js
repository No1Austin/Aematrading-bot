const monitored=new Map();
const id=()=>`mon_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
export function createMonitoredSetup(candidate,scenario=null){if(!candidate?.setup?.approved)throw new Error("ONLY_APPROVED_SETUP_CAN_BE_MONITORED");const monitor={id:id(),symbol:candidate.symbol,status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),original:{asset:candidate.asset,directionDecision:candidate.directionDecision,researchRankScore:candidate.researchRankScore,engines:candidate.engines,setup:candidate.setup},scenario,history:[]};monitored.set(monitor.id,monitor);return monitor;}
export function getMonitoredSetup(id){return monitored.get(id)||null;}
export function listMonitoredSetups(){return [...monitored.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));}
export function updateMonitoredSetup(id,patch){const current=monitored.get(id);if(!current)return null;const next={...current,...patch,updatedAt:new Date().toISOString()};monitored.set(id,next);return next;}
export default {createMonitoredSetup,getMonitoredSetup,listMonitoredSetups,updateMonitoredSetup};
