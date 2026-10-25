/** Offline, research-only A3 validation. Inputs must be timestamped and point-in-time verified.
 * Do not mix SPOT candles with FUTURES setups or assume matching symbol strings imply matching venues.
 */
import { replayVolatilityStopComparison } from './botVolatilityStopReplay.js';
const positive = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v)>0;
const ts = v => typeof v === 'number' ? v : Date.parse(v);
const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
const reason = (s, candles, options) => {
  if (s.pointInTimeVerified !== true) return 'SETUP_NOT_POINT_IN_TIME_VERIFIED';
  if (!s.observationId || !Number.isFinite(ts(s.timestamp))) return 'SETUP_PROVENANCE_MISSING';
  if (!s.exchange || !s.marketId || !s.instrumentType || !s.candleInterval) return 'MARKET_IDENTITY_MISSING';
  if (!s.proposedStopVerifiedAt || !Number.isFinite(ts(s.proposedStopVerifiedAt)) || ts(s.proposedStopVerifiedAt)>ts(s.timestamp)) return 'PROPOSED_STOP_LOOKAHEAD_OR_MISSING';
  if (!positive(s.proposedStop) || !positive(s.stop) || !positive(s.entry) || !positive(s.target) || !positive(s.quantity)) return 'PRICES_OR_SIZING_MISSING';
  if (!candles || !Array.isArray(candles.rows) || !candles.rows.length) return 'POST_ENTRY_CANDLES_MISSING';
  if (candles.exchange!==s.exchange || candles.marketId!==s.marketId || candles.instrumentType!==s.instrumentType || candles.candleInterval!==s.candleInterval) return 'CANDLE_MARKET_MISMATCH';
  if (candles.pointInTimeVerified !== true) return 'CANDLE_PROVENANCE_UNVERIFIED';
  if (options.feePercent === undefined || options.slippagePercent === undefined) return 'COST_ASSUMPTIONS_MISSING';
  const first=ts(candles.rows[0].time), last=ts(candles.rows.at(-1).time);
  if (!Number.isFinite(first) || first<=ts(s.timestamp) || !Number.isFinite(last)) return 'POST_ENTRY_TIMING_INVALID';
  if (options.maxHorizonMs && last-ts(s.timestamp)>options.maxHorizonMs) return 'HORIZON_EXCEEDED';
  return null;
};
/** candleSets keyed by observationId; no implicit fetching or inferred market matching. */
export function validateHistoricalStops({setups=[],candleSets={},feePercent,slippagePercent,maxHorizonMs=24*3600*1000}={}) {
  if(!Array.isArray(setups)) throw Error('SETUPS_ARRAY_REQUIRED');
  const options={feePercent,slippagePercent,maxHorizonMs};
  const rows=setups.map((s,index)=>{
    const id=s.observationId || `row_${index}`;
    const candles=candleSets[id];
    const reject=reason(s,candles,options);
    if(reject)return {observationId:id,strategy:s.strategy||'UNKNOWN',symbol:s.symbol||null,status:'EXCLUDED',reason:reject};
    try {
      const replay=replayVolatilityStopComparison({direction:s.direction,entry:s.entry,existingStop:s.stop,proposedStop:s.proposedStop,target:s.target,quantity:s.quantity,entryTime:ts(s.timestamp),candles:candles.rows,feePercent,slippagePercent});
      return {observationId:id,strategy:s.strategy||'UNKNOWN',symbol:s.symbol,status:'REPLAYED',replay};
    }catch(e){return {observationId:id,strategy:s.strategy||'UNKNOWN',symbol:s.symbol,status:'EXCLUDED',reason:`REPLAY_INVALID:${e.message}`};}
  });
  const grouped={};
  for(const r of rows){const g=grouped[r.strategy]??={total:0,eligible:0,excluded:0,existingPnl:[],proposedPnl:[],resolved:0};g.total++;
    if(r.status==='REPLAYED'){g.eligible++;g.existingPnl.push(r.replay.existing.netPnlUsd);g.proposedPnl.push(r.replay.proposed.netPnlUsd);if(!['MARK_TO_MARKET','OPEN'].includes(r.replay.existing.reason)&&!['MARK_TO_MARKET','OPEN'].includes(r.replay.proposed.reason))g.resolved++;}else g.excluded++;
  }
  const strategies=Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,{total:v.total,eligible:v.eligible,excluded:v.excluded,resolvedPairs:v.resolved,meanExistingNetPnlUsd:mean(v.existingPnl),meanProposedNetPnlUsd:mean(v.proposedPnl),meanPairedDifferenceUsd:mean(v.proposedPnl.map((p,i)=>p-v.existingPnl[i]))}]));
  const exclusionReasons={};for(const r of rows)if(r.status==='EXCLUDED')exclusionReasons[r.reason]=(exclusionReasons[r.reason]||0)+1;
  return {status:'RESEARCH_ONLY',executionAuthority:false,eligible:rows.filter(r=>r.status==='REPLAYED').length,total:rows.length,exclusionReasons,strategies,rows};
}
export default validateHistoricalStops;
