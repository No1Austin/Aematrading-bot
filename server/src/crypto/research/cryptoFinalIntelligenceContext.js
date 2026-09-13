import { resolveCandidateEvents } from "./cryptoEventIdentityResolver.js";
import { getEvidenceIdentityPolicy, namesConsistent } from "./cryptoEvidenceIdentityPolicy.js";
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,Number(v)||0));
const norm=v=>String(v??"").trim().toLowerCase();

function derivative(c,s){
 const policy=getEvidenceIdentityPolicy(c); if(!policy.allowBinanceDerivatives)return null;
 const base=String(c?.symbol??"").trim().toUpperCase(); if(!base||!s?.index)return null;
 let t=null,p=null,contract=null;
 for(const sym of [`${base}USDT`,`${base}USDC`]){t=s.index.tickerBySymbol?.get(sym)??null;p=s.index.premiumBySymbol?.get(sym)??null;if(t||p){contract=sym;break;}}
 if(!t&&!p)return null;
 const d=String(c?.preferredDirection??"LONG").toUpperCase();let pts=0,w=0;
 const q=finite(t?.quoteVolumeUsd),f=finite(p?.fundingRate),m=finite(p?.markPrice),i=finite(p?.indexPrice),chg=finite(t?.priceChangePercent);
 if(q!==null){pts+=clamp(Math.log10(Math.max(1,q))/10*100)*.35;w+=.35;}
 if(f!==null){const fp=f*100;let sc=70-clamp(Math.abs(fp)*500,0,45);if(d==="LONG"&&fp<0)sc+=8;if(d==="SHORT"&&fp>0)sc+=8;pts+=clamp(sc)*.35;w+=.35;}
 let basis=null;if(m&&i){basis=(m/i-1)*100;pts+=clamp(90-clamp(Math.abs(basis)*45,0,65))*.2;w+=.2;}
 if(chg!==null){const z=Math.abs(chg),sc=z<=2?58:z<=8?80:z<=18?65:38;pts+=sc*.1;w+=.1;}
 if(w<.35)return null;
 return{score:clamp(pts/w),evidence:{contract,quoteVolumeUsd:q,fundingRate:f,markPrice:m,indexPrice:i,basisPercent:basis,priceChangePercent:chg,tradeCount:finite(t?.tradeCount),identityPolicy:"CEX_ONLY",source:"BINANCE_FUTURES_BULK"}};
}

function scoreSocialRow(x,matchType){
 const a=[],push=(v,w)=>{if(v!==null)a.push([v,w]);};
 push(finite(x.galaxyScore),.35);push(finite(x.sentiment),.25);
 const sv=finite(x.socialVolume);if(sv!==null)push(clamp(Math.log10(sv+1)/6*100),.2);
 const it=finite(x.interactions);if(it!==null)push(clamp(Math.log10(it+1)/8*100),.1);
 const ar=finite(x.altRank);if(ar!==null)push(clamp(100-Math.log10(ar+1)*22),.1);
 if(!a.length)return null;const w=a.reduce((q,[,z])=>q+z,0);
 return{score:clamp(a.reduce((q,[v,z])=>q+v*z,0)/w),evidence:{...x,matchType,source:"LUNARCRUSH_BULK"}};
}
function social(c,s){
 const policy=getEvidenceIdentityPolicy(c);if(!policy.allowSocialFallback)return null;
 const byName=s?.index?.lunarByName?.get(norm(c?.name))??null;if(byName)return scoreSocialRow(byName,"NAME");
 const bySymbol=s?.index?.lunarBySymbol?.get(norm(c?.symbol))??null;
 if(!bySymbol||!namesConsistent(c?.name,bySymbol?.name))return null;
 return scoreSocialRow(bySymbol,"SYMBOL_NAME_VERIFIED");
}
function eventScore(c,s){
 const r=resolveCandidateEvents(s,c);if(r.ambiguous||!r.events?.length)return null;
 const now=Date.now(),out=[];let best=0;
 for(const e of r.events.slice(0,10)){
  const start=Date.parse(e?.date??""),end=Date.parse(e?.dateEnd??"");
  const hs=Number.isFinite(start),he=Number.isFinite(end);
  if(he&&end<now)continue;
  let state="UNKNOWN",days=null;
  if(hs&&start<=now&&he&&end>=now){state="ACTIVE";days=0;}
  else if(hs&&start>now){state="UPCOMING";days=(start-now)/86400000;}
  else if(hs&&start<=now&&!he)continue;
  const impact=finite(e?.impact);let sc=impact!==null?clamp(impact*10):50;
  if(state==="ACTIVE")sc+=8;else if(state==="UPCOMING"&&days!==null){if(days<=7)sc+=12;else if(days<=30)sc+=7;}
  const risk=`${(e?.categories??[]).join(" ")} ${e?.title??""}`.toLowerCase();
  if(/hack|exploit|delist|lawsuit|security breach/.test(risk))sc-=25;else if(/unlock/.test(risk))sc-=15;
  sc=clamp(sc);best=Math.max(best,sc);
  out.push({id:e.id,title:e.title,date:e.date??null,dateEnd:e.dateEnd??null,state,impact:e.impact,daysAway:days===null?null:Math.round(days*10)/10});
 }
 if(!out.length)return null;
 return{score:best||50,evidence:{events:out,matchType:r.matchType,matchedSlugs:r.matchedSlugs??[],source:"COINMARKETCAL_BULK"}};
}
export function buildCandidateFinalIntelligence(c,s){return{derivatives:derivative(c,s),socialNarrative:social(c,s),events:eventScore(c,s)};}
export default buildCandidateFinalIntelligence;
