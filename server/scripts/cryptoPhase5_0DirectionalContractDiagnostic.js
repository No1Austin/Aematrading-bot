import "dotenv/config";
import{buildCryptoDirectionalResult,buildInsufficientDirectionalResult,CRYPTO_ENGINE_ROLE,CRYPTO_TIME_HORIZON,isDirectionalResult}from"../src/crypto/trading/contracts/cryptoDirectionalEngineContract.js";
import{aggregateDirectionalResults}from"../src/crypto/trading/contracts/cryptoDirectionalAggregationMath.js";
const results={
 technical:buildCryptoDirectionalResult({engine:"CRYPTO_TECHNICAL",role:CRYPTO_ENGINE_ROLE.DIRECTIONAL,horizon:CRYPTO_TIME_HORIZON.INTRADAY,longSupport:18,shortSupport:84,confidence:.91,quality:88,reasons:["LOWER_HIGH_STRUCTURE","MOMENTUM_DOWN"]}),
 fundamentals:buildCryptoDirectionalResult({engine:"CRYPTO_FUNDAMENTALS",role:CRYPTO_ENGINE_ROLE.CONTEXT,horizon:CRYPTO_TIME_HORIZON.STRUCTURAL,longSupport:82,shortSupport:10,confidence:.88,quality:91,reasons:["STRONG_PROTOCOL_QUALITY"]}),
 derivatives:buildCryptoDirectionalResult({engine:"CRYPTO_DERIVATIVES",role:CRYPTO_ENGINE_ROLE.DIRECTIONAL,horizon:CRYPTO_TIME_HORIZON.INTRADAY,longSupport:21,shortSupport:76,confidence:.84,quality:82,reasons:["CROWDED_LONG_POSITIONING"]}),
 liquidityExecution:buildCryptoDirectionalResult({engine:"CRYPTO_LIQUIDITY_EXECUTION",role:CRYPTO_ENGINE_ROLE.EXECUTION,horizon:CRYPTO_TIME_HORIZON.INTRADAY,longSupport:0,shortSupport:0,confidence:.96,quality:92,reasons:["DEEP_EXECUTABLE_LIQUIDITY"]}),
 unavailable:buildInsufficientDirectionalResult({engine:"CRYPTO_ORDER_FLOW",role:CRYPTO_ENGINE_ROLE.DIRECTIONAL})
};
const weights={technical:20,fundamentals:20,derivatives:12,liquidityExecution:0,unavailable:10};
console.log("\nAEMA CRYPTO PHASE 5.0 — DIRECTIONAL CONTRACT\n");
console.table(Object.entries(results).map(([key,x])=>({key,role:x.role,direction:x.direction,directionalScore:x.directionalScore,longSupport:x.longSupport,shortSupport:x.shortSupport,confidence:x.confidence,valid:isDirectionalResult(x)})));
const a=aggregateDirectionalResults({results,weights});console.log("\nDIRECTIONAL AGGREGATION");console.dir(a,{depth:5});
console.log("\nINVARIANTS");console.log({allResultsValid:Object.values(results).every(isDirectionalResult),bullishFundamentalsDoNotAddToShort:a.breakdown.fundamentals.shortPoints<a.breakdown.fundamentals.longPoints,bearishTechnicalDoesNotAddToLong:a.breakdown.technical.longPoints<a.breakdown.technical.shortPoints,executionEngineHasNoDirectionalWeight:a.breakdown.liquidityExecution.weight===0,missingEngineContributesZero:a.breakdown.unavailable.longPoints===0&&a.breakdown.unavailable.shortPoints===0,shortPreferredInThisScenario:a.preferredDirection==="SHORT"});
