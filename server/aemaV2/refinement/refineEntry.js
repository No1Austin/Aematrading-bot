import { planStructureExecution } from '../structure/structureExecutionPlan.js';

const round = x => Number(x.toPrecision(12));
const valid = x => Number.isFinite(x) && x > 0;
const directional = (d, entry, stop, target) => d === 'BULL'
  ? stop < entry && entry < target
  : target < entry && entry < stop;

/** Optional, research-only refinement. Direction is supplied by the original server-side snapshot. */
export function refineEntry({ original, fresh, candles15m, candles5m, candles1h }) {
  if (!['BULL', 'BEAR'].includes(original?.direction)) throw Error('ORIGINAL_DIRECTION_REQUIRED');
  const direction = original.direction;
  const base = {direction, original: {
    entry: original.entryReference ?? null, stop: original.stopReference ?? null,
    target: original.targetIllustration ?? null, asOf: original.asOf ?? null
  }, current: {direction: fresh?.direction ?? null, status: fresh?.status ?? null,
    entry: fresh?.entryReference ?? null, stop: fresh?.stopReference ?? null,
    target: fresh?.targetIllustration ?? null},
    executionAuthority:false, liveExecution:false, researchOnly:true,
    validatedForTrading:false, autoApplied:false};
  if (fresh?.direction !== direction || fresh?.status !== 'RESEARCH_CANDIDATE') {
    return {...base, decision:'SETUP_INVALIDATED', reason:'FRESH_CANDLE_DECISION_NO_LONGER_CONFIRMS_ORIGINAL_SETUP', refined:null};
  }
  const structure = planStructureExecution({direction,candles15m,candles5m,candles1h});
  if (structure.decision !== 'ENTRY_CANDIDATE_UNVALIDATED') {
    return {...base, decision:'SETUP_INVALIDATED',reason:structure.reason,refined:null};
  }
  const currentEntry = structure.entryReference;
  const stop = structure.stopReference;
  const target = structure.targetIllustration;
  if (![currentEntry,stop,target].every(valid) || !directional(direction,currentEntry,stop,target)) {
    return {...base,decision:'SETUP_INVALIDATED',reason:'INVALID_CURRENT_STRUCTURE',refined:null};
  }
  const bull = direction === 'BULL';
  const sign = bull ? 1 : -1;
  const atr = structure.diagnostics?.atr15;
  const zones = [...(structure.diagnostics?.zones15m ?? []), ...(structure.diagnostics?.zones1h ?? [])];
  // For BULL a pullback must be BELOW the current price; for BEAR ABOVE.
  const pullbacks = zones.map(z => ({zone:z,price:bull ? z.upper : z.lower}))
    .filter(x => valid(x.price) && sign * (currentEntry-x.price)>0 &&
      sign * (x.price-stop)>0 &&
      (!valid(atr) || Math.abs(x.price-currentEntry) <= 1.5*atr))
    .sort((a,b)=>Math.abs(a.price-currentEntry)-Math.abs(b.price-currentEntry));
  const costRate = 0.002; // Illustrative 20 bps round trip; must be replaced with actual market cost estimates.
  const evaluate = entry => {
    const risk = sign*(entry-stop), reward = sign*(target-entry);
    const cost = entry*costRate;
    return {entry:round(entry),stop:round(stop),target:round(target),
      grossRR:round(reward/risk),estimatedNetRR:round((reward-cost)/risk),
      distanceFromCurrentPct:round(Math.abs(entry-currentEntry)/currentEntry*100)};
  };
  const baseline = evaluate(currentEntry);
  const candidate = pullbacks.length ? evaluate(pullbacks[0].price) : null;
  // Never call a hypothetical limit price 'better' based on RR alone.
  if (!candidate || !valid(candidate.entry) || !directional(direction,candidate.entry,candidate.stop,candidate.target)
    || candidate.estimatedNetRR < 1.6 || candidate.estimatedNetRR <= baseline.estimatedNetRR + 0.15) {
    return {...base,decision:'NO_IMPROVEMENT',reason:'NO_STRUCTURALLY_VALID_PULLBACK_WITH_MEANINGFUL_NET_RR_GAIN',
      baseline,refined:null};
  }
  return {...base,decision:'WAIT_FOR_PULLBACK',reason:'POTENTIAL_STRUCTURE_BASED_LIMIT_ENTRY_NOT_YET_FILLED',
    baseline,refined:{...candidate,entryType:'HYPOTHETICAL_LIMIT',
      zone:pullbacks[0].zone,requiresFresh5mConfirmation:true,
      expiresAfterMinutes:15,fillProbabilityUnknown:true},
    caveats:['Entry may never fill','Reconfirm structure and direction at fill time',
      'Estimated costs are assumptions, not exchange quotes']};
}

/** Diagnostic-only independent V2 review for unqualified legacy watchlist candidates.
 * Never upgrades qualification, changes the original signal or authorizes execution.
 */
export function refineDevelopingEntry({direction,fresh,candles15m,candles5m,candles1h}) {
  if (!['BULL','BEAR'].includes(direction)) throw Error('INVALID_DIRECTION');
  const base = {researchOnly:true,executionAuthority:false,liveExecution:false,
    validatedForTrading:false,autoApplied:false,qualification:'NOT_QUALIFIED',
    source:'UNVERIFIED_CLIENT_CANDIDATE',freshStatus:fresh?.status??null,
    freshDirection:fresh?.direction??null,
    current:{entry:fresh?.entryReference??null,stop:fresh?.stopReference??null,
      target:fresh?.targetIllustration??null}};
  // A conflicting V2 direction cannot be treated as a refined original direction.
  if (['BULL','BEAR'].includes(fresh?.direction) && fresh.direction!==direction)
    return {...base,decision:'DIRECTION_CONFLICT',reason:'FRESH_V2_DIRECTION_CONFLICTS_WITH_DEVELOPING_SETUP',refined:null};
  const structure=planStructureExecution({direction,candles15m,candles5m,candles1h});
  if (structure.decision!=='ENTRY_CANDIDATE_UNVALIDATED')
    return {...base,decision:'NO_REFINED_ENTRY',reason:structure.reason,
      structureDecision:structure.decision,refined:null};
  // A structurally valid hypothetical level is NOT a qualified or executable signal.
  const entry=structure.entryReference,stop=structure.stopReference,target=structure.targetIllustration;
  if (![entry,stop,target].every(valid)||!directional(direction,entry,stop,target))
    return {...base,decision:'NO_REFINED_ENTRY',reason:'INVALID_STRUCTURE_LEVELS',refined:null};
  return {...base,decision:'STRUCTURAL_LEVELS_FOUND_UNQUALIFIED',
    reason:'STRUCTURE_LEVELS_IDENTIFIED_BUT_ORIGINAL_QUALIFICATION_NOT_PASSED',
    refined:{entry,stop,target,estimatedNetRR:structure.netRR??null,
      entryType:'HYPOTHETICAL_REFERENCE',requiresFreshConfirmation:true},
    caveats:['Original qualification blockers remain','No trade authorization',
      'Costs, fill probability and liquidity are not verified']};
}
