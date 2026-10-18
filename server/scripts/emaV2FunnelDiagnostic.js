import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import runBotMarketSearch from "../src/crypto/bot/orchestration/botMarketSearchCycle.js";

const root=path.dirname(fileURLToPath(import.meta.url));
const timestamp=new Date().toISOString().replace(/[:.]/g,"-");
const output=path.join(root,`ema-v2-funnel-${timestamp}.json`);
const summary=path.join(root,`ema-v2-funnel-${timestamp}.txt`);
const tally=(values)=>Object.entries(values.reduce((acc,v)=>{
  const k=String(v||"UNKNOWN");acc[k]=(acc[k]||0)+1;return acc;
},{})).sort((a,b)=>b[1]-a[1]);

try {
  const result=await runBotMarketSearch({
    quantShadow: { enabled: true },
    quantSetupShadow: { enabled: true },
    quantSetupCapture: { enabled: true, filePath: "quant-research/data/setup_observations.jsonl", candleInterval: "5m" },
    quantArchive: {
      enabled: true,
      filePath: "quant-research/data/futures_snapshots.jsonl",
      candleInterval: "5m",
      includeDetails: true
    }
  });
  const rejected=Array.isArray(result.noSetup)?result.noSetup:[];
  const selected=Array.isArray(result.qualifiedSetups)?result.qualifiedSetups:[];
  const failures=Array.isArray(result.setupFailures)?result.setupFailures:[];
  const reasons=tally(rejected.flatMap(x=>x.blockers?.length?x.blockers:[x.reason]));
  const strategies=tally([...rejected,...selected].map(x=>x.strategy||x.setup?.strategy||x.diagnosticSetup?.strategy));
  const report={
    generatedAt:new Date().toISOString(),researchOnly:true,
    counts:result.counts||{},
    rejectionReasons:reasons,strategies,
    setupFailures:failures,
    quantShadow: result.quantShadow ?? null,
    quantSetupShadow: result.quantSetupShadow ?? null,
    quantArchive: result.quantArchive ?? null,
    quantSetupCapture: result.quantSetupCapture ?? null,
    setups:selected.map(x=>({
      symbol:x.symbol,strategy:x.setup?.strategy||x.strategy||null,
      direction:x.setup?.direction||null,
      entry:x.setup?.entry??null,stop:x.setup?.stop??null,
      target:x.setup?.target??null,riskReward:x.setup?.riskReward??null
    })),
    rejected:rejected.map(x=>({
      symbol:x.symbol,stage:x.stage,reason:x.reason,blockers:x.blockers,
      strategy:x.strategy, direction:x.direction
    })),
    // Keep complete response locally for debugging. Contains research market data.
    raw:result
  };
  await fs.writeFile(output,JSON.stringify(report,null,2));
  const lines=[
    "EMA v2 — research-only funnel diagnostic",
    `Generated: ${report.generatedAt}`,
    ...Object.entries(report.counts).map(([k,v])=>`${k}: ${v}`),
    "", "Top rejection reasons:",
    ...reasons.slice(0,25).map(([k,v])=>`${v} × ${k}`),
    "", "Strategies:",...strategies.map(([k,v])=>`${v} × ${k}`),
    "", `Quant shadow observations: ${Array.isArray(result.quantShadow) ? result.quantShadow.length : (result.quantShadow ? "present" : "none")}`,
    `Quant setup shadow observations: ${Array.isArray(result.quantSetupShadow) ? result.quantSetupShadow.length : (result.quantSetupShadow ? "present" : "none")}`,
    `Quant setup capture: ${JSON.stringify(result.quantSetupCapture ?? null)}`,
    `Quant archive saved: ${result.quantArchive?.saved ?? "not enabled"}`,
    `Quant archive rejected: ${result.quantArchive?.rejected ?? "not enabled"}`,
    `Quant archive reasons: ${JSON.stringify(result.quantArchive?.reasons ?? {})}`,
    "", `Full report: ${output}`
  ];
  await fs.writeFile(summary,lines.join("\n")+"\n");
  console.log(lines.join("\n"));
  console.log("QUANT ARCHIVE:", JSON.stringify(result.quantArchive ?? null, null, 2));
  console.log("QUANT SETUP SHADOW:", JSON.stringify(result.quantSetupShadow ?? null, null, 2));
} catch(err) {
  console.error("Diagnostic failed:",err?.stack||String(err));
  process.exitCode=1;
}
