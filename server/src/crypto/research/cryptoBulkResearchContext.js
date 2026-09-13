import{buildCryptoFundamentalSnapshot}from"../data/providers/cryptoFundamentalSnapshotProvider.js";
import{buildCryptoFinalIntelligenceSnapshot}from"../data/providers/cryptoFinalIntelligenceSnapshotProvider.js";
export async function buildCryptoBulkResearchContext({refreshFundamentals=false,refreshFinalIntelligence=false}={}){
  const[fundamentalSnapshot,finalIntelligenceSnapshot]=await Promise.all([
    buildCryptoFundamentalSnapshot({refresh:refreshFundamentals}),
    buildCryptoFinalIntelligenceSnapshot({refresh:refreshFinalIntelligence})
  ]);
  return{createdAt:new Date().toISOString(),fundamentalSnapshot,finalIntelligenceSnapshot};
}
export default buildCryptoBulkResearchContext;
