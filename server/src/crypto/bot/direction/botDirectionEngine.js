/** Comparative direction engine with observation-only agreement diagnostics.
 * Existing directionDecision fields and order-selection semantics are preserved.
 */
import BOT_CONFIG from "../config/botConfig.js";
const finite = value => typeof value === "number" && Number.isFinite(value);
const round = value => Number(value.toFixed(4));

export function determineBotDirection(candidate, options = {}) {
  const weights = { ...BOT_CONFIG.research.weights, ...(options.weights || {}) };
  const engines = candidate?.engines || {};
  let longWeighted = 0, shortWeighted = 0, weightUsed = 0, confidenceWeighted = 0;
  const contributions = {};

  for (const [key, weight] of Object.entries(weights)) {
    if (!finite(weight) || weight < 0) throw new Error(`INVALID_DIRECTION_WEIGHT:${key}`);
    const engine = engines[key];
    if (!engine?.available || !finite(engine.long) || !finite(engine.short)) {
      contributions[key] = { available: false, weight };
      continue;
    }
    longWeighted += engine.long * weight;
    shortWeighted += engine.short * weight;
    confidenceWeighted += (finite(engine.confidence) ? engine.confidence : 0) * weight;
    weightUsed += weight;
    contributions[key] = {
      available: true, weight, long: engine.long, short: engine.short,
      confidence: engine.confidence ?? null
    };
  }

  if (weightUsed <= 0) return { ...candidate, directionDecision: {
    direction: null, longScore: null, shortScore: null, separation: null,
    confidence: 0, availableWeight: 0, reason: "NO_DIRECTIONAL_EVIDENCE",
    contributions, diagnostics: { observationOnly: true, technicalAgreement: null,
      marketStructureAgreement: null, independentAgreement: false,
      unavailable: Object.keys(contributions) },
    executionAuthority: false, liveExecution: false
  }};

  const longScore = longWeighted / weightUsed;
  const shortScore = shortWeighted / weightUsed;
  const direction = longScore >= shortScore ? "LONG" : "SHORT";
  const supports = key => {
    const evidence = contributions[key];
    if (!evidence?.available) return null;
    const selected = direction === "LONG" ? evidence.long : evidence.short;
    const opposite = direction === "LONG" ? evidence.short : evidence.long;
    return { selected: round(selected), opposite: round(opposite),
      agrees: selected > opposite, separation: round(selected - opposite) };
  };
  const technical = supports("technical");
  const marketStructure = supports("marketStructure");
  return { ...candidate, directionDecision: {
    direction, longScore: round(longScore), shortScore: round(shortScore),
    separation: round(Math.abs(longScore - shortScore)),
    confidence: round(confidenceWeighted / weightUsed),
    availableWeight: round(weightUsed), contributions,
    diagnostics: { observationOnly: true, technical, marketStructure,
      independentAgreement: technical?.agrees === true && marketStructure?.agrees === true,
      unavailable: Object.keys(contributions).filter(key => !contributions[key].available) },
    executionAuthority: false, liveExecution: false
  }};
}
export default determineBotDirection;
