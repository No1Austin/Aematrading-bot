/** Historical Gate USDT perpetual 1m collector. Public market data; no execution. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGateLinearKlines } from '../src/crypto/data/providers/gateFuturesProvider.js';

function parseArgs(argv) {
  const a = {};
  for (let i=0;i<argv.length;i++) {
    if (!argv[i].startsWith('--')) throw Error(`Unexpected argument: ${argv[i]}`);
    const k=argv[i].slice(2);
    if (!['symbol','days','output','pause-ms'].includes(k) || !argv[i+1] || argv[i+1].startsWith('--')) throw Error(`Invalid --${k}`);
    a[k]=argv[++i];
  }
  const symbol=a.symbol ?? 'BTC_USDT';
  const days=Number(a.days ?? 7);
  const pauseMs=Number(a['pause-ms'] ?? 300);
  if (!/^[A-Z0-9]+_USDT$/.test(symbol)) throw Error('Symbol must be GATE format, e.g. BTC_USDT');
  if (!Number.isInteger(days) || days<2 || days>90) throw Error('--days must be an integer from 2 to 90');
  if (!Number.isInteger(pauseMs) || pauseMs<100 || pauseMs>30000) throw Error('--pause-ms must be 100..30000');
  const output=a.output ?? `quant-research/data/${symbol}_1m.csv`;
  if (!output.endsWith('.csv')) throw Error('--output must be .csv');
  return {symbol,days,pauseMs,output};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const number=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN;};
export function normalizeKlines(rows) {
  return rows.map(r=>({timestamp:number(r[0]),open:number(r[1]),high:number(r[2]),low:number(r[3]),close:number(r[4]),volume:number(r[5])})).filter(c=>Number.isInteger(c.timestamp) && c.timestamp>0 && [c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite) && c.open>0 && c.low>0 && c.close>0 && c.volume>=0 && c.high>=Math.max(c.open,c.close,c.low) && c.low<=Math.min(c.open,c.close));
}
export function inspectSeries(rows) {
  const sorted=[...rows].sort((a,b)=>a.timestamp-b.timestamp);
  const gaps=[];let duplicates=0;
  for(let i=1;i<sorted.length;i++){
    const delta=sorted[i].timestamp-sorted[i-1].timestamp;
    if(delta===0) duplicates++;
    else if(delta!==60000) gaps.push({previous:new Date(sorted[i-1].timestamp).toISOString(),next:new Date(sorted[i].timestamp).toISOString(),missingMinutes:Math.max(0,delta/60000-1)});
  }
  return {gaps,duplicates};
}
async function collect({symbol,days,pauseMs,output}) {
  // End at the start of the current minute, excluding the still-forming candle.
  const end=Math.floor(Date.now()/60000)*60;
  const start=end-days*86400;
  const all=new Map();
  let requests=0;
  // Use <= 900 candles per call to stay within Gate's per-request limits.
  for(let from=start;from<end;from+=900*60){
    const to=Math.min(end-60,from+899*60);
    let raw;
    for(let attempt=0;attempt<4;attempt++){
      try { raw=await getGateLinearKlines(symbol,{interval:'1',from,to,limit:900,timeoutMs:20000});break; }
      catch(err){if(attempt===3)throw err;await sleep(1000*(2**attempt));}
    }
    requests++;
    for(const c of normalizeKlines(raw)) if(c.timestamp>=start*1000 && c.timestamp<end*1000) all.set(c.timestamp,c);
    if(to<end-60)await sleep(pauseMs);
  }
  const rows=[...all.values()].sort((a,b)=>a.timestamp-b.timestamp);
  const {gaps,duplicates}=inspectSeries(rows);
  if(!rows.length)throw Error('No valid historical candles returned');
  if(gaps.length || duplicates || rows[0].timestamp!==start*1000 || rows.at(-1).timestamp!==(end-60)*1000){
    const report={symbol,expected:days*1440,received:rows.length,first:new Date(rows[0].timestamp).toISOString(),last:new Date(rows.at(-1).timestamp).toISOString(),gaps:gaps.slice(0,20),duplicates};
    throw Error('Incomplete historical data: '+JSON.stringify(report));
  }
  await fs.mkdir(path.dirname(output),{recursive:true});
  const csv='timestamp,open,high,low,close,volume\n'+rows.map(c=>`${new Date(c.timestamp).toISOString()},${c.open},${c.high},${c.low},${c.close},${c.volume}`).join('\n')+'\n';
  await fs.writeFile(output,csv,{flag:'w'});
  console.log(JSON.stringify({symbol,source:'GATE_USDT_PERPETUAL',interval:'1m',candles:rows.length,requests,output,first:new Date(rows[0].timestamp).toISOString(),last:new Date(rows.at(-1).timestamp).toISOString()},null,2));
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  collect(parseArgs(process.argv.slice(2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
