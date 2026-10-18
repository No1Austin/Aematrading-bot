#!/usr/bin/env node
/** Export captured setups for future independent OHLCV outcome matching. */
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);const opt=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const input=opt('--input','quant-research/data/setup_observations.jsonl');
const output=opt('--output','quant-research/data/historical_setups.json');
if(!fs.existsSync(input)){console.error(`No captured setups at ${input}. Run the diagnostic with quantSetupCapture enabled first.`);process.exit(2);}
const rows=[],errors=[];for(const [index,line] of fs.readFileSync(input,'utf8').split(/\r?\n/).entries()){
 if(!line.trim())continue;
 try {const r=JSON.parse(line);if(r.geometryValid&&r.instrumentType==='FUTURES'&&r.outcomeStart&&r.symbol){rows.push({timestamp:r.outcomeStart,symbol:r.symbol,instrumentType:r.instrumentType,exchange:r.exchange||null,marketId:r.marketId||null,marketIdentitySource:r.marketIdentitySource||null,candleInterval:r.candleInterval||null,capturedAt:r.capturedAt||null,strategy:r.strategy,direction:r.direction,entry:r.entry,stop:r.stop,target:r.target,observationId:r.observationId,pointInTimeVerified:false});}}
 catch(e){errors.push({line:index+1,error:String(e.message)});}
}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify({capturedValidGeometry:rows.length,parseErrors:errors.length,output,requiresMatchedFutureCandles:true,trainingReady:false},null,2));
