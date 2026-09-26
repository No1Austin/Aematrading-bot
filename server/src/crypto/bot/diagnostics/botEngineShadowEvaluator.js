/**
 * AEMA directional shadow evaluator.
 * Observation only: experiment eligibility MUST NOT authorize paper or live orders.
 * Preserves the existing baseline/agreement60/separation20 experiment names.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);
const evidence = (contributions, key, side) => {
  const row = contributions?.[key];
  return row?.available && finite(row?.[side]) ? row[side] : null;
};
const result = (eligible, reason, checks = {}) => ({ eligible: Boolean(eligible), reason, checks });

export function evaluateBotEngineShadow(candidate) {
  const decision = candidate?.directionDecision ?? {};
  const direction = decision.direction;
  const side = direction === "LONG" ? "long" : direction === "SHORT" ? "short" : null;
  const opposite = side === "long" ? "short" : side === "short" ? "long" : null;
  const contributions = decision.contributions ?? {};
  const technical = side ? evidence(contributions, "technical", side) : null;
  const structure = side ? evidence(contributions, "marketStructure", side) : null;
  const technicalOpposite = opposite ? evidence(contributions, "technical", opposite) : null;
  const structureOpposite = opposite ? evidence(contributions, "marketStructure", opposite) : null;
  const bothAvailable = finite(technical) && finite(structure);
  const independentAgreement = bothAvailable && finite(technicalOpposite) && finite(structureOpposite)
    && technical > technicalOpposite && structure > structureOpposite;
  const separation = finite(decision.separation) ? decision.separation : null;
  const confidence = finite(decision.confidence) ? decision.confidence : null;
  const availableWeight = finite(decision.availableWeight) ? decision.availableWeight : null;
  const setupApproved = candidate?.setup?.approved === true;
  const directionValid = side !== null;
  const checks = {
    setupApproved, directionValid, bothAvailable, independentAgreement,
    technicalAtLeast60: finite(technical) && technical >= 60,
    structureAtLeast60: finite(structure) && structure >= 60,
    technicalAtLeast65: finite(technical) && technical >= 65,
    structureAtLeast85: finite(structure) && structure >= 85,
    separationAtLeast20: finite(separation) && separation >= 20,
    separationAtLeast35: finite(separation) && separation >= 35,
  };
  const reasonFor = (passed, extraChecks = []) => {
    if (!setupApproved) return "SETUP_NOT_APPROVED";
    if (!directionValid) return "INVALID_DIRECTION";
    if (!bothAvailable && extraChecks.includes("evidence")) return "MISSING_ENGINE_EVIDENCE";
    return passed ? "SHADOW_ELIGIBLE" : "SHADOW_CRITERIA_NOT_MET";
  };
  const agreement60 = setupApproved && directionValid && bothAvailable
    && checks.technicalAtLeast60 && checks.structureAtLeast60;
  const separation20 = setupApproved && directionValid && checks.separationAtLeast20;
  const strictAgreement = setupApproved && directionValid && independentAgreement
    && checks.technicalAtLeast65 && checks.structureAtLeast85;
  const strictPlusSeparation = strictAgreement && checks.separationAtLeast35;
  return Object.freeze({
    symbol: candidate?.symbol ?? candidate?.setup?.symbol ?? null,
    direction, technical, marketStructure: structure,
    technicalOpposite, marketStructureOpposite: structureOpposite,
    separation, confidence, availableWeight,
    evidence: { technicalAvailable: finite(technical), marketStructureAvailable: finite(structure),
      independentAgreement },
    experiments: {
      baseline: result(setupApproved, "EXISTING_SETUP_APPROVAL_ONLY", {setupApproved}),
      agreement60: result(agreement60, !bothAvailable ? "MISSING_ENGINE_EVIDENCE" : "SHADOW_COMPARISON_ONLY",
        {setupApproved, bothAvailable, technicalAtLeast60:checks.technicalAtLeast60, structureAtLeast60:checks.structureAtLeast60}),
      separation20: result(separation20, "SHADOW_COMPARISON_ONLY", {setupApproved, separationAtLeast20:checks.separationAtLeast20}),
      independentAgreement: result(setupApproved && independentAgreement,
        reasonFor(setupApproved && independentAgreement, ["evidence"]), {setupApproved, independentAgreement}),
      agreement65Structure85: result(strictAgreement, reasonFor(strictAgreement, ["evidence"]),
        {setupApproved, independentAgreement, technicalAtLeast65:checks.technicalAtLeast65,
          structureAtLeast85:checks.structureAtLeast85}),
      agreement65Structure85Separation35: result(strictPlusSeparation,
        reasonFor(strictPlusSeparation, ["evidence"]),
        {setupApproved, independentAgreement, technicalAtLeast65:checks.technicalAtLeast65,
          structureAtLeast85:checks.structureAtLeast85, separationAtLeast35:checks.separationAtLeast35}),
    },
    executionAuthority:false, liveExecution:false, paperExecutionAuthority:false,
    hypotheticalOnly:true, observedAt:new Date().toISOString(),
  });
}
export default evaluateBotEngineShadow;
