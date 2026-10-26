import express from 'express';
import { createClient } from '@supabase/supabase-js';

const TABLE = 'ema_manual_signal_history';
const outcomes = new Set(['WIN','LOSS','BREAKEVEN','NOT_TAKEN']);
const directionOf = (v) => {
  const d = String(v || '').toUpperCase();
  return ['BULL','BUY','LONG'].includes(d) ? 'BULL' : ['BEAR','SELL','SHORT'].includes(d) ? 'BEAR' : null;
};
const finiteOptional = (v) => v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : NaN;

function userClient(req) {
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!req.botUser?.id || req.botAuthMethod !== 'supabase' || !token) return null;
  if (!url || !anon) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}

// Pass getMonitoredSetup from the existing store. Never trust client-supplied symbol/direction/signal snapshot.
export default function createBotManualHistoryRoutes({ getMonitoredSetup }) {
  const router = express.Router();
  router.use((req,res,next) => {
    if (!req.botUser?.id || req.botAuthMethod !== 'supabase') return res.status(403).json({error:'SUPABASE_USER_REQUIRED'});
    next();
  });
  router.get('/', async (req,res) => {
    try {
      const client = userClient(req);
      const {data,error} = await client.from(TABLE).select('*').eq('user_id',req.botUser.id).order('created_at',{ascending:false}).limit(200);
      if (error) throw error;
      return res.json({records:data});
    } catch (e) { return res.status(500).json({error:'HISTORY_READ_FAILED'}); }
  });
  router.post('/:monitorId/result', async (req,res) => {
    try {
      const client = userClient(req);
      const monitorId = String(req.params.monitorId || '').trim();
      const monitor = getMonitoredSetup(monitorId);
      if (!monitor) return res.status(404).json({error:'MONITOR_NOT_FOUND'});
      // IMPORTANT: Legacy monitoring store is global. Only monitors created with authenticated owner can be saved.
      if (!monitor.userId || monitor.userId !== req.botUser.id) return res.status(403).json({error:'MONITOR_OWNERSHIP_NOT_VERIFIED'});
      const outcome = String(req.body?.outcome || '').toUpperCase();
      if (!outcomes.has(outcome)) return res.status(400).json({error:'INVALID_OUTCOME'});
      const actualEntry = finiteOptional(req.body?.actualEntry);
      const actualExit = finiteOptional(req.body?.actualExit);
      const netPnlUsd = finiteOptional(req.body?.netPnlUsd);
      if ([actualEntry,actualExit,netPnlUsd].some(Number.isNaN) || (actualEntry !== null && actualEntry <= 0) || (actualExit !== null && actualExit <= 0)) return res.status(400).json({error:'INVALID_PRICES_OR_PNL'});
      if (outcome !== 'NOT_TAKEN' && (actualEntry === null || actualExit === null)) return res.status(400).json({error:'ENTRY_EXIT_REQUIRED'});
      const date = new Date(req.body?.occurredAt || Date.now());
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60_000) return res.status(400).json({error:'INVALID_RESULT_DATE'});
      const setup = monitor.setup || monitor.candidate?.setup || monitor.signal || {};
      const symbol = String(monitor.symbol || setup.symbol || monitor.candidate?.symbol || '').trim();
      const direction = directionOf(monitor.direction || setup.direction || setup.publicDirection || monitor.candidate?.direction);
      if (!symbol || !direction) return res.status(422).json({error:'MONITOR_SIGNAL_INCOMPLETE'});
      const record = {
        user_id:req.botUser.id, source_monitor_id:monitorId, symbol, direction,
        strategy:String(monitor.strategy || setup.strategy || setup.strategyName || '') || null,
        signal_snapshot:JSON.parse(JSON.stringify(monitor)),
        outcome, actual_entry:actualEntry, actual_exit:actualExit, net_pnl_usd:netPnlUsd,
        occurred_at:date.toISOString(), notes:String(req.body?.notes || '').slice(0,3000), source:'USER_REPORTED'
      };
      const {data,error} = await client.from(TABLE).insert(record).select('*').single();
      if (error?.code === '23505') return res.status(409).json({error:'RESULT_ALREADY_SAVED'});
      if (error) throw error;
      return res.status(201).json({record:data});
    } catch (e) { return res.status(500).json({error:'HISTORY_SAVE_FAILED'}); }
  });
  return router;
}
