import {stockClient} from './stockHttpClient.js';
const validSymbol=s=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s);
const validTF=new Set(['1Min','5Min','15Min','1Hour','1Day']);
const norm=b=>({timestamp:b.t??b.timestamp,open:Number(b.o??b.open),high:Number(b.h??b.high),low:Number(b.l??b.low),close:Number(b.c??b.close),volume:Number(b.v??b.volume)});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function page(path,params){
  for(let attempt=0;attempt<3;attempt++){
    try{return (await stockClient().get(path,{params})).data;}
    catch(e){if(e?.response?.status!==429||attempt===2)throw e;
      const retry=Number(e.response.headers?.['retry-after']);
      await delay(Number.isFinite(retry)&&retry>0?Math.min(retry*1000,20000):1000*2**attempt);
    }
  }
}
export async function getHistoricalBarsBatch({symbols=[],timeframe='5Min',start,end,feed='iex',pageSize=10000,maximumBars=250000}={}){
  if(!Array.isArray(symbols)||!symbols.length||symbols.some(s=>!validSymbol(s))||!validTF.has(timeframe)||!['iex','sip'].includes(feed))throw Error('INVALID_STOCK_BAR_REQUEST');
  const barsBySymbol=Object.fromEntries(symbols.map(s=>[s,[]]));
  const warnings=[];let token=null,total=0,pages=0,truncated=false;
  do{
    const data=await page('/v2/stocks/bars',{symbols:symbols.join(','),timeframe,start,end,feed,adjustment:'raw',limit:Math.min(pageSize,10000),...(token?{page_token:token}:{})});
    pages++;
    for(const s of symbols)for(const b of data?.bars?.[s]??[]){
      if(total>=maximumBars){truncated=true;break;}
      barsBySymbol[s].push(norm(b));total++;
    }
    if(truncated)break;
    token=data?.next_page_token??null;
  }while(token);
  for(const s of symbols)barsBySymbol[s]=[...new Map(barsBySymbol[s].map(b=>[b.timestamp,b])).values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  if(truncated)warnings.push(`Historical batch download reached the configured ${maximumBars}-bar safety limit.`);
  const missing=symbols.filter(s=>!barsBySymbol[s].length);
  if(missing.length)warnings.push(`Alpaca returned no historical bars for ${missing.length} requested symbol(s).`);
  return {approved:symbols.some(s=>barsBySymbol[s].length),barsBySymbol,warnings,errors:[],pageCount:pages,totalBarCount:total};
}
export async function getHistoricalBars({symbol,timeframe='5Min',start,end,feed='iex',maximumBars=250000}={}){
  const r=await getHistoricalBarsBatch({symbols:[symbol],timeframe,start,end,feed,maximumBars});
  return {approved:r.approved,bars:r.barsBySymbol[symbol]??[],errors:r.errors,warnings:r.warnings};
}
