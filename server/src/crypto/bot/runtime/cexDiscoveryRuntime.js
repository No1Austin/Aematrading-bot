/**
 * AEMA Independent CEX Discovery Runtime
 *
 * Research/discovery only.
 *
 * IMPORTANT:
 * - Runs independently from the private /bot trading runtime.
 * - Does NOT open orders.
 * - Does NOT read portfolio capacity.
 * - Does NOT call account risk, final order revalidation, or paper execution.
 * - Continues discovering markets even when the private bot has 3/3 positions.
 * - Internal legacy field names are preserved where required by Phase 7 contracts.
 * - Public telemetry uses Bullish Direction / Bearish Direction and does not expose
 *   "opportunity" terminology.
 */

import getBotFuturesUniverse
  from "../universe/botFuturesUniverseProvider.js";

import filterBotHardEligibleAssets
  from "../filters/botHardEligibilityFilter.js";

import rankBotOpportunities
  from "../filters/botOpportunityFilter.js";

import {
  researchBotTop20,
} from "../research/botResearchOrchestrator.js";

import determineBotDirection
  from "../direction/botDirectionEngine.js";

import rankBotResearchCandidates
  from "../ranking/botResearchRankingEngine.js";

import getBotFuturesExecutionMarket
  from "../market/botFuturesExecutionMarketProvider.js";

import buildBotFuturesSetup
  from "../setup/botFuturesSetupBuilder.js";

import rankBotExecutionSetups
  from "../ranking/botExecutionRankingEngine.js";

import applyTradeLearning
  from "../learning/botTradeLearningEngine.js";


const DEFAULT_INTERVAL_MS =
  Number(
    process.env
      .AEMA_CEX_DISCOVERY_INTERVAL_MS ??
      60_000,
  );

const MAX_TERMINAL_EVENTS = 80;

let timer = null;
let busy = false;
let cycleCount = 0;

const state = {
  system:
    "AEMA_CEX_DISCOVERY",

  status:
    "IDLE",

  active:
    false,

  runningCycle:
    false,

  cycleCount:
    0,

  startedAt:
    null,

  lastCycleStartedAt:
    null,

  lastCycleCompletedAt:
    null,

  nextCycleAt:
    null,

  lastError:
    null,

  counts: {
    universe:
      0,

    hardEligible:
      0,

    marketFiltered:
      0,

    selectedForResearch:
      0,

    researchCompleted:
      0,

    researchFailed:
      0,

    strongestCandidates:
      0,

    setupsBuilt:
      0,

    executableSetups:
      0,

    bestSetups:
      0,
  },

  top20:
    [],

  top10:
    [],

  bestSetups:
    [],

  strongestSetup:
    null,

  events:
    [],

  paperOnly:
    true,

  executionAuthority:
    false,

  liveExecution:
    false,
};


function nowIso() {
  return new Date()
    .toISOString();
}


function finiteNumber(
  value,
  fallback = null,
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}


function publicDirection(
  direction,
) {
  const normalized =
    String(
      direction ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    normalized === "LONG"
  ) {
    return "Bullish Direction";
  }

  if (
    normalized === "SHORT"
  ) {
    return "Bearish Direction";
  }

  return "Direction unavailable";
}


function pushEvent(
  type,
  message,
  data = null,
) {
  const event = {
    id:
      `${
        Date.now()
      }-${
        Math.random()
          .toString(36)
          .slice(2, 8)
      }`,

    timestamp:
      nowIso(),

    type,

    message,

    data,
  };

  state.events =
    [
      ...state.events,
      event,
    ]
      .slice(
        -MAX_TERMINAL_EVENTS,
      );

  return event;
}


function toTop20Row(
  row,
  index,
) {
  return {
    rank:
      index + 1,

    symbol:
      row?.asset?.symbol ??
      null,

    baseAsset:
      row?.asset?.baseAsset ??
      null,

    quoteAsset:
      row?.asset?.quoteAsset ??
      null,

    // Keep these internal properties because the existing
    // Phase 7 research orchestrator expects them.
    opportunityScore:
      row?.opportunity
        ?.opportunityScore ??
      null,

    dimensions:
      row?.opportunity
        ?.dimensions ??
      null,

    market:
      row?.asset?.market ??
      null,

    asset:
      row?.asset ??
      null,

    opportunity:
      row?.opportunity ??
      null,
  };
}


