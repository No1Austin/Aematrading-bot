/** AEMA stock-only dual-horizon coordinator. Never imports crypto modules or execution services. */

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
  const shared = {};
  for (const key of ['symbols','feed']) if (options[key] !== undefined) shared[key] = options[key];
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
  const failed = requested.filter(h=>tracks[h].status==='ERROR');
  return {
    system:'AEMA_PRIVATE_STOCK_DUAL_RESEARCH',assetClass:'STOCK',marketType:'STOCK',
    researchOnly:true,executionDisabled:true,executionAuthority:false,liveExecution:false,
    startedAt,completedAt:new Date().toISOString(),
    status:failed.length===requested.length?'ERROR':failed.length?'PARTIAL':setups.length?'SETUPS_FOUND':'NO_SETUP',
    horizons:requested,tracks,setups,
    counts:{qualifiedSetups:setups.length,
      intradaySetups:tracks.INTRADAY?.setups.length??0,
      swingSetups:tracks.SWING?.setups.length??0,
      failedTracks:failed.length},
  };
}
export default runStockDualMarketSearch;
