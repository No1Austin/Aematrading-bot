import{finite,clamp,complete,insufficient}from"./cryptoEngineUtils.js";
export default async function run(c){const m=c?.measurements??{},d=c?.preferredDirection??"LONG",s=String(d).toUpperCase()==="SHORT"?-1:1;
const vals=[m?.change1hPercent,m?.change4hPercent,m?.change24hPercent,m?.change7dPercent].filter(v=>Number.isFinite(Number(v)));
if(vals.length<2)return insufficient("CRYPTO_TECHNICAL",{available:vals.length});
const momentum=clamp(50+finite(m.change1hPercent)*s*3+finite(m.change4hPercent)*s*2+finite(m.change24hPercent)*s+finite(m.change7dPercent)*s*.35);
return complete("CRYPTO_TECHNICAL",momentum*.5+clamp(c?.scannerScore)*.35+clamp(finite(c?.directionEdge)*3)*.15,d,{change1hPercent:m.change1hPercent??null,change4hPercent:m.change4hPercent??null,change24hPercent:m.change24hPercent??null,change7dPercent:m.change7dPercent??null});}
