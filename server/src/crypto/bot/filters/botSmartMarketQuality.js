/** Advisory first-stage market-quality assessment. No trade authority. */
const n = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const positive = v => { const x=n(v); return x!==null&&x>0?x:null; };
const median = xs => { const a=xs.filter(Number.isFinite).sort((a,b)=>a-b); return a.length?a[Math.floor((a.length-1)/2)]:null; };
const timeMs = v => { if(v==null||v==='')return null;const x=Number(v);const t=Number.isFinite(x)?x*(x<1e12?1000:1):Date.parse(String(v));return Number.isFinite(t)?t:null; };
export function buildMarketQualityContext(assets=[]) {
 const volumes=assets.map(a=>positive(a?.market?.quoteVolume)).filter(x=>x!==null);
 const spreads=assets.map(a=>n(a?.market?.spreadPercent)).filter(x=>x!==null&&x>=0);
 return {sampleSize:assets.length,volumeMedian:median(volumes),spreadMedian:median(spreads)};
}
export function assessSmartMarketQuality(asset,context={},cfg={},now=Date.now()) {
 const m=asset?.market??{};const volume=positive(m.quoteVolume),spread=n(m.spreadPercent),price=positive(m.price),tick=positive(asset?.priceTick);
 const range=n(m.rangePercent),ageTime=timeMs(asset?.listingTime),delistTime=timeMs(asset?.delistingTime);
 const ageDays=ageTime!==null?(now-ageTime)/86400000:null;
 const volumeRelative=volume!==null&&positive(context.volumeMedian)!==null?volume/context.volumeMedian:null;
 const spreadRelative=spread!==null&&positive(context.spreadMedian)!==null?spread/context.spreadMedian:null;
 const tickPercent=tick!==null&&price!==null?100*tick/price:null;
 const reasons=[],unknown=[];
 if(volume===null)unknown.push('VOLUME_UNKNOWN');
 else if(cfg.minimumQuoteVolumeUsd>0&&volume<cfg.minimumQuoteVolumeUsd)reasons.push('LOW_ABSOLUTE_VOLUME');
 if(volumeRelative!==null&&volumeRelative<(cfg.lowRelativeVolumeRatio??0.1))reasons.push('LOW_RELATIVE_VOLUME');
 if(spread===null||spread<0)unknown.push('SPREAD_UNKNOWN');
 else if(spread>(cfg.maximumSpreadPercent??1))reasons.push('WIDE_SPREAD');
 if(spreadRelative!==null&&spreadRelative>(cfg.highRelativeSpreadRatio??5))reasons.push('WIDE_RELATIVE_SPREAD');
 if(ageDays===null||ageDays<0)unknown.push('MARKET_AGE_UNKNOWN');
 else if(ageDays<(cfg.emergingAgeDays??7))reasons.push('NEW_LISTING');
 if(tickPercent===null)unknown.push('TICK_PRECISION_UNKNOWN');
 else if(tickPercent>(cfg.maximumTickPercent??0.2))reasons.push('COARSE_PRICE_TICK');
 if(range===null||range<0)unknown.push('VOLATILITY_UNKNOWN');
 else if(range>(cfg.extremeRangePercent24h??60))reasons.push('EXTREME_24H_RANGE');
 if(delistTime!==null&&delistTime>0)reasons.push('DELISTING_SCHEDULED');
 const critical=delistTime!==null&&delistTime>0;
 const emerging=reasons.includes('NEW_LISTING');
 const status=critical?'EXCLUDE':reasons.some(r=>r!=='NEW_LISTING')?'OBSERVE':emerging?'EMERGING':unknown.length>=3?'OBSERVE':'READY';
 return {status,reasons,unknown,evidence:{volume,volumeRelative,spreadPercent:spread,spreadRelative,ageDays,tickPercent,rangePercent24h:range,delistingTime:delistTime},context:{sampleSize:context.sampleSize??null,volumeMedian:context.volumeMedian??null,spreadMedian:context.spreadMedian??null},advisoryOnly:true};
}
