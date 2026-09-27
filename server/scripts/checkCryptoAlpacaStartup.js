import inspectDedicatedAlpacaStartup from '../src/crypto/bot/alpaca/botAlpacaStartupPreflight.js';
const result=await inspectDedicatedAlpacaStartup();
console.log(JSON.stringify(result,null,2));
if(result.status!=='READY_FOR_GUARDED_TESTS')process.exitCode=1;
