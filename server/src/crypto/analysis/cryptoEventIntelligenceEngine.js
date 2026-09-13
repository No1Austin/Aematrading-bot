import{complete,insufficient}from"./cryptoEngineUtils.js";
export default async function run(c,{finalIntelligence=null}={}){
  const d=c?.preferredDirection??"LONG",bulk=finalIntelligence?.events;
  if(Number.isFinite(Number(bulk?.score)))return complete("CRYPTO_EVENT_INTELLIGENCE",bulk.score,d,bulk.evidence);
  const m=c?.measurements??{},x=m?.eventIntelligence??{},score=x?.score??m?.eventScore;
  if(!Number.isFinite(Number(score)))return insufficient("CRYPTO_EVENT_INTELLIGENCE",x);
  return complete("CRYPTO_EVENT_INTELLIGENCE",score,d,x);
}
