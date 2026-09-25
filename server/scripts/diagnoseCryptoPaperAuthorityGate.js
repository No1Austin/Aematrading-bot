/**
 * ============================================================
 * AEMA CRYPTO — PHASE 6.19
 * CONTROLLED PAPER AUTHORITY DIAGNOSTIC
 * ============================================================
 *
 * Pure gate diagnostic:
 * - no provider calls
 * - no position sizing
 * - no order construction
 * - no exchange submission
 * - no live execution
 */

import {
  evaluateCryptoPaperExecutionAuthority,
} from "../src/crypto/execution/cryptoPaperExecutionAuthorityGate.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeCandidate({
  type = "CEX",
  decision = "LONG",
  measuredAt = new Date().toISOString(),
  q2Qualified = true,
  revalidated = true,
} = {}) {
  const isCex = type === "CEX";

  return {
    symbol: "BTC",
    qualified: true,

    venues: {
      cexCount: isCex ? 1 : 0,
      dexCount: isCex ? 0 : 1,
    },

    qualification2: {
      qualified: q2Qualified,
      decision,
    },

    finalRevalidation: {
      approved: revalidated,
      decision,
    },

    freshRevalidationEvidence: {
      measurements: {
        symbol: "BTC",
        measuredAt,
      },
    },
  };
}

function makeLedger({
  equity = 10_000,
  drawdownPercent = 0,
  openPositions = [],
  position = null,
} = {}) {
  return {
    getSnapshot() {
      return {
        equity,
        drawdownPercent,
      };
    },

    getOpenPositions() {
      return openPositions;
    },

    getPosition() {
      return position;
    },
  };
}

function makeRuntime({
  direction = "FLAT",
  quantity = 0,
  exposure = 0,
  exitPending = false,
  activeOrderStatus = null,
} = {}) {
  return {
    paperOnly: true,
    liveExecutionEnabled: false,

    getSymbolState() {
      return {
        position: {
          direction,
          quantity,
          exposure,
          exitPending,
        },

        activeOrder:
          activeOrderStatus
            ? { status: activeOrderStatus }
            : null,
      };
    },
  };
}

function makeSupervisor({
  approved = true,
  blocker = null,
} = {}) {
  return {
    liveExecutionEnabled: false,

    evaluateAction() {
      return approved
        ? {
            approved: true,
            status: "READY",
            supervisorState: "READY",
            blocker: null,
            reason: null,
          }
        : {
            approved: false,
            status: "BLOCKED",
            supervisorState: "SAFE_MODE",
            blocker:
              blocker ??
              "SUPERVISOR_NOT_READY",
            reason:
              blocker ??
              "SUPERVISOR_NOT_READY",
          };
    },
  };
}

function runCase(name, {
  candidate = makeCandidate(),
  ledger = makeLedger(),
  runtime = makeRuntime(),
  supervisor = makeSupervisor(),
  nowMs = Date.now(),
  expectedApproved,
  expectedReason = null,
}) {
  const result =
    evaluateCryptoPaperExecutionAuthority({
      candidate,
      ledger,
      runtime,
      supervisor,
      nowMs,
    });

  assert(
    result.approved === expectedApproved,
    `${name}: expected approved=${expectedApproved}, got ${result.approved}`,
  );

  if (expectedReason) {
    assert(
      result.reason === expectedReason,
      `${name}: expected reason=${expectedReason}, got ${result.reason}`,
    );
  }

  assert(
    result.executionAuthority === false,
    `${name}: general execution authority must remain false`,
  );

  assert(
    result.liveExecution === false,
    `${name}: live execution must remain false`,
  );

  return {
    name,
    passed: true,
    approved: result.approved,
    status: result.status,
    reason: result.reason,
    nextStage: result.nextStage,
    paperExecutionAuthority:
      result.paperExecutionAuthority,
    executionAuthority:
      result.executionAuthority,
    liveExecution:
      result.liveExecution,
  };
}

const nowMs = Date.now();
const fresh = new Date(nowMs - 5_000).toISOString();
const stale = new Date(nowMs - 180_000).toISOString();

