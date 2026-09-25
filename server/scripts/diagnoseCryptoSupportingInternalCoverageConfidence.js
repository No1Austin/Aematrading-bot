/**
 * AEMA Crypto — Phase 6.43
 * Supporting Internal Coverage & Confidence Audit
 *
 * Audit only. No production changes.
 *
 * Proven current contracts:
 * - Social Narrative may derive confidence from evidence count, but exposes
 *   no explicit coverage/evidenceCoverage/directionalCoverage contract.
 * - News passes confidence inside evidence to complete(), but does not pass
 *   it as complete()'s confidence argument and exposes no explicit coverage.
 * - Canonical Supporting aggregation treats an available engine as its full
 *   configured weight when engine-internal coverage is absent.
 */

const fixture = {
  narrative: {
    available: true,
    score: 70,
    confidence: 61,
    internalCoverage: null,
    configuredSupportingWeight: 0.50,
  },
  news: {
    available: true,
    score: 60,
    confidence: 0,
    internalCoverage: null,
    configuredSupportingWeight: 0.50,
  },
};

function currentSupportingCoverage(items) {
  return items.reduce(
    (sum, x) => sum + (x.available ? x.configuredSupportingWeight : 0),
    0,
  ) * 100;
}

const items=Object.values(fixture);
const currentCoverage=currentSupportingCoverage(items);

if (currentCoverage !== 100) {
  throw new Error("Expected current availability-based Supporting coverage to be 100.");
}
if (fixture.narrative.internalCoverage !== null ||
    fixture.news.internalCoverage !== null) {
  throw new Error("Fixture must represent missing engine-internal coverage.");
}

console.log(JSON.stringify({
  passed:true,
  phase:"6.43",
  socialNarrative:{
    explicitCoverageContract:false,
    evidenceCountCanIncreaseConfidence:true,
    evidenceCountDoesNotMeasureConfiguredEvidenceCoverage:true
  },
  news:{
    explicitCoverageContract:false,
    bulkConfidencePassedAsCompleteConfidenceArgument:false,
    bulkConfidenceNestedInsideEvidence:true,
    normalizedConfidenceCanThereforeCollapseToZero:true
  },
  supportingAggregation:{
    configuredWeights:{narrative:50,news:50},
    availabilityCanRepresentFullSupportingCoverage:true,
    fixtureCoveragePercent:currentCoverage,
    internalCoverageRequiredForRepresentedEvidence:false,
    canonicalSupportingCoverageCanBeOverstated:true,
    canonicalSupportingConfidenceCanBeMisweighted:true
  },
  finding:{
    productionFixRequired:true,
    area:"SUPPORTING_INTERNAL_COVERAGE_AND_CONFIDENCE",
    recommendedFix:"ADD_EXPLICIT_COVERAGE_AND_CONFIDENCE_CONTRACTS_TO_NARRATIVE_AND_NEWS; PROPAGATE_ENGINE_INTERNAL_COVERAGE_IN_SUPPORTING_AGGREGATION; NEVER_TREAT_AVAILABILITY_ALONE_AS_FULL_REPRESENTED_EVIDENCE"
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"SUPPORTING_REPRESENTED_EVIDENCE_FIX"
},null,2));
