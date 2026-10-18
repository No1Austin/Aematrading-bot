/** Coinbase Exchange SPOT historical OHLCV collector. Research only. Node 18+. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function parseArgs(argv) {
  const opts={symbol:'BTC-USD',days:7};
  for(let i=0;i<argv.length;i++) {
    if(argv[i]==='--symbol') opts.symbol=argv[++i];
    else if(argv[i]==='--days') opts.days=Number(argv[++i]);
    else if(argv[i]==='--output') opts.output=argv[++i];
    else throw new Error(`UNKNOWN_ARGUMENT:${argv[i]}`);
  }
  if(!/^[A-Z0-9]+-[A-Z0-9]+$/.test(opts.symbol)) throw new Error('COINBASE_SPOT_PRODUCT_REQUIRED: use BTC-USD, not BTC_USDT');
  if(!Number.isInteger(opts.days)||opts.days<1||opts.days>90) throw new Error('DAYS_MUST_BE_1_TO_90');
  return opts;
}
export function normalize(rows) {
  if(!Array.isArray(rows)) throw new Error('INVALID_COINBASE_CANDLES');
  return rows.map(r=>{
    if(!Array.isArray(r)||r.length<6) throw new Error('INVALID_COINBASE_ROW');
    const [timestamp,low,high,open,close,volume]=r.map(Number);
    if(![timestamp,low,high,open,close,volume].every(Number.isFinite)||open<=0||close<=0||low<=0||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close)) throw new Error('INVALID_OHLCV');
    return {timestamp,open,high,low,close,volume};
  });
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function collect({symbol='BTC-USD',days=7,output,fetchImpl=fetch,now=Date.now(),sleep=wait}={}) {
  if(!/^[A-Z0-9]+-[A-Z0-9]+$/.test(symbol)) throw new Error('COINBASE_SPOT_PRODUCT_REQUIRED');
  if(!Number.isInteger(days)||days<1||days>90) throw new Error('DAYS_MUST_BE_1_TO_90');
  const end=Math.floor(now/60000)*60-60; // latest completed minute start
  const start=end-days*86400+60;
  const candles=new Map();
  for(let from=start;from<=end;from+=299*60){
    const to=Math.min(end+60,from+299*60);
    const url=new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles`);
    url.searchParams.set('granularity','60');
    url.searchParams.set('start',new Date(from*1000).toISOString());
    url.searchParams.set('end',new Date(to*1000).toISOString());
    let rows;
    for(let attempt=0;attempt<4;attempt++){
      const response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'AEMA-Research/1.0'},signal:AbortSignal.timeout(20000)});
      if(response.ok){rows=normalize(await response.json());break;}
      const body=(await response.text()).slice(0,300);
      if((response.status===429||response.status>=500)&&attempt<3){await sleep(1000*2**attempt);continue;}
      throw new Error(`COINBASE_HTTP_${response.status}: ${body}`);
    }
    for(const c of rows) if(c.timestamp>=start&&c.timestamp<=end&&c.timestamp%60===0) candles.set(c.timestamp,c);
    if(from+299*60<=end) await sleep(400);
  }
  // Coinbase sometimes omits a boundary minute. Retry only missing minutes, without fabrication.
  let missing=[];
  for(let t=start;t<=end;t+=60) if(!candles.has(t)) missing.push(t);
  for(const t of missing) {
    const url=new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles`);
    url.searchParams.set('granularity','60');
    url.searchParams.set('start',new Date((t-60)*1000).toISOString());
    url.searchParams.set('end',new Date((t+120)*1000).toISOString());
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'AEMA-Research/1.0'},signal:AbortSignal.timeout(20000)});
        if(!response.ok) {if(response.status===429||response.status>=500){await sleep(500*(attempt+1));continue;}break;}
        for(const c of normalize(await response.json())) if(c.timestamp===t) candles.set(t,c);
        if(candles.has(t)) break;
      } catch(e) {if(attempt===2) break;await sleep(500*(attempt+1));}
    }
    await sleep(200);
  }
  missing=missing.filter(t=>!candles.has(t));
  const sorted=[...candles.values()].sort((a,b)=>a.timestamp-b.timestamp);
  const expected=Math.floor((end-start)/60)+1;
  const dest=output??path.join('quant-research','data',`${symbol.replace('-','_')}_SPOT_1m.csv`);
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.writeFile(dest,['timestamp,open,high,low,close,volume',...sorted.map(c=>[c.timestamp,c.open,c.high,c.low,c.close,c.volume].join(','))].join('\n')+'\n');
  const gapReport=dest.replace(/\.csv$/i,'')+'.gaps.json';
  await fs.writeFile(gapReport,JSON.stringify({schemaVersion:'ema-spot-gaps-v1',symbol,marketType:'SPOT',expected,received:sorted.length,missingCount:missing.length,missingTimestamps:missing.map(t=>new Date(t*1000).toISOString()),complete:missing.length===0},null,2)+'\n');
  return {output:dest,gapReport,complete:missing.length===0,missingCount:missing.length,marketType:'SPOT',source:'COINBASE_EXCHANGE_PUBLIC',candles:sorted.length,expected,from:new Date(start*1000).toISOString(),to:new Date(end*1000).toISOString()};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct) collect(parseArgs(process.argv.slice(2))).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
