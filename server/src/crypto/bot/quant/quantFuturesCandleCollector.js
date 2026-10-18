/** Research-only historical linear-perpetual candle collector. No trading authority. */
import {INTERVAL_MS} from './quantOutcomeTracking.js';
const EXCHANGES=new Set(['GATE','BYBIT']);
const time=v=>Date.parse(v);
const num=v=>Number(v);
export function validateFuturesSetupIdentity(s,{interval='5m',maxBars=72,nowMs=Date.now()}={}){
 const ms=INTERVAL_MS[interval];if(!ms||!Number.isInteger(maxBars)||maxBars<1||maxBars>200)throw Error('INVALID_WINDOW');
 if(!s||s.instrumentType!=='FUTURES'||!EXCHANGES.has(s.exchange))return {ok:false,reason:'MISSING_OR_UNSUPPORTED_FUTURES_EXCHANGE'};
 const marketId=String(s.marketId||'');
 const valid=s.exchange==='GATE'?/^[A-Z0-9]+_USDT$/.test(marketId):/^[A-Z0-9]+USDT$/.test(marketId);
 const expected=s.exchange==='GATE'?s.symbol:String(s.symbol||'').replace('_','');
 if(!valid||marketId!==expected)return {ok:false,reason:'MARKET_ID_MISMATCH'};
 const t=time(s.timestamp);
 if(!Number.isFinite(t)||t%ms!==0)return {ok:false,reason:'INVALID_DECISION_WINDOW'};
 // A capture in the current candle is valid, but its outcome window is not yet available.
 // Distinguish PENDING from malformed timestamps; never fetch incomplete future candles.
 if(t>nowMs || t+ms*maxBars>nowMs)return {ok:false,reason:'OUTCOME_WINDOW_NOT_COMPLETE',readyAt:new Date(t+ms*maxBars).toISOString()};
 return {ok:true,start:t,end:t+ms*maxBars,marketId};
}
function parseRows(rows,exchange){
 return rows.map(r=>{
  const a=exchange==='GATE'?r:[r[0],r[1],r[2],r[3],r[4],r[5]];
  return {openTime:Number(a[0]),open:num(a[1]),high:num(a[2]),low:num(a[3]),close:num(a[4]),volume:num(a[5])};
 }).sort((a,b)=>a.openTime-b.openTime);
}
export function validateFetchedCandles(rows,{start,end,interval='5m'}={}){
 const ms=INTERVAL_MS[interval];if(!ms||!Array.isArray(rows))throw Error('INVALID_CANDLES');
 const candles=rows.filter(c=>c.openTime>=start&&c.openTime<end);
 if(candles.length!==(end-start)/ms)return {ok:false,reason:'MISSING_CANDLES',candles};
 for(let i=0;i<candles.length;i++){
  const c=candles[i];if(c.openTime!==start+i*ms||![c.open,c.high,c.low,c.close].every(Number.isFinite)||c.low<=0||c.high<c.low||c.open<c.low||c.open>c.high||c.close<c.low||c.close>c.high)return {ok:false,reason:'INVALID_OR_GAPPED_CANDLES',candles};
 }
 return {ok:true,candles};
}
export async function collectMatchedFuturesCandles(setups,{interval='5m',maxBars=72,nowMs=Date.now(),fetchJson=defaultFetch}={}){
 if(!Array.isArray(setups))throw Error('SETUPS_ARRAY_REQUIRED');
 const bundles=[],skipped=[];
 for(const s of setups){
  const v=validateFuturesSetupIdentity(s,{interval,maxBars,nowMs});if(!v.ok){skipped.push({observationId:s?.observationId??null,symbol:s?.symbol??null,reason:v.reason,...(v.readyAt?{readyAt:v.readyAt}:{})});continue;}
  const ms=INTERVAL_MS[interval],raw=[];
  try{
   // One explicit request per setup, never substitute a different exchange.
   let url;
   if(s.exchange==='GATE'){
    url=new URL('https://api.gateio.ws/api/v4/futures/usdt/candlesticks');
    Object.entries({contract:v.marketId,interval,from:Math.floor(v.start/1000),to:Math.floor((v.end-ms)/1000)}).forEach(([k,val])=>url.searchParams.set(k,String(val)));
   }else{
    url=new URL('https://api.bybit.com/v5/market/kline');
    Object.entries({category:'linear',symbol:v.marketId,interval:String(ms/60000),start:v.start,end:v.end-ms,limit:maxBars}).forEach(([k,val])=>url.searchParams.set(k,String(val)));
   }
   const body=await fetchJson(url.toString());
   if(s.exchange==='BYBIT'&&String(body?.retCode)!=='0')throw Error('BYBIT_API_REJECTED');
   const rows=s.exchange==='GATE'?body:body?.result?.list;
   if(!Array.isArray(rows))throw Error('INVALID_PROVIDER_RESPONSE');
   const parsed=s.exchange==='GATE'?rows.map(c=>[Number(c.t)*1000,c.o,c.h,c.l,c.c,c.v]):rows;
   const check=validateFetchedCandles(parseRows(parsed,s.exchange),{start:v.start,end:v.end,interval});
   if(!check.ok){skipped.push({observationId:s.observationId??null,symbol:s.symbol,reason:check.reason});continue;}
   bundles.push({exchange:s.exchange,instrumentType:'FUTURES',symbol:s.symbol,marketId:v.marketId,interval,observationId:s.observationId??null,capturedThrough:new Date(v.end).toISOString(),provenanceVerified:true,provenanceMethod:'DIRECT_PUBLIC_FUTURES_API_NOT_INDEPENDENTLY_AUDITED',candles:check.candles,researchOnly:true,trainingReady:false});
  }catch(e){skipped.push({observationId:s.observationId??null,symbol:s.symbol,reason:'PROVIDER_FETCH_FAILED',detail:String(e.message)});}
 }
 return {bundles,skipped,trainingReady:false};
}
async function defaultFetch(url){const res=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error(`HTTP_${res.status}`);return res.json();}
