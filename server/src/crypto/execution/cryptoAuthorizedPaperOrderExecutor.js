/**
 * AEMA CRYPTO — AUTHORIZED PAPER ORDER EXECUTOR
 * Phase 6.55 / 6.56
 *
 * Consumes ONLY Phase 6.54-authorized candidates.
 * Builds bounded paper orders, submits only to the paper adapter,
 * synchronizes ACTUAL fills to the ledger, and adopts exchange truth
 * into the stateful runtime.
 *
 * NO LIVE EXECUTION PATH EXISTS HERE.
 */

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value) {
  const n = finite(value);
  return n === null ? null : Math.max(0, n);
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function block(reason, candidate = null, detail = null) {
  return {
    approved: false,
    status: "PAPER_ORDER_BLOCKED",
    reason,
    detail,
    symbol: upper(candidate?.paperExecutionGate?.symbol ?? candidate?.symbol) || null,
    paperExecutionAuthority: false,
    executionAuthority: false,
    liveExecution: false,
  };
}

function sideFor(direction) {
  if (direction === "LONG") return "BUY";
  if (direction === "SHORT") return "SELL";
  return null;
}

function safeClientPart(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
}

function buildClientOrderId(candidate) {
  const gate = candidate?.paperExecutionGate ?? {};
  const measuredAt =
    candidate?.freshRevalidationEvidence?.measurements?.measuredAt ?? "";
  const stamp = Date.parse(measuredAt);
  return [
    "AEMA",
    safeClientPart(gate.symbol),
    safeClientPart(gate.decision),
    Number.isFinite(stamp) ? stamp : "NA",
  ].join("-");
}

function newFillsSince(beforeSnapshot, afterSnapshot) {
  const before = new Set(
    (Array.isArray(beforeSnapshot?.fills) ? beforeSnapshot.fills : [])
      .map(fill => String(fill?.fillId ?? ""))
      .filter(Boolean),
  );
  return (Array.isArray(afterSnapshot?.fills) ? afterSnapshot.fills : [])
    .filter(fill => fill?.fillId && !before.has(String(fill.fillId)));
}

export async function executeAuthorizedCryptoPaperCandidate({
  candidate,
  ledger,
  runtime,
  exchange,
  maximumPositionNotionalPercent = 2,
} = {}) {
  const gate = candidate?.paperExecutionGate ?? {};

  if (
    gate?.approved !== true ||
    gate?.paperExecutionAuthority !== true ||
    gate?.nextStage !== "PAPER_ORDER_CONSTRUCTION"
  ) {
    return block("PAPER_EXECUTION_AUTHORITY_REQUIRED", candidate);
  }

  if (
    candidate?.finalRevalidation?.approved !== true ||
    candidate?.finalRevalidation?.nextStage !== "PAPER_EXECUTION_AUTHORITY_GATE"
  ) {
    return block("FINAL_REVALIDATION_CONTRACT_REQUIRED", candidate);
  }

  if (
    candidate?.freshRevalidationEvidence?.freshnessAuthorized !== true ||
    candidate?.freshRevalidationEvidence?.batchFreshness?.authorized !== true
  ) {
    return block("FRESHNESS_AUTHORITY_REQUIRED", candidate);
  }

  if (
    !exchange ||
    exchange.paperExecution !== true ||
    exchange.liveExecution === true ||
    typeof exchange.submitOrder !== "function" ||
    typeof exchange.getSnapshot !== "function" ||
    typeof exchange.getPosition !== "function"
  ) {
    return block("PAPER_EXCHANGE_REQUIRED", candidate);
  }

  if (
    !runtime ||
    runtime.paperOnly !== true ||
    runtime.liveExecutionEnabled === true ||
    typeof runtime.beginCycle !== "function" ||
    typeof runtime.registerOrder !== "function" ||
    typeof runtime.updateOrderState !== "function" ||
    typeof runtime.adoptExchangePosition !== "function"
  ) {
    return block("PAPER_RUNTIME_REQUIRED", candidate);
  }

  if (!ledger || typeof ledger.applyFill !== "function" || typeof ledger.getSnapshot !== "function") {
    return block("PAPER_LEDGER_REQUIRED", candidate);
  }

  const symbol = upper(gate.symbol);
  const direction = upper(gate.decision);
  const side = sideFor(direction);
  const price = positive(
    candidate?.freshRevalidationEvidence?.measurements?.priceUsd ??
    candidate?.finalRevalidation?.market?.priceUsd,
  );

  if (!symbol || !side || price === null || price <= 0) {
    return block("VALID_ORDER_MARKET_INPUT_REQUIRED", candidate);
  }

  const account = ledger.getSnapshot();
  const equity = positive(account?.equity);
  if (equity === null || equity <= 0) {
    return block("POSITIVE_ACCOUNT_EQUITY_REQUIRED", candidate);
  }

  const pct = positive(maximumPositionNotionalPercent);
  if (pct === null || pct <= 0 || pct > 100) {
    return block("INVALID_POSITION_NOTIONAL_LIMIT", candidate);
  }

  // Cap TOTAL per-symbol notional, not each scan's increment.
  const existing = ledger.getPosition?.(symbol) ?? null;
  const existingQty = positive(existing?.quantity) ?? 0;
  const existingDirection = upper(existing?.direction || "FLAT");

  if (
    existingQty > 0 &&
    existingDirection !== "FLAT" &&
    existingDirection !== direction
  ) {
    return block("DIRECT_POSITION_FLIP_BLOCKED", candidate);
  }

  const maximumNotionalUsd = equity * (pct / 100);
  const existingNotionalUsd = existingQty * price;
  const remainingNotionalUsd = Math.max(0, maximumNotionalUsd - existingNotionalUsd);
  const quantity = remainingNotionalUsd / price;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return block(
      "POSITION_NOTIONAL_LIMIT_REACHED",
      candidate,
      { maximumNotionalUsd, existingNotionalUsd },
    );
  }

  const clientOrderId = buildClientOrderId(candidate);
  const action = gate.action === "ADD_EXPOSURE" ? "ADD_EXPOSURE" : "OPEN_POSITION";
  const intent = action === "ADD_EXPOSURE" ? "INCREASE" : "OPEN";
  const cycleKey = `PAPER:${clientOrderId}`;

  const cycle = runtime.beginCycle({
    symbol,
    cycleKey,
    action,
    requestedDirection: direction,
  });

  if (cycle?.approved !== true) {
    return block(cycle?.blocker || "RUNTIME_CYCLE_BLOCKED", candidate);
  }

  let cycleCompleted = false;

  try {
    const registration = runtime.registerOrder({
      symbol,
      order: {
        clientOrderId,
        status: "CREATED",
        side,
        requestedQuantity: quantity,
        price,
        paperOnly: true,
      },
    });

    if (registration?.approved !== true) {
      runtime.failCycle({ symbol, cycleKey, error: registration?.blocker });
      return block(registration?.blocker || "ORDER_REGISTRATION_BLOCKED", candidate);
    }

    const before = exchange.getSnapshot();

    const submission = await exchange.submitOrder({
      symbol,
      side,
      quantity,
      price,
      clientOrderId,
      reduceOnly: false,
    });

    const order = submission?.order ?? null;

    runtime.updateOrderState({
      symbol,
      executionState: {
        ...(order ?? {}),
        status: submission?.status ?? order?.status ?? "FAILED",
      },
    });

    if (submission?.accepted !== true || !order) {
      runtime.completeCycle({
        symbol,
        cycleKey,
        decision: {
          action,
          direction,
          status: submission?.status ?? "REJECTED",
        },
      });
      cycleCompleted = true;
      return block(
        submission?.reason || "PAPER_EXCHANGE_REJECTED_ORDER",
        candidate,
        { status: submission?.status ?? null },
      );
    }

    const after = exchange.getSnapshot();
    const fills = newFillsSince(before, after)
      .filter(fill => fill?.clientOrderId === clientOrderId);

    const ledgerResults = [];

    for (const fill of fills) {
      const ledgerResult = ledger.applyFill({
        fillId: fill.fillId,
        symbol,
        intent,
        direction,
        side: fill.side ?? side,
        filledQuantity: fill.quantity,
        fillPrice: fill.price,
        timestamp: fill.timestamp ?? null,
      });
      ledgerResults.push(ledgerResult);

      if (ledgerResult?.approved !== true) {
        throw new Error(
          `LEDGER_FILL_SYNC_FAILED:${ledgerResult?.blocker ?? ledgerResult?.status ?? "UNKNOWN"}`,
        );
      }
    }

    const exchangePosition = await exchange.getPosition(symbol);
    runtime.adoptExchangePosition({
      symbol,
      exchangePosition: {
        ...exchangePosition,
        exposure:
          equity > 0 && exchangePosition?.quantity > 0
            ? (exchangePosition.quantity * price) / equity
            : 0,
      },
    });

    runtime.completeCycle({
      symbol,
      cycleKey,
      decision: {
        action,
        direction,
        paperOrderId: order?.orderId ?? null,
        clientOrderId,
        status: order?.status ?? submission?.status ?? null,
      },
    });
    cycleCompleted = true;

    if (["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "FAILED"].includes(upper(order?.status))) {
      runtime.clearTerminalOrder?.({ symbol });
    }

    return {
      approved: true,
      status:
        fills.length > 0
          ? "PAPER_ORDER_EXECUTED"
          : "PAPER_ORDER_ACCEPTED_NO_FILL",
      symbol,
      direction,
      side,
      action,
      sizing: {
        equity,
        maximumPositionNotionalPercent: pct,
        maximumNotionalUsd,
        existingNotionalUsd,
        requestedIncrementNotionalUsd: remainingNotionalUsd,
        requestedQuantity: quantity,
        priceUsd: price,
      },
      order,
      fills,
      ledgerResults,
      position: await exchange.getPosition(symbol),
      nextStage: "PAPER_POSITION_MONITORING",
      paperExecutionAuthority: false,
      executionAuthority: false,
      liveExecution: false,
    };
  } catch (error) {
    if (!cycleCompleted) {
      runtime.failCycle({ symbol, cycleKey, error });
    }
    return block(
      "PAPER_EXECUTION_FAILED",
      candidate,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function executeAuthorizedCryptoPaperCandidates({
  candidates = [],
  ledger,
  runtime,
  exchange,
  maximumOrdersPerScan = 1,
  maximumPositionNotionalPercent = 2,
} = {}) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const limit = Math.max(0, Math.trunc(Number(maximumOrdersPerScan) || 0));
  const selected = rows.slice(0, limit);
  const results = [];

  for (const candidate of selected) {
    results.push(
      await executeAuthorizedCryptoPaperCandidate({
        candidate,
        ledger,
        runtime,
        exchange,
        maximumPositionNotionalPercent,
      }),
    );
  }

  return {
    approved: true,
    status: "PAPER_EXECUTION_BATCH_COMPLETE",
    authorizedCandidates: rows.length,
    attempted: selected.length,
    executed: results.filter(row => row?.status === "PAPER_ORDER_EXECUTED").length,
    blocked: results.filter(row => row?.approved !== true).length,
    results,
    paperExecution: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export default executeAuthorizedCryptoPaperCandidates;
