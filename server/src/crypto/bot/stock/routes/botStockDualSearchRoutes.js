/** Stock-only dual-horizon HTTP router. Mount under your existing authenticated stock API. */
import { Router } from 'express';
import { runStockDualMarketSearch } from '../orchestration/botStockDualMarketSearch.js';

export function createStockDualSearchRouter({ requireAccess, runSearch = runStockDualMarketSearch } = {}) {
  if (typeof requireAccess !== 'function') throw new Error('STOCK_DUAL_AUTH_REQUIRED');
  const router = Router();
  router.post('/dual-search', requireAccess, async (req, res) => {
    try {
      const body = req.body ?? {};
      const allowed = ['symbols', 'feed', 'horizons'];
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
      const result = await runSearch(body);
      return res.status(result.status === 'ERROR' ? 503 : 200).json(result);
    } catch (error) {
      return res.status(500).json({ error: 'STOCK_DUAL_SEARCH_FAILED', detail: String(error?.message ?? error) });
    }
  });
  return router;
}
export default createStockDualSearchRouter;