function toPublicCandidate(
  candidate,
  fallbackRank = null,
) {
  const internalDirection =
    candidate
      ?.directionDecision
      ?.direction ??
    candidate
      ?.setup
      ?.direction ??
    candidate
      ?.direction ??
    null;

  return {
    rank:
      candidate
        ?.executionRank ??
      candidate
        ?.researchRank ??
      fallbackRank,

    symbol:
      candidate?.symbol ??
      null,

    direction:
      publicDirection(
        internalDirection,
      ),

    executionScore:
      finiteNumber(
        candidate
          ?.learnedExecutionScore ??
        candidate
          ?.executionRankScore,
      ),

    researchScore:
      finiteNumber(
        candidate
          ?.researchRankScore ??
        candidate
          ?.researchScore,
      ),

    riskReward:
      finiteNumber(
        candidate
          ?.setup
          ?.riskReward ??
        candidate
          ?.riskReward,
      ),

    entry:
      finiteNumber(
        candidate
          ?.setup
          ?.entry,
      ),

    stop:
      finiteNumber(
        candidate
          ?.setup
          ?.stop,
      ),

    target:
      finiteNumber(
        candidate
          ?.setup
          ?.target,
      ),

    spreadPercent:
      finiteNumber(
        candidate
          ?.market
          ?.spreadPercent ??
        candidate
          ?.setup
          ?.spreadPercent,
      ),

    approved:
      candidate
        ?.setup
        ?.approved ===
      true,
  };
}


function buildPublicSnapshot() {
  return {
    system:
      state.system,

    status:
      state.status,

    active:
      state.active,

    runningCycle:
      state.runningCycle,

    cycleCount:
      state.cycleCount,

    startedAt:
      state.startedAt,

    lastCycleStartedAt:
      state.lastCycleStartedAt,

    lastCycleCompletedAt:
      state.lastCycleCompletedAt,

    nextCycleAt:
      state.nextCycleAt,

    lastError:
      state.lastError,

    counts: {
      ...state.counts,
    },

    top20:
      state.top20,

    top10:
      state.top10,

    bestSetups:
      state.bestSetups,

    strongestSetup:
      state.strongestSetup,

    events:
      state.events,

    mode:
      "RESEARCH_ONLY",

    paperOnly:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,

    generatedAt:
      nowIso(),
  };
}


function scheduleNextTimestamp(
  intervalMs,
) {
  state.nextCycleAt =
    new Date(
      Date.now() +
      intervalMs,
    )
      .toISOString();
}


export function getCexDiscoveryState() {
  return buildPublicSnapshot();
}


