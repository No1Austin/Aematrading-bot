/**
 * AEMA Private Futures Research Bot
 * Setup Lifecycle Engine
 *
 * Separates structural setup existence from immediate entry availability.
 * Research only. No execution authority.
 */

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveOrNull(value) {
  const n = finiteOrNull(value);
  return n !== null && n > 0 ? n : null;
}

export function resolveSetupLifecycle({ selectedResult, market, qualityApproved = false, priceGuard = null } = {}) {
  if (priceGuard?.blockers?.includes('SETUP_INVALIDATED_BY_CURRENT_PRICE')) {
    return { status: 'INVALIDATED', entryReached: false, currentPrice: priceGuard.currentPrice, reason: 'PRICE_CROSSED_STRUCTURAL_STOP' };
  }
  if (priceGuard?.blockers?.includes('SETUP_ALL_TARGETS_ALREADY_PASSED') || priceGuard?.blockers?.includes('SETUP_ENTRY_CHASE_EXCEEDS_RISK_BUDGET')) {
    return { status: 'EXPIRED', entryReached: false, currentPrice: priceGuard.currentPrice, reason: 'ENTRY_NO_LONGER_ACTIONABLE' };
  }
  if (!selectedResult) {
    return {
      status: "FORMING",
      entryReached: false,
      currentPrice: null,
      reason: "NO_STRUCTURAL_SETUP_SELECTED",
    };
  }

  const rawDirection = String(selectedResult?.direction ?? "").toUpperCase();
  const direction = rawDirection === "BULL" || rawDirection === "LONG"
    ? "BULL"
    : rawDirection === "BEAR" || rawDirection === "SHORT"
      ? "BEAR"
      : null;

  const currentPrice = direction === "BULL"
    ? positiveOrNull(market?.ask ?? market?.lastPrice ?? market?.price)
    : direction === "BEAR"
      ? positiveOrNull(market?.bid ?? market?.lastPrice ?? market?.price)
      : positiveOrNull(market?.lastPrice ?? market?.price);

  const zone = selectedResult?.entryZone ?? null;
  const low = positiveOrNull(zone?.low);
  const high = positiveOrNull(zone?.high);
  const preferredEntry = positiveOrNull(selectedResult?.preferredEntry);
  const stop = positiveOrNull(selectedResult?.stop ?? selectedResult?.invalidation?.price);
  const targets = Array.isArray(selectedResult?.targets) ? selectedResult.targets : [];
  const hasGeometry = preferredEntry !== null && stop !== null && targets.length > 0;

  if (!hasGeometry) {
    return {
      status: "FORMING",
      entryReached: false,
      currentPrice,
      reason: "STRUCTURAL_GEOMETRY_INCOMPLETE",
    };
  }

  const insideZone = currentPrice !== null && low !== null && high !== null &&
    currentPrice >= Math.min(low, high) && currentPrice <= Math.max(low, high);

  if (insideZone) {
    return {
      status: qualityApproved ? "ENTRY_READY" : "FORMING",
      entryReached: true,
      currentPrice,
      reason: qualityApproved
        ? "PRICE_REACHED_VALIDATED_ENTRY_ZONE"
        : "PRICE_REACHED_ENTRY_ZONE_PENDING_QUALITY",
    };
  }

  return {
    status: qualityApproved ? "WAITING_FOR_ENTRY" : "PLANNED",
    entryReached: false,
    currentPrice,
    reason: qualityApproved
      ? "VALID_SETUP_WAITING_FOR_PLANNED_ENTRY"
      : "STRUCTURAL_PLAN_EXISTS_PENDING_FINAL_QUALITY",
  };
}

export default resolveSetupLifecycle;
