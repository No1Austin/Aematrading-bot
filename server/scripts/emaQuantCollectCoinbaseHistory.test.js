import assert from 'node:assert/strict';
import {normalize,parseArgs,collect} from './emaQuantCollectCoinbaseHistory.js';
assert.equal(parseArgs(['--symbol','BTC-USD','--days','7']).days,7);
assert.throws(()=>parseArgs(['--symbol','BTC_USDT']),/SPOT_PRODUCT/);
assert.equal(normalize([[60,1,3,2,2.5,10]])[0].close,2.5);
assert.rejects(collect({symbol:'BTC-USD',days:1,now:1700000000000,fetchImpl:async()=>({ok:true,json:async()=>[]}),sleep:async()=>{}}),/INCOMPLETE_COINBASE_SPOT_HISTORY/).then(()=>console.log('Coinbase history collector offline tests passed'));
