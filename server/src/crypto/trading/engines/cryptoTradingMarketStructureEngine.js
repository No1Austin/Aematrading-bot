import {
  buildCryptoDirectionalResult,
  buildInsufficientDirectionalResult,
  CRYPTO_ENGINE_ROLE,
  CRYPTO_TIME_HORIZON,
} from "../contracts/cryptoDirectionalEngineContract.js";

const n=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,Number(v)||0));

function move(v,strong){
  const x=n(v); if(x===null)return{available:false,long:0,short:0};
  const s=clamp(Math.abs(x)/strong*100);
  return x>0?{available:true,long:s,short:0}:x<0?{available:true,long:0,short:s}:{available:true,long:0,short:0};
}

export default async function run(candidate){
  const m=candidate?.measurements??{},p=n(m.priceUsd),h=n(m.high24h),l=n(m.low24h),range=n(m.intradayRangePercent);
  const a=move(m.change1hPercent,4),b=move(m.change4hPercent,7),c=move(m.change24hPercent,12);
  const available=[a,b,c].filter(x=>x.available).length+(p!==null&&h!==null&&l!==null?1:0);
  if(available<2)return buildInsufficientDirectionalResult({engine:"CRYPTO_TRADING_MARKET_STRUCTURE"});
  let longSupport=a.long*.20+b.long*.35+c.long*.25,shortSupport=a.short*.20+b.short*.35+c.short*.25;
  let rangePosition=null; const reasons=[],risks=[];
  if(p!==null&&h!==null&&l!==null&&h>l){
    rangePosition=clamp((p-l)/(h-l)*100);
    if(rangePosition>=75){longSupport+=12;reasons.push("PRICE_HOLDING_UPPER_24H_RANGE");}
    else if(rangePosition<=25){shortSupport+=12;reasons.push("PRICE_HOLDING_LOWER_24H_RANGE");}
  }
  const signs=[m.change1hPercent,m.change4hPercent,m.change24hPercent].filter(v=>n(v)!==null).map(v=>Number(v)>0?1:Number(v)<0?-1:0);
  const bull=signs.filter(x=>x>0).length,bear=signs.filter(x=>x<0).length;
  if(bull===3){longSupport+=15;reasons.push("BULLISH_STRUCTURE_ALIGNMENT");}
  else if(bear===3){shortSupport+=15;reasons.push("BEARISH_STRUCTURE_ALIGNMENT");}
  else if(bull&&bear)risks.push("MIXED_TIMEFRAME_STRUCTURE");
  if(range!==null&&range>15)risks.push(range>30?"EXTREME_INTRADAY_VOLATILITY":"HIGH_INTRADAY_VOLATILITY");
  longSupport=clamp(longSupport);shortSupport=clamp(shortSupport);
  const separation=Math.abs(longSupport-shortSupport),alignment=Math.max(bull,bear)/Math.max(1,signs.length),coverage=Math.min(1,available/4);
  const confidence=clamp((coverage*.30+alignment*.40+Math.min(1,separation/60)*.30)*100)/100;
  return buildCryptoDirectionalResult({
    engine:"CRYPTO_TRADING_MARKET_STRUCTURE",role:CRYPTO_ENGINE_ROLE.DIRECTIONAL,horizon:CRYPTO_TIME_HORIZON.INTRADAY,
    longSupport,shortSupport,confidence,quality:range===null?60:range<=15?85:range<=30?65:40,reasons,risks,
    evidence:{priceUsd:p,high24h:h,low24h:l,intradayRangePercent:range,rangePositionPercent:rangePosition,change1hPercent:n(m.change1hPercent),change4hPercent:n(m.change4hPercent),change24hPercent:n(m.change24hPercent)}
  });
}
