import updateTrailingPosition from "./trailingEngine.js";
import {
  TRADE_SIDE,
} from "../config/riskConfig.js";

function formatR(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "NONE";
  }

  return `${Number(value).toFixed(2)}R`;
}

function formatPercent(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "N/A";
  }

  return `${(
    Number(value) * 100
  ).toFixed(2)}%`;
}

function runSimulation({
  name,
  side,
  entryPrice,
  initialStopPrice,
  atr,
  prices,
}) {
  console.log(
    "\n======================================",
  );

  console.log(name);

  console.log(
    "======================================",
  );

  const originalRiskPerShare =
    Math.abs(
      entryPrice -
      initialStopPrice,
    );

  /**
   * Persistent position state.
   */
  let bestPrice =
    entryPrice;

  let stopPrice =
    initialStopPrice;

  let peakR = 0;

  /**
   * IMPORTANT:
   *
   * null means profit locking has
   * never activated.
   *
   * 0 means profit locking HAS
   * activated at break-even.
   */
  let highestLockedR =
    null;

  /**
   * Preserve the source of the
   * effective stop between ticks.
   */
  let stopSource =
    "INITIAL_STOP";

  console.log({
    side,
    entryPrice,
    initialStopPrice,
    originalRiskPerShare,
    atr,
  });

  for (
    const currentPrice
    of prices
  ) {
    const result =
      updateTrailingPosition({
        side,

        entryPrice,

        currentPrice,

        previousBestPrice:
          bestPrice,

        currentStopPrice:
          stopPrice,

        initialStopPrice,

        originalRiskPerShare,

        atr,

        previousPeakR:
          peakR,

        previousHighestLockedR:
          highestLockedR,

        previousStopSource:
          stopSource,
      });

    /**
     * ======================================================
     * FAIL-SAFE / ENGINE ERROR
     * ======================================================
     */

    if (!result.approved) {
      console.error(
        "\n******** TRAILING ENGINE FAIL-SAFE ********",
      );

      console.error(
        "Errors:",
        result.errors ??
          [],
      );

      console.error(
        "Warnings:",
        result.warnings ??
          [],
      );

      console.error(
        "Protection:",
        result.protection ??
          null,
      );

      console.error(
        "Exit:",
        result.exit ??
          null,
      );

      /**
       * If the engine explicitly says
       * emergency exit is required,
       * stop the simulation immediately.
       */
      if (
        result.exit
          ?.shouldExit
      ) {
        console.error(
          "EMERGENCY EXIT REQUIRED",
        );
      }

      break;
    }

    /**
     * ======================================================
     * UPDATE PERSISTENT STATE
     * ======================================================
     */

    bestPrice =
      result.bestPrice;

    stopPrice =
      result.currentStopPrice;

    peakR =
      result.peakR;

    highestLockedR =
      result.highestLockedR;

    stopSource =
      result.stopSource ??
      stopSource;

    /**
     * ======================================================
     * OUTPUT
     * ======================================================
     */

    console.log(
      "\n----------------------------------",
    );

    console.log(
      `Price:              $${currentPrice}`,
    );

    console.log(
      `Best price:         $${result.bestPrice}`,
    );

    console.log(
      `Current R:          ${formatR(
        result.currentR,
      )}`,
    );

    console.log(
      `Peak R:             ${formatR(
        result.peakR,
      )}`,
    );

    console.log(
      `Highest locked R:   ${formatR(
        result.highestLockedR,
      )}`,
    );

    console.log(
      `Profit:             ${formatPercent(
        result.profitPercent,
      )}`,
    );

    console.log(
      `Peak profit:        ${formatPercent(
        result.peakProfitPercent,
      )}`,
    );

    console.log(
      `Current stop:       $${result.currentStopPrice}`,
    );

    console.log(
      `Stop source:        ${
        result.stopSource ??
        "NONE"
      }`,
    );

    console.log(
      `Trailing loss:      ${
        result.trailingLossActive
          ? "ACTIVE"
          : "OFF"
      }`,
    );

    console.log(
      `Trailing gain:      ${
        result.trailingGainActive
          ? "ACTIVE"
          : "OFF"
      }`,
    );

    if (
      result.profitLockLevel
    ) {
      console.log(
        `Current lock level: ${formatR(
          result
            .profitLockLevel
            .minimumLockedR,
        )}`,
      );
    }

    if (
      result.breakEvenStop !==
        null &&
      result.breakEvenStop !==
        undefined
    ) {
      console.log(
        `Break-even stop:    $${result.breakEvenStop}`,
      );
    }

    if (
      result.trailingCandidate !==
        null &&
      result.trailingCandidate !==
        undefined
    ) {
      console.log(
        `Trail candidate:    $${result.trailingCandidate}`,
      );
    }

    if (
      result.profitLockStop !==
        null &&
      result.profitLockStop !==
        undefined
    ) {
      console.log(
        `Profit-lock stop:   $${result.profitLockStop}`,
      );
    }

    console.log(
      `Exit triggered:     ${
        result.stopTriggered
          ? "YES"
          : "NO"
      }`,
    );

    if (
      Array.isArray(
        result.warnings,
      ) &&
      result.warnings
        .length > 0
    ) {
      console.log(
        "Warnings:",
        result.warnings,
      );
    }

    if (
      Array.isArray(
        result.actions,
      ) &&
      result.actions
        .length > 0
    ) {
      console.log(
        "Actions:",
        result.actions,
      );
    }

    /**
     * ======================================================
     * POSITION EXIT
     * ======================================================
     */

    if (
      result.exit
        ?.shouldExit
    ) {
      console.log(
        "\n******** POSITION EXIT ********",
      );

      console.log(
        `Exit price:         $${currentPrice}`,
      );

      console.log(
        `Reason:             ${
          result.exit.reason ??
          "UNKNOWN"
        }`,
      );

      console.log(
        `Final R:            ${formatR(
          result.currentR,
        )}`,
      );

      console.log(
        `Peak R achieved:    ${formatR(
          result.peakR,
        )}`,
      );

      console.log(
        `Highest locked R:   ${formatR(
          result.highestLockedR,
        )}`,
      );

      console.log(
        `Final stop:         $${result.currentStopPrice}`,
      );

      console.log(
        `Final stop source:  ${
          result.stopSource ??
          "UNKNOWN"
        }`,
      );

      console.log(
        `Final profit:       ${formatPercent(
          result.profitPercent,
        )}`,
      );

      break;
    }
  }
}

