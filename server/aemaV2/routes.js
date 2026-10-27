import {Router} from 'express';
import {analyze} from './engine.js';
import {candlesFor} from './providers.js';
import {getV2CryptoCandleBundle} from './multiTimeframeProvider.js';
import {evaluateV2CandleDecision} from './candles/candleDecisionEngine.js';
const router=Router();
router.get('/health',(_req,res)=>res.json({ok:true,version:'v2',markets:['crypto','stocks'],cryptoTimeframes:['5m','15m','1h'],executionAuthority:false}));
async function research(body={}) {
  const {market,symbol}=body;
  if (market==='crypto') {
    const bundle=await getV2CryptoCandleBundle(symbol);
    const decision=evaluateV2CandleDecision({...bundle,asOf:bundle.asOf});
    return {market,symbol,source:bundle.source,...decision,interval:'15m',timeframes:{primary:'15m',entry:'5m',context:'1h'},validatedForTrading:false};
  }
  if (market==='stocks') {
    const bars=await candlesFor(market,symbol);
    return {...analyze({market,symbol,candles:bars}),timeframes:{primary:'15m',entry:null,context:null},validatedForTrading:false,warning:'STOCK_MULTI_TIMEFRAME_NOT_YET_IMPLEMENTED'};
  }
  throw Error('INVALID_MARKET');
}
router.post('/analyze',async(req,res)=>{
  try {res.json(await research(req.body));}
  catch(e){res.status(422).json({error:e.message||'ANALYSIS_FAILED',executionAuthority:false});}
});
router.post('/compare',async(req,res)=>{
  try {
    const v2=await research(req.body);
    const legacy=req.body?.legacy??null;
    const legacyDirection=legacy?.researchDirection??legacy?.direction??null;
    res.json({v2,legacy,comparison:{directionAgreement:legacyDirection&&v2.direction?String(legacyDirection).toUpperCase()===v2.direction:null,legacyDirection,v2Direction:v2.direction,legacySource:legacy?'USER_SUPPLIED_UNVERIFIED':'NOT_AVAILABLE',sameSnapshotVerified:false},executionAuthority:false});
  } catch(e){res.status(422).json({error:e.message||'COMPARISON_FAILED',executionAuthority:false});}
});
export default router;
