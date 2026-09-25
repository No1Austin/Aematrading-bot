import BOT_CONFIG from "../config/botConfig.js";
import PHASE5 from "../config/botPhase5Config.js";
import PHASE7 from "../config/botPhase7Config.js";
import {getBotPaperAccount,updateBotPaperPosition,closeBotPaperPosition,
  realizeBotPartialPnl,recordBotPaperOrder,recordBotPaperFill} from "../account/botPaperLedger.js";
import evaluateBotTradingConsistency from "../consistency/botTradingConsistencyEngine.js";
import recordClosedTradeToMemory from "../learning/botTradeResultRecorder.js";
import getBotFuturesExecutionMarket from "../market/botFuturesExecutionMarketProvider.js";

const BASE=process.env.AEMA_BOT_BINANCE_FUTURES_BASE_URL||"https://fapi.binance.com";
async function getBook(symbol){
  const r=await fetch(`${BASE}/fapi/v1/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`);
  if(!r.ok) throw new Error(`BINANCE_HTTP_${r.status}:bookTicker`);
  const x=await r.json(); return {bid:Number(x.bidPrice),ask:Number(x.askPrice)};
}
const pnl=(p,px,qty=p.quantity)=>p.direction==="LONG"?(px-p.entryPrice)*qty:(p.entryPrice-px)*qty;
const initialRiskPerUnit=p=>Math.abs(Number(p.entryPrice)-Number(p.initialStop??p.stop));
const rNow=(p,px)=>{
  const risk=initialRiskPerUnit(p);
  if(!(risk>0)) return 0;
  return p.direction==="LONG"?(px-p.entryPrice)/risk:(p.entryPrice-px)/risk;
};
const tightens=(direction,current,next)=>
  direction==="LONG" ? next>current : next<current;

async function updateTrailingProtection(position,exitPx,options={}){
  const cfg={...PHASE7.trailing,...options.trailing};
  if(!cfg.enabled) return {position,changed:false,rMultiple:rNow(position,exitPx)};
  const rMultiple=rNow(position,exitPx);
  const highest=Math.max(Number(position.highestPriceSinceEntry)||position.entryPrice,exitPx);
  const lowest=Math.min(Number(position.lowestPriceSinceEntry)||position.entryPrice,exitPx);
  const targetReached=position.direction==="LONG"
    ? highest>=Number(position.initialTarget??position.target)
    : lowest<=Number(position.initialTarget??position.target);
  const activate=Boolean(position.trailingActive) ||
    rMultiple>=cfg.activationR || (cfg.originalTargetActivatesTrailing&&targetReached);

  let nextStop=Number(position.stop), trailingStop=Number(position.trailingStop)||null;
  let market=null;
  if(activate){
    market=await getBotFuturesExecutionMarket({symbol:position.symbol},options.setup);
    const atr=Number(market.atr);
    if(atr>0){
      const atrTrail=position.direction==="LONG"
        ? highest-atr*cfg.atrMultiplier
        : lowest+atr*cfg.atrMultiplier;
      const structureTrail=position.direction==="LONG"
        ? Number(market.support)-atr*cfg.structureBufferAtr
        : Number(market.resistance)+atr*cfg.structureBufferAtr;
      const candidates=[atrTrail,structureTrail].filter(Number.isFinite);
      if(rMultiple>=cfg.moveToBreakevenAtR) candidates.push(Number(position.entryPrice));
      const proposed=position.direction==="LONG"?Math.max(...candidates):Math.min(...candidates);
      if(Number.isFinite(proposed)&&tightens(position.direction,nextStop,proposed)){
        // Never put a LONG protective stop at/above current bid, or a SHORT stop at/below current ask.
        const physicallyValid=position.direction==="LONG"?proposed<exitPx:proposed>exitPx;
        if(physicallyValid){ nextStop=proposed; trailingStop=proposed; }
      }
    }
  }
  const patch={
    highestPriceSinceEntry:highest,lowestPriceSinceEntry:lowest,
    trailingActive:activate,
    trailingStop:trailingStop,
    stop:nextStop,
  };
  if(activate&&!position.trailingActive) patch.trailingActivatedAt=new Date().toISOString();
  const updated=updateBotPaperPosition(position.id,patch);
  return {position:updated,changed:nextStop!==Number(position.stop),
    activated:activate&&!position.trailingActive,rMultiple,market};
}

