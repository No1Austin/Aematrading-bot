#!/usr/bin/env node
/** Read-only diagnostic combining archive integrity with setup economics. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectArchive,summarizeSetups} from '../src/crypto/bot/quant/quantArchiveResearchReport.js';
export function buildReadinessReport({archiveText='',diagnostic={},costBps=12}={}) {
  const raw=diagnostic.raw??diagnostic;
  const setups=Array.isArray(raw.quantSetupShadow)?raw.quantSetupShadow:Array.isArray(diagnostic.quantSetupShadow)?diagnostic.quantSetupShadow:[];
  const archive=inspectArchive(archiveText);
  return {archive,setups:summarizeSetups(setups,{costBps}),funnel:{qualifiedSetups:raw?.summary?.qualifiedSetups??raw?.qualifiedSetups??null},trainingReady:false,reason:'POINT_IN_TIME_PROVENANCE_AND_FUTURE_OUTCOMES_NOT_VERIFIED',researchOnly:true};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const args=process.argv.slice(2);
  const arg=(name,def)=>{const i=args.indexOf(name);return i>=0?args[i+1]:def;};
  const archivePath=arg('--archive','quant-research/data/futures_snapshots.jsonl');
  const diagnosticPath=arg('--diagnostic',null);
  const costBps=Number(arg('--cost-bps','12'));
  if(!Number.isFinite(costBps)||costBps<0){console.error('Invalid --cost-bps');process.exit(2);}
  if(!fs.existsSync(archivePath)){console.error(`Archive missing: ${archivePath}. Run a snapshot collection cycle first.`);process.exit(2);}
  const diagnostic=diagnosticPath?JSON.parse(fs.readFileSync(diagnosticPath,'utf8')):{};
  const report=buildReadinessReport({archiveText:fs.readFileSync(archivePath,'utf8'),diagnostic,costBps});
  const output=arg('--output',null);
  if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
  if(report.archive.parseErrors||report.archive.hashMismatches)process.exitCode=1;
}
