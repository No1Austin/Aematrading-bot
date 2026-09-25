import fs from "node:fs";
import path from "node:path";
import PHASE6 from "../config/botPhase6Config.js";

const memoryPath=path.resolve(process.cwd(),PHASE6.memory.path);
const fresh=()=>({version:1,records:[],updatedAt:new Date().toISOString()});
function load(){
  try{
    if(fs.existsSync(memoryPath)) return {...fresh(),...JSON.parse(fs.readFileSync(memoryPath,"utf8"))};
  }catch(e){console.error("[TRADE MEMORY] load:",e.message)}
  return fresh();
}
let db=load();
function save(){
  fs.mkdirSync(path.dirname(memoryPath),{recursive:true});
  db.updatedAt=new Date().toISOString();
  const tmp=`${memoryPath}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(db,null,2));
  fs.renameSync(tmp,memoryPath);
}
export function getTradeMemory(){return {memoryPath,count:db.records.length,records:db.records.map(x=>({...x}))}}
export function appendTradeMemory(record){
  if(!record?.tradeId) throw new Error("TRADE_MEMORY_ID_REQUIRED");
  if(db.records.some(x=>x.tradeId===record.tradeId)) return db.records.find(x=>x.tradeId===record.tradeId);
  db.records.push({...record,recordedAt:new Date().toISOString()});
  if(db.records.length>PHASE6.memory.maximumRecords) db.records=db.records.slice(-PHASE6.memory.maximumRecords);
  save(); return record;
}
export function resetTradeMemory(){db=fresh();save();return getTradeMemory()}
export default {getTradeMemory,appendTradeMemory,resetTradeMemory};
