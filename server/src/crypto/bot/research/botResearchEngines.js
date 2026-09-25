/**
 * Six independent research dimensions.
 *
 * Each engine emits LONG and SHORT support (0..100), confidence and evidence.
 * Engines DO NOT approve trades. Missing evidence is exposed, never converted
 * into a neutral 50.
 */
const clamp = (v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const n = (v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function pct(a,b) { return a > 0 ? ((b-a)/a)*100 : 0; }
function avg(xs) { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }

function directional(name, raw, confidence, evidence, available=true) {
  if (!available) return {
    engine:name, available:false, long:null, short:null, confidence:0,
    evidence, executionAuthority:false, liveExecution:false
  };
  const signed = clamp(raw,-100,100);
  return {
    engine:name, available:true,
    long:Number(clamp(50 + signed/2).toFixed(4)),
    short:Number(clamp(50 - signed/2).toFixed(4)),
    confidence:Number(clamp(confidence).toFixed(4)),
    evidence, executionAuthority:false, liveExecution:false
  };
}

export function runTechnicalEngine(asset, ev) {
  const c = ev.candles || [];
  if (c.length < 20) return directional("TECHNICAL",0,0,{reason:"INSUFFICIENT_CANDLES"},false);
  const closes=c.map(x=>x.close), vols=c.map(x=>x.quoteVolume||0);
  const last=closes.at(-1);
  const m1=pct(closes.at(-5),last), m2=pct(closes.at(-13),last), m3=pct(closes.at(-20),last);
  const recentVol=avg(vols.slice(-8)), priorVol=avg(vols.slice(-16,-8));
  const volExpansion=priorVol>0?recentVol/priorVol:1;
  const raw=clamp(m1*8 + m2*4 + m3*2,-100,100);
  const conf=clamp(45 + Math.abs(m1)*5 + Math.abs(m2)*2 + Math.min(volExpansion,3)*8);
  return directional("TECHNICAL",raw,conf,{m1,m2,m3,volExpansion,lastPrice:last});
}

export function runFundamentalEngine(asset, ev) {
  // Crypto market-quality fundamentals: participation, OI and derivatives demand.
  const qv=n(asset?.market?.quoteVolume);
  const oi=n(ev.openInterest);
  const funding=n(ev.fundingRate);
  if (!(qv>0) || !(oi>0)) return directional("FUNDAMENTAL",0,0,{quoteVolume:qv,openInterest:oi},false);
  const change=n(asset?.market?.priceChangePercent);
  const participation=Math.min(1,Math.log10(Math.max(qv,1))/10);
  const fundingBias=clamp(funding*100000,-20,20);
  const raw=clamp(change*2 + fundingBias,-100,100);
  const conf=clamp(40 + participation*40 + Math.min(Math.log10(oi+1)*3,20));
  return directional("FUNDAMENTAL",raw,conf,{quoteVolume:qv,openInterest:oi,fundingRate:funding,participation});
}

export function runNarrativeEngine(asset, ev) {
  // Phase-2 independent bot has no external narrative feed configured yet.
  // Do not fabricate sentiment.
  return directional("NARRATIVE",0,0,{
    reason:"EXTERNAL_NARRATIVE_FEED_NOT_CONFIGURED",
    symbol:asset?.symbol
  },false);
}

export function runNewsEngine(asset, ev) {
  // Phase-2 independent bot has no external news feed configured yet.
  // Do not fabricate sentiment.
  return directional("NEWS",0,0,{
    reason:"EXTERNAL_NEWS_FEED_NOT_CONFIGURED",
    symbol:asset?.symbol
  },false);
}

export function runMarketStructureEngine(asset, ev) {
  const c=ev.candles||[];
  if(c.length<20) return directional("MARKET_STRUCTURE",0,0,{reason:"INSUFFICIENT_CANDLES"},false);
  const recent=c.slice(-20);
  const highs=recent.map(x=>x.high), lows=recent.map(x=>x.low), closes=recent.map(x=>x.close);
  const firstMid=(highs[0]+lows[0])/2, lastMid=(highs.at(-1)+lows.at(-1))/2;
  const structureMove=pct(firstMid,lastMid);
  const closeLocation=(closes.at(-1)-Math.min(...lows))/(Math.max(...highs)-Math.min(...lows)||1);
  const locationBias=(closeLocation-.5)*40;
  const raw=clamp(structureMove*7 + locationBias,-100,100);
  const conf=clamp(50 + Math.abs(structureMove)*5 + Math.abs(locationBias));
  return directional("MARKET_STRUCTURE",raw,conf,{
    structureMovePercent:structureMove,closeLocation,
    high:Math.max(...highs),low:Math.min(...lows)
  });
}

export function runLiquidityEngine(asset, ev) {
  const spread=n(asset?.market?.spreadPercent,NaN);
  const d=ev.depth;
  if(!Number.isFinite(spread)||!(d?.totalNotional>0))
    return directional("LIQUIDITY",0,0,{spreadPercent:spread,depth:d},false);
  const imbalance=n(d.imbalance);
  const raw=clamp(imbalance*100,-100,100);
  const spreadQuality=spread<=0.02?100:spread>=0.5?0:100*(1-(spread-.02)/.48);
  const depthQuality=clamp(Math.log10(d.totalNotional+1)*10);
  const conf=clamp(spreadQuality*.55+depthQuality*.45);
  return directional("LIQUIDITY",raw,conf,{
    spreadPercent:spread,bidNotional:d.bidNotional,askNotional:d.askNotional,
    totalNotional:d.totalNotional,imbalance
  });
}

export function runAllBotResearchEngines(asset, evidence) {
  return {
    technical:runTechnicalEngine(asset,evidence),
    fundamental:runFundamentalEngine(asset,evidence),
    narrative:runNarrativeEngine(asset,evidence),
    news:runNewsEngine(asset,evidence),
    marketStructure:runMarketStructureEngine(asset,evidence),
    liquidity:runLiquidityEngine(asset,evidence),
  };
}