export async function runCexDiscoveryCycle(
  options = {},
) {
  if (
    busy
  ) {
    return {
      ...buildPublicSnapshot(),

      skipped:
        true,

      reason:
        "DISCOVERY_CYCLE_ALREADY_RUNNING",
    };
  }

  busy =
    true;

  state.runningCycle =
    true;

  state.status =
    "RUNNING";

  state.lastError =
    null;

  state.lastCycleStartedAt =
    nowIso();

  cycleCount +=
    1;

  state.cycleCount =
    cycleCount;

  pushEvent(
    "CYCLE_START",
    `Starting CEX discovery cycle #${cycleCount}`,
  );

  try {
    /**
     * =========================================================
     * 1. CEX FUTURES UNIVERSE
     * =========================================================
     */

    const universe =
      await getBotFuturesUniverse(
        options.universe,
      );

    state.counts.universe =
      universe
        ?.assets
        ?.length ??
      0;

    pushEvent(
      "UNIVERSE",
      `${
        state.counts.universe
      } CEX futures instruments discovered`,
    );


    /**
     * =========================================================
     * 2. HARD MARKET ELIGIBILITY
     * =========================================================
     */

    const eligibility =
      filterBotHardEligibleAssets(
        universe.assets,
        options.eligibility,
      );

    state.counts.hardEligible =
      eligibility
        ?.approved
        ?.length ??
      0;

    pushEvent(
      "ELIGIBILITY",
      `${
        state.counts.hardEligible
      } passed market eligibility`,
    );


    /**
     * =========================================================
     * 3. MARKET FILTERS
     * =========================================================
     *
     * The underlying Phase 7 module retains its historical
     * internal function/field names. Public telemetry deliberately
     * calls this stage "Market Filters".
     */

    const marketSelection =
      rankBotOpportunities(
        eligibility.approved,
        options.marketFilters ??
        options.opportunity,
      );

    state.counts.marketFiltered =
      marketSelection
        ?.qualified
        ?.length ??
      0;

    pushEvent(
      "MARKET_FILTERS",
      "Market filters completed: volume · liquidity · volatility · momentum · activity",
      {
        passed:
          state.counts
            .marketFiltered,
      },
    );


    /**
     * =========================================================
     * 4. TOP 20 FOR RESEARCH
     * =========================================================
     */

    const top20 =
      marketSelection
        .topCandidates
        .map(
          toTop20Row,
        );

    state.counts
      .selectedForResearch =
      top20.length;

    state.top20 =
      top20.map(
        row => ({
          rank:
            row.rank,

          symbol:
            row.symbol,
        }),
      );

    pushEvent(
      "TOP_20",
      `${
        top20.length
      } tokens selected for research`,
      {
        symbols:
          state.top20
            .map(
              row =>
                row.symbol,
            ),
      },
    );


    /**
     * =========================================================
     * 5. RESEARCH ENGINES
     * =========================================================
     */

    const research =
      await researchBotTop20(
        top20,
        options.research,
      );

    state.counts
      .researchCompleted =
      research.completed ??
      research
        ?.researched
        ?.length ??
      0;

    state.counts
      .researchFailed =
      research
        ?.failed
        ?.length ??
      0;

    pushEvent(
      "RESEARCH",
      `Research engines completed for ${
        state.counts
          .researchCompleted
      } tokens`,
      {
        completed:
          state.counts
            .researchCompleted,

        failed:
          state.counts
            .researchFailed,
      },
    );


    /**
     * =========================================================
     * 6. DIRECTION
     * =========================================================
     */

    const directional =
      research.researched.map(
        row =>
          determineBotDirection(
            row,
            options.direction,
          ),
      );

    pushEvent(
      "DIRECTION",
      "Bullish / Bearish direction analysis completed",
    );


    /**
     * =========================================================
     * 7. TOP 10 RESEARCH CANDIDATES
     * =========================================================
     */

    const researchRanking =
      rankBotResearchCandidates(
        directional,
        options.ranking,
      );

    state.counts
      .strongestCandidates =
      researchRanking
        ?.top10
        ?.length ??
      0;

    state.top10 =
      researchRanking
        .top10
        .map(
          (
            candidate,
            index,
          ) => {
            const internalDirection =
              candidate
                ?.directionDecision
                ?.direction ??
              candidate
                ?.direction ??
              null;

            return {
              rank:
                index + 1,

              symbol:
                candidate
                  ?.symbol ??
                null,

              direction:
                publicDirection(
                  internalDirection,
                ),

              researchScore:
                finiteNumber(
                  candidate
                    ?.researchRankScore ??
                  candidate
                    ?.researchScore,
                ),
            };
          },
        );

    pushEvent(
      "TOP_10",
      `${
        state.counts
          .strongestCandidates
      } strongest research candidates identified`,
    );


    /**
     * =========================================================
     * 8. BUILD FUTURES SETUPS
     * =========================================================
     */

    const setups =
      [];

    const setupFailures =
      [];

    for (
      const candidate
      of researchRanking.top10
    ) {
      try {
        const market =
          await getBotFuturesExecutionMarket(
            candidate,
            options.setup,
          );

        setups.push(
          buildBotFuturesSetup(
            candidate,
            market,
            options.setup,
          ),
        );
      } catch (
        error
      ) {
        setupFailures.push({
          symbol:
            candidate
              ?.symbol ??
            null,

          error:
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
        });
      }
    }

    state.counts
      .setupsBuilt =
      setups.length;


    /**
     * =========================================================
     * 9. EXECUTION-QUALITY COMPARISON
     * =========================================================
     *
     * This is still research-only here. No order is created.
     */

    const executionRanking =
      rankBotExecutionSetups(
        setups,
        options.executionRanking,
      );

    state.counts
      .executableSetups =
      executionRanking
        ?.executable
        ?.length ??
      0;


    /**
     * =========================================================
     * 10. TRADE MEMORY INFLUENCE
     * =========================================================
     *
     * Existing closed-trade memory may influence comparative
     * ordering, but it is not a hard gate.
     */

    const learningRanking =
      applyTradeLearning(
        executionRanking.executable,
        options.learning,
      );


    /**
     * =========================================================
     * 11. BEST 5
     * =========================================================
     */

    const bestFive =
      learningRanking
        .ranked
        .slice(
          0,
          5,
        );

    state.counts
      .bestSetups =
      bestFive.length;

    state.bestSetups =
      bestFive.map(
        (
          candidate,
          index,
        ) =>
          toPublicCandidate(
            candidate,
            index + 1,
          ),
      );

    pushEvent(
      "BEST_5",
      `${
        bestFive.length
      } best executable setups selected`,
      {
        candidates:
          state.bestSetups,
      },
    );

    for (
      const candidate
      of state.bestSetups
    ) {
      pushEvent(
        "CANDIDATE",
        `#${
          candidate.rank
        } ${
          candidate.symbol
        } · ${
          candidate.direction
        } · R:R ${
          candidate.riskReward ??
          "n/a"
        }`,
        candidate,
      );
    }


    /**
     * =========================================================
     * 12. STRONGEST CURRENT SETUP
     * =========================================================
     *
     * This is NOT an order approval.
     * Account/risk/final execution checks belong to private /bot.
     */

    state.strongestSetup =
      state.bestSetups[0] ??
      null;

    if (
      state.strongestSetup
    ) {
      pushEvent(
        "STRONGEST_SETUP",
        `${
          state.strongestSetup
            .symbol
        } · ${
          state.strongestSetup
            .direction
        } · strongest current setup`,
        state.strongestSetup,
      );
    } else {
      pushEvent(
        "NO_EXECUTABLE_SETUP",
        "No executable setup is currently available",
      );
    }

    state.status =
      "READY";

    state.lastCycleCompletedAt =
      nowIso();

    return {
      ...buildPublicSnapshot(),

      setupFailures,
    };
  } catch (
    error
  ) {
    state.status =
      "ERROR";

    state.lastError =
      error instanceof Error
        ? error.message
        : String(
            error,
          );

    state.lastCycleCompletedAt =
      nowIso();

    pushEvent(
      "ERROR",
      state.lastError,
    );

    throw error;
  } finally {
    busy =
      false;

    state.runningCycle =
      false;
  }
}


