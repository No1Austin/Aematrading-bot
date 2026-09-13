/**
 * AEMA CRYPTO
 * Phase 5.27
 *
 * LEDGER-AWARE PAPER RUNTIME
 *
 * Wraps the integrated paper runtime and automatically
 * synchronizes actual paper fills into the paper account ledger.
 *
 * NO live execution authority.
 */

import syncPaperExecutionToLedger
  from "../account/cryptoPaperExecutionLedgerSync.js";

import {
  buildCryptoPaperAccountSnapshot,
} from "./cryptoPaperAccountSnapshot.js";

export function createLedgerAwarePaperRuntime({
  integratedRuntime,
  ledger,
} = {}) {
  if (!integratedRuntime) {
    throw new Error(
      "INTEGRATED_RUNTIME_REQUIRED",
    );
  }

  if (!ledger) {
    throw new Error(
      "PAPER_ACCOUNT_LEDGER_REQUIRED",
    );
  }

  if (
    integratedRuntime
      ?.liveExecution ===
      true
  ) {
    throw new Error(
      "LIVE_RUNTIME_NOT_ALLOWED",
    );
  }

  async function processMarketSnapshot(
    args = {},
  ) {
    const result =
      await integratedRuntime
        .processMarketSnapshot(
          args,
        );

    if (
      !result ||
      !result.paperCycle
    ) {
      return {
        ...result,

        ledgerSync:
          null,

        accountSnapshot:
          buildCryptoPaperAccountSnapshot({
            ledger,
          }),

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    const command =
      result
        ?.paperCycle
        ?.command ??
      result
        ?.paperCycle
        ?.executionCommand ??
      null;

    const executionState =
      result
        ?.paperCycle
        ?.executionState ??
      null;

    const paperResult =
      result
        ?.paperCycle
        ?.paperResult ??
      null;

    const ledgerSync =
      syncPaperExecutionToLedger({
        ledger,

        symbol:
          result?.symbol ??
          args?.symbol,

        lifecycle:
          result?.lifecycle,

        command,

        executionState,

        paperResult,
      });

    return {
      ...result,

      ledgerSync,

      accountSnapshot:
        buildCryptoPaperAccountSnapshot({
          ledger,
        }),

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  function getAccountSnapshot(
    marketPrices = {},
  ) {
    return buildCryptoPaperAccountSnapshot({
      ledger,
      marketPrices,
    });
  }

  return {
    processMarketSnapshot,

    getAccountSnapshot,

    ledger,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}

export default
  createLedgerAwarePaperRuntime;