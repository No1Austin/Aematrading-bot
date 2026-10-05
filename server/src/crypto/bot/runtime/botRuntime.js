import PHASE5 from "../config/botPhase5Config.js";
import PHASE7 from "../config/botPhase7Config.js";
import manageBotOpenPositions from "../positions/botPositionManager.js";
import { getBotPaperAccount } from "../account/botPaperLedger.js";
import { assertInternalPaperMode } from "../config/botExecutionMode.js";

/*
 * Legacy position-management runtime.
 *
 * IMPORTANT:
 * This runtime NO LONGER starts new trading cycles or automatically
 * refills empty portfolio slots.
 *
 * New market discovery is user initiated through:
 *
 * POST /market/search
 *
 * New flow:
 *
 * Search Market
 *   -> Futures universe
 *   -> Eligibility
 *   -> Opportunity ranking
 *   -> Top 20 research
 *   -> Direction qualification
 *   -> Setup generation
 *   -> Setup ranking
 *   -> User chooses whether to monitor
 *
 * This runtime remains only so existing legacy paper positions can
 * continue to be observed/managed while the new research/monitoring
 * architecture is being completed.
 */

let timer = null;
let busy = false;
let cycle = 0;

/**
 * Used by private routes to prevent a market search from colliding
 * with an active legacy position-management cycle.
 */
export function isBotRuntimeBusy() {
  return busy;
}

/**
 * Indicates whether the legacy position-management timer is active.
 */
export function isBotRuntimeRunning() {
  return Boolean(timer);
}

/**
 * Shared runtime lock.
 */
export async function withBotRuntimeLock(action) {
  if (busy) {
    throw new Error("BOT_RUNTIME_BUSY_RETRY");
  }

  busy = true;

  try {
    return await action();
  } finally {
    busy = false;
  }
}

/**
 * Safe formatting for console diagnostics.
 */
const f = (value, digits = 2) =>
  Number.isFinite(Number(value))
    ? Number(value).toFixed(digits)
    : "n/a";

/**
 * Print the result of managing existing legacy paper positions.
 */
function printManagement(result) {
  cycle += 1;

  console.log(
    `\n[${new Date().toLocaleTimeString()}] POSITION CYCLE #${cycle}`
  );

  console.log(
    "------------------------------------------------------"
  );

  if (!result.results.length) {
    console.log("No open positions.");
  }

  for (const item of result.results) {
    const consistency = item.consistency || {};

    console.log(
      `${item.symbol} ${item.direction || ""} | ${item.action}` +
        `${item.reason ? ` | ${item.reason}` : ""}` +
        ` | P&L=$${f(item.unrealizedPnlUsd, 2)}` +
        ` | R=${f(item.rMultiple, 2)}` +
        ` | consistency=${
          consistency.ratio == null
            ? "n/a"
            : f(consistency.ratio, 3)
        }` +
        ` | trail=${item.trailing ? "ON" : "OFF"}` +
        `${
          item.trailingStop
            ? ` @ ${f(item.trailingStop, 8)}`
            : ""
        }`
    );

    if (item.memory) {
      console.log(
        `  TRADE MEMORY SAVED → ${item.memory.outcome}` +
          ` | P&L=$${f(item.memory.realizedPnlUsd, 2)}` +
          ` | R=${f(item.memory.rMultiple, 2)}`
      );
    }
  }

  console.log(
    `Account: equity=$${f(result.after.equityUsd, 2)}` +
      ` open=${result.after.openPositions}/` +
      `${PHASE7.portfolio.maximumOpenPositions}` +
      ` available=$${f(result.after.availableMarginUsd, 2)}`
  );
}

/**
 * Start legacy position monitoring.
 *
 * NOTE:
 * This function does NOT call runBotTradingCycle().
 * It cannot automatically create a new paper position.
 */
export function startBotPositionRuntime(options = {}) {
  assertInternalPaperMode();

  if (timer) {
    return {
      started: false,
      reason: "ALREADY_RUNNING",
    };
  }

  const intervalMs = Number(
    options.intervalMs ||
      PHASE5.consistency.intervalMs
  );

  const tick = async () => {
    if (busy) {
      return;
    }

    busy = true;

    try {
      assertInternalPaperMode();

      /*
       * Manage ONLY positions that already exist.
       *
       * No market discovery.
       * No setup generation.
       * No account-risk planning for new trades.
       * No revalidation for new orders.
       * No paper-order execution.
       */
      const managed =
        await manageBotOpenPositions(options);

      if (PHASE7.runtime.printEveryCycle) {
        printManagement(managed);
      }

      /*
       * Read the account only for diagnostics.
       *
       * Previously this section called runBotTradingCycle()
       * repeatedly until empty portfolio slots were filled.
       *
       * That behaviour has intentionally been removed.
       */
      const account = getBotPaperAccount();

      if (
        PHASE7.runtime.printEveryCycle &&
        account.openPositions <
          PHASE7.portfolio.maximumOpenPositions
      ) {
        console.log(
          `[BOT POSITION RUNTIME] Auto-refill disabled` +
            ` | positions=${account.openPositions}/` +
            `${PHASE7.portfolio.maximumOpenPositions}`
        );
      }
    } catch (error) {
      console.error(
        "[BOT POSITION RUNTIME]",
        error?.stack || error
      );

      /*
       * Keep the existing safety behaviour:
       * if execution mode is unexpectedly changed away from
       * INTERNAL_PAPER, stop this legacy runtime.
       */
      if (
        error?.message?.startsWith(
          "ALPACA_EXECUTION_NOT_ENABLED"
        ) ||
        error?.message ===
          "INVALID_BOT_EXECUTION_MODE"
      ) {
        stopBotPositionRuntime();

        console.error(
          "[BOT POSITION RUNTIME] Stopped: " +
            "execution mode is not INTERNAL_PAPER."
        );
      }
    } finally {
      busy = false;
    }
  };

  /*
   * Continue managing existing legacy positions on the configured
   * interval, but never automatically generate/open another one.
   */
  timer = setInterval(
    tick,
    intervalMs
  );

  /*
   * Run the first position-management cycle immediately.
   */
  tick();

  return {
    started: true,
    intervalMs,
    maximumOpenPositions:
      PHASE7.portfolio.maximumOpenPositions,

    autoRefill: false,
    marketSearchMode: "ON_DEMAND",

    paperOnly: true,
    liveExecution: false,
    executionAuthority: false,
  };
}

/**
 * Stop legacy position monitoring.
 */
export function stopBotPositionRuntime() {
  if (timer) {
    clearInterval(timer);
  }

  timer = null;

  return {
    stopped: true,
  };
}