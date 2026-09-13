const n=v=>String(v??"").trim().toLowerCase();
const uniq=a=>{const s=new Set();return(a??[]).filter(e=>{const k=String(e?.id??e?.slug??JSON.stringify(e));if(s.has(k))return false;s.add(k);return true})};
export function resolveCandidateEvents(snapshot,candidate={}){
 if(!snapshot)return{events:[],matchType:"NONE",ambiguous:false};
 const id=n(candidate.assetId??candidate.coinGeckoId),sym=n(candidate.symbol);
 const slug=id?uniq(snapshot.eventsBySlug?.get(id)??[]):[];
 if(slug.length)return{events:slug,matchType:"SLUG",ambiguous:false};
 const events=sym?uniq(snapshot.eventsBySymbol?.get(sym)??[]):[];
 if(!events.length)return{events:[],matchType:"NONE",ambiguous:false};
 const slugs=new Set(); for(const e of events)for(const c of e?.coins??[])if(n(c?.symbol)===sym&&n(c?.slug))slugs.add(n(c.slug));
 if(slugs.size>1)return{events:[],matchType:"SYMBOL_AMBIGUOUS",ambiguous:true,matchedSlugs:[...slugs]};
 return{events,matchType:"SYMBOL_FALLBACK",ambiguous:false,matchedSlugs:[...slugs]};
}
