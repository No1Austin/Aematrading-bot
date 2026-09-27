import reconcileAlpacaExecution from '../src/crypto/bot/alpaca/botAlpacaExecutionReconciler.js';
const result=await reconcileAlpacaExecution({persist:false});
console.log(JSON.stringify(result,null,2));
if (result.blockers.length) process.exitCode=2;
