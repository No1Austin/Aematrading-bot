/** Collect multiple Coinbase SPOT products sequentially using the tested Phase 2 collector. */
import {collect} from './emaQuantCollectCoinbaseHistory.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function main(args=process.argv.slice(2), collector=collect) {
  const index=args.indexOf('--days');
  const days=index>=0?Number(args[index+1]):30;
  const products=args.filter((v,i)=>i!==index&&i!==index+1);
  if(!products.length)throw new Error('Provide products, e.g. BTC-USD ETH-USD SOL-USD');
  if(!Number.isInteger(days)||days<1||days>90)throw new Error('Days must be 1-90');
  const reports=[];
  for(const symbol of products){
    try {const result=await collector({symbol,days});reports.push({symbol,ok:result.complete!==false,...result});console.log(JSON.stringify(reports.at(-1)));}
    catch(e){reports.push({symbol,ok:false,error:e.message});console.error(JSON.stringify(reports.at(-1)));}
  }
  if(reports.some(r=>!r.ok))process.exitCode=1;
  return reports;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
