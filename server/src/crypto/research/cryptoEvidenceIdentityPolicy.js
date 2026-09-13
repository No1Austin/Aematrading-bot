import { getCryptoIdentity } from "../identity/cryptoCandidateIdentity.js";
const norm=v=>String(v??"").trim().toLowerCase();
export function getEvidenceIdentityPolicy(candidate={}){
 const identity=getCryptoIdentity(candidate),isCex=identity.candidateType==="CEX",isEmerging=identity.candidateType==="EMERGING";
 return{identity,isCex,isEmerging,allowExactAssetIdLookup:Boolean(identity.assetId),allowCexSymbolFallback:isCex,allowEmergingSymbolFallback:false,allowBinanceDerivatives:isCex,allowSocialFallback:isCex};
}
export function namesConsistent(a,b){a=norm(a);b=norm(b);if(!a||!b)return false;if(a===b)return true;const c=x=>x.replace(/[^a-z0-9]/g,"");return c(a)===c(b);}
export default getEvidenceIdentityPolicy;
