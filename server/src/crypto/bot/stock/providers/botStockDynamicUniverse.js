/** Stock-only, read-only Alpaca equity listing. No trading endpoints are called. */
const SYMBOL=/^[A-Z][A-Z0-9.-]{0,9}$/;
export function selectStockUniverse(assets,{limit=100,offset=0}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)throw new Error('STOCK_UNIVERSE_PAGINATION_INVALID');
  if(!Array.isArray(assets))throw new Error('STOCK_UNIVERSE_RESPONSE_INVALID');
  const symbols=[...new Set(assets.filter(a=>a&&a.status==='active'&&a.tradable===true&&
    (a.class==='us_equity'||a.asset_class==='us_equity')&&a.exchange&&
    ['NASDAQ','NYSE','AMEX','ARCA','BATS'].includes(String(a.exchange).toUpperCase())&&
    typeof a.symbol==='string'&&SYMBOL.test(a.symbol.toUpperCase())&&
    !a.symbol.includes('/'))
    .map(a=>a.symbol.toUpperCase()))].sort();
  return {symbols:symbols.slice(offset,offset+limit),totalEligible:symbols.length,offset,limit};
}
export async function getStockDynamicUniverse({limit=100,offset=0,fetchImpl=globalThis.fetch,env=process.env}={}) {
  const key=env.ALPACA_API_KEY??env.APCA_API_KEY_ID;
  const secret=env.ALPACA_SECRET_KEY??env.APCA_API_SECRET_KEY;
  if(!key||!secret)throw new Error('STOCK_UNIVERSE_ALPACA_CREDENTIALS_MISSING');
  if(typeof fetchImpl!=='function')throw new Error('STOCK_UNIVERSE_FETCH_UNAVAILABLE');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetchImpl('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity',{
      method:'GET',headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret},signal:controller.signal});
    if(!response.ok)throw new Error(`STOCK_UNIVERSE_PROVIDER_HTTP_${response.status}`);
    const assets=await response.json();
    return {...selectStockUniverse(assets,{limit,offset}),source:'ALPACA_ACTIVE_US_EQUITIES',researchOnly:true};
  }finally{clearTimeout(timeout);}
}
