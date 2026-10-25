import {readFileSync,writeFileSync} from 'node:fs';
const file=new URL('../src/crypto/bot/api/botPrivateRoutes.js',import.meta.url);
let src=readFileSync(file,'utf8');
const importLine='import runStockMarketSearch from "../stock/orchestration/botStockMarketSearchCycle.js";';
if(!src.includes(importLine))src=importLine+'\n'+src;
if(!src.includes('r.post("/stock/market/search"')){
  const anchor='  r.post("/stock/research"';
  if(!src.includes(anchor))throw new Error('STOCK_RESEARCH_ROUTE_ANCHOR_NOT_FOUND: route not modified');
  src=src.replace(anchor,`  // Independent stock V2 market search. Never places orders.\n  r.post("/stock/market/search",handle(async(req,res)=>{\n    res.set("Cache-Control","no-store");\n    res.json(await runStockMarketSearch(req.body?.options??req.body??{}));\n  }));\n${anchor}`);
}
writeFileSync(file,src);
console.log('PASS: stock market search route installed (existing routes preserved)');
