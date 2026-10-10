/** Gate public USDT linear perpetual evidence. Research-only, no order authority. */
const BASE = "https://api.gateio.ws/api/v4/futures/usdt";
const n = v => v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const str = v => v === null || v === undefined ? null : String(v);
async function request(path, query = {}, timeoutMs = 12000) {
  const url = new URL(BASE + path);
  for (const [k,v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const response = await fetch(url, {headers:{Accept:"application/json"}, signal:AbortSignal.timeout(Math.min(30000,Math.max(1000,timeoutMs)))});
  if (!response.ok) throw new Error(`GATE_FUTURES_HTTP_${response.status}`);
  const body = await response.json();
  if (body?.label || body?.message && !Array.isArray(body)) throw new Error(`GATE_FUTURES_API_${body.label || body.message}`);
  return body;
}
const validSymbol = s => /^[A-Z0-9]+_USDT$/.test(String(s || ""));
const requireSymbol = s => { if (!validSymbol(s)) throw new Error("GATE_INVALID_PERPETUAL_SYMBOL"); return s; };
const instrument = c => ({symbol:c.name,baseCoin:c.name.slice(0,-5),quoteCoin:"USDT",settleCoin:"USDT",contractType:"LinearPerpetual",status:"Trading",contractMultiplier:n(c.quanto_multiplier)});
const ticker = (t,c={}) => ({symbol:t.contract,lastPrice:str(t.last),bid1Price:str(t.highest_bid),ask1Price:str(t.lowest_ask),highPrice24h:str(t.high_24h),lowPrice24h:str(t.low_24h),turnover24h:str(t.volume_24h_quote),volume24h:str(t.volume_24h_base),price24hPcnt:n(t.change_percentage) === null ? null : String(n(t.change_percentage)/100),markPrice:str(t.mark_price ?? c.mark_price),indexPrice:str(t.index_price ?? c.index_price),openInterest:null,openInterestValue:null,fundingRate:str(t.funding_rate ?? c.funding_rate),nextFundingTime:n(c.funding_next_apply),source:"GATE_USDT_PERPETUAL",observedAt:Date.now()});
export async function listGateLinearPerpetuals({timeoutMs=12000}={}) {
  const [contracts,tickers] = await Promise.all([request("/contracts",{},timeoutMs),request("/tickers",{},timeoutMs)]);
  if (!Array.isArray(contracts) || !Array.isArray(tickers)) throw new Error("GATE_UNIVERSE_INVALID");
  const byName=new Map(tickers.map(t=>[t.contract,t]));
  return contracts.filter(c=>c?.type === "direct" && c?.in_delisting === false && validSymbol(c?.name) && byName.has(c.name)).map(c=>({instrument:instrument(c),ticker:ticker(byName.get(c.name),c)}));
}
export async function getGateLinearTicker(symbol,{timeoutMs=12000}={}) {
  requireSymbol(symbol);
  const rows=await request("/tickers",{contract:symbol},timeoutMs);
  const t=Array.isArray(rows)?rows.find(x=>x.contract===symbol):null;
  if (!t) throw new Error("GATE_TICKER_MISSING");
  return ticker(t);
}
const interval = v => { const m={"1":"1m","3":"3m","5":"5m","15":"15m","30":"30m","60":"1h","240":"4h","D":"1d"};return m[String(v)] || "15m"; };
export async function getGateLinearKlines(symbol,{interval:iv="15",limit=96,timeoutMs=12000}={}) {
  requireSymbol(symbol);
  const rows=await request("/candlesticks",{contract:symbol,interval:interval(iv),limit:Math.min(1000,Math.max(2,limit))},timeoutMs);
  if (!Array.isArray(rows)) throw new Error("GATE_KLINES_INVALID");
  return rows.map(c=>[String(n(c.t)*1000),c.o,c.h,c.l,c.c,c.v ?? null,c.sum ?? null]);
}
export async function getGateLinearOrderbook(symbol,{limit=100,timeoutMs=12000}={}) {
  requireSymbol(symbol);
  const book=await request("/order_book",{contract:symbol,limit:Math.min(100,Math.max(5,limit))},timeoutMs);
  if (!Array.isArray(book?.bids) || !Array.isArray(book?.asks)) throw new Error("GATE_ORDERBOOK_INVALID");
  // Gate sizes are contracts; multiply by contract's underlying-unit multiplier.
  const contract=await request(`/contracts/${symbol}`,{},timeoutMs);
  const multiplier=n(contract?.quanto_multiplier);
  if (!(multiplier>0)) throw new Error("GATE_CONTRACT_MULTIPLIER_UNAVAILABLE");
  const levels=rows=>rows.map(x=>[str(x.p),n(x.s)===null?null:String(Math.abs(n(x.s))*multiplier)]).filter(x=>n(x[0])>0 && n(x[1])>0);
  return {b:levels(book.bids),a:levels(book.asks),ts:n(book.current) ? n(book.current)*1000 : null,source:"GATE_USDT_PERPETUAL"};
}
export async function getGateOpenInterest(symbol,{limit=2,timeoutMs=12000}={}) {
  requireSymbol(symbol);
  const rows=await request("/contract_stats",{contract:symbol,limit:Math.min(100,Math.max(2,limit)),interval:"5m"},timeoutMs);
  if (!Array.isArray(rows)) return [];
  return rows.map(r=>({openInterest:r.open_interest_usd ?? null,timestamp:n(r.time)===null?null:String(n(r.time)*1000)}));
}
