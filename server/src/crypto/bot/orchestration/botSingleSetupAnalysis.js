/**
 * AEMA Private Futures Research Bot
 * Single-symbol Setup Engine entry point.
 *
 * Reuses the same research, direction, market-evidence and V4 setup builder
 * used by Search Market. Research only: this module has no execution authority.
 */
import getBotFuturesUniverse from "../universe/botFuturesUniverseProvider.js";
import { researchBotCandidate } from "../research/botResearchOrchestrator.js";
import determineBotDirection from "../direction/botDirectionEngine.js";
import getBotFuturesExecutionMarket from "../market/botFuturesExecutionMarketProvider.js";
import buildBotFuturesSetup from "../setup/botFuturesStrategySetupBuilder.js";

function normalizeSymbol(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) throw new Error("BOT_SETUP_SYMBOL_REQUIRED");

  // Frontend normally sends SUI_USDT. Accept SUI, SUI-USDT and SUI/USDT too.
  const normalized = raw.replace(/[-/]/g, "_");
  return normalized.includes("_") ? normalized : `${normalized}_USDT`;
}

function directionOnlySetup(candidate) {
  const decision = candidate?.directionDecision ?? null;
  const researchDirection = decision?.direction === "LONG"
    ? "BULL"
    : decision?.direction === "SHORT"
      ? "BEAR"
      : decision?.direction ?? null;

  return {
    approved: false,
    status: "NO_SETUP",
    setupType: "NONE",
    symbol: candidate?.symbol ?? null,
    direction: decision?.direction ?? null,
    researchDirection,
    lifecycleStatus: "FORMING",
    lifecycle: {
      status: "FORMING",
      entryReached: false,
      currentPrice: candidate?.asset?.market?.price ?? null,
      reason: "DIRECTION_NOT_QUALIFIED",
    },
    marketRegime: null,
    strategy: null,
    entry: null,
    entryZone: null,
    stop: null,
    invalidation: null,
    target: null,
    targets: [],
    targetsDetailed: [],
    riskReward: null,
    blockers: decision?.blockers ?? ["DIRECTION_NOT_QUALIFIED"],
    executionAuthority: false,
    liveExecution: false,
  };
}

export async function analyzeBotSingleSetup(symbolInput, options = {}) {
  const startedAt = new Date().toISOString();
  const symbol = normalizeSymbol(symbolInput);

  // Use the exact same genuine Gate perpetual universe as Search Market.
  const universe = await getBotFuturesUniverse(options.universe);
  const asset = (universe?.assets ?? []).find(
    (row) => String(row?.symbol ?? "").toUpperCase() === symbol
  );

  if (!asset) {
    throw new Error(`BOT_PERPETUAL_SYMBOL_NOT_FOUND:${symbol}`);
  }

  // Single-symbol research intentionally bypasses opportunity ranking: the user
  // selected the instrument. All deeper research/direction/setup gates remain.
  const seedCandidate = {
    rank: null,
    symbol: asset.symbol,
    baseAsset: asset.baseAsset,
    quoteAsset: asset.quoteAsset,
    market: asset.market,
    asset,
    opportunityScore: null,
    dimensions: null,
    opportunity: null,
  };

  const researched = await researchBotCandidate(seedCandidate, options.research);
  const directional = determineBotDirection(researched, options.direction);

  let setup;
  let setupMarket = null;

  if (directional?.directionDecision?.qualified === true) {
    setupMarket = await getBotFuturesExecutionMarket(directional, options.setup);
    setup = buildBotFuturesSetup(directional, setupMarket, options.setup);
  } else {
    setup = directionOnlySetup(directional);
  }

  return {
    system: "AEMA_PRIVATE_SINGLE_SETUP_RESEARCH",
    status: setup?.approved === true ? "SETUP_FOUND" : (setup?.lifecycleStatus ?? "NO_SETUP"),
    symbol: asset.symbol,
    baseAsset: asset.baseAsset,
    quoteAsset: asset.quoteAsset,
    exchange: universe?.exchange ?? asset?.exchange ?? "GATE",
    marketType: universe?.marketType ?? asset?.instrumentType ?? "PERPETUAL",
    onDemand: true,
    executionDisabled: true,
    executionAuthority: false,
    liveExecution: false,
    startedAt,
    completedAt: new Date().toISOString(),
    directionDecision: directional?.directionDecision ?? null,
    researchDiagnostics: researched?.researchDiagnostics ?? null,
    setup,
    diagnosticSetup: setup,
    market: setupMarket
      ? {
          source: setupMarket?.source ?? null,
          instrumentType: setupMarket?.instrumentType ?? null,
          freshness: setupMarket?.freshness ?? null,
        }
      : null,
  };
}

export default analyzeBotSingleSetup;
