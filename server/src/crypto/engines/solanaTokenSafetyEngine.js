/**
 * AEMA — Solana Token Safety + On-chain Confidence Engine
 * Unknown evidence stays null. No invented lock/burn/rug claims.
 */
import {getSolanaTokenSafetySnapshot,getAccountIdentity} from "../data/providers/solanaTokenSafetyProvider.js";
const round=(v,d=2)=>Number.isFinite(Number(v))?Math.round(Number(v)*10**d)/10**d:null;
const clamp=v=>Math.max(0,Math.min(100,Number(v)||0));

function authorityRisk(snapshot){
  const m=snapshot?.mintAccount;
  if(!m)return {score:null,label:"UNAVAILABLE",reasons:["MINT_ACCOUNT_UNAVAILABLE"]};
  let risk=0;const reasons=[];
  if(m.mintAuthority){risk+=35;reasons.push("MINT_AUTHORITY_ACTIVE");}else reasons.push("MINT_AUTHORITY_REVOKED_OR_NULL");
  if(m.freezeAuthority){risk+=30;reasons.push("FREEZE_AUTHORITY_ACTIVE");}else reasons.push("FREEZE_AUTHORITY_REVOKED_OR_NULL");
  return {score:clamp(risk),label:risk>=50?"HIGH":risk>=25?"ELEVATED":"LOW",reasons};
}

export async function inspectWalletIdentity(wallet){
  try{
    const a=await getAccountIdentity(wallet);
    const signals=[];
    if(a.executable===true)signals.push("EXECUTABLE_PROGRAM_ACCOUNT");
    if(a.parsedProgram)signals.push(`PARSED_PROGRAM:${a.parsedProgram}`);
    if(a.parsedType)signals.push(`PARSED_TYPE:${a.parsedType}`);
    return {wallet,status:"COMPLETE",account:a,
      infrastructureSuspected:a.executable===true,
      infrastructureConfirmed:false,
      exclusionRecommended:false,
      signals,
      note:"Program/executable evidence may indicate infrastructure; PDA/vault classification is not proven by this check alone."};
  }catch(e){
    return {wallet,status:"UNAVAILABLE",account:null,infrastructureSuspected:null,
      infrastructureConfirmed:false,exclusionRecommended:false,signals:[],error:e.message??String(e)};
  }
}

export async function analyzeSolanaTokenSafety({
  mint,holderSnapshot=null,walletFlowResult=null,holderWallets=[]
}){
  const snapshot=await getSolanaTokenSafetySnapshot(mint);
  const auth=authorityRisk(snapshot);
  const authoritativeSupplyRaw=snapshot?.supply?.amountRaw??null;
  const observedRaw=holderSnapshot?.observedAmountRaw??null;
  const supplyCoverage=(authoritativeSupplyRaw&&observedRaw!==null)
    ? Math.min(100,(observedRaw/authoritativeSupplyRaw)*100):null;

  const identities=[];
  for(const w of holderWallets.slice(0,5)) identities.push(await inspectWalletIdentity(w));

  let confidence=0,weight=0;
  const add=(value,w)=>{if(value!==null&&value!==undefined){confidence+=value*w;weight+=w;}};
  add(snapshot.status==="COMPLETE"?100:snapshot.status==="PARTIAL"?60:0,0.25);
  add(supplyCoverage===null?null:clamp(supplyCoverage),0.30);
  add(holderSnapshot?.complete===true?100:holderSnapshot?.partial===true?50:null,0.20);
  const analyzed=walletFlowResult?.analyzedHolderCount??null;
  add(analyzed===null?null:clamp((analyzed/5)*100),0.15);
  const identityComplete=identities.length?identities.filter(x=>x.status==="COMPLETE").length/identities.length*100:null;
  add(identityComplete,0.10);

  const onChainConfidence=weight?round(confidence/weight):null;
  const warnings=[];
  if(auth.score===null)warnings.push("TOKEN_AUTHORITY_RISK_UNAVAILABLE");
  if(snapshot?.mintAccount?.mintAuthority)warnings.push("MINT_AUTHORITY_ACTIVE");
  if(snapshot?.mintAccount?.freezeAuthority)warnings.push("FREEZE_AUTHORITY_ACTIVE");
  if(supplyCoverage!==null&&supplyCoverage<90)warnings.push("HOLDER_SNAPSHOT_COVERS_LESS_THAN_90_PERCENT_OF_AUTHORITATIVE_SUPPLY");
  warnings.push("LIQUIDITY_LOCK_STATUS_NOT_VERIFIED");
  warnings.push("WALLET_PDA_OR_POOL_VAULT_IDENTITY_NOT_PROVEN");

  return {engine:"SOLANA_TOKEN_SAFETY",version:"1.0.0",status:snapshot.status,mint,
    authoritativeSupply:snapshot.supply,mintAccount:snapshot.mintAccount,
    tokenAuthorityRisk:auth,supplyCoveragePercent:round(supplyCoverage,4),
    onChainConfidence,holderSnapshotComplete:holderSnapshot?.complete??null,
    walletIdentity:identities,warnings,errors:snapshot.errors,
    researchOnly:true,executionAuthority:false,generatedAt:new Date().toISOString()};
}
export default {inspectWalletIdentity,analyzeSolanaTokenSafety};
