import {
  buildCryptoDirectionalResult,
  buildInsufficientDirectionalResult,
  CRYPTO_ENGINE_ROLE,
  CRYPTO_TIME_HORIZON,
} from "../contracts/cryptoDirectionalEngineContract.js";

const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,Number(v)||0));

function component(value,strong,weight){
  const n=finite(value);
  if(n===null)return{available:false,long:0,short:0};
  const magnitude=clamp(Math.abs(n)/strong*100)*weight;
  return n>0?{available:true,long:magnitude,short:0}:n<0?{available:true,long:0,short:magnitude}:{available:true,long:0,short:0};
}

export default async function run(candidate){
  const m=candidate?.measurements??{};
  const rows=[
    component(m.change1hPercent,4,.30),
    component(m.change4hPercent,7,.30),
    component(m.change24hPercent,12,.25),
    component(m.change7dPercent,25,.15),
  ];
  const available=rows.filter(x=>x.available).length;
  if(available<2)return buildInsufficientDirectionalResult({engine:"CRYPTO_TRADING_TECHNICAL",role:CRYPTO_ENGINE_ROLE.DIRECTIONAL,horizon:CRYPTO_TIME_HORIZON.INTRADAY});
  let longSupport=rows.reduce((s,x)=>s+x.long,0),shortSupport=rows.reduce((s,x)=>s+x.short,0);
  const signs=[m.change1hPercent,m.change4hPercent,m.change24hPercent,m.change7dPercent].filter(v=>finite(v)!==null).map(v=>Number(v)>0?"LONG":Number(v)<0?"SHORT":"NEUTRAL");
  const longCount=signs.filter(x=>x==="LONG").length,shortCount=signs.filter(x=>x==="SHORT").length,dominant=Math.max(longCount,shortCount);
  if(longCount>=3)longSupport+=longCount===4?12:8;
  if(shortCount>=3)shortSupport+=shortCount===4?12:8;
  longSupport=clamp(longSupport);shortSupport=clamp(shortSupport);
  const separation=Math.abs(longSupport-shortSupport),coverage=available/4,alignment=dominant/available;
  const confidence=clamp((coverage*.35+alignment*.40+Math.min(1,separation/60)*.25)*100)/100;
  return buildCryptoDirectionalResult({
    engine:"CRYPTO_TRADING_TECHNICAL",role:CRYPTO_ENGINE_ROLE.DIRECTIONAL,horizon:CRYPTO_TIME_HORIZON.INTRADAY,
    longSupport,shortSupport,confidence,quality:clamp(coverage*60+alignment*40),
    reasons:[longSupport>shortSupport?"MULTI_TIMEFRAME_MOMENTUM_FAVOURS_LONG":shortSupport>longSupport?"MULTI_TIMEFRAME_MOMENTUM_FAVOURS_SHORT":"MOMENTUM_BALANCED"],
    evidence:{change1hPercent:m.change1hPercent??null,change4hPercent:m.change4hPercent??null,change24hPercent:m.change24hPercent??null,change7dPercent:m.change7dPercent??null}
  });
}
