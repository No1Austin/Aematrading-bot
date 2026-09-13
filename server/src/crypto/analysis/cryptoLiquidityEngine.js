import{finite,clamp,complete,insufficient}from"./cryptoEngineUtils.js";
export default async function run(c){const m=c?.measurements??{},d=c?.preferredDirection??"LONG",v=finite(m?.volume24hUsd),l=finite(m?.liquidityUsd),n=finite(c?.venues?.venueCount??m?.venueCount),cex=finite(c?.venues?.cexCount??m?.cexCount);if(!v&&!l)return insufficient("CRYPTO_LIQUIDITY");
const vs=clamp(Math.log10(v+1)/8*100),ls=l?clamp(Math.log10(l+1)/8*100):vs*.65,venues=clamp(n*12+cex*6);return complete("CRYPTO_LIQUIDITY",vs*.45+ls*.35+venues*.2,d,{volume24hUsd:v,liquidityUsd:l,venueCount:n,cexCount:cex});}
