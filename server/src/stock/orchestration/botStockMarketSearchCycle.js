/** Independent AEMA stock fork: discovery -> Alpaca bars -> V2 strategy fork -> qualified setups. */
import { randomUUID } from 'node:crypto';
import { discoverStockCandidates } from '../botStockDiscoveryEngine.js';
import { getHistoricalBars } from '../providers/stockHistoricalProvider.js';
import { evaluateStockStrategyFork } from '../setup/botStockStrategyFork.js';
import { getStockQuoteEvidence } from '../providers/stockQuoteProvider.js';
import { estimateStockSlippage } from '../providers/stockSlippageEstimator.js';

const DEFAULT_SYMBOLS=['AAPL','MSFT','NVDA','AMD','AMZN','GOOGL','META','TSLA','AVGO','NFLX','CRM','ORCL','ADBE','INTC','QCOM','MU','AMAT','PLTR','UBER','SHOP','COIN','HOOD','PYPL','SQ','JPM','BAC','GS','V','MA','XOM','CVX','LLY','UNH','JNJ','ABBV','COST','WMT','HD','DIS','BA','CAT','GE','DE','NKE','PFE','MRK','T','VZ','IBM','SNOW'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const cleanSymbols=xs=>[...new Set(xs.map(x=>String(x).trim().toUpperCase()))];
function directions(candidate,bars){
  // Discovery hint is a ranking feature, NOT a confirmed directional decision.
  // Run both strategy directions and let the fork's independent quality gates decide.
  return ['BULL','BEAR'];
}
export async function runStockMarketSearch(options={},deps={}){
  const discover=deps.discover??discoverStockCandidates;
  const fetchBars=deps.fetchBars??getHistoricalBars;
  const evaluate=deps.evaluate??evaluateStockStrategyFork;
  const fetchQuote=deps.fetchQuote??getStockQuoteEvidence;
  const estimateSlippage=deps.estimateSlippage??estimateStockSlippage;
  const evidenceCounts={quoteAvailable:0,quoteUnavailable:0,slippageEstimated:0,slippageUnavailable:0};
  const startedAt=new Date().toISOString();
  const universe=cleanSymbols(options.symbols??DEFAULT_SYMBOLS);
  if(!universe.length||universe.length>500||universe.some(x=>!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x)))throw new Error('STOCK_SEARCH_UNIVERSE_INVALID');
  const timeframe=options.timeframe??'5Min',feed=options.feed??'iex';
  const lookbackDays=options.lookbackDays??20;
  const shortlist=options.shortlist??50;
  if(!Number.isInteger(shortlist)||shortlist<1||shortlist>50)throw new Error('STOCK_SEARCH_SHORTLIST_INVALID');
  const discovered=await discover({symbols:universe,timeframe,feed,lookbackDays,topN:shortlist});
  const ranked=discovered.candidates??[];
  const noSetup=[],researchFailures=[],setupsBuilt=[];
  let researchCompleted=0;
  const asOf=deps.now?.()??Date.now();
  const end=new Date(asOf).toISOString(),start=new Date(asOf-lookbackDays*86400000).toISOString();
  for(const candidate of ranked){
    try{
      const data=await fetchBars({symbol:candidate.symbol,timeframe,feed,start,end});
      if(!data?.approved||!Array.isArray(data.bars)){
        researchFailures.push({symbol:candidate.symbol,errors:data?.errors??['STOCK_BARS_UNAVAILABLE']});continue;
      }
      researchCompleted++;
      // Quotes are optional evidence: missing or stale quotes must never be fabricated.
      let quoteEvidence={available:false,reason:'QUOTE_UNAVAILABLE'};
      try { quoteEvidence=await fetchQuote({symbol:candidate.symbol,feed,asOf}); }
      catch(error) { quoteEvidence={available:false,reason:String(error?.message??error)}; }
      if(quoteEvidence?.available) evidenceCounts.quoteAvailable++; else evidenceCounts.quoteUnavailable++;
      const slippageEvidence=estimateSlippage({quote:quoteEvidence,assumedOrderShares:options.assumedOrderShares??10});
      if(slippageEvidence.available) evidenceCounts.slippageEstimated++; else evidenceCounts.slippageUnavailable++;
      for(const direction of directions(candidate,data.bars)){
        try{
          const result=evaluate({symbol:candidate.symbol,bars:data.bars,timeframe,direction,asOf,options:{...(options.setup??{}),
            spreadPercent:quoteEvidence.available?quoteEvidence.spreadPercent:null,
            slippagePercent:slippageEvidence.available?slippageEvidence.percent:null}});
          const setup=result?.setup??null;
          if(setup?.approved===true){
            setupsBuilt.push({symbol:candidate.symbol,direction,opportunityScore:candidate.score??0,
              setup:{...setup,direction:direction==='BULL'?'LONG':'SHORT',setupType:direction},
              researchDirection:direction,marketEvidence:{quoteTimestamp:quoteEvidence.timestamp??null,spreadPercent:quoteEvidence.spreadPercent??null,slippage:slippageEvidence},assetClass:'STOCK',researchOnly:true,executionAuthority:false,liveExecution:false});
          }else{
            noSetup.push({symbol:candidate.symbol,direction,stage:'SETUP',reason:'SETUP_NOT_APPROVED',
              blockers:setup?.blockers??result?.blockers??['STOCK_STRATEGY_NOT_QUALIFIED'],
              strategy:setup?.strategy??null,quoteEvidence:{available:quoteEvidence.available,reason:quoteEvidence.reason??null},slippageEvidence:{available:slippageEvidence.available,reason:slippageEvidence.reason??null}});
          }
        }catch(error){noSetup.push({symbol:candidate.symbol,direction,stage:'SETUP',reason:'SETUP_ERROR',blockers:[String(error?.message??error)]});}
      }
    }catch(error){researchFailures.push({symbol:candidate.symbol,errors:[String(error?.message??error)]});}
  }
  // Each symbol can have at most one published setup: choose strongest approved direction.
  const rankedSetups=setupsBuilt.sort((a,b)=>{
    const score=x=>[x.setup?.setupQuality?.score,x.setup?.qualityScore,x.setup?.riskReward,x.opportunityScore].find(finite)??0;
    return score(b)-score(a)||a.symbol.localeCompare(b.symbol);
  });
  const unique=[];const used=new Set();
  for(const row of rankedSetups){if(!used.has(row.symbol)){used.add(row.symbol);unique.push(row);}}
  const setups=unique.slice(0,20).map(x=>({...x,setupId:`stock_${randomUUID()}`}));
  return {system:'AEMA_PRIVATE_STOCK_MARKET_RESEARCH',assetClass:'STOCK',marketType:'STOCK',provider:'ALPACA_HISTORICAL',
    status:setups.length?'SETUPS_FOUND':'NO_SETUP',startedAt,completedAt:new Date().toISOString(),onDemand:true,
    researchOnly:true,executionDisabled:true,executionAuthority:false,liveExecution:false,
    counts:{universe:universe.length,hardEligible:discovered.scanned??0,opportunityQualified:discovered.rankedCount??0,
      top20:Math.min(ranked.length,20),shortlisted:ranked.length,researchCompleted,researchFailed:researchFailures.length,
      directionQualified:setupsBuilt.length,directionRejected:noSetup.length,top10:Math.min(ranked.length,10),
      setupsBuilt:setupsBuilt.length,qualifiedSetups:setups.length,noSetup:noSetup.length,setupFailures:noSetup.filter(x=>x.reason==='SETUP_ERROR').length,evidence:evidenceCounts},
    setups,noSetup,researchFailures,setupFailures:researchFailures,discoveryDiagnostics:{providerErrors:discovered.providerErrors??[],warnings:discovered.warnings??[],rejected:discovered.rejected??[]},
    setupAccounting:{built:setupsBuilt.length,builderApproved:setupsBuilt.length,builderRejected:noSetup.length,
      rankingEvaluated:rankedSetups.length,rankingQualified:setups.length,
      rankingExcluded:unique.slice(20).map(x=>({symbol:x.symbol,reason:'TOP_20_LIMIT'}))}};
}
export default runStockMarketSearch;