const results = [];

results.push(
  runCase("VALID_CEX_AUTHORIZED", {
    candidate:
      makeCandidate({
        type: "CEX",
        measuredAt: fresh,
      }),
    expectedApproved: true,
  }),
);

results.push(
  runCase("DEX_ONLY_BLOCKED", {
    candidate:
      makeCandidate({
        type: "DEX",
        measuredAt: fresh,
      }),
    expectedApproved: false,
    expectedReason:
      "CEX_EXECUTION_REQUIRED",
  }),
);

results.push(
  runCase("STALE_REVALIDATION_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: stale,
      }),
    nowMs,
    expectedApproved: false,
    expectedReason:
      "REVALIDATION_EXPIRED",
  }),
);

results.push(
  runCase("MISSING_LEDGER_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: fresh,
      }),
    ledger: null,
    expectedApproved: false,
    expectedReason:
      "PAPER_LEDGER_UNAVAILABLE",
  }),
);

results.push(
  runCase("OPPOSITE_POSITION_BLOCKED", {
    candidate:
      makeCandidate({
        decision: "LONG",
        measuredAt: fresh,
      }),
    runtime:
      makeRuntime({
        direction: "SHORT",
        quantity: 1,
        exposure: 100,
      }),
    expectedApproved: false,
    expectedReason:
      "DIRECT_POSITION_FLIP_BLOCKED",
  }),
);

results.push(
  runCase("EXIT_PENDING_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: fresh,
      }),
    runtime:
      makeRuntime({
        direction: "LONG",
        quantity: 1,
        exposure: 100,
        exitPending: true,
      }),
    expectedApproved: false,
    expectedReason:
      "EXIT_PENDING_CANNOT_INCREASE_RISK",
  }),
);

results.push(
  runCase("ACTIVE_ORDER_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: fresh,
      }),
    runtime:
      makeRuntime({
        activeOrderStatus: "SUBMITTED",
      }),
    expectedApproved: false,
    expectedReason:
      "ACTIVE_ORDER_ALREADY_EXISTS",
  }),
);

results.push(
  runCase("UNHEALTHY_SUPERVISOR_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: fresh,
      }),
    supervisor:
      makeSupervisor({
        approved: false,
        blocker:
          "SUPERVISOR_SAFE_MODE",
      }),
    expectedApproved: false,
    expectedReason:
      "SUPERVISOR_SAFE_MODE",
  }),
);

results.push(
  runCase("QUALIFICATION_2_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: fresh,
        q2Qualified: false,
      }),
    expectedApproved: false,
    expectedReason:
      "QUALIFICATION_2_REQUIRED",
  }),
);

results.push(
  runCase("FINAL_REVALIDATION_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: fresh,
        revalidated: false,
      }),
    expectedApproved: false,
    expectedReason:
      "FINAL_REVALIDATION_REQUIRED",
  }),
);

results.push(
  runCase("NO_DIRECTION_BLOCKED", {
    candidate:
      makeCandidate({
        measuredAt: fresh,
        decision: "NO_TRADE",
      }),
    expectedApproved: false,
    expectedReason:
      "DIRECTIONAL_DECISION_REQUIRED",
  }),
);

const authorized =
  results.filter(row => row.approved).length;

const blocked =
  results.filter(row => !row.approved).length;

assert(
  authorized === 1,
  `Expected exactly 1 authorized case, got ${authorized}`,
);

assert(
  blocked === results.length - 1,
  `Expected all remaining cases blocked, got ${blocked}`,
);

console.log(
  JSON.stringify(
    {
      passed: true,
      phase: "6.19",
      tests: results.length,
      authorized,
      blocked,
      results,
      safety: {
        positionSizing: false,
        orderConstruction: false,
        exchangeSubmission: false,
        executionAuthority: false,
        liveExecution: false,
      },
      nextStage:
        "ARCHITECTURE_DEBT_CLEANUP_BEFORE_POSITION_SIZING",
    },
    null,
    2,
  ),
);