/**
 * ============================================================
 * LONG SIMULATION
 * ============================================================
 *
 * Entry = $100
 * Stop  = $98
 *
 * Initial risk:
 *
 * 1R = $2
 *
 * Expected behaviour:
 *
 * - Initial stop remains $98.
 * - Trailing protection activates.
 * - Peak R increases as price rises.
 * - Highest locked R never decreases.
 * - Stop never loosens.
 * - Price reverses and eventually exits.
 */

runSimulation({
  name:
    "LONG — TRAILING LOSS + TRAILING GAIN",

  side:
    TRADE_SIDE.LONG,

  entryPrice: 100,

  initialStopPrice: 98,

  atr: 1,

  prices: [
    99,
    100,
    101,
    102,
    103,
    104,
    106,
    108,
    110,
    109,
    108,
    107,
    106,
  ],
});

/**
 * ============================================================
 * SHORT SIMULATION
 * ============================================================
 *
 * Entry = $100
 * Stop  = $102
 *
 * Initial risk:
 *
 * 1R = $2
 *
 * Expected behaviour:
 *
 * - Initial stop remains $102.
 * - Trailing protection activates.
 * - Peak R increases as price falls.
 * - Highest locked R never decreases.
 * - Stop never loosens.
 * - Price reverses upward and eventually exits.
 */

runSimulation({
  name:
    "SHORT — TRAILING LOSS + TRAILING GAIN",

  side:
    TRADE_SIDE.SHORT,

  entryPrice: 100,

  initialStopPrice: 102,

  atr: 1,

  prices: [
    101,
    100,
    99,
    98,
    97,
    96,
    94,
    92,
    90,
    91,
    92,
    93,
    94,
  ],
});