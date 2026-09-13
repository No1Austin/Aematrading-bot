import "dotenv/config";
import runCryptoDiscoveryCycle from "../src/crypto/scanner/cryptoDiscoveryCycle.js";
import { buildCryptoFundamentalSnapshot, lookupCryptoFundamentals } from "../src/crypto/data/providers/cryptoFundamentalSnapshotProvider.js";
import { buildCryptoBulkResearchContext } from "../src/crypto/research/cryptoBulkResearchContext.js";
import buildCandidateFinalIntelligence from "../src/crypto/research/cryptoFinalIntelligenceContext.js";
import { getCryptoIdentity } from "../src/crypto/identity/cryptoCandidateIdentity.js";

const discovery=await runCryptoDiscoveryCycle({refreshUniverse:true,includeDexDiscovery:true});
const candidates=discovery.selectedCandidates??[];
const [fundamentalSnapshot,context]=await Promise.all([
 buildCryptoFundamentalSnapshot({refresh:true}),
 buildCryptoBulkResearchContext({refreshFundamentals:false,refreshFinalIntelligence:true})
]);
const finalSnapshot=context.finalIntelligenceSnapshot;
const rows=candidates.map((c,i)=>{const id=getCryptoIdentity(c),f=lookupCryptoFundamentals(fundamentalSnapshot,c),x=buildCandidateFinalIntelligence(c,finalSnapshot);return{rank:i+1,symbol:id.symbol,type:id.candidateType,assetId:id.assetId??"N/A",identity:id.canonicalKey,fundamentalMarketMatch:f?.marketMatchType??"NONE",fundamentalProtocolMatch:f?.protocolMatchType??"NONE",derivatives:x?.derivatives?"YES":"NO",social:x?.socialNarrative?"YES":"NO",events:x?.events?"YES":"NO"};});
console.log("\nAEMA CRYPTO PHASE 4.6.4 — CROSS-PROVIDER IDENTITY ISOLATION\n");console.table(rows);
const emerging=rows.filter(x=>x.type==="EMERGING");
console.log({selected:rows.length,emerging:emerging.length,emergingWithDerivatives:emerging.filter(x=>x.derivatives==="YES").length,emergingWithCexFundamentalFallback:emerging.filter(x=>String(x.fundamentalMarketMatch).includes("CEX_")||String(x.fundamentalProtocolMatch).includes("CEX_")).length,emergingIdentityIsolation:emerging.every(x=>x.derivatives==="NO"&&!String(x.fundamentalMarketMatch).includes("CEX_")&&!String(x.fundamentalProtocolMatch).includes("CEX_")),perCandidateNetworkCalls:0});
