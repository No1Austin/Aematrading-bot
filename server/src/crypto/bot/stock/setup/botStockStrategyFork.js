import buildBotStockStrategySetup from './botStockStrategySetupBuilder.js';
import {adaptAlpacaBarsToStockSetup} from './botStockMarketAdapter.js';
const MAP=Object.freeze({'1Min':'1m','5Min':'5m','15Min':'15m','1Hour':'1h','1Day':'1d'});
/** Genuine fork of crypto V2 strategy builder; no brokerage execution. */
export function evaluateStockStrategyFork({symbol,bars,timeframe='5Min',direction,asOf=Date.now(),options={}}={}){
  const market=adaptAlpacaBarsToStockSetup({symbol,bars,timeframe,asOf,spreadPercent:options.spreadPercent,slippagePercent:options.slippagePercent});
  const normalized=String(direction??'').toUpperCase();
  const bull=normalized==='BULL'||normalized==='LONG';
  const bear=normalized==='BEAR'||normalized==='SHORT';
  if(!bull&&!bear)throw new Error('STOCK_DIRECTION_REQUIRED');
  const candidate={symbol,asset:{symbol,instrumentType:'EQUITY'},directionDecision:{direction:bull?'BULL':'BEAR',qualified:true}};
  const built=buildBotStockStrategySetup(candidate,market,{...options,candleInterval:MAP[timeframe],replayNowMs:asOf});
  return {...built,assetClass:'STOCK',researchOnly:true,executionAuthority:false,liveExecution:false};
}
