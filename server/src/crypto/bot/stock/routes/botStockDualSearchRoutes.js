/** Stock-only dual-horizon HTTP router. Mount under your existing authenticated stock API. */
import { Router } from 'express';
import { runStockDualMarketSearch } from '../orchestration/botStockDualMarketSearch.js';
import { reviewStockEntrySnapshot } from '../refinement/botStockEntryReview.js';

export function createStockDualSearchRouter({ requireAccess, runSearch = runStockDualMarketSearch } = {}) {
  if (typeof requireAccess !== 'function') throw new Error('STOCK_DUAL_AUTH_REQUIRED');
  const router = Router();
  router.post('/dual-search', requireAccess, async (req, res) => {
    try {
      const body = req.body ?? {};
      const allowed = ['symbols', 'feed', 'horizons', 'universeMode', 'universeLimit', 'universeOffset', 'rankedLimit'];
      if (Object.keys(body).some(key => !allowed.includes(key))) {
        return res.status(400).json({ error: 'STOCK_DUAL_UNSUPPORTED_OPTION' });
      }
      if (body.symbols !== undefined && (!Array.isArray(body.symbols) || body.symbols.length > 500 || body.symbols.some(s => typeof s !== 'string'))) {
        return res.status(400).json({ error: 'STOCK_DUAL_SYMBOLS_INVALID' });
      }
      if (body.feed !== undefined && !['iex', 'sip'].includes(body.feed)) {
        return res.status(400).json({ error: 'STOCK_DUAL_FEED_INVALID' });
      }
      if (body.horizons !== undefined && (!Array.isArray(body.horizons) || !body.horizons.length || new Set(body.horizons).size !== body.horizons.length || body.horizons.some(h => !['INTRADAY', 'SWING'].includes(h)))) {
        return res.status(400).json({ error: 'STOCK_DUAL_HORIZONS_INVALID' });
      }
      if (body.universeMode !== undefined && !['DYNAMIC','FIXED','RANKED'].includes(body.universeMode)) return res.status(400).json({error:'STOCK_DUAL_UNIVERSE_MODE_INVALID'});
      if (body.universeLimit !== undefined && (!Number.isInteger(body.universeLimit)||body.universeLimit<1||body.universeLimit>500)) return res.status(400).json({error:'STOCK_DUAL_UNIVERSE_LIMIT_INVALID'});
      if (body.universeOffset !== undefined && (!Number.isInteger(body.universeOffset)||body.universeOffset<0)) return res.status(400).json({error:'STOCK_DUAL_UNIVERSE_OFFSET_INVALID'});
      if (body.rankedLimit !== undefined && (!Number.isInteger(body.rankedLimit)||body.rankedLimit<1||body.rankedLimit>50)) return res.status(400).json({error:'STOCK_DUAL_RANKED_LIMIT_INVALID'});
      if (['DYNAMIC','RANKED'].includes(body.universeMode) && body.symbols !== undefined) return res.status(400).json({error:'STOCK_DUAL_UNIVERSE_CONFLICT'});
      const result = await runSearch(body);
      return res.status(result.status === 'ERROR' ? 503 : 200).json(result);
    } catch (error) {
      return res.status(500).json({ error: 'STOCK_DUAL_SEARCH_FAILED', detail: String(error?.message ?? error) });
    }
  });
  // A snapshot diagnostic, not an authenticated source of trade approval.
  // Requires the same access middleware as stock dual-search.
  router.post('/entry-review', requireAccess, (req, res) => {
    const {row, referencePrice, asOf, maxAgeMinutes} = req.body ?? {};
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.symbol !== 'string' || row.symbol.length > 12 ||
        !row.setup || typeof row.setup !== 'object' || Array.isArray(row.setup) ||
        (referencePrice !== undefined && (typeof referencePrice !== 'number' || !Number.isFinite(referencePrice))) ||
        (maxAgeMinutes !== undefined && (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes < 1 || maxAgeMinutes > 1440))) {
      return res.status(400).json({error:'STOCK_ENTRY_REVIEW_INPUT_INVALID'});
    }
    const review = reviewStockEntrySnapshot(row,{referencePrice,asOf,maxAgeMinutes});
    return res.json({...review,source:'CLIENT_SUPPLIED_SNAPSHOT_UNVERIFIED',tradeApproval:false});
  });
  return router;
}
export default createStockDualSearchRouter;
