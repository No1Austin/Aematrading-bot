import getBotFuturesUniverse from "../universe/botFuturesUniverseProvider.js";
import filterBotHardEligibleAssets from "../filters/botHardEligibilityFilter.js";
import rankBotOpportunities from "../filters/botOpportunityFilter.js";
import { researchBotTop20 } from "../research/botResearchOrchestrator.js";
import determineBotDirection from "../direction/botDirectionEngine.js";
import rankBotResearchCandidates from "../ranking/botResearchRankingEngine.js";
import getBotFuturesExecutionMarket from "../market/botFuturesExecutionMarketProvider.js";
import buildBotFuturesSetup from "../setup/botFuturesSetupBuilder.js";
import rankBotExecutionSetups from "../ranking/botExecutionRankingEngine.js";
import { getBotPaperAccount } from "../account/botPaperLedger.js";
import buildBotAccountRiskPlan from "../risk/botAccountRiskManager.js";
import revalidateBotOrder from "../revalidation/botFinalRevalidationEngine.js";
import executeBotPaperOrder from "../execution/botPaperOrderExecutor.js";
import applyTradeLearning from "../learning/botTradeLearningEngine.js";
import PHASE7 from "../config/botPhase7Config.js";
import recordBotShadowCycle from "../diagnostics/botShadowRecorder.js";

