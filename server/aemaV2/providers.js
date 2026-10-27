// Uses existing public Gate futures feed and existing Alpaca data credentials, if configured.
const timeout=ms=>AbortSignal.timeout(ms);
async function get(url,headers={}){const r=await fetch(url,{headers,signal:timeout(12000)});if(!r.ok)throw Error(`PROVIDER_HTTP_${r.status}`);return r.json()}
export async function candlesFor(market,symbol){
  if(market==='crypto'){
    if(!/^[A-Z0-9]{2,20}_USDT$/.test(symbol))throw Error('CRYPTO_SYMBOL_MUST_BE_BASE_USDT');
    const raw=await get(`https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=${encodeURIComponent(symbol)}&interval=15m&limit=120`);
    if(!Array.isArray(raw))throw Error('GATE_RESPONSE_INVALID');
    return raw.map(x=>({time:Number(x.t)*1000,open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v})).sort((a,b)=>a.time-b.time).slice(0,-1); // exclude potentially forming candle
  }
  if(market==='stocks'){
    if(!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol))throw Error('INVALID_STOCK_SYMBOL');
    const key=process.env.APCA_API_KEY_ID||process.env.ALPACA_API_KEY||process.env.ALPACA_API_KEY_ID;
    const secret=process.env.APCA_API_SECRET_KEY||process.env.ALPACA_SECRET_KEY||process.env.ALPACA_API_SECRET;
    if(!key||!secret)throw Error('ALPACA_DATA_CREDENTIALS_MISSING');
    const end=new Date(),start=new Date(end.getTime()-25*86400000);
    const params=new URLSearchParams({timeframe:'15Min',start:start.toISOString(),end:end.toISOString(),limit:'1000',adjustment:'raw',feed:'iex',sort:'desc'});
    const raw=await get(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`,{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret});
    if(!Array.isArray(raw.bars))throw Error('ALPACA_BARS_MISSING');
    return raw.bars.map(x=>({time:Date.parse(x.t),open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v})).sort((a,b)=>a.time-b.time).filter(x=>x.time+15*60000<=Date.now());
  }
  throw Error('INVALID_MARKET');
}
