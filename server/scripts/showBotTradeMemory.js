#!/usr/bin/env node
import {getTradeMemory} from "../src/crypto/bot/learning/botTradeMemoryStore.js";
const m=getTradeMemory();
console.log("\n======================================================");
console.log(" AEMA BOT — TRADE MEMORY");
console.log("======================================================");
console.log(`Records: ${m.count}`);
for(const r of m.records.slice(-30).reverse()){
  console.log(`${r.closedAt} ${r.symbol} ${r.direction} ${r.outcome} PnL=$${Number(r.realizedPnlUsd).toFixed(2)} R=${Number(r.rMultiple).toFixed(2)} exit=${r.exitReason}`);
}
console.log(`\nMemory: ${m.memoryPath}`);
console.log("======================================================\n");
