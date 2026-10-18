import assert from 'node:assert/strict';
import {makeSetupCaptureRows} from '../src/crypto/bot/quant/quantSetupCapture.js';
const shadows=[{symbol:'NEAR_USDT',direction:'BEAR',strategy:'TREND_PULLBACK',entry:4.7,stop:4.8,target:4.6,setupApproved:true},{symbol:'OTHER_USDT',direction:'BULL',entry:1,stop:0.9,target:1.2}];
const rows=makeSetupCaptureRows(shadows,{capturedAtMs:Date.now()-1000,interval:'5m',marketIdentities:{NEAR_USDT:{exchange:'GATE',marketId:'NEAR_USDT',source:'LIVE_FUTURES_UNIVERSE'}}});
assert.equal(rows[0].exchange,'GATE');assert.equal(rows[0].marketId,'NEAR_USDT');assert.equal(rows[0].marketIdentitySource,'LIVE_FUTURES_UNIVERSE');assert.equal(rows[0].candleInterval,'5m');assert.equal(rows[1].exchange,null);assert.equal(rows[1].marketId,null);assert.equal(rows[0].executionAuthority,false);assert.equal(rows[0].pointInTimeVerified,false);
console.log('EMA quant market identity tests passed');
