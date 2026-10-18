#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {evaluateMatchedOutcomes} from '../src/crypto/bot/quant/quantOutcomeDataset.js';
const argv=process.argv.slice(2);
const opt=(flag,fallback)=>{const i=argv.indexOf(flag);return i<0?fallback:argv[i+1];};
const setupsFile=opt('--setups','quant-research/data/historical_setups.json');
const candlesFile=opt('--candles','quant-research/data/future_candles.json');
const output=opt('--output','quant-research/output/quant_outcomes.json');
for(const f of [setupsFile,candlesFile])if(!fs.existsSync(f)){console.error(`Missing input: ${f}. No historical data will be fabricated.`);process.exit(2);}
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const result=evaluateMatchedOutcomes(read(setupsFile),read(candlesFile),{interval:opt('--interval','5m'),costBps:Number(opt('--cost-bps','12')),maxBars:Number(opt('--max-bars','72'))});
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,...result.summary,trainingReady:false},null,2));
