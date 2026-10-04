/**
 * AEMA — Combined Solana On-chain Research Orchestrator
 * Combines holder concentration, top-holder flow, token safety, Token-2022 extensions.
 * Research evidence only. Does not alter Emerging DEX score yet.
 */
import {analyzeSolanaAssetOnChain} from "./solanaOnChainIntelligenceEngine.js";
import {analyzeTopSolanaHolders} from "./solanaWalletIntelligenceEngine.js";
import {analyzeSolanaTokenSafety} from "./solanaTokenSafetyEngine.js";
import {inspectToken2022Extensions} from "../data/providers/solanaToken2022ExtensionProvider.js";

const round=(v,d=2)=>Number.isFinite(Number(v))?Math.round(Number(v)*10**d)/10**d:null;
function extensionRisk(x){
  if(!x?.isToken2022)return {score:0,label:"NOT_TOKEN_2022",reasons:[]};
  if(!x.parserExposedExtensions)return {score:null,label:"UNKNOWN",reasons:["TOKEN_2022_EXTENSIONS_NOT_EXPOSED_BY_RPC_PARSER"]};
  let risk=0;const reasons=[];
  const add=(flag,points,label)=>{if(flag){risk+=points;reasons.push(label);}};
  add(x.flags.permanentDelegate,45,"PERMANENT_DELEGATE_PRESENT");
  add(x.flags.transferHook,25,"TRANSFER_HOOK_PRESENT");
  add(x.flags.defaultAccountState,20,"DEFAULT_ACCOUNT_STATE_EXTENSION_PRESENT");
  add(x.flags.pausable,30,"PAUSABLE_EXTENSION_PRESENT");
  add(x.flags.nonTransferable,35,"NON_TRANSFERABLE_EXTENSION_PRESENT");
  add(x.flags.transferFee,12,"TRANSFER_FEE_EXTENSION_PRESENT");
  add(x.flags.confidentialTransfer,15,"CONFIDENTIAL_TRANSFER_EXTENSION_PRESENT");
  add(x.flags.mintCloseAuthority,15,"MINT_CLOSE_AUTHORITY_EXTENSION_PRESENT");
  add(x.flags.interestBearing,5,"INTEREST_BEARING_EXTENSION_PRESENT");
  return {score:Math.min(100,risk),label:risk>=60?"HIGH":risk>=30?"ELEVATED":risk>0?"WATCH":"LOW",reasons};
}
function publicDirection(score){
  if(score===null||score===undefined)return "UNAVAILABLE";
  return score>=58?"BULL":score<=42?"BEAR":"NEUTRAL";
}

export async function runSolanaOnChainResearch({
  asset,holderLimit=5,signaturesPerAddress=10,maxTransactions=15
}){
  const mint=asset?.contractAddress??asset?.mint;
  if(!mint)throw new Error("asset.contractAddress or asset.mint is required");

  const holders=await analyzeSolanaAssetOnChain({...asset,network:"solana",contractAddress:mint});
  const flows=await analyzeTopSolanaHolders(holders,{holderLimit,signaturesPerAddress,maxTransactions});

  const holderWallets=(holders?.largeHolders??[]).slice(0,holderLimit).map(x=>x.wallet).filter(Boolean);
  const safety=await analyzeSolanaTokenSafety({
    mint,holderSnapshot:holders?.holderSnapshot??null,walletFlowResult:flows,holderWallets
  });

  let token2022=null,token2022Risk={score:null,label:"UNAVAILABLE",reasons:[]};
  try{token2022=await inspectToken2022Extensions(mint);token2022Risk=extensionRisk(token2022);}
  catch(e){token2022={status:"UNAVAILABLE",error:e.message??String(e)};}

  const marketScore=Number.isFinite(Number(asset?.emergingScore))?Number(asset.emergingScore):null;
  const whaleScore=Number.isFinite(Number(flows?.tokenWhaleFlowScore))?Number(flows.tokenWhaleFlowScore):null;
  const confidence=Number.isFinite(Number(safety?.onChainConfidence))?Number(safety.onChainConfidence):null;

  // Preview only: do not mutate the production Emerging DEX score yet.
  let previewScore=marketScore;
  if(marketScore!==null&&whaleScore!==null&&confidence!==null){
    const confidenceWeight=Math.min(.20,Math.max(0,(confidence/100)*.20));
    previewScore=round(marketScore*(1-confidenceWeight)+whaleScore*confidenceWeight);
  }

  return {
    engine:"SOLANA_COMBINED_ONCHAIN_RESEARCH",version:"1.0.0",mint,
    status:[holders?.status,flows?.status,safety?.status].includes("UNAVAILABLE")?"PARTIAL":"COMPLETE",
    evidence:{
      marketScore,
      whaleFlowScore:whaleScore,
      whaleFlowDirection:publicDirection(whaleScore),
      whaleFlowEvidence:flows?.whaleFlowEvidence??null,
      materialFlowHolderCount:flows?.materialFlowHolderCount??null,
      onChainConfidence:confidence,
      tokenAuthorityRisk:safety?.tokenAuthorityRisk??null,
      token2022Risk,
      supplyCoveragePercent:safety?.supplyCoveragePercent??null,
    },
    preview:{
      score:previewScore,
      direction:publicDirection(previewScore),
      productionScoreChanged:false,
      note:"Preview only. Production Emerging DEX scoring remains unchanged until validated across multiple tokens."
    },
    holders,flows,safety,token2022,
    researchOnly:true,executionAuthority:false,generatedAt:new Date().toISOString()
  };
}
export default {runSolanaOnChainResearch};
