/** Dedicated crypto PAPER account, read-only. Never uses stock bot credentials. */
const BASE = 'https://paper-api.alpaca.markets';
const allowed = new Set(['USD','USDT','USDC']);
function credentials() {
  const key = process.env.ALPACA_CRYPTO_API_KEY;
  const secret = process.env.ALPACA_CRYPTO_SECRET_KEY;
  const configured = (process.env.ALPACA_CRYPTO_BASE_URL || BASE).replace(/\/+$/, '').replace(/\/v2$/, '');
  if (configured !== BASE) throw Error('DEDICATED_CRYPTO_PAPER_ENDPOINT_REQUIRED');
  if (!key || !secret) throw Error('DEDICATED_CRYPTO_PAPER_CREDENTIALS_MISSING');
  return {'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret,Accept:'application/json'};
}
async function get(path,headers) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),12000);
  try {
    const response = await fetch(`${BASE}${path}`,{headers,signal:controller.signal});
    if (!response.ok) throw Error(`ALPACA_PAPER_HTTP_${response.status}`);
    return await response.json();
  } finally {clearTimeout(timer);}
}
const number = v => Number.isFinite(Number(v)) ? Number(v) : null;
const crypto = s => /^(BTC|ETH|SOL|AVAX|LINK|DOGE|LTC|BCH|UNI|AAVE|SHIB|DOT|MATIC|TRUMP|PEPE)[\/_]?(USD|USDT|USDC)$/i.test(String(s||''));
export async function getDedicatedAlpacaOverview() {
  const headers=credentials();
  const [a,p,o]=await Promise.all([
    get('/v2/account',headers),get('/v2/positions',headers),
    get('/v2/orders?status=all&limit=100&direction=desc',headers)
  ]);
  const positions=(Array.isArray(p)?p:[]).filter(x=>x.asset_class==='crypto'||crypto(x.symbol)).map(x=>({
    symbol:x.symbol,side:x.side,quantity:number(x.qty),averageEntryPrice:number(x.avg_entry_price),
    currentPrice:number(x.current_price),marketValue:number(x.market_value),unrealizedPnlUsd:number(x.unrealized_pl),
    unrealizedPnlPercent:number(x.unrealized_plpc)
  }));
  const orders=(Array.isArray(o)?o:[]).filter(x=>x.asset_class==='crypto'||crypto(x.symbol)).map(x=>({
    id:x.id,clientOrderId:x.client_order_id,symbol:x.symbol,side:x.side,type:x.type,status:x.status,
    quantity:number(x.qty),filledQuantity:number(x.filled_qty),filledAveragePrice:number(x.filled_avg_price),
    submittedAt:x.submitted_at,filledAt:x.filled_at
  }));
  return {provider:'ALPACA_PAPER',accountScope:'DEDICATED_CRYPTO_PAPER',connected:true,
    executionEnabled:false,protectionEnabled:false, // UI flags remain conservative until wired to runtime
    account:{status:a.status,cryptoStatus:a.crypto_status,cashUsd:number(a.cash),equityUsd:number(a.equity),
      tradingBlocked:Boolean(a.trading_blocked),accountBlocked:Boolean(a.account_blocked)},
    positions,orders,orderHistoryLimitedToLatest100:true,observedAt:new Date().toISOString()};
}
export default getDedicatedAlpacaOverview;
