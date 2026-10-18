#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
import {collectMatchedFuturesCandles} from '../src/crypto/bot/quant/quantFuturesCandleCollector.js';
const args=process.argv.slice(2);const opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const setupsPath=opt('--setups','quant-research/data/historical_setups.json'),output=opt('--output','quant-research/data/future_candles.json'),interval=opt('--interval','5m'),maxBars=Number(opt('--max-bars','72'));
if(!fs.existsSync(setupsPath)){console.error('Missing setups: '+setupsPath);process.exit(2);}
const setups=JSON.parse(fs.readFileSync(setupsPath,'utf8'));
const result=await collectMatchedFuturesCandles(setups,{interval,maxBars});
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result.bundles,null,2)+'\n');
console.log(JSON.stringify({output,matched:result.bundles.length,skipped:result.skipped,trainingReady:false},null,2));
