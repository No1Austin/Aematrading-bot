import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {archiveQuantSnapshot} from '../src/crypto/bot/quant/quantSnapshotArchive.js';
import {auditArchiveText} from './emaQuantArchiveAudit.js';
const t=Date.parse('2026-10-18T12:00:00Z'),dt=300000;
const candles=Array.from({length:30},(_,i)=>({openTime:t-(30-i)*dt,open:100,high:101,low:99,close:100}));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ema-audit-'));
try {
 const f=path.join(tmp,'snap.jsonl');
 const r=archiveQuantSnapshot({timestamp:new Date(t).toISOString(),candleInterval:'5m',market:{symbol:'BTC_USDT',instrumentType:'PERPETUAL',candles},candidate:{symbol:'BTC_USDT'}},{filePath:f,capturedAtMs:t});
 assert.equal(r.saved,true);
 const content=fs.readFileSync(f,'utf8');
 const audit=auditArchiveText(content);
 assert.equal(audit.records,1);assert.equal(audit.hashMismatches,0);assert.equal(audit.invalidCandles,0);assert.equal(audit.unverified,1);assert.equal(audit.readyForReplay,false);
 assert.equal(auditArchiveText(content.replace('BTC_USDT','ETH_USDT')).hashMismatches,1);
 assert.equal(auditArchiveText(content+content).duplicateSnapshots,1);
 console.log('EMA snapshot archive audit tests passed');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
