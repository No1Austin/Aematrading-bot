/** Read-only audit of research-only snapshot archives. No verification promotion. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateHistoricalSnapshot} from '../src/crypto/bot/quant/quantSnapshotArchive.js';
export function auditArchiveText(text) {
 const result={records:0,parseErrors:0,hashMismatches:0,invalidCandles:0,unverified:0,duplicateSnapshots:0,reasons:{},researchOnly:true};
 const seen=new Set();
 for(const line of text.split(/\r?\n/).filter(Boolean)) {
  result.records++;
  let record;
  try {record=JSON.parse(line);} catch {result.parseErrors++;continue;}
  const hash=record?.archiveMetadata?.sha256;
  const clone=JSON.parse(JSON.stringify(record));
  if(clone.archiveMetadata)delete clone.archiveMetadata.sha256;
  const calculated=crypto.createHash('sha256').update(JSON.stringify(clone)).digest('hex');
  if(!hash || hash!==calculated)result.hashMismatches++;
  if(record.pointInTimeVerified!==true)result.unverified++;
  const errors=validateHistoricalSnapshot(record,Date.parse(record?.archiveMetadata?.capturedAt || ''));
  if(errors.length)result.invalidCandles++;
  for(const e of errors)result.reasons[e]=(result.reasons[e]||0)+1;
  const id=`${record?.timestamp}|${record?.market?.symbol}`;
  if(seen.has(id))result.duplicateSnapshots++;
  seen.add(id);
 }
 result.readyForReplay=false; // A hash is not independent proof of capture time.
 return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const file=process.argv[2];
 if(!file){console.error('Usage: node scripts/emaQuantArchiveAudit.js <archive.jsonl>');process.exitCode=2;}
 else {const r=auditArchiveText(fs.readFileSync(file,'utf8'));console.log(JSON.stringify(r,null,2));if(r.parseErrors||r.hashMismatches||r.invalidCandles)process.exitCode=1;}
}
