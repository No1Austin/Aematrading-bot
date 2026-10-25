import { planVolatilityPosition } from './botVolatilityPositionPlanner.js';

const positive = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null;
const nonnegative = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : null;

/** Observation only. Never changes an approved setup or its published stop. */
export function buildVolatilityResearchDiagnostic({direction, entry, currentStop, target, atr, support, resistance, spreadPercent, slippagePercent, config = {}} = {}) {
  const side = String(direction ?? '').toUpperCase();
  const bull = side === 'BULL' || side === 'LONG';
  const bear = side === 'BEAR' || side === 'SHORT';
  if (!bull && !bear) return {status:'UNAVAILABLE', reason:'DIRECTION_MISSING', shadowOnly:true};
  const e = positive(entry), a = positive(atr);
  if (!e || !a) return {status:'UNAVAILABLE', reason:'ENTRY_OR_ATR_MISSING', shadowOnly:true};
  const structureStop = positive(bull ? support : resistance);
  if (structureStop && (bull ? structureStop >= e : structureStop <= e)) {
    return {status:'UNAVAILABLE', reason:'STRUCTURE_WRONG_SIDE', shadowOnly:true};
  }
  // Risk budget is explicitly a research scenario, NOT a production setting.
  const marginUsd = positive(config.marginUsd) ?? 250;
  const leverage = positive(config.leverage) ?? 2;
  const maxLossUsd = positive(config.maxLossUsd) ?? 25;
  const atrMultiplier = positive(config.atrMultiplier) ?? 2;
  const spread = nonnegative(spreadPercent);
  const slippage = nonnegative(slippagePercent);
  try {
    const plan = planVolatilityPosition({
      direction: side, entry:e, atr:a, structureStop,
      atrMultiplier, marginUsd, leverage, maxLossUsd,
      spreadPercent:spread ?? 0, slippagePercent:slippage ?? 0,
      roundTripFeePercent:nonnegative(config.roundTripFeePercent) ?? 0,
      target:positive(target),
    });
    return {
      status:'OBSERVED', shadowOnly:true, source:'ATR_STRUCTURE_RESEARCH',
      existingStop:positive(currentStop), proposedStop:plan.stop,
      stopDifferencePercent:positive(currentStop) ? (plan.stop-Number(currentStop))/e*100 : null,
      ...plan,
      status:'OBSERVED',
      // Explicit missing-evidence flags: default zero is not evidence of zero costs.
      evidenceWarnings:[
        ...(spread === null ? ['SPREAD_NOT_VERIFIED'] : []),
        ...(slippage === null ? ['SLIPPAGE_NOT_VERIFIED'] : []),
        ...(config.roundTripFeePercent === undefined ? ['FEES_NOT_VERIFIED'] : []),
        'LIQUIDATION_DISTANCE_NOT_VERIFIED',
        'ATR_TIMEFRAME_NOT_VERIFIED',
      ],
    };
  } catch (error) {
    return {status:'UNAVAILABLE', shadowOnly:true, reason:String(error?.message ?? error)};
  }
}
