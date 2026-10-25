/** Bounded, on-demand stock discovery -> existing research engine. No orders. */
import { discoverStockCandidates } from './botStockDiscoveryEngine.js';
import { runStockResearch } from './botStockResearchEngine.js';

export const DEFAULT_STOCK_UNIVERSE = Object.freeze([
  'AAPL','MSFT','NVDA','AMD','AMZN','GOOGL','META','TSLA','AVGO','NFLX',
  'CRM','ORCL','ADBE','INTC','QCOM','MU','AMAT','PLTR','UBER','SHOP',
  'COIN','HOOD','PYPL','SQ','JPM','BAC','GS','V','MA','XOM',
  'CVX','LLY','UNH','JNJ','ABBV','COST','WMT','HD','DIS','BA',
  'CAT','GE','DE','NKE','PFE','MRK','T','VZ','IBM','SNOW'
]);

export async function runStockDiscoveryResearch({
  symbols, timeframe='5Min', lookbackDays=10, feed='iex',
  topN=12, minRiskReward=1.5,
  discover=discoverStockCandidates, research=runStockResearch
}={}) {
  // No arbitrary fallback for malformed explicit universe.
  const universe = symbols === undefined ? [...DEFAULT_STOCK_UNIVERSE] : symbols;
  if (!Array.isArray(universe)) throw new Error('STOCK_DISCOVERY_SYMBOLS_REQUIRED');
  const limit = Number(topN);
  if (!Number.isInteger(limit) || limit<1 || limit>12) throw new Error('STOCK_DISCOVERY_TOP_N_INVALID');
  const discovery = await discover({symbols:universe,timeframe,lookbackDays,feed,topN:limit});
  const shortlisted = (discovery.candidates??[]).map(x=>x.symbol);
  const analysis = shortlisted.length
    ? await research({symbols:shortlisted,timeframe,lookbackDays,feed,minRiskReward})
    : {assetClass:'STOCK',researchOnly:true,executionAuthority:false,liveExecution:false,results:[],qualifiedSetups:[],
      counts:{requested:0,researched:0,qualifiedSetups:0}};
  return {assetClass:'STOCK',mode:'DISCOVERY_AND_RESEARCH',researchOnly:true,executionAuthority:false,
    liveExecution:false,generatedAt:new Date().toISOString(),discovery,analysis,
    qualifiedSetups:analysis.qualifiedSetups??[],counts:{
      universe:discovery.universeSize??universe.length,scanned:discovery.scanned??0,
      ranked:discovery.rankedCount??0,shortlisted:shortlisted.length,
      researched:analysis.counts?.researched??0,qualifiedSetups:analysis.counts?.qualifiedSetups??0}};
}
