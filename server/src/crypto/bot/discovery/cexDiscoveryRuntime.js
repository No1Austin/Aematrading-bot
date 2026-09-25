import getBotFuturesUniverse from "../universe/botFuturesUniverseProvider.js";
import filterBotHardEligibleAssets from "../filters/botHardEligibilityFilter.js";
import rankBotOpportunities from "../filters/botOpportunityFilter.js";
import {researchBotTop20} from "../research/botResearchOrchestrator.js";
import determineBotDirection from "../direction/botDirectionEngine.js";
import rankBotResearchCandidates from "../ranking/botResearchRankingEngine.js";
import getBotFuturesExecutionMarket from "../market/botFuturesExecutionMarketProvider.js";
import buildBotFuturesSetup from "../setup/botFuturesSetupBuilder.js";
import rankBotExecutionSetups from "../ranking/botExecutionRankingEngine.js";
import applyTradeLearning from "../learning/botTradeLearningEngine.js";

const MAX_EVENTS=80;
let timer=null,busy=false,cycle=0;
let state={running:false,busy:false,cycle:0,lastStartedAt:null,lastCompletedAt:null,lastError:null,events:[],snapshot:null};
const event=(text,type="info",data={})=>{
  state.events=[...state.events,{id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,at:new Date().toISOString(),text,type,...data}].slice(-MAX_EVENTS);
};
const publicDirection=d=>d==="LONG"?"Bullish Direction":d==="SHORT"?"Bearish Direction":"Direction unavailable";
const compact=x=>({symbol:x.symbol,direction:publicDirection(x.directionDecision?.direction||x.setup?.direction||x.direction),
  internalDirection:x.directionDecision?.direction||x.setup?.direction||x.direction,
  executionScore:x.learnedExecutionScore??x.executionRankScore??null,riskReward:x.setup?.riskReward??x.riskReward??null});

export async function runCexDiscoveryCycle(options={}){
  if(busy)return state.snapshot;
  busy=true;state.busy=true;state.lastStartedAt=new Date().toISOString();cycle++;state.cycle=cycle;
  event(`Starting CEX discovery cycle #${cycle}`,"cycle");
  try{
    const universe=await getBotFuturesUniverse(options.universe); event(`${universe.assets.length} CEX futures instruments discovered`);
    const eligibility=filterBotHardEligibleAssets(universe.assets,options.eligibility); event(`${eligibility.approved.length} passed market eligibility`);
    const filtered=rankBotOpportunities(eligibility.approved,options.opportunity); event(`Market filters completed · ${filtered.qualified.length} qualified by volume, liquidity, volatility, momentum and activity`);
    const top20=filtered.topCandidates.slice(0,20).map((row,index)=>({rank:index+1,symbol:row.asset.symbol,baseAsset:row.asset.baseAsset,quoteAsset:row.asset.quoteAsset,
      opportunityScore:row.opportunity.opportunityScore,dimensions:row.opportunity.dimensions,market:row.asset.market,asset:row.asset,opportunity:row.opportunity}));
    event(`${top20.length} tokens selected for research`,"accent");
    const research=await researchBotTop20(top20,options.research); event(`Research engines completed for ${research.completed} tokens`);
    const directional=research.researched.map(row=>determineBotDirection(row,options.direction));
    const ranked=rankBotResearchCandidates(directional,options.ranking); event(`${ranked.top10.length} strongest research candidates identified`);
    const setups=[],failures=[];
    for(const candidate of ranked.top10){try{const market=await getBotFuturesExecutionMarket(candidate,options.setup);setups.push(buildBotFuturesSetup(candidate,market,options.setup));}
      catch(error){failures.push({symbol:candidate.symbol,error:error?.message||String(error)})}}
    const execution=rankBotExecutionSetups(setups,options.executionRanking);
    const learned=applyTradeLearning(execution.executable,options.learning);
    const bestFive=learned.ranked.slice(0,5).map(compact); event(`${bestFive.length} best executable setups selected`,"accent");
    bestFive.forEach((x,i)=>event(`#${i+1} ${x.symbol} · ${x.direction} · R:R ${Number(x.riskReward||0).toFixed(2)}`,"candidate",{symbol:x.symbol}));
    const strongest=bestFive[0]||null;if(strongest)event(`${strongest.symbol} · ${strongest.direction} · strongest current setup`,"success");
    state.snapshot={cycle,startedAt:state.lastStartedAt,completedAt:new Date().toISOString(),counts:{universe:universe.assets.length,marketEligible:eligibility.approved.length,
      marketFiltered:filtered.qualified.length,selectedForResearch:top20.length,researchCompleted:research.completed,strongestCandidates:ranked.top10.length,
      executableSetups:execution.executable.length,bestSetups:bestFive.length},bestFive,strongest,researchFailures:research.failed.length,setupFailures:failures.length};
    state.lastCompletedAt=state.snapshot.completedAt;state.lastError=null;return state.snapshot;
  }catch(error){state.lastError=error?.message||String(error);event(`Discovery cycle failed · ${state.lastError}`,"error");throw error}
  finally{busy=false;state.busy=false}
}
export function getCexDiscoveryState(){return {...state,events:[...state.events]}}
export function startCexDiscoveryRuntime(options={}){
  if(timer)return {started:false,reason:"ALREADY_RUNNING"};
  const intervalMs=Math.max(60000,Number(options.intervalMs||process.env.AEMA_CEX_DISCOVERY_INTERVAL_MS||120000));
  state.running=true;const tick=()=>runCexDiscoveryCycle(options).catch(()=>{});timer=setInterval(tick,intervalMs);tick();
  return {started:true,intervalMs};
}
export function stopCexDiscoveryRuntime(){if(timer)clearInterval(timer);timer=null;state.running=false;return {stopped:true}}
export default {runCexDiscoveryCycle,getCexDiscoveryState,startCexDiscoveryRuntime,stopCexDiscoveryRuntime};
