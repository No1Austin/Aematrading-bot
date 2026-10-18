#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeStrategyOutcomes} from '../src/crypto/bot/quant/quantStrategyAnalytics.js';
export function runAnalytics({cwd=process.cwd(),input='quant-research/output/quant_outcomes.json',output='quant-research/output/quant_strategy_analytics.json',minSample=30}={}){
 const source=path.resolve(cwd,input);
 if(!fs.existsSync(source))throw new Error('OUTCOMES_FILE_MISSING: '+source);
 const data=JSON.parse(fs.readFileSync(source,'utf8'));
 const report={generatedAt:new Date().toISOString(),source:input,...analyzeStrategyOutcomes(data,{minSample})};
 const destination=path.resolve(cwd,output);
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination+'.tmp',JSON.stringify(report,null,2)+'\n');
 fs.renameSync(destination+'.tmp',destination);
 return {output:destination,observations:report.observations,eligible:report.eligible,excluded:report.excluded,trainingReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(runAnalytics(),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
