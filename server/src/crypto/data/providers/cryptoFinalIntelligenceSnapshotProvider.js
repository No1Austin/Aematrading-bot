const BINANCE=process.env.BINANCE_FUTURES_BASE_URL||"https://fapi.binance.com";
const LUNAR=process.env.LUNARCRUSH_BASE_URL||"https://lunarcrush.com/api4";
const CMC=process.env.COINMARKETCAL_BASE_URL||"https://api.coinmarketcal.com";
const TTL=Number(process.env.CRYPTO_FINAL_INTELLIGENCE_TTL_MS)||600000;
const cache={value:null,expiresAt:0,promise:null};
const norm=v=>String(v??"").trim().toLowerCase();
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

async function getJson(url,{headers={},timeoutMs=12000}={}){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const r=await fetch(url,{headers:{Accept:"application/json",...headers},signal:c.signal});
    if(!r.ok)throw new Error(`HTTP_${r.status}: ${(await r.text().catch(()=>"")).slice(0,160)}`);
    return await r.json();
  }finally{clearTimeout(t);}
}
async function binance(){
  const [a,b]=await Promise.all([
    getJson(`${BINANCE}/fapi/v1/ticker/24hr`),
    getJson(`${BINANCE}/fapi/v1/premiumIndex`)
  ]);
  const tickers=(Array.isArray(a)?a:[]).map(x=>({
    symbol:String(x?.symbol??"").toUpperCase(),priceChangePercent:finite(x?.priceChangePercent),
    lastPrice:finite(x?.lastPrice),quoteVolumeUsd:finite(x?.quoteVolume??x?.baseVolume),
    volume:finite(x?.volume),highPrice:finite(x?.highPrice),lowPrice:finite(x?.lowPrice),tradeCount:finite(x?.count)
  }));
  const premiums=(Array.isArray(b)?b:[]).map(x=>({
    symbol:String(x?.symbol??"").toUpperCase(),markPrice:finite(x?.markPrice),indexPrice:finite(x?.indexPrice),
    fundingRate:finite(x?.lastFundingRate),interestRate:finite(x?.interestRate),nextFundingTime:finite(x?.nextFundingTime)
  }));
  return{tickers,premiums};
}
async function lunar(){
  const key=process.env.LUNARCRUSH_API_KEY;
  if(!key)return{enabled:false,reason:"LUNARCRUSH_API_KEY_MISSING",coins:[]};
  const p=await getJson(`${LUNAR}/public/coins/list/v1`,{headers:{Authorization:`Bearer ${key}`}});
  const rows=Array.isArray(p?.data)?p.data:Array.isArray(p)?p:[];
  return{enabled:true,reason:null,coins:rows.map(x=>({
    id:x?.id??null,symbol:String(x?.symbol??"").toUpperCase(),name:x?.name??null,topic:x?.topic??null,
    galaxyScore:finite(x?.galaxy_score??x?.galaxyScore),altRank:finite(x?.alt_rank??x?.altRank),
    sentiment:finite(x?.sentiment),socialVolume:finite(x?.social_volume??x?.socialVolume),
    interactions:finite(x?.interactions??x?.social_interactions),socialDominance:finite(x?.social_dominance??x?.socialDominance)
  }))};
}
async function cmc(){
  const key=process.env.COINMARKETCAL_API_KEY;
  if(!key)return{enabled:false,reason:"COINMARKETCAL_API_KEY_MISSING",events:[]};
  const max=Math.max(1,Math.min(5,Number(process.env.COINMARKETCAL_EVENT_PAGES)||2));
  let cursor=null; const events=[];
  for(let i=0;i<max;i++){
    const q=new URLSearchParams({limit:"100",sortBy:"date_asc"}); if(cursor)q.set("cursor",cursor);
    const p=await getJson(`${CMC}/v2/events?${q}`,{headers:{"x-api-key":key}});
    for(const x of (Array.isArray(p?.data)?p.data:[]))events.push({
      id:String(x?.id??""),title:x?.title??null,description:x?.description??null,date:x?.date??null,dateEnd:x?.dateEnd??null,
      displayedDate:x?.displayedDate??null,isEstimated:x?.isEstimated===true,categories:Array.isArray(x?.categories)?x.categories:[],
      impact:finite(x?.impact),impactSummary:x?.impactSummary??null,
      coins:Array.isArray(x?.coins)?x.coins.map(c=>({slug:norm(c?.slug),symbol:String(c?.symbol??"").toUpperCase(),name:c?.name??null})):[]
    });
    cursor=p?.meta?.cursor??null; if(!cursor)break;
  }
  return{enabled:true,reason:null,events};
}
const settled=(r,f)=>r.status==="fulfilled"?{ok:true,error:null,value:r.value}:{ok:false,error:r.reason instanceof Error?r.reason.message:String(r.reason),value:f};

async function build(){
  const [br,lr,er]=await Promise.allSettled([binance(),lunar(),cmc()]);
  const b=settled(br,{tickers:[],premiums:[]}),l=settled(lr,{enabled:false,coins:[]}),e=settled(er,{enabled:false,events:[]});
  const tickerBySymbol=new Map(),premiumBySymbol=new Map(),lunarBySymbol=new Map(),lunarByName=new Map(),eventsBySlug=new Map(),eventsBySymbol=new Map();
  for(const x of b.value.tickers??[])if(x.symbol)tickerBySymbol.set(x.symbol,x);
  for(const x of b.value.premiums??[])if(x.symbol)premiumBySymbol.set(x.symbol,x);
  for(const x of l.value.coins??[]){if(x.symbol)lunarBySymbol.set(norm(x.symbol),x);if(x.name)lunarByName.set(norm(x.name),x);}
  const add=(m,k,v)=>{if(!k)return;const a=m.get(k)??[];a.push(v);m.set(k,a);};
  for(const ev of e.value.events??[])for(const c of ev.coins??[]){add(eventsBySlug,norm(c.slug),ev);add(eventsBySymbol,norm(c.symbol),ev);}
  return{
    fetchedAt:new Date().toISOString(),
    providers:{
      binanceFutures:{ok:b.ok,error:b.error,tickers:b.value.tickers?.length??0,premiums:b.value.premiums?.length??0},
      lunarCrush:{ok:l.ok&&l.value.enabled===true,enabled:l.value.enabled===true,reason:l.value.reason??null,error:l.error,coins:l.value.coins?.length??0},
      coinMarketCal:{ok:e.ok&&e.value.enabled===true,enabled:e.value.enabled===true,reason:e.value.reason??null,error:e.error,events:e.value.events?.length??0}
    },
    index:{tickerBySymbol,premiumBySymbol,lunarBySymbol,lunarByName,eventsBySlug,eventsBySymbol}
  };
}
export async function buildCryptoFinalIntelligenceSnapshot({refresh=false,ttlMs=TTL}={}){
  if(!refresh&&cache.value&&cache.expiresAt>Date.now())return cache.value;
  if(cache.promise)return cache.promise;
  cache.promise=build().then(v=>{cache.value=v;cache.expiresAt=Date.now()+ttlMs;return v;}).finally(()=>{cache.promise=null;});
  return cache.promise;
}
export function clearCryptoFinalIntelligenceSnapshot(){cache.value=null;cache.expiresAt=0;cache.promise=null;}
export default buildCryptoFinalIntelligenceSnapshot;
