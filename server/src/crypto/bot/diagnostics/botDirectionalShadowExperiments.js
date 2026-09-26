/** Observation-only directional experiments. NEVER feed approval into paper execution. */
const finite = n => typeof n === "number" && Number.isFinite(n);
export const DIRECTION_EXPERIMENTS = Object.freeze({
  baseline: Object.freeze({}),
  agreement: Object.freeze({ requireAgreement: true }),
  agreement35: Object.freeze({ requireAgreement: true, minSeparation: 35 }),
  strongerConfirmation: Object.freeze({ requireAgreement: true, minSeparation: 35,
    minTechnicalSupport: 65, minMarketStructureSupport: 85 })
});

export function evaluateBotDirectionalShadow(candidate, experiments = DIRECTION_EXPERIMENTS) {
  const decision = candidate?.directionDecision || {};
  const contributions = decision.contributions || {};
  const direction = decision.direction;
  const support = key => {
    const evidence = contributions[key];
    if (!evidence?.available || (direction !== "LONG" && direction !== "SHORT")) return null;
    const selected = evidence[direction === "LONG" ? "long" : "short"];
    const opposite = evidence[direction === "LONG" ? "short" : "long"];
    return finite(selected) && finite(opposite) ? { selected, opposite, agrees: selected > opposite } : null;
  };
  const technical = support("technical");
  const structure = support("marketStructure");
  const evidenceAvailable = (direction === "LONG" || direction === "SHORT") && finite(decision.separation);
  const results = {};
  for (const [name, rule] of Object.entries(experiments)) {
    const reasons = [];
    if (!evidenceAvailable) reasons.push("NO_DIRECTIONAL_EVIDENCE");
    if (rule.requireAgreement && (!technical?.agrees || !structure?.agrees))
      reasons.push("TECHNICAL_STRUCTURE_AGREEMENT_REQUIRED");
    if (finite(rule.minSeparation) && !(decision.separation >= rule.minSeparation))
      reasons.push("DIRECTIONAL_SEPARATION_BELOW_THRESHOLD");
    if (finite(rule.minTechnicalSupport) && !(technical?.selected >= rule.minTechnicalSupport))
      reasons.push("TECHNICAL_SUPPORT_BELOW_THRESHOLD_OR_MISSING");
    if (finite(rule.minMarketStructureSupport) && !(structure?.selected >= rule.minMarketStructureSupport))
      reasons.push("STRUCTURE_SUPPORT_BELOW_THRESHOLD_OR_MISSING");
    results[name] = { hypotheticalQualified: reasons.length === 0, reasons };
  }
  return { symbol: candidate?.symbol ?? null, direction: direction ?? null,
    confidence: decision.confidence ?? null, separation: decision.separation ?? null,
    technical, marketStructure: structure, experiments: results,
    observationOnly: true, executionAuthority: false, liveExecution: false };
}
export default evaluateBotDirectionalShadow;