function totalTradePnl(p,remainingPnl){
  return (Number(p.partialRealizedPnlUsd)||0)+(Number(remainingPnl)||0);
}
function saveClosedMemory(p,closed,remainingPnl){
  // Memory should describe the complete trade, including earlier partial reductions.
  return recordClosedTradeToMemory(p,{...closed,realizedPnlUsd:totalTradePnl(p,remainingPnl)});
}

export async function manageBotOpenPositions(options={}) {
  const cfg={...PHASE5.consistency,...options.consistency};
  const before=getBotPaperAccount(), results=[];
  for(const original of before.positions){
    try{
      let p=original;
      const b=await getBook(p.symbol);
      const exitPx=p.direction==="LONG"?b.bid:b.ask;
      let upnl=pnl(p,exitPx);
      p=updateBotPaperPosition(p.id,{
        markPrice:exitPx,unrealizedPnlUsd:upnl,
        maximumFavorableExcursionUsd:Math.max(Number(p.maximumFavorableExcursionUsd)||0,upnl,0),
        maximumAdverseExcursionUsd:Math.min(Number(p.maximumAdverseExcursionUsd)||0,upnl,0)
      });

      // Phase 7: fixed target no longer immediately closes a strong trade.
      // It activates/tightens trailing protection. Stop/trailing stop remains authoritative.
      const trail=await updateTrailingProtection(p,exitPx,options);
      p=trail.position;
      upnl=pnl(p,exitPx);
      const stopHit=p.direction==="LONG"?exitPx<=p.stop:exitPx>=p.stop;
      if(stopHit){
        const reason=p.trailingActive?"TRAILING_STOP_HIT":"STOP_HIT";
        const closed=closeBotPaperPosition(p.id,{exitPrice:exitPx,reason,realizedPnlUsd:upnl});
        const memory=saveClosedMemory(p,closed,upnl);
        results.push({symbol:p.symbol,direction:p.direction,action:"EXIT",reason,exitPrice:exitPx,
          unrealizedPnlUsd:upnl,rMultiple:trail.rMultiple,trailing:p.trailingActive,
          trailingStop:p.trailingStop,closed,memory}); continue;
      }

      const c=await evaluateBotTradingConsistency(p,options.consistency);
      const history=[...(p.consistencyHistory||[]),c].slice(-100);

      if(c.action==="EXIT"){
        const closed=closeBotPaperPosition(p.id,{exitPrice:exitPx,reason:c.reason,realizedPnlUsd:upnl});
        const memory=saveClosedMemory(p,closed,upnl);
        results.push({symbol:p.symbol,direction:p.direction,action:"EXIT",reason:c.reason,
          exitPrice:exitPx,unrealizedPnlUsd:upnl,rMultiple:trail.rMultiple,
          trailing:p.trailingActive,trailingStop:p.trailingStop,consistency:c,closed,memory}); continue;
      }

      if(c.action==="REDUCE"){
        const qty=p.quantity*cfg.reduceFraction;
        const realized=pnl(p,exitPx,qty);
        const remain=p.quantity-qty;
        recordBotPaperOrder({symbol:p.symbol,side:p.direction==="LONG"?"SELL":"BUY",type:"MARKET",
          requestedQuantity:qty,status:"CONSISTENCY_REDUCE"});
        recordBotPaperFill({symbol:p.symbol,fillPrice:exitPx,quantity:qty,
          notionalUsd:exitPx*qty,source:"CONSISTENCY_REDUCE"});
        realizeBotPartialPnl(realized);
        p=updateBotPaperPosition(p.id,{quantity:remain,notionalUsd:remain*exitPx,
          marginUsedUsd:p.marginUsedUsd*(remain/(remain+qty)),
          unrealizedPnlUsd:pnl(p,exitPx,remain),consistencyHistory:history,
          partialRealizedPnlUsd:(p.partialRealizedPnlUsd||0)+realized});
        results.push({symbol:p.symbol,direction:p.direction,action:"REDUCE",consistency:c,
          exitPrice:exitPx,reduceQty:qty,realizedPnlUsd:realized,
          unrealizedPnlUsd:p.unrealizedPnlUsd,rMultiple:trail.rMultiple,
          trailing:p.trailingActive,trailingStop:p.trailingStop}); continue;
      }

      if(c.action==="ADD"){
        const account=getBotPaperAccount();
        const allocated=account.allocationUsd;
        const maxNotional=allocated*(cfg.maximumPositionNotionalPercent/100);
        const last=p.lastAddAt?new Date(p.lastAddAt).getTime():0;
        const cooldown=cfg.minimumMinutesBetweenAdds*60000;
        const allowed=(p.addCount||0)<cfg.maximumAddsPerPosition && Date.now()-last>=cooldown;
        const desired=allowed?Math.min(p.notionalUsd*cfg.addFraction,Math.max(0,maxNotional-p.notionalUsd),Math.max(0,account.allocatedAvailableMarginUsd*BOT_CONFIG.account.maximumLeverage)):0;
        const addQty=desired>0?desired/exitPx:0;
        const newNotional=p.notionalUsd+desired;
        const leverage=Math.min(BOT_CONFIG.account.maximumLeverage,
          Math.max(p.leverage,Math.ceil(newNotional/(allocated*(BOT_CONFIG.account.maximumMarginPercent/100)))));
        const newMargin=newNotional/leverage;

        if(addQty>0){
          const newQty=p.quantity+addQty;
          const avg=((p.entryPrice*p.quantity)+(exitPx*addQty))/newQty;
          const stopRisk=p.direction==="LONG"
            ? Math.max(0,(avg-p.stop)*newQty)
            : Math.max(0,(p.stop-avg)*newQty);
          const maxRisk=allocated*(BOT_CONFIG.account.riskPerTradePercent/100);
          const riskApproved=stopRisk<=maxRisk+1e-8;
          const marginApproved=newMargin<=account.allocatedAvailableMarginUsd+p.marginUsedUsd &&
            newMargin<=allocated*(BOT_CONFIG.account.maximumMarginPercent/100);
          if(riskApproved&&marginApproved){
            recordBotPaperOrder({symbol:p.symbol,side:p.direction==="LONG"?"BUY":"SELL",type:"MARKET",
              requestedQuantity:addQty,status:"CONSISTENCY_ADD"});
            recordBotPaperFill({symbol:p.symbol,fillPrice:exitPx,quantity:addQty,
              notionalUsd:desired,source:"CONSISTENCY_ADD"});
            p=updateBotPaperPosition(p.id,{quantity:newQty,entryPrice:avg,notionalUsd:newNotional,
              leverage,marginUsedUsd:newMargin,addCount:(p.addCount||0)+1,
              lastAddAt:new Date().toISOString(),consistencyHistory:history,
              unrealizedPnlUsd:pnl({...p,entryPrice:avg},exitPx,newQty)});
            results.push({symbol:p.symbol,direction:p.direction,action:"ADD",consistency:c,
              exitPrice:exitPx,addQty,leverage,newNotional,stopRiskUsd:stopRisk,
              rMultiple:trail.rMultiple,trailing:p.trailingActive,trailingStop:p.trailingStop}); continue;
          }
        }
        updateBotPaperPosition(p.id,{consistencyHistory:history});
        results.push({symbol:p.symbol,direction:p.direction,action:"HOLD",
          reason:"ADD_NOT_RISK_APPROVED",consistency:c,exitPrice:exitPx,
          unrealizedPnlUsd:upnl,rMultiple:trail.rMultiple,
          trailing:p.trailingActive,trailingStop:p.trailingStop}); continue;
      }

      updateBotPaperPosition(p.id,{consistencyHistory:history});
      results.push({symbol:p.symbol,direction:p.direction,action:"HOLD",consistency:c,
        exitPrice:exitPx,unrealizedPnlUsd:upnl,rMultiple:trail.rMultiple,
        trailing:p.trailingActive,trailingStop:p.trailingStop,
        trailingChanged:trail.changed,trailingActivated:trail.activated});
    }catch(error){
      results.push({symbol:original.symbol,direction:original.direction,action:"ERROR",
        error:error?.message||String(error)});
    }
  }
  return {before,after:getBotPaperAccount(),results};
}
export default manageBotOpenPositions;
