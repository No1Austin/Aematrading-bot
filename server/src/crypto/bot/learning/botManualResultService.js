/** User-reported outcomes only; never executes an order. */
import { getMonitoredSetup, updateMonitoredSetup } from '../monitoring/botSetupMonitorStore.js';
import { appendTradeMemory } from './botTradeMemoryStore.js';
import buildSetupFingerprint from './botSetupFingerprint.js';
const number = value => value === '' || value == null ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function saveManualMonitorResult(id, input = {}) {
  const monitor = getMonitoredSetup(id);
  if (!monitor) throw new Error('MONITORED_SETUP_NOT_FOUND');
  if (monitor.manualResult) throw new Error('MANUAL_RESULT_ALREADY_SAVED');
  const outcome = String(input.outcome || '').toUpperCase();
  if (!['WIN','LOSS','BREAKEVEN','NOT_TAKEN'].includes(outcome)) throw new Error('INVALID_MANUAL_OUTCOME');
  const taken = outcome !== 'NOT_TAKEN';
  const entry = number(input.actualEntry), exit = number(input.actualExit), pnl = number(input.netPnlUsd);
  if (taken && (!(entry > 0) || !(exit > 0) || pnl === null)) throw new Error('ACTUAL_ENTRY_EXIT_AND_PNL_REQUIRED');
  if (taken && ((outcome === 'WIN' && pnl <= 0) || (outcome === 'LOSS' && pnl >= 0) || (outcome === 'BREAKEVEN' && pnl !== 0))) throw new Error('OUTCOME_PNL_MISMATCH');
  if (outcome === 'NOT_TAKEN' && (entry !== null || exit !== null || pnl !== null)) throw new Error('NOT_TAKEN_MUST_HAVE_NO_FILLS');
  if (!validDate(input.resultAt)) throw new Error('VALID_RESULT_DATE_REQUIRED');
  const notes = String(input.notes || '').trim();
  if (notes.length > 2000) throw new Error('NOTES_TOO_LONG');
  const original = monitor.original || {};
  const initialRisk = entry !== null ? Math.abs(entry - Number(monitor.stop)) : null;
  const perUnitR = taken && initialRisk > 0 ? (monitor.direction === 'SHORT' ? entry-exit : exit-entry)/initialRisk : null;
  const manualResult = { source:'USER_REPORTED', outcome, actualEntry:entry, actualExit:exit, netPnlUsd:pnl,
    resultAt:new Date(input.resultAt).toISOString(), notes, savedAt:new Date().toISOString(),
    rMultiplePrice:perUnitR === null ? null : Number(perUnitR.toFixed(4)), verified:false };
  // NOT_TAKEN must not enter the win/loss learning population.
  if (taken) {
    const snapshot = { ...original, symbol:monitor.symbol, direction:monitor.direction, setup:original.setup };
    appendTradeMemory({ tradeId:`manual:${monitor.id}`, source:'USER_REPORTED', verified:false,
      symbol:monitor.symbol, direction:monitor.direction, openedAt:monitor.createdAt, closedAt:manualResult.resultAt,
      entryPrice:entry, exitPrice:exit, initialStop:monitor.stop, initialTarget:monitor.target,
      realizedPnlUsd:pnl, outcome, rMultiple:manualResult.rMultiplePrice,
      // Do not infer a percentage return without a known position notional.
      returnPercent:null, notes, fingerprint:buildSetupFingerprint(snapshot), entrySnapshot:snapshot });
  }
  const updated = updateMonitoredSetup(id, { manualResult, manualSavedAt:manualResult.savedAt });
  return updated;
}
export default saveManualMonitorResult;