export async function runBotTradingCycle(options={}){
  const startedAt=new Date().toISOString();
  console.log("[BOT_TRADING_CYCLE_STARTED]", {
  startedAt,
});
  const initialAccount=getBotPaperAccount();
  const portfolioCfg={...PHASE7.portfolio,...options.portfolio};
  if(initialAccount.controls?.paused) return {status:"BOT_PAUSED",accountBefore:initialAccount,accountAfter:initialAccount,paperOnly:true,liveExecution:false};
  if(initialAccount.openPositions>=portfolioCfg.maximumOpenPositions){
    return {
      system:"AEMA_INDEPENDENT_CRYPTO_BOT",phase:"PHASE_7",status:"POSITION_CAP_REACHED",
      startedAt,completedAt:new Date().toISOString(),
      counts:{universe:0,hardEligible:0,opportunityQualified:0,top20:0,researchCompleted:0,
        researchFailed:0,top10:0,setupsBuilt:0,executableSetups:0,setupFailures:0},
      top20:[],top10:[],executionCandidates:[],preLearningExecutionCandidates:[],
      learningBest:null,blockedSetups:[],bestAvailableOrder:null,selectedOrderCandidate:null,
      orderAttempts:[],paperExecution:null,accountBefore:initialAccount,accountAfter:initialAccount,
      researchFailures:[],setupFailures:[],nextStage:"POSITION_MANAGEMENT",
      portfolio:{maximumOpenPositions:portfolioCfg.maximumOpenPositions,slotAvailable:false},
      executionAuthority:false,liveExecution:false,paperOnly:true
    };
  }
  const universe=await getBotFuturesUniverse(options.universe);
  const eligibility=filterBotHardEligibleAssets(universe.assets,options.eligibility);
  const opportunity=rankBotOpportunities(eligibility.approved,options.opportunity);
  const top20=opportunity.topCandidates.map((row,index)=>({
    rank:index+1,symbol:row.asset.symbol,baseAsset:row.asset.baseAsset,
    quoteAsset:row.asset.quoteAsset,opportunityScore:row.opportunity.opportunityScore,
    dimensions:row.opportunity.dimensions,market:row.asset.market,
    asset:row.asset,opportunity:row.opportunity,
  }));
  const research=await researchBotTop20(top20,options.research);
  const directional=research.researched.map(row=>determineBotDirection(row,options.direction));
  const researchRanking=rankBotResearchCandidates(directional,options.ranking);

  const setups=[], setupFailures=[];
  for(const candidate of researchRanking.top10){
    try{
      const market=await getBotFuturesExecutionMarket(candidate,options.setup);
      setups.push(buildBotFuturesSetup(candidate,market,options.setup));
    }catch(error){
      setupFailures.push({symbol:candidate.symbol,error:error?.message||String(error)});
    }
  }
  const executionRanking=rankBotExecutionSetups(setups,options.executionRanking);
  const learningRanking=applyTradeLearning(executionRanking.executable,options.learning);

  const accountBefore=getBotPaperAccount();
  const orderAttempts=[];
  let selected=null, execution=null;

  // Descend the execution ranking. A last-second failure on #1 does not kill
  // the cycle if #2, #3 ... can still produce a valid paper order.
  for(const candidate of learningRanking.ranked){
    try{
      const currentAccount=getBotPaperAccount();
      if(currentAccount.controls?.paused) break;
      if(currentAccount.openPositions>=portfolioCfg.maximumOpenPositions){
        orderAttempts.push({symbol:candidate.symbol,executionRank:candidate.executionRank,
          stage:"PORTFOLIO",approved:false,blockers:["MAXIMUM_3_OPEN_POSITIONS"]});
        break;
      }
      const duplicate=portfolioCfg.blockConcurrentSameSymbol &&
        currentAccount.positions.some(p=>p.symbol===candidate.symbol);
      if(duplicate){
        orderAttempts.push({symbol:candidate.symbol,executionRank:candidate.executionRank,
          stage:"PORTFOLIO",approved:false,blockers:["SYMBOL_ALREADY_OPEN"]});
        continue;
      }
      const risked=buildBotAccountRiskPlan(candidate,currentAccount,options.account);
      if(!risked.riskPlan.approved){
        orderAttempts.push({symbol:candidate.symbol,executionRank:candidate.executionRank,
          stage:"RISK",approved:false,blockers:risked.riskPlan.blockers});
        continue;
      }
      const checked=await revalidateBotOrder(risked,options.revalidation);
      if(!checked.revalidation.approved){
        orderAttempts.push({symbol:candidate.symbol,executionRank:candidate.executionRank,
          stage:"REVALIDATION",approved:false,blockers:checked.revalidation.blockers});
        continue;
      }
      if(getBotPaperAccount().controls?.paused) break;
      execution=executeBotPaperOrder(checked);
      selected=checked;
      orderAttempts.push({symbol:candidate.symbol,executionRank:candidate.executionRank,
        stage:"PAPER_EXECUTION",approved:true,blockers:[]});
      break;
    }catch(error){
      orderAttempts.push({symbol:candidate.symbol,executionRank:candidate.executionRank,
        stage:"ERROR",approved:false,blockers:[error?.message||String(error)]});
    }
  }
  const accountAfter=getBotPaperAccount();
  console.log("[BOT_SHADOW_RECORDING]", {
  startedAt,
  evaluated: executionRanking.evaluated?.length ?? 0,
  attempts: orderAttempts.length,
});
  // Shadow records never feed into selection, risk, revalidation, or execution.
  recordBotShadowCycle({startedAt,candidates:executionRanking.evaluated,orderAttempts,selected,
    status:execution?"PAPER_POSITION_OPEN":"NO_ORDER",
    counts:{setupsBuilt:setups.length,executable:executionRanking.executable.length}});

  return {
    system:"AEMA_INDEPENDENT_CRYPTO_BOT",phase:"PHASE_7",
    status:execution?"PAPER_POSITION_OPEN":(executionRanking.best?"NO_PAPER_ORDER_FILLED":"NO_EXECUTABLE_SETUP"),
    startedAt,completedAt:new Date().toISOString(),
    counts:{universe:universe.assets.length,hardEligible:eligibility.approved.length,
      opportunityQualified:opportunity.qualified.length,top20:top20.length,
      researchCompleted:research.completed,researchFailed:research.failed.length,
      top10:researchRanking.top10.length,setupsBuilt:setups.length,
      executableSetups:executionRanking.executable.length,setupFailures:setupFailures.length},
    top20,top10:researchRanking.top10,
    executionCandidates:learningRanking.ranked,
    preLearningExecutionCandidates:executionRanking.executable,
    learningBest:learningRanking.best,
    blockedSetups:setups.filter(x=>!x.setup?.approved).map(x=>({
      symbol:x.symbol,
      direction:x.setup?.direction,
      blockers:x.setup?.blockers||[],
      freshness:x.setup?.freshness||null,
      entry:x.setup?.entry??null,
      stop:x.setup?.stop??null,
      target:x.setup?.target??null,
      riskReward:x.setup?.riskReward??null,
    })),
    bestAvailableOrder:learningRanking.best,
    selectedOrderCandidate:selected,
    orderAttempts,
    paperExecution:execution,
    accountBefore,
    accountAfter,
    researchFailures:research.failed,setupFailures,
    nextStage:execution?"POSITION_MANAGEMENT":"NO_ORDER_POSSIBLE",
    portfolio:{maximumOpenPositions:portfolioCfg.maximumOpenPositions,
      slotAvailable:accountAfter.openPositions<portfolioCfg.maximumOpenPositions},
    executionAuthority:false,liveExecution:false,paperOnly:true,
  };
}
export default runBotTradingCycle;
