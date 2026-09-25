#!/usr/bin/env node
import {startBotPositionRuntime} from "../src/crypto/bot/runtime/botRuntime.js";
const r=startBotPositionRuntime();
console.log(`AEMA paper position runtime started. interval=${r.intervalMs}ms`);
console.log(`Portfolio cap: ${r.maximumOpenPositions} positions.`);
console.log("Trading Consistency + ATR/structure trailing protection active.");
console.log("Empty slots auto-refill from the research/trading cycle.");
console.log("Live execution DISABLED. Press Ctrl+C to stop.");
