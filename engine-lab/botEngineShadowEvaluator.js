/**
 * AEMA Phase 7 — read-only shadow experiment. Never authorizes orders.
 * Run alongside the current candidate pipeline and log results; do NOT use
 * `shadowEligible` to execute trades until independently forward-validated.
 */
const finite = x => typeof x === 'number' && Number.isFinite(x);
export function evaluateBotEngineShadow(candidate) {
  const d = candidate?.directionDecision ?? {};
  const direction = d.direction;
  const contributions = d.contributions ?? {};
  const side = direction === 'LONG' ? 'long' : direction === 'SHORT' ? 'short' : null;
  const technical = side && contributions.technical?.available ? contributions.technical[side] : null;
  const structure = side && contributions.marketStructure?.available ? contributions.marketStructure[side] : null;
  const bothAvailable = finite(technical) && finite(structure);
  const setups = {
    baseline: {eligible: Boolean(candidate?.setup?.approved), reason:'EXISTING_SETUP_APPROVAL_ONLY'},
    agreement60: {
      eligible: Boolean(candidate?.setup?.approved && bothAvailable && technical >= 60 && structure >= 60),
      reason: !bothAvailable ? 'MISSING_ENGINE_EVIDENCE' : 'SHADOW_COMPARISON_ONLY',
    },
    separation20: {
      eligible: Boolean(candidate?.setup?.approved && finite(d.separation) && d.separation >= 20),
      reason: 'SHADOW_COMPARISON_ONLY',
    },
  };
  return Object.freeze({
    symbol:candidate?.symbol ?? candidate?.setup?.symbol ?? null,
    direction, technical, marketStructure:structure,
    separation:finite(d.separation)?d.separation:null,
    experiments:setups,
    executionAuthority:false, liveExecution:false, paperExecutionAuthority:false,
    observedAt:new Date().toISOString(),
  });
}
export default evaluateBotEngineShadow;
