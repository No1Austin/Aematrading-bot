import{complete,insufficient}from"./cryptoEngineUtils.js";

export default async function run(c,{finalIntelligence=null}={}){

  const d=c?.preferredDirection??"LONG",bulk=finalIntelligence?.derivatives;

  if(Number.isFinite(Number(bulk?.score)))return complete("CRYPTO_DERIVATIVES",bulk.score,d,bulk.evidence);

  const m=c?.measurements??{},x=m?.derivatives??{},score=x?.score??m?.derivativesScore;

  if(!Number.isFinite(Number(score)))return insufficient("CRYPTO_DERIVATIVES",x);

  return complete("CRYPTO_DERIVATIVES",score,d,x);

}
