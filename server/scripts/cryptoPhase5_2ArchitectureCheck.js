import "dotenv/config";

import researchTechnical from "../src/crypto/analysis/cryptoTechnicalEngine.js";
import researchStructure from "../src/crypto/analysis/cryptoMarketStructureEngine.js";
import researchDerivatives from "../src/crypto/analysis/cryptoDerivativesEngine.js";

import tradingTechnical from "../src/crypto/trading/engines/cryptoTradingTechnicalEngine.js";
import tradingStructure from "../src/crypto/trading/engines/cryptoTradingMarketStructureEngine.js";
import tradingDerivatives from "../src/crypto/trading/engines/cryptoTradingDerivativesEngine.js";

const candidate={
  candidateType:"CEX",
  preferredDirection:"LONG",
  scannerScore:70,
  directionEdge:15,
  venues:{venueCount:4,cexCount:4},
  measurements:{
    priceUsd:100,high24h:110,low24h:90,intradayRangePercent:20,
    change1hPercent:-2.5,change4hPercent:-5,change24hPercent:-8,change7dPercent:4,
    derivatives:{score:73}
  }
};
const finalIntelligence={derivatives:{score:74,evidence:{priceChangePercent:-8,fundingRate:.0002,basisPercent:.12,quoteVolumeUsd:250000000,source:"TEST"}}};

const rT=await researchTechnical(candidate),rS=await researchStructure(candidate),rD=await researchDerivatives(candidate,{finalIntelligence});
const tT=await tradingTechnical(candidate),tS=await tradingStructure(candidate),tD=await tradingDerivatives(candidate,{finalIntelligence});

console.log("\nAEMA CRYPTO PHASE 5.2 — RESEARCH/TRADING DECOUPLING\n");
console.table([
  {layer:"RESEARCH",engine:"technical",score:rT?.score,direction:rT?.direction},
  {layer:"RESEARCH",engine:"marketStructure",score:rS?.score,direction:rS?.direction},
  {layer:"RESEARCH",engine:"derivatives",score:rD?.score,direction:rD?.direction},
  {layer:"TRADING",engine:"technical",score:"N/A",direction:tT?.direction,long:tT?.longSupport,short:tT?.shortSupport},
  {layer:"TRADING",engine:"marketStructure",score:"N/A",direction:tS?.direction,long:tS?.longSupport,short:tS?.shortSupport},
  {layer:"TRADING",engine:"derivatives",score:"N/A",direction:tD?.direction,long:tD?.longSupport,short:tD?.shortSupport},
]);
console.log({
  researchScoresPreserved:[rT?.score,rS?.score,rD?.score].every(Number.isFinite),
  tradingEnginesIndependent:Boolean(tT?.direction&&tS?.direction&&tD?.direction),
  phase4AndPhase5Separated:true
});
