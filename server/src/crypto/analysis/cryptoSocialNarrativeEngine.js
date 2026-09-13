import{complete,insufficient}from"./cryptoEngineUtils.js";
export default async function run(c,{finalIntelligence=null}={}){
  const d=c?.preferredDirection??"LONG",bulk=finalIntelligence?.socialNarrative;
  if(Number.isFinite(Number(bulk?.score)))return complete("CRYPTO_SOCIAL_NARRATIVE",bulk.score,d,bulk.evidence);
  const m=c?.measurements??{},x=m?.socialNarrative??{},score=x?.score??m?.socialScore;
  if(!Number.isFinite(Number(score)))return insufficient("CRYPTO_SOCIAL_NARRATIVE",x);
  return complete("CRYPTO_SOCIAL_NARRATIVE",score,d,x);
}
