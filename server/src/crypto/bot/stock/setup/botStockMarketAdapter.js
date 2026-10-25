/** Convert Alpaca completed OHLCV bars to the independent stock strategy engine input. */
const FINITE = v => typeof v === 'number' && Number.isFinite(v);
const INTERVAL = Object.freeze({'1Min':'1m','5Min':'5m','15Min':'15m','1Hour':'1h','1Day':'1d'});
const MS = Object.freeze({'1Min':60000,'5Min':300000,'15Min':900000,'1Hour':3600000,'1Day':86400000});
export function adaptAlpacaBarsToStockSetup({symbol,bars,timeframe='5Min',asOf=Date.now(),spreadPercent=null,slippagePercent=null}={}) {
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol??'')) throw new Error('INVALID_STOCK_SYMBOL');
  if (!INTERVAL[timeframe]) throw new Error('UNSUPPORTED_STOCK_TIMEFRAME');
  if (!Array.isArray(bars)) throw new Error('STOCK_BARS_REQUIRED');
  const candles=[]; const seen=new Set();
  for(const b of bars){
    const t=typeof (b.timestamp??b.t)==='number'?(b.timestamp??b.t):Date.parse(b.timestamp??b.t);
    const open=Number(b.open??b.o),high=Number(b.high??b.h),low=Number(b.low??b.l),close=Number(b.close??b.c),volume=Number(b.volume??b.v);
    if (![t,open,high,low,close,volume].every(FINITE)||open<=0||close<=0||low<=0||high<Math.max(open,close)||low>Math.min(open,close)||volume<0)continue;
    if(t+MS[timeframe]+1000>asOf||seen.has(t))continue;
    seen.add(t);
    candles.push({openTime:t,time:t,timestamp:t,open,high,low,close,volume});
  }
  candles.sort((a,b)=>a.openTime-b.openTime);
  const last=candles.at(-1); const recent=candles.slice(-15);
  const ranges=candles.slice(-15).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-(candles[candles.length-recent.length+i-1]?.close??b.open)),Math.abs(b.low-(candles[candles.length-recent.length+i-1]?.close??b.open))));
  const atr=ranges.length===15?ranges.reduce((a,b)=>a+b,0)/15:null;
  const support=candles.length>=30?Math.min(...candles.slice(-30).map(b=>b.low)):null;
  const resistance=candles.length>=30?Math.max(...candles.slice(-30).map(b=>b.high)):null;
  const blockers=[];
  if(candles.length<65)blockers.push('INSUFFICIENT_CLOSED_STOCK_BARS');
  if(!last||asOf-last.openTime>4*86400000)blockers.push('STALE_STOCK_DATA');
  // Never manufacture spread/slippage evidence from OHLCV. Quality engine must fail closed if required.
  return {symbol,marketType:'STOCK',instrumentType:'EQUITY',approved:blockers.length===0,blockers,
    candles,price:last?.close??null,lastPrice:last?.close??null,atr,support,resistance,
    spreadPercent:FINITE(spreadPercent)?spreadPercent:null,
    slippage:FINITE(slippagePercent)?{buy:{available:true,percent:slippagePercent},sell:{available:true,percent:slippagePercent}}:null,
    candleInterval:INTERVAL[timeframe],asOf,source:'ALPACA_HISTORICAL',executionAuthority:false,liveExecution:false};
}
