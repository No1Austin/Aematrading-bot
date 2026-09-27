import express from "express";
import {botLogin,botLogout,botAuthStatus,requireBotAccess} from "../auth/botAccess.js";
import {getBotPaperAccount,setBotControls} from "../account/botPaperLedger.js";
import {getTradeMemory} from "../learning/botTradeMemoryStore.js";
import {manuallyCloseBotPosition,emergencyStopBot} from "../positions/botManualControls.js";
import {isBotRuntimeBusy,isBotRuntimeRunning} from "../runtime/botRuntime.js";
import getDedicatedAlpacaOverview from "../alpaca/botDedicatedAlpacaOverview.js";

const handle=(fn)=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{
  const status=e.message==="BOT_RUNTIME_BUSY_RETRY"?409:e.message==="BOT_POSITION_NOT_FOUND"?404:400;
  res.status(status).json({error:e.message});
});

// Ledger closed-position realizedPnlUsd is the FINAL exit only.
// API trade realizedPnlUsd represents the WHOLE trade, including partial exits.
const completeClosedTrade=(position)=>{
  const finalExitPnlUsd=Number(position.realizedPnlUsd);
  const partialRealizedPnlUsd=Number(position.partialRealizedPnlUsd??0);
  return {
    ...position,
    finalExitPnlUsd,
    partialRealizedPnlUsd,
    realizedPnlUsd:finalExitPnlUsd+partialRealizedPnlUsd
  };
};

export default function createBotPrivateRoutes(){
  const r=express.Router();
  r.post("/auth/login",botLogin);
  r.post("/auth/logout",botLogout);
  r.get("/auth/status",botAuthStatus);
  r.use(requireBotAccess);
  r.get("/dashboard",(_req,res)=>{
    const account=getBotPaperAccount(),memory=getTradeMemory();
    res.json({paperOnly:true,liveExecution:false,portfolioLimit:3,account,
      runtime:{running:isBotRuntimeRunning(),busy:isBotRuntimeBusy()},
      memory:{records:memory.records||[],count:(memory.records||[]).length},generatedAt:new Date().toISOString()});
  });

  // Dedicated crypto Alpaca account: authenticated, read-only, never uses stock credentials.
  const alpacaOverview = async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.json(await getDedicatedAlpacaOverview()); }
    catch (error) {
      console.error("[DEDICATED CRYPTO ALPACA]", error?.message || error);
      return res.status(503).json({connected:false,provider:"ALPACA_PAPER",executionEnabled:false,error:"DEDICATED_ALPACA_OVERVIEW_UNAVAILABLE"});
    }
  };
  r.get("/alpaca/overview", alpacaOverview);
  r.get("/alpaca/account", alpacaOverview); // compatibility; never returns shared stock account

  r.get("/history",(_req,res)=>{
    const account=getBotPaperAccount();
    const trades=[...account.closedPositions].reverse().map(completeClosedTrade);
    res.json({trades,paperOnly:true});
  });
  r.get("/positions/:id/explanation",(req,res)=>{
    const a=getBotPaperAccount(),p=[...a.positions,...a.closedPositions].find(x=>x.id===req.params.id);
    if(!p)return res.status(404).json({error:"BOT_POSITION_NOT_FOUND"});
    const memory=getTradeMemory().records.find(x=>x.tradeId===p.id);
    res.json({positionId:p.id,symbol:p.symbol,direction:p.direction,entrySnapshot:p.entryCandidateSnapshot??null,
      researchRankScore:p.entryResearchRankScore??null,executionRankScore:p.entryExecutionRankScore??null,
      entryDirectionDecision:p.entryDirectionDecision??null,consistencyHistory:p.consistencyHistory??[],
      management:{trailingActive:p.trailingActive,trailingStop:p.trailingStop,stop:p.stop,addCount:p.addCount,exitReason:p.exitReason??null},
      result:memory??null,evidenceMissing:!p.entryCandidateSnapshot,explanationSource:"RECORDED_EVIDENCE_ONLY"});
  });
  r.put("/controls/allocation",handle((req,res)=>{
    if(isBotRuntimeBusy())throw new Error("BOT_RUNTIME_BUSY_RETRY");
    res.json({account:setBotControls({allocationUsd:req.body?.allocationUsd})});
  }));
  r.post("/controls/pause",handle((_req,res)=>res.json({account:setBotControls({paused:true})})));
  r.post("/controls/resume",handle((_req,res)=>res.json({account:setBotControls({paused:false})})));
  r.post("/positions/:id/close",handle(async(req,res)=>res.json(await manuallyCloseBotPosition(req.params.id))));
  r.post("/controls/emergency-stop",handle(async(_req,res)=>{
    // Pause immediately, even if the runtime is currently busy; retry closure if necessary.
    setBotControls({paused:true});
    res.json(await emergencyStopBot());
  }));
  return r;
}
