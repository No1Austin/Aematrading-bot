import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {makeSetupCaptureRows,appendSetupCaptureRows} from '../src/crypto/bot/quant/quantSetupCapture.js';
const rows=makeSetupCaptureRows([{symbol:'BTC_USDT',direction:'BULL',strategy:'TREND_PULLBACK',entry:100,stop:99,target:103,setupApproved:true},{symbol:'ETH_USDT',direction:'BEAR',entry:null,stop:null,target:null}],{capturedAtMs:Date.now()-2000});
assert.equal(rows.length,2);assert.equal(rows[0].geometryValid,true);assert.equal(rows[1].geometryValid,false);assert.equal(rows[0].trainingReady,false);assert.equal(rows[0].executionAuthority,false);assert.ok(Date.parse(rows[0].outcomeStart)>=Date.parse(rows[0].capturedAt));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ema-capture-'));const f=path.join(dir,'setups.jsonl');assert.equal(appendSetupCaptureRows(rows,{filePath:f}).saved,2);assert.equal(fs.readFileSync(f,'utf8').trim().split('\n').length,2);fs.rmSync(dir,{recursive:true,force:true});
console.log('EMA setup capture tests passed');