export function startCexDiscoveryRuntime(
  options = {},
) {
  if (
    timer
  ) {
    return Promise.resolve({
      started:
        false,

      reason:
        "ALREADY_RUNNING",

      intervalMs:
        DEFAULT_INTERVAL_MS,

      state:
        buildPublicSnapshot(),
    });
  }

  const requestedInterval =
    Number(
      options.intervalMs ??
      DEFAULT_INTERVAL_MS,
    );

  const intervalMs =
    Number.isFinite(
      requestedInterval,
    ) &&
    requestedInterval >=
      10_000
      ? requestedInterval
      : DEFAULT_INTERVAL_MS;

  state.active =
    true;

  state.startedAt =
    state.startedAt ??
    nowIso();

  state.status =
    "STARTING";

  pushEvent(
    "RUNTIME_START",
    "CEX Discovery runtime started",
  );

  const tick =
    async () => {
      if (
        !state.active
      ) {
        return;
      }

      if (
        busy
      ) {
        pushEvent(
          "CYCLE_SKIPPED",
          "Previous CEX discovery cycle is still running",
        );

        scheduleNextTimestamp(
          intervalMs,
        );

        return;
      }

      try {
        await runCexDiscoveryCycle(
          options,
        );
      } catch (
        error
      ) {
        console.error(
          "[CEX_DISCOVERY_RUNTIME]",
          error
            ?.stack ??
          error,
        );
      } finally {
        if (
          state.active
        ) {
          scheduleNextTimestamp(
            intervalMs,
          );
        }
      }
    };

  timer =
    setInterval(
      () => {
        void tick();
      },
      intervalMs,
    );

  scheduleNextTimestamp(
    intervalMs,
  );

  // Start the first cycle immediately without blocking server startup.
  void tick();

  return Promise.resolve({
    started:
      true,

    intervalMs,

    researchOnly:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,
  });
}


export async function stopCexDiscoveryRuntime() {
  state.active =
    false;

  state.nextCycleAt =
    null;

  if (
    timer
  ) {
    clearInterval(
      timer,
    );

    timer =
      null;
  }

  state.status =
    busy
      ? "STOPPING"
      : "STOPPED";

  pushEvent(
    "RUNTIME_STOP",
    "CEX Discovery runtime stopped",
  );

  return {
    stopped:
      true,

    runningCycle:
      busy,

    state:
      buildPublicSnapshot(),
  };
}


export default {
  start:
    startCexDiscoveryRuntime,

  stop:
    stopCexDiscoveryRuntime,

  runOnce:
    runCexDiscoveryCycle,

  getState:
    getCexDiscoveryState,
};
