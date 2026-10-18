import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {archiveQuantSnapshot,validateHistoricalSnapshot} from '../src/crypto/bot/quant/quantSnapshotArchive.js';
const now=Date.parse('2026-10-18T12:00:00.000Z'),step=300000;
const candles=Array.from({length:30},(_,i)=>({openTime:now-30*step+i*step,open:100,high:102,low:99,close:101}));
const sample={timestamp:new Date(now).toISOString(),candleInterval:'5m',market:{instrumentType:'PERPETUAL',symbol:'BTC_USDT',candles,apiSecret:'do-not-save'},candidate:{symbol:'BTC_USDT',directionDecision:{qualified:true}}};
assert.deepEqual(validateHistoricalSnapshot(sample,now),[]);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ema-snapshot-'));
try {
 const dest=path.join(dir,'snapshots.jsonl');
 assert.equal(archiveQuantSnapshot(sample,{filePath:dest,capturedAtMs:now}).saved,true);
 const saved=JSON.parse(fs.readFileSync(dest,'utf8').trim());
 assert.equal(saved.pointInTimeVerified,false);
 assert.equal(saved.market.apiSecret,undefined);
 assert.equal(saved.archiveMetadata.requiresIndependentVerification,true);
 assert.equal(archiveQuantSnapshot({...sample,market:{...sample.market,candles:[...candles.slice(0,20),...candles.slice(21)]}},{filePath:dest,capturedAtMs:now}).saved,false);
 assert.equal(archiveQuantSnapshot({...sample,timestamp:new Date(now+60000).toISOString()},{filePath:dest,capturedAtMs:now}).saved,false);
 assert.equal(fs.readFileSync(dest,'utf8').trim().split('\n').length,1);
 console.log('EMA snapshot archive tests passed');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
