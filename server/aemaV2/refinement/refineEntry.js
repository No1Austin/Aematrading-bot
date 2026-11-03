import {reviewOriginalSetup} from './setupAwareReview.js';
import {precisionRefinement} from './precisionPlanner.js';
import { planStructureExecution } from '../structure/structureExecutionPlan.js';

const round = x => Number(x.toPrecision(12));
const valid = x => Number.isFinite(x) && x > 0;
const directional = (d, entry, stop, target) => d === 'BULL'
  ? stop < entry && entry < target
  : target < entry && entry < stop;

/** Optional, research-only refinement. Direction is supplied by the original server-side snapshot. */
export function refineEntry({original,fresh,candles15m,candles5m,candles1h}) {
 if(!['BULL','BEAR'].includes(original?.direction))throw Error('ORIGINAL_DIRECTION_REQUIRED');
 const direction=original.direction;
 const base={direction,original:{entry:original.entryReference??null,stop:original.stopReference??null,target:original.targetIllustration??null,asOf:original.asOf??null},current:{direction:fresh?.direction??null,status:fresh?.status??null,entry:fresh?.entryReference??null,stop:fresh?.stopReference??null,target:fresh?.targetIllustration??null}};
 if(['BULL','BEAR'].includes(fresh?.direction)&&fresh.direction!==direction)return {...base,decision:'DIRECTION_CONFLICT',reason:'FRESH_DIRECTION_CONFLICTS_WITH_SNAPSHOT',refined:null,researchOnly:true,executionAuthority:false,liveExecution:false,autoApplied:false,validatedForTrading:false};
 return {...base,...precisionRefinement({direction,candles15m,candles5m,candles1h,original:base.original})};
}
/** Unverified legacy developing candidates: evidence only; never upgrades qualification. */
export function refineDevelopingEntry({direction,fresh,candles15m,candles5m,candles1h,original=null,referenceVenue='GATE'}) {
 if(!['BULL','BEAR'].includes(direction))throw Error('INVALID_DIRECTION');
 const base={direction,source:'UNVERIFIED_CLIENT_CANDIDATE',freshStatus:fresh?.status??null,freshDirection:fresh?.direction??null,current:{entry:fresh?.entryReference??null,stop:fresh?.stopReference??null,target:fresh?.targetIllustration??null}};
 const freshDirectionConflict=['BULL','BEAR'].includes(fresh?.direction)&&fresh.direction!==direction;
 const precision=precisionRefinement({direction,candles15m,candles5m,candles1h,original});
 const originalReview=reviewOriginalSetup({direction,original,referencePrice:precision.evidence?.referencePrice,referenceVenue,evidence:precision.evidence});
 return {...base,...precision,originalReview,freshDirectionConflict,
  ...(freshDirectionConflict ? {
    decision:'DIRECTION_CONFLICT',
    reason:'FRESH_V2_DIRECTION_CONFLICTS_WITH_ORIGINAL_SETUP',
    refined:null,
    candidates:[]
  } : {})};
}
