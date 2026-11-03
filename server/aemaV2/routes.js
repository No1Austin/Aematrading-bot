import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { analyze } from './engine.js';
import { candlesFor } from './providers.js';
import { getV2CryptoCandleBundle } from './multiTimeframeProvider.js';
import { evaluateV2CandleDecision } from './candles/candleDecisionEngine.js';
import { refineEntry, refineDevelopingEntry } from './refinement/refineEntry.js';

const router = Router();
const snapshots = new Map(); // Ephemeral research snapshots; lost on server restart.
const TTL_MS = 20 * 60_000;
const MAX_SNAPSHOTS = 500;
function remember(snapshot) {
  const now = Date.now();
  for (const [key, value] of snapshots) if (value.expiresAt <= now) snapshots.delete(key);
  while (snapshots.size >= MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value);
  const setupId = randomUUID();
  snapshots.set(setupId,{...snapshot,expiresAt:now+TTL_MS});
  return setupId;
}
async function research(body={}) {
  const {market,symbol}=body;
  if(market==='crypto') {
    const bundle=await getV2CryptoCandleBundle(symbol);
    const decision=evaluateV2CandleDecision(bundle);
    const result={market,symbol,source:bundle.source,...decision,asOf:bundle.asOf,
      interval:'15m',timeframes:{primary:'15m',entry:'5m',context:'1h'},
      validatedForTrading:false,executionAuthority:false};
    if(result.status==='RESEARCH_CANDIDATE' && ['BULL','BEAR'].includes(result.direction)) {
      result.setupId=remember({market,symbol,direction:result.direction,
        entryReference:result.entryReference,stopReference:result.stopReference,
        targetIllustration:result.targetIllustration,asOf:result.asOf});
    }
    return result;
  }
  if(market==='stocks') {
    const bars=await candlesFor(market,symbol);
    return {...analyze({market,symbol,candles:bars}),timeframes:{primary:'15m',entry:null,context:null},
      validatedForTrading:false,warning:'STOCK_MULTI_TIMEFRAME_NOT_YET_IMPLEMENTED'};
  }
  throw Error('INVALID_MARKET');
}
router.get('/health',(_req,res)=>res.json({ok:true,version:'v2',markets:['crypto','stocks'],
  cryptoTimeframes:['5m','15m','1h'],refineEntry:true,executionAuthority:false}));
router.post('/analyze',async(req,res)=>{
  try {res.json(await research(req.body));}
  catch(e){res.status(422).json({error:e.message||'ANALYSIS_FAILED',executionAuthority:false});}
});
router.post('/refine-entry',async(req,res)=>{
  try {
    const setupId=req.body?.setupId;
    if(typeof setupId!=='string'||!/^[0-9a-f-]{36}$/i.test(setupId))
      return res.status(400).json({error:'VALID_SETUP_ID_REQUIRED',executionAuthority:false});
    const original=snapshots.get(setupId);
    if(!original||original.expiresAt<=Date.now()) {
      snapshots.delete(setupId);
      return res.status(410).json({error:'SETUP_EXPIRED_ANALYZE_AGAIN',executionAuthority:false});
    }
    // Only use the server's stored symbol/direction; never trust client-supplied levels.
    const bundle=await getV2CryptoCandleBundle(original.symbol);
    const fresh=evaluateV2CandleDecision(bundle);
    const result=refineEntry({original,fresh,...bundle});
    return res.json({market:original.market,symbol:original.symbol,asOf:bundle.asOf,...result});
  } catch(e) {return res.status(422).json({error:e.message||'REFINEMENT_FAILED',executionAuthority:false});}
});
// Research-only bridge for developing candidates from the original market search.
// Client-provided symbol/direction are unverified hints, never trading authority.
router.post('/refine-developing', async (req,res) => {
  try {
    const symbol = req.body?.symbol;
    const direction = req.body?.direction;
    if (typeof symbol !== 'string' || !/^[A-Z0-9_:/.-]{2,40}$/i.test(symbol))
      return res.status(400).json({error:'VALID_SYMBOL_REQUIRED',executionAuthority:false});
    if (!['BULL','BEAR'].includes(direction))
      return res.status(400).json({error:'VALID_DIRECTION_REQUIRED',executionAuthority:false});
    const bundle = await getV2CryptoCandleBundle(symbol);
    const fresh = evaluateV2CandleDecision(bundle);
    const original = req.body?.original ?? null;
    const originalValues = original && typeof original === 'object' && !Array.isArray(original) ? {
      entry: original.entry, stop: original.stop, target: original.target, venue: original.venue
    } : null;
    const result = refineDevelopingEntry({direction,fresh,...bundle,original:originalValues,referenceVenue:'GATE'});
    return res.json({market:'crypto',symbol,asOf:bundle.asOf,...result});
  } catch (e) {
    return res.status(422).json({error:e.message||'DEVELOPING_REFINEMENT_FAILED',executionAuthority:false});
  }
});
router.post('/compare',async(req,res)=>{
  try {
    const v2=await research(req.body),legacy=req.body?.legacy??null;
    const legacyDirection=legacy?.researchDirection??legacy?.direction??null;
    res.json({v2,legacy,comparison:{directionAgreement:legacyDirection&&v2.direction?
      String(legacyDirection).toUpperCase()===v2.direction:null,
      legacyDirection,v2Direction:v2.direction,
      legacySource:legacy?'USER_SUPPLIED_UNVERIFIED':'NOT_AVAILABLE',sameSnapshotVerified:false},executionAuthority:false});
  } catch(e){res.status(422).json({error:e.message||'COMPARISON_FAILED',executionAuthority:false});}
});
export default router;
