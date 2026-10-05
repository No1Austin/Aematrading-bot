export const finite=v=>{
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v); return Number.isFinite(n)?n:null;
};
export const fmt=(v,d=4)=>{
  const n=finite(v); if(n===null)return "Unavailable";
  if(Math.abs(n)>=1000)return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n);
  return n.toFixed(d).replace(/\.?0+$/,"");
};
export const money=v=>{
  const n=finite(v); return n===null?"Unavailable":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n);
};
export const pct=v=>{
  const n=finite(v); return n===null?"Unavailable":`${n.toFixed(2)}%`;
};
export const directionOf=x=>{
  const d=String(x?.publicDirection||x?.direction||x?.setup?.publicDirection||x?.setup?.direction||"").toUpperCase();
  if(d==="LONG"||d==="BUY"||d==="BULL")return "BULL";
  if(d==="SHORT"||d==="SELL"||d==="BEAR")return "BEAR";
  return "NO SETUP";
};
export const setupIdOf=x=>x?.setupId||x?.id||x?.setup?.setupId||x?.setup?.id||null;
export const setupOf=x=>x?.setup||x||{};
export const scoreOf=x=>finite(x?.setupQualityScore??x?.setupQuality?.score??x?.researchRankScore??x?.score);
