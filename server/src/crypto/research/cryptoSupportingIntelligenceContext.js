/**
 * Derives supporting research evidence from the SAME bulk snapshots already
 * loaded for the research batch. No candidate-specific HTTP requests.
 */
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,Number(v)||0));
const norm=v=>String(v??"").trim().toLowerCase();

function scoreOnChain(e){
  const p=e?.protocol;
  if(!p)return null;
  const tvl=finite(p.tvlUsd),d1=finite(p.change1d),d7=finite(p.change7d);
  let s=50, signals=0;
  if(tvl!==null){s+=clamp(Math.log10(Math.max(1,tvl))/9*25,0,25);signals++;}
  if(d1!==null){s+=clamp(d1,-20,20)*.5;signals++;}
  if(d7!==null){s+=clamp(d7,-40,40)*.35;signals++;}
  if(Array.isArray(p.chains)&&p.chains.length){s+=clamp(p.chains.length*2,0,10);signals++;}
  return signals?{score:clamp(s),evidence:{tvlUsd:tvl,change1d:d1,change7d:d7,chains:p.chains??[]}}:null;
}
function scoreIntegrity(e){
  const m=e?.market,p=e?.protocol;
  if(!m&&!p)return null;
  let s=55,signals=0; const flags=[];
  if(m?.marketCapUsd){s+=10;signals++;}
  if(m?.volume24hUsd){const ratio=m.marketCapUsd?m.volume24hUsd/m.marketCapUsd:null;if(ratio!==null){s+=ratio>=.02?10:-5;signals++;}}
  if(m?.marketCapUsd&&m?.fdvUsd){const ratio=m.fdvUsd/m.marketCapUsd;if(ratio>5){s-=20;flags.push("EXTREME_FDV_DILUTION");}else if(ratio<=2)s+=8;signals++;}
  if(p?.category){s+=7;signals++;}
  if(Array.isArray(p?.chains)&&p.chains.length){s+=clamp(p.chains.length,0,5);signals++;}
  return signals?{score:clamp(s),evidence:{criticalFlags:flags,marketCapUsd:m?.marketCapUsd??null,fdvUsd:m?.fdvUsd??null,volume24hUsd:m?.volume24hUsd??null,category:p?.category??null,chains:p?.chains??[]}}:null;
}
function scoreHistorical(e){
  const m=e?.market;if(!m)return null;
  const h1=finite(m.change1hPercent),d1=finite(m.change24hPercent),d7=finite(m.change7dPercent);
  if(h1===null&&d1===null&&d7===null)return null;
  const vals=[h1,d1,d7].filter(v=>v!==null);
  const momentum=vals.reduce((a,b)=>a+b,0)/vals.length;
  const dispersion=vals.reduce((a,b)=>a+Math.abs(b-momentum),0)/vals.length;
  const score=clamp(55+clamp(momentum,-20,20)*1.2-clamp(dispersion,0,30)*.35);
  return{score,evidence:{change1hPercent:h1,change24hPercent:d1,change7dPercent:d7,momentum,dispersion}};
}
export function buildCandidateSupportingIntelligence(candidate,fundamentalSnapshot){
  const i=fundamentalSnapshot?.index;if(!i)return{};
  const id=norm(candidate?.assetId),sym=norm(candidate?.symbol);
  const market=i.byId?.get(id)||i.bySymbol?.get(sym)||null;
  const protocol=i.llamaByGecko?.get(norm(market?.id||id))||i.llamaBySymbol?.get(sym)||null;
  const e={market,protocol};
  return{onChain:scoreOnChain(e),projectIntegrity:scoreIntegrity(e),historical:scoreHistorical(e)};
}
export default buildCandidateSupportingIntelligence;
