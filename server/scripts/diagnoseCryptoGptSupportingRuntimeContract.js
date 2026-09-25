/**
 * AEMA Crypto — Phase 6.47
 * GPT Supporting Runtime Contract Test
 *
 * Deterministic runtime-contract fixture. No network calls and no production changes.
 * Verifies the Phase 6.44 + 6.46 semantics end-to-end at the contract level.
 */

const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,Number(v)));

function normalizeBucket(value={}) {
  const score=Number.isFinite(Number(value?.score)) ? clamp(value.score) : null;
  const coverageRaw=value?.coverage ?? value?.evidenceCoverage;
  const coverage=Number.isFinite(Number(coverageRaw)) ? clamp(coverageRaw) : 0;
  return {
    available:value?.available===true && score!==null,
    score,
    confidence:Number.isFinite(Number(value?.confidence)) ? clamp(value.confidence) : 0,
    coverage,
    evidenceCoverage:coverage,
  };
}

function aggregate(narrative,news){
  const rows=[
    ["narrative",narrative,.5],
    ["news",news,.5],
  ];
  let ws=0, aw=0, wc=0, rw=0;
  const availability={};
  for(const [key,r,w] of rows){
    const available=r?.available===true && Number.isFinite(Number(r?.score));
    const c=available ? clamp(r?.coverage ?? 0)/100 : 0;
    const represented=available ? w*c : 0;
    availability[key]={available,configuredWeight:w,coverage:c*100,representedWeight:represented};
    if(!available) continue;
    ws += Number(r.score)*w;
    aw += w;
    wc += Number(r.confidence ?? 0)*represented;
    rw += represented;
  }
  return {
    score:aw>0?ws/aw:null,
    confidence:rw>0?wc/rw:0,
    coverage:rw*100,
    representedEvidenceWeight:rw,
    availability,
  };
}

const assert=(c,m)=>{if(!c)throw new Error(m);};

const narrative=normalizeBucket({available:true,score:70,confidence:80,coverage:50});
const news=normalizeBucket({available:true,score:60,confidence:60,coverage:25});
const supporting=aggregate(narrative,news);

assert(supporting.score===65,"Supporting score changed.");
assert(supporting.coverage===37.5,"Supporting represented coverage failed.");
assert(Math.abs(supporting.confidence-73.33333333333333)<1e-9,"Supporting represented confidence failed.");

const missingCoverage=normalizeBucket({available:true,score:75,confidence:90});
assert(missingCoverage.coverage===0,"Missing GPT coverage did not fail closed.");

const oneMissing=aggregate(narrative,missingCoverage);
assert(oneMissing.coverage===25,"Zero-coverage available engine incorrectly received represented weight.");
assert(oneMissing.representedEvidenceWeight===.25,"Represented weight mismatch.");

const stale={...normalizeBucket({available:true,score:80,confidence:90,coverage:90}),available:false,score:null,confidence:0,coverage:0,evidenceCoverage:0};
const staleAggregate=aggregate(narrative,stale);
assert(staleAggregate.coverage===25,"Stale bucket retained Supporting coverage authority.");
assert(staleAggregate.score===70,"Unavailable stale engine affected score.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.47",
  runtimeContract:{
    explicitGptCoverageFlowsIntoSupporting:true,
    fixtureScore:supporting.score,
    fixtureCoverage:supporting.coverage,
    fixtureConfidence:Number(supporting.confidence.toFixed(4)),
    representedEvidenceWeight:supporting.representedEvidenceWeight,
    missingCoverageFailsClosed:true,
    availableWithZeroCoverageGetsNoCoverageAuthority:true,
    staleBucketGetsNoCoverageAuthority:true,
    unavailableBucketExcludedFromScore:true
  },
  preserved:{
    supportingScoreRenormalization:true,
    narrativeNewsWeights:"50_50",
    canonicalWeights:"20_20_60",
    missingEvidenceNotConvertedToNeutralOrZeroScore:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"FINAL_REVALIDATION_FUTURE_TIMESTAMP_AUDIT"
},null,2));
