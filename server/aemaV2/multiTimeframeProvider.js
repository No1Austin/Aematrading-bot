/** Independent V2 data adapter. No imports from legacy trading/execution code. */
const DURATIONS = {"5m":300000,"15m":900000,"1h":3600000};
const GATE_BASE="https://api.gateio.ws/api/v4/futures/usdt/candlesticks";
function closed(rows, interval, now=Date.now()) {
  const duration=DURATIONS[interval];
  if (!Array.isArray(rows)) throw Error(`INVALID_${interval}_PROVIDER_RESPONSE`);
  const result=rows.map(r=>({openTime:Number(r.t)*1000,open:Number(r.o),high:Number(r.h),low:Number(r.l),close:Number(r.c),volume:Number(r.v??0)}))
    .filter(c=>Number.isFinite(c.openTime)&&c.openTime+duration<=now)
    .sort((a,b)=>a.openTime-b.openTime);
  if (result.length<35) throw Error(`INSUFFICIENT_CLOSED_${interval}_CANDLES`);
  return result;
}
export async function getV2CryptoCandleBundle(symbol,{fetchImpl=fetch,now=Date.now()}={}) {
  if (!/^[A-Z0-9]{2,20}_USDT$/.test(symbol)) throw Error("INVALID_GATE_FUTURES_SYMBOL");
  const results=await Promise.all(Object.keys(DURATIONS).map(async interval=>{
    const url=new URL(GATE_BASE);url.searchParams.set("contract",symbol);url.searchParams.set("interval",interval);url.searchParams.set("limit","150");
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetchImpl(url.toString(),{signal:controller.signal});
      if (!response.ok) throw Error(`GATE_${interval}_HTTP_${response.status}`);
      return [interval,closed(await response.json(),interval,now)];
    } finally {clearTimeout(timer);}
  }));
  const map=Object.fromEntries(results);
  return {candles5m:map['5m'],candles15m:map['15m'],candles1h:map['1h'],source:'GATE_FUTURES_PUBLIC',asOf:now};
}
