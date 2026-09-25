import fs from "node:fs";
import path from "node:path";
import BOT_CONFIG from "../config/botConfig.js";
import PHASE5 from "../config/botPhase5Config.js";

const ledgerPath = path.resolve(process.cwd(), PHASE5.persistence.ledgerPath);
const startEquity = () => Number(process.env.AEMA_BOT_PAPER_STARTING_EQUITY || BOT_CONFIG.account.startingEquityUsd || 10000);
const fresh = () => ({
  version: 2, startingEquityUsd: startEquity(), cashUsd: startEquity(),
  realizedPnlUsd: 0, positions: [], closedPositions: [], orders: [], fills: [],
  controls: {paused:true, allocationUsd:null}, sequence: 0, updatedAt: new Date().toISOString()
});
function load() {
  try {
    if (fs.existsSync(ledgerPath)) return { ...fresh(), ...JSON.parse(fs.readFileSync(ledgerPath, "utf8")) };
  } catch (e) { console.error("[BOT LEDGER] load:", e.message); }
  return fresh();
}
let state = load();
state.controls = {paused:true, allocationUsd:null, ...(state.controls||{})};
const id = p => `${p}-${Date.now()}-${++state.sequence}`;
const round = (v,d=8) => Number(Number(v).toFixed(d));
function save() {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive:true });
  state.updatedAt = new Date().toISOString();
  const tmp = `${ledgerPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state,null,2));
  fs.renameSync(tmp, ledgerPath);
}
export function getBotPaperAccount() {
  const used = state.positions.reduce((s,p)=>s+(Number(p.marginUsedUsd)||0),0);
  const upnl = state.positions.reduce((s,p)=>s+(Number(p.unrealizedPnlUsd)||0),0);
  const allocated = state.controls.allocationUsd == null ? Math.max(0,state.cashUsd+upnl) : Math.min(state.controls.allocationUsd,Math.max(0,state.cashUsd+upnl));
  return {
    controls:{...state.controls}, allocationUsd:round(allocated,2),
    allocatedAvailableMarginUsd:round(Math.max(0,Math.min(allocated,state.cashUsd)-used),2),
    startingEquityUsd:state.startingEquityUsd, cashUsd:round(state.cashUsd,2),
    realizedPnlUsd:round(state.realizedPnlUsd,2), unrealizedPnlUsd:round(upnl,2),
    equityUsd:round(state.cashUsd+upnl,2), usedMarginUsd:round(used,2),
    availableMarginUsd:round(Math.max(0,state.cashUsd-used),2),
    openPositions:state.positions.length, positions:state.positions.map(x=>({...x})),
    closedPositions:state.closedPositions.map(x=>({...x})),
    orderCount:state.orders.length, fillCount:state.fills.length,
    ledgerPath, paperOnly:true, liveExecution:false
  };
}
export function setBotControls(patch) {
  if (patch.allocationUsd !== undefined) {
    const amount=Number(patch.allocationUsd);
    const account=getBotPaperAccount();
    if (!Number.isFinite(amount)||amount<=0||amount>account.equityUsd) throw new Error("INVALID_ALLOCATION");
    if (amount+1e-8<account.usedMarginUsd ||
        account.positions.some(p => (Number(p.notionalUsd)||0) > amount*(BOT_CONFIG.account.maximumPositionNotionalPercent/100)+1e-8))
      throw new Error("ALLOCATION_BELOW_EXISTING_POSITION_EXPOSURE");
    state.controls.allocationUsd=amount;
  }
  if (patch.paused !== undefined) state.controls.paused=Boolean(patch.paused);
  save(); return getBotPaperAccount();
}
export function recordBotPaperOrder(x) {
  const row={id:id("BOT-ORDER"),createdAt:new Date().toISOString(),...x,paperOnly:true};
  state.orders.push(row); save(); return {...row};
}
export function recordBotPaperFill(x) {
  const row={id:id("BOT-FILL"),filledAt:new Date().toISOString(),...x,paperOnly:true};
  state.fills.push(row); save(); return {...row};
}
export function openBotPaperPosition(x) {
  const row={id:id("BOT-POS"),openedAt:new Date().toISOString(),status:"OPEN",
    unrealizedPnlUsd:0,partialRealizedPnlUsd:0,addCount:0,lastAddAt:null,
    consistencyHistory:[],...x,paperOnly:true};
  if(state.controls.paused) throw new Error("BOT_PAUSED");
  const a=getBotPaperAccount();
  if((Number(x.marginUsedUsd)||0)>a.allocatedAvailableMarginUsd+1e-8) throw new Error("ALLOCATION_MARGIN_EXCEEDED");
  state.positions.push(row); save(); return {...row};
}
export function updateBotPaperPosition(positionId,patch) {
  const i=state.positions.findIndex(x=>x.id===positionId);
  if(i<0) throw new Error("BOT_POSITION_NOT_FOUND");
  state.positions[i]={...state.positions[i],...patch,updatedAt:new Date().toISOString()};
  save(); return {...state.positions[i]};
}
export function realizeBotPartialPnl(amount) {
  const v=Number(amount)||0; state.cashUsd+=v; state.realizedPnlUsd+=v; save();
}
export function closeBotPaperPosition(positionId,{exitPrice,reason,realizedPnlUsd}) {
  const i=state.positions.findIndex(x=>x.id===positionId);
  if(i<0) throw new Error("BOT_POSITION_NOT_FOUND");
  const [p]=state.positions.splice(i,1);
  const pnl=Number(realizedPnlUsd)||0;
  state.cashUsd+=pnl; state.realizedPnlUsd+=pnl;
  const row={...p,status:"CLOSED",exitPrice,exitReason:reason,realizedPnlUsd:pnl,
    closedAt:new Date().toISOString()};
  state.closedPositions.push(row); save(); return {...row};
}
export function resetBotPaperLedger(){ state=fresh(); save(); return getBotPaperAccount(); }
export default {getBotPaperAccount,recordBotPaperOrder,recordBotPaperFill,openBotPaperPosition,
  updateBotPaperPosition,realizeBotPartialPnl,closeBotPaperPosition,resetBotPaperLedger,setBotControls};
