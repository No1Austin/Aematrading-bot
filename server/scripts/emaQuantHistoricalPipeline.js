#!/usr/bin/env node
/** Safe export + optional outcome matching. No exchange API or fabricated data. */
import fs from 'node:fs';
import path from 'node:path';
import {extractArchivedObservations,evaluateExternalOutcomes} from '../src/crypto/bot/quant/quantHistoricalPipeline.js';
const args=process.argv.slice(2);
const get=(key,defaultValue)=>{const i=args.indexOf(key);return i<0?defaultValue:args[i+1];};
const archive=get('--archive','quant-research/data/futures_snapshots.jsonl');
const prefix=get('--output-prefix','quant-research/output/ema_historical_pipeline');
const futureFile=get('--future-markets',null);
if(!fs.existsSync(archive)){console.error(`Archive not found: ${archive}. Run the archive-enabled diagnostic first.`);process.exit(2);}
const records=[], parseErrors=[];
fs.readFileSync(archive,'utf8').split(/\r?\n/).forEach((line,i)=>{if(!line.trim())return;try{records.push(JSON.parse(line));}catch(e){parseErrors.push({line:i+1,error:e.message});}});
const extracted=extractArchivedObservations(records);
const report={schemaVersion:'ema-quant-historical-pipeline-v1',archivedRecords:records.length,parseErrors,...extracted,trainingReady:false,reason:'ARCHIVE_PROVENANCE_AND_FUTURE_OUTCOMES_NOT_INDEPENDENTLY_VERIFIED',researchOnly:true};
if(futureFile){
 const markets=JSON.parse(fs.readFileSync(futureFile,'utf8'));
 report.outcomes=evaluateExternalOutcomes(extracted.observations,markets,{interval:get('--interval','5m'),costBps:Number(get('--cost-bps','12')),maxBars:Number(get('--max-bars','72'))});
}
fs.mkdirSync(path.dirname(prefix),{recursive:true});
fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(prefix+'.observations.json',JSON.stringify(extracted.observations,null,2)+'\n');
console.log(JSON.stringify({archiveRecords:records.length,observations:extracted.observations.length,rejected:extracted.rejected.length,parseErrors:parseErrors.length,outcomes:report.outcomes?.byStatus||null,trainingReady:false,output:prefix+'.json'},null,2));
