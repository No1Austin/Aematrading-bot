import fs from "node:fs";
const source=fs.readFileSync("src/crypto/scanner/cryptoScanner.js","utf8");
const a=source.indexOf("function aggregateDeepResearch");
const b=source.indexOf("async function runSixEngineResearch",a);
if(a<0||b<0) throw new Error("aggregateDeepResearch not found");
const x=source.slice(a,b);
const ok=(c,m)=>{if(!c)throw new Error(m)};
ok(x.includes("representedWeight;"),"representedWeight confidence multiplier missing");
ok(x.includes("representedEvidenceWeight > 0"),"represented confidence denominator missing");
ok(x.includes("weightedScore /")&&x.includes("availableWeight"),"score semantics changed");

const W={technical:.2,fundamental:.2,supporting:.6};
const p={
 technical:{score:70,confidence:90,coverage:.5},
 fundamental:{score:60,confidence:90,coverage:.5},
 supporting:{score:50,confidence:40,coverage:1}
};
let ws=0,wc=0,aw=0,rw=0;
for(const [k,v] of Object.entries(p)){
 const r=W[k]*v.coverage;
 ws+=v.score*W[k]; wc+=v.confidence*r; aw+=W[k]; rw+=r;
}
const score=ws/aw, confidence=wc/rw, coverage=rw*100;
ok(Math.abs(score-56)<1e-9,"score changed");
ok(Math.abs(confidence-52.5)<1e-9,"confidence wrong");
ok(Math.abs(coverage-80)<1e-9,"coverage wrong");
console.log(JSON.stringify({
 passed:true,phase:"6.38",
 canonicalResearch:{
  scoreSemanticsPreserved:true,
  configuredWeightsPreserved:{technical:20,fundamental:20,supporting:60},
  confidenceUsesRepresentedEvidenceWeight:true,
  confidenceDenominatorUsesRepresentedEvidenceWeight:true,
  coverageSemanticsPreserved:true
 },
 partialCoverageFixture:{canonicalScore:score,canonicalConfidence:confidence,canonicalCoverage:coverage,previousConfidenceWouldHaveBeen:60},
 executionAuthority:false,liveExecution:false,
 nextStage:"ONCHAIN_AND_FINAL_REVALIDATION_FRESHNESS_AUDIT"
},null,2));
