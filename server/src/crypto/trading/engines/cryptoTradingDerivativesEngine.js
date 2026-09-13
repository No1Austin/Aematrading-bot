import {
  buildCryptoDirectionalResult,
  buildInsufficientDirectionalResult,
  CRYPTO_ENGINE_ROLE,
  CRYPTO_TIME_HORIZON,
} from "../contracts/cryptoDirectionalEngineContract.js";

const n=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,Number(v)||0));

export default async function run(candidate,{finalIntelligence=null}={}){
  const type=String(candidate?.candidateType??candidate?.type??"").toUpperCase();
  if(type==="EMERGING")return buildInsufficientDirectionalResult({engine:"CRYPTO_TRADING_DERIVATIVES",reasons:["EMERGING_RESEARCH_ONLY_NO_CEX_DERIVATIVES"]});

  const m=candidate?.measurements??{},e={...(m.derivatives??{}),...(finalIntelligence?.derivatives?.evidence??{})};
  const price=n(e.priceChangePercent??m.change24hPercent),funding=n(e.fundingRate),basis=n(e.basisPercent),oi=n(e.openInterestChangePercent??e.openInterestChange24hPercent),volume=n(e.quoteVolumeUsd);
  const available=[price,funding,basis,oi].filter(x=>x!==null).length;
  if(available<2)return buildInsufficientDirectionalResult({engine:"CRYPTO_TRADING_DERIVATIVES",evidence:e});

  let longSupport=0,shortSupport=0; const reasons=[],risks=[];
  if(price!==null){const s=clamp(Math.abs(price)/12*100); if(price>0)longSupport+=s*.30; else if(price<0)shortSupport+=s*.30;}
  if(funding!==null){
    const fp=funding*100,abs=Math.abs(fp);
    if(abs<.005){longSupport+=3;shortSupport+=3;}
    else if(fp>0&&fp<=.05)longSupport+=clamp(35+fp*500)*.25;
    else if(fp>.05){shortSupport+=clamp(45+fp*300)*.25;risks.push("LONG_POSITIONING_CROWDED");}
    else if(fp<0&&fp>=-.05)shortSupport+=clamp(35+abs*500)*.25;
    else {longSupport+=clamp(45+abs*300)*.25;risks.push("SHORT_POSITIONING_CROWDED");}
  }
  if(basis!==null){
    const abs=Math.abs(basis);
    if(abs<.05){longSupport+=2;shortSupport+=2;}
    else if(basis>0&&basis<=.75)longSupport+=clamp(30+basis*45)*.20;
    else if(basis>.75){shortSupport+=clamp(45+basis*20)*.20;risks.push("EXTREME_POSITIVE_BASIS");}
    else if(basis<0&&basis>=-.75)shortSupport+=clamp(30+abs*45)*.20;
    else {longSupport+=clamp(45+abs*20)*.20;risks.push("EXTREME_NEGATIVE_BASIS");}
  }
  if(price!==null&&oi!==null){
    if(price>0&&oi>0){longSupport+=clamp(45+Math.abs(oi)*5)*.25;reasons.push("PRICE_AND_OI_EXPANDING_LONG");}
    else if(price<0&&oi>0){shortSupport+=clamp(45+Math.abs(oi)*5)*.25;reasons.push("PRICE_AND_OI_EXPANDING_SHORT");}
    else if(price>0&&oi<0)risks.push("PRICE_RISE_MAY_BE_SHORT_COVERING");
    else if(price<0&&oi<0)risks.push("PRICE_DROP_INCLUDES_LONG_LIQUIDATION");
  }
  longSupport=clamp(longSupport);shortSupport=clamp(shortSupport);
  const separation=Math.abs(longSupport-shortSupport),coverage=available/4,volumeQuality=volume&&volume>0?clamp(Math.log10(volume+1)/10*100):50;
  const confidence=clamp((coverage*.45+Math.min(1,separation/60)*.35+(volumeQuality/100)*.20)*100)/100;
  return buildCryptoDirectionalResult({
    engine:"CRYPTO_TRADING_DERIVATIVES",role:CRYPTO_ENGINE_ROLE.DIRECTIONAL,horizon:CRYPTO_TIME_HORIZON.INTRADAY,
    longSupport,shortSupport,confidence,quality:clamp(coverage*65+(volumeQuality/100)*35),reasons,risks,
    evidence:{priceChangePercent:price,fundingRate:funding,basisPercent:basis,openInterestChangePercent:oi,quoteVolumeUsd:volume,source:e.source??null}
  });
}
