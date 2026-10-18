#!/usr/bin/env node
/** Research-only offline outcome report. Requires independent post-decision OHLCV CSV/JSON. */
import fs from 'node:fs';import path from 'node:path';import {trackOutcome,summarizeOutcomes} from '../src/crypto/bot/quant/quantOutcomeTracking.js';
const args=process.argv.slice(2);const arg=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const setupFile=arg('--setups',null),candlesFile=arg('--candles',null),output=arg('--output','quant-research/output/quant_outcomes.json');
if(!setupFile||!candlesFile){console.error('Usage: node scripts/emaQuantOutcomeBatch.js --setups setups.json --candles future_candles.json [--interval 5m] [--cost-bps 12] [--output path]');process.exit(2);}
const setups=JSON.parse(fs.readFileSync(setupFile,'utf8'));const markets=JSON.parse(fs.readFileSync(candlesFile,'utf8'));
if(!Array.isArray(setups)||!markets||typeof markets!=='object'){console.error('Invalid inputs: setups must be an array; candles must be an object keyed by symbol');process.exit(2);}
const options={interval:arg('--interval','5m'),costBps:Number(arg('--cost-bps','12')),maxBars:Number(arg('--max-bars','72'))};
const rows=setups.map(s=>trackOutcome(s,markets[s.symbol]||[],options));const report={...summarizeOutcomes(rows),rows,options,researchOnly:true};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,...summarizeOutcomes(rows)},null,2));
