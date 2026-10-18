import {trackOutcome, summarizeOutcomes} from './quantOutcomeTracking.js';
const parseTime=v=>Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
export function evaluateMatchedOutcomes(setups, candleBundles, {interval='5m',maxBars=72,costBps=12}={}) {
 if(!Array.isArray(setups)||!Array.isArray(candleBundles)) throw Error('ARRAY_INPUTS_REQUIRED');
 const lookup=new Map();
 for(const b of candleBundles){
  if(!b||!b.symbol||!b.exchange||!b.instrumentType||!Array.isArray(b.candles)) continue;
  const key=[b.exchange,b.instrumentType,b.symbol,interval].join('|');
  if(lookup.has(key))throw Error('DUPLICATE_CANDLE_BUNDLE:'+key);
  lookup.set(key,b);
 }
 const outcomes=setups.map(s=>{
  const base={observationId:s.observationId??null,symbol:s.symbol,exchange:s.exchange??null,instrumentType:s.instrumentType??null,pointInTimeVerified:s.pointInTimeVerified===true};
  if(!s.exchange||!s.instrumentType||!s.symbol||!Number.isFinite(parseTime(s.timestamp)))return {...base,status:'MISSING_MARKET_IDENTITY_OR_TIME',trainingReady:false};
  if(s.instrumentType!=='FUTURES')return {...base,status:'INSTRUMENT_NOT_FUTURES',trainingReady:false};
  const bundle=lookup.get([s.exchange,s.instrumentType,s.symbol,interval].join('|'));
  if(!bundle)return {...base,status:'MISSING_MATCHED_FUTURES_CANDLES',trainingReady:false};
  if(bundle.provenanceVerified!==true)return {...base,status:'UNVERIFIED_CANDLE_PROVENANCE',trainingReady:false};
  if(bundle.capturedThrough && parseTime(bundle.capturedThrough)<parseTime(s.timestamp))return {...base,status:'NO_POST_DECISION_DATA',trainingReady:false};
  const result=trackOutcome(s,bundle.candles,{interval,maxBars,costBps});
  return {...base,...result,trainingReady:false};
 });
 return {summary:summarizeOutcomes(outcomes),outcomes,trainingReady:false,reason:'INDEPENDENT_POINT_IN_TIME_VALIDATION_AND_WALK_FORWARD_TESTS_REQUIRED'};
}
