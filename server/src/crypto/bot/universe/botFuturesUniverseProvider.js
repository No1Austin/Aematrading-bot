/** Genuine Bybit USDT/USDC linear perpetual universe. Research only; no order authority. */
import BOT_CONFIG from "../config/botConfig.js";
import {listBybitLinearPerpetuals} from "../../data/providers/bybitFuturesProvider.js";
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
export async function getBotFuturesUniverse(options={}){
 const cfg={...BOT_CONFIG.universe,...options}; const rows=await listBybitLinearPerpetuals({timeoutMs:cfg.timeoutMs});
 const quoteSet=new Set((cfg.quoteAssets||["USDT","USDC"]).map(x=>String(x).toUpperCase()));
 const assets=rows.map(({instrument:i,ticker:t})=>{const last=num(t?.lastPrice),bid=num(t?.bid1Price),ask=num(t?.ask1Price),high=num(t?.highPrice24h),low=num(t?.lowPrice24h),turnover=num(t?.turnover24h),pct=num(t?.price24hPcnt);const mid=bid>0&&ask>0?(bid+ask)/2:null;return{
   symbol:i.symbol,productId:i.symbol,baseAsset:i.baseCoin,quoteAsset:i.quoteCoin,status:"TRADING",contractType:"PERPETUAL",instrumentType:"PERPETUAL",exchange:"BYBIT",settleCoin:i.settleCoin,
   market:{price:last,markPrice:num(t?.markPrice),indexPrice:num(t?.indexPrice),bid,ask,spreadPercent:mid>0?((ask-bid)/mid)*100:null,quoteVolume:turnover,baseVolume:num(t?.volume24h),priceChangePercent:pct!==null?pct*100:null,high24h:high,low24h:low,rangePercent:last>0&&high!==null&&low!==null?((high-low)/last)*100:null,tradeCount24h:null,openInterest:num(t?.openInterest),openInterestValue:num(t?.openInterestValue),fundingRate:num(t?.fundingRate),nextFundingTime:num(t?.nextFundingTime)},
   derivativesEvidenceAvailable:num(t?.openInterest)!==null||num(t?.fundingRate)!==null,executionAuthority:false,liveExecution:false
 };}).filter(a=>quoteSet.has(String(a.quoteAsset).toUpperCase())).slice(0,cfg.maximumSymbols||1000);
 return{approved:true,status:"FUTURES_UNIVERSE_READY",marketType:"PERPETUAL",instrumentType:"PERPETUAL",exchange:"BYBIT",assets,count:assets.length,observedAt:new Date().toISOString(),executionAuthority:false,liveExecution:false};
}
export default getBotFuturesUniverse;
