/** AEMA stock-only dual-horizon coordinator. Never imports crypto modules or execution services. */

import { getStockDynamicUniverse } from '../providers/botStockDynamicUniverse.js';

export const STOCK_HORIZONS = Object.freeze({
  INTRADAY: Object.freeze({timeframe:'5Min',lookbackDays:20,shortlist:30}),
  SWING: Object.freeze({timeframe:'1Day',lookbackDays:90,shortlist:30}),
});

/**
 * Runs independent research tracks. No live execution, no order submission.
 * deps.runSearch allows deterministic testing without an Alpaca connection.
 */
export async function runStockDualMarketSearch(options={},deps={}) {
  const runSearch = deps.runSearch ?? (await import('./botStockMarketSearchCycle.js')).runStockMarketSearch;
  const startedAt = new Date().toISOString();
  // Explicit opt-in: existing fixed-symbol behaviour remains the default.
  // Cap scans to 500 symbols because discovery's batch service enforces this limit.
  let universeInfo = null;
  if (['DYNAMIC','RANKED'].includes(options.universeMode) && options.symbols === undefined) {
    const loadUniverse = deps.loadUniverse ?? getStockDynamicUniverse;
    universeInfo = await loadUniverse({limit:options.universeLimit ?? 100,offset:options.universeOffset ?? 0});
    if (!Array.isArray(universeInfo?.symbols) || !universeInfo.symbols.length) throw new Error('STOCK_DYNAMIC_UNIVERSE_EMPTY');
  }
  // RANKED is opt-in: use historical daily liquidity/movement to prioritize
  // equities BEFORE running the more expensive independent research tracks.
  // Ranking is not trade approval, a probability, or a live market quote.
  let rankingInfo = null;
  if (options.universeMode === 'RANKED') {
    if (options.symbols !== undefined) throw new Error('STOCK_RANKED_EXPLICIT_SYMBOLS_CONFLICT');
    const limit = options.rankedLimit ?? 30;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('STOCK_RANKED_LIMIT_INVALID');
    const rank = deps.rankCandidates ?? (await import('../botStockDiscoveryEngine.js')).discoverStockCandidates;
    const ranked = await rank({symbols:universeInfo.symbols,timeframe:'1Day',lookbackDays:90,
      feed:options.feed ?? 'iex',topN:50,minBars:25,minAverageDollarVolume:1_000_000});
    const candidates = ranked?.candidates ?? [];
    if (!Array.isArray(candidates)) throw new Error('STOCK_RANKING_RESPONSE_INVALID');
    const selected = candidates.slice(0,limit).map(x=>x.symbol);
    if (!selected.length) throw new Error('STOCK_RANKING_NO_ELIGIBLE_CANDIDATES');
    rankingInfo = {method:'DAILY_HISTORICAL_LIQUIDITY_AND_MOVEMENT',
      scanned:ranked.scanned ?? 0,eligible:ranked.rankedCount ?? candidates.length,
      selected:selected.length,providerErrors:ranked.providerErrors ?? [],
      warnings:ranked.warnings ?? [],
      leaders:candidates.slice(0,limit).map(x=>({symbol:x.symbol,score:x.score,
        averageDollarVolume:x.averageDollarVolume,relativeVolume:x.relativeVolume,
        movePct:x.movePct,lastBarAt:x.lastBarAt}))};
    universeInfo = {...universeInfo,symbols:selected};
  }
  const shared = {};
  for (const key of ['symbols','feed']) if (options[key] !== undefined) shared[key] = options[key];
  if (universeInfo) shared.symbols = universeInfo.symbols;
  const requested = options.horizons ?? ['INTRADAY','SWING'];
  if (!Array.isArray(requested) || requested.length === 0 ||
      new Set(requested).size !== requested.length ||
      requested.some(h=>!Object.hasOwn(STOCK_HORIZONS,h))) {
    throw new Error('STOCK_HORIZONS_INVALID');
  }
  const tracks = {};
  for (const horizon of requested) {
    const config = {...STOCK_HORIZONS[horizon],...shared,...(options[horizon.toLowerCase()]??{})};
    // Keep setup settings scoped to each horizon. Never share mutable result objects.
    try {
      const result = await runSearch(config, deps.searchDeps?.[horizon] ?? {});
      tracks[horizon] = {...result,horizon,
        setups:(result.setups??[]).map(s=>({...s,horizon,setup:{...s.setup,horizon}}))};
    } catch (error) {
      tracks[horizon] = {horizon,status:'ERROR',setups:[],counts:{qualifiedSetups:0},
        errors:[String(error?.message??error)],researchOnly:true,executionDisabled:true};
    }
  }
  const setups = requested.flatMap(h=>tracks[h].setups);
  // Independent tracks can disagree; flag opposing directions without deleting either setup.
  // Research annotation only: never authorize execution or alter a strategy's approval.
  const bySymbol = new Map();
  for (const row of setups) {
    const symbol = typeof row.symbol === 'string' ? row.symbol.toUpperCase() : '';
    if (!symbol) continue;
    const direction = row.researchDirection ?? row.direction ?? row.setup?.setupType ?? null;
    const directions = bySymbol.get(symbol) ?? new Set();
    if (direction === 'BULL' || direction === 'BEAR') directions.add(direction);
    bySymbol.set(symbol, directions);
  }
  const conflictingSymbols = [...bySymbol].filter(([,directions]) => directions.size > 1).map(([symbol]) => symbol).sort();
  const annotatedSetups = setups.map(row => ({...row,
    crossHorizonConflict: conflictingSymbols.includes(String(row.symbol ?? '').toUpperCase()),
    manualExecutionOnly:true}));
  const failed = requested.filter(h=>tracks[h].status==='ERROR');
  return {
    system:'AEMA_PRIVATE_STOCK_DUAL_RESEARCH',assetClass:'STOCK',marketType:'STOCK',
    researchOnly:true,manualExecutionOnly:true,executionDisabled:true,executionAuthority:false,liveExecution:false,
    startedAt,completedAt:new Date().toISOString(),
    status:failed.length===requested.length?'ERROR':failed.length?'PARTIAL':setups.length?'SETUPS_FOUND':'NO_SETUP',
    universe:universeInfo ? {mode:options.universeMode,source:universeInfo.source,totalEligible:universeInfo.totalEligible,selected:universeInfo.symbols.length,offset:universeInfo.offset} : {mode:'FIXED_OR_EXPLICIT'},
    horizons:requested,tracks,setups:annotatedSetups,conflictingSymbols,ranking:rankingInfo,
    counts:{qualifiedSetups:setups.length,
      intradaySetups:tracks.INTRADAY?.setups.length??0,
      swingSetups:tracks.SWING?.setups.length??0,
      failedTracks:failed.length,crossHorizonConflicts:conflictingSymbols.length},
  };
}
export default runStockDualMarketSearch;
