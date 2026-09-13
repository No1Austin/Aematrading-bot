import coordinateLifecycle from
  "../src/crypto/trading/coordinator/cryptoPositionLifecycleCoordinator.js";

const baseDecision = {
  direction: "LONG",
  longScore: 82,
  shortScore: 14,
};

const baseRisk = {
  approved: true,
  status: "RISK_PLAN_READY",
  exposure: 1,
};

const scenarios = [
  {
    scenario: "OPEN_ENTRY",
    context: {
      position: {
        state: "ENTRY_PENDING",
        direction: "LONG",
        exposure: 0,
      },
      entryGate: {
        approved: true,
        state: "ENTRY_ALLOWED",
        exposure: 1,
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "HEALTHY_HOLD",
    context: {
      position: {
        state: "OPEN",
        direction: "LONG",
        exposure: 1,
      },
      monitor: {
        action: "HOLD",
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "ADD_EXPOSURE",
    context: {
      position: {
        state: "OPEN",
        direction: "LONG",
        exposure: 0.6,
      },
      monitor: {
        action: "ADD_EXPOSURE",
        exposure: 0.85,
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "ADD_BLOCKED_DIRECTION",
    context: {
      position: {
        state: "OPEN",
        direction: "LONG",
        exposure: 0.6,
      },
      monitor: {
        action: "ADD_EXPOSURE",
        exposure: 0.9,
      },
      riskPlan: baseRisk,
      decision: {
        direction: "SHORT",
        longScore: 35,
        shortScore: 70,
      },
    },
  },

  {
    scenario: "REDUCE_EXPOSURE",
    context: {
      position: {
        state: "OPEN",
        direction: "LONG",
        exposure: 1,
      },
      monitor: {
        action: "REDUCE_EXPOSURE",
        exposure: 0.65,
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "TRAIL_PROFIT",
    context: {
      position: {
        state: "OPEN",
        direction: "LONG",
        exposure: 1,
      },
      monitor: {
        action: "TRAIL_PROFIT",
      },
      stopPlan: {
        mode: "TRAILING",
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "NORMAL_EXIT",
    context: {
      position: {
        state: "OPEN",
        direction: "LONG",
        exposure: 0.7,
      },
      monitor: {
        action: "EXIT",
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "EMERGENCY_EXIT",
    context: {
      position: {
        state: "OPEN",
        direction: "LONG",
        exposure: 1,
      },
      monitor: {
        action: "EMERGENCY_EXIT",
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "EXIT_PENDING_CANNOT_REBUILD",
    context: {
      position: {
        state: "EXIT_PENDING",
        direction: "LONG",
        exposure: 0.4,
      },
      monitor: {
        action: "ADD_EXPOSURE",
        exposure: 1,
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },

  {
    scenario: "CLOSED_TERMINAL",
    context: {
      position: {
        state: "CLOSED",
        direction: "LONG",
        exposure: 0,
      },
      monitor: {
        action: "ADD_EXPOSURE",
        exposure: 1,
      },
      riskPlan: baseRisk,
      decision: baseDecision,
    },
  },
];

const results = [];

for (const test of scenarios) {
  const result =
    await coordinateLifecycle(
      test.context,
    );

  results.push({
    scenario:
      test.scenario,

    state:
      result.state,

    action:
      result.action,

    direction:
      result.direction,

    current:
      result.currentExposure,

    target:
      result.targetExposure,

    change:
      result.exposureChange,

    approved:
      result.approved,

    urgency:
      result.urgency,

    execution:
      result.executionAuthority,
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.11 — POSITION LIFECYCLE COORDINATOR\n",
);

console.table(results);

const byScenario =
  Object.fromEntries(
    results.map(
      (row) => [
        row.scenario,
        row,
      ],
    ),
  );

const invariants = {
  qualifiedEntryOpens:
    byScenario.OPEN_ENTRY
      ?.action ===
      "OPEN_POSITION",

  healthyPositionHeld:
    byScenario.HEALTHY_HOLD
      ?.action ===
      "HOLD",

  strengtheningAdds:
    byScenario.ADD_EXPOSURE
      ?.action ===
        "ADD_EXPOSURE" &&
    byScenario.ADD_EXPOSURE
      ?.target >
      byScenario.ADD_EXPOSURE
        ?.current,

  invalidDirectionBlocksAdd:
    byScenario.ADD_BLOCKED_DIRECTION
      ?.action ===
        "HOLD" &&
    byScenario.ADD_BLOCKED_DIRECTION
      ?.target ===
      byScenario.ADD_BLOCKED_DIRECTION
        ?.current,

  deteriorationReduces:
    byScenario.REDUCE_EXPOSURE
      ?.action ===
        "REDUCE_EXPOSURE" &&
    byScenario.REDUCE_EXPOSURE
      ?.target <
      byScenario.REDUCE_EXPOSURE
        ?.current,

  profitProtectionRecognized:
    byScenario.TRAIL_PROFIT
      ?.state ===
        "PROTECTED" &&
    byScenario.TRAIL_PROFIT
      ?.action ===
        "PROTECT_POSITION",

  normalExitZerosExposure:
    byScenario.NORMAL_EXIT
      ?.target === 0,

  emergencyOverrides:
    byScenario.EMERGENCY_EXIT
      ?.action ===
        "EMERGENCY_EXIT" &&
    byScenario.EMERGENCY_EXIT
      ?.target === 0,

  exitPendingCannotRebuild:
    byScenario.EXIT_PENDING_CANNOT_REBUILD
      ?.action ===
        "EXIT_POSITION" &&
    byScenario.EXIT_PENDING_CANNOT_REBUILD
      ?.target === 0,

  closedPositionTerminal:
    byScenario.CLOSED_TERMINAL
      ?.state ===
        "CLOSED" &&
    byScenario.CLOSED_TERMINAL
      ?.action ===
        "NONE",

  noExecutionAuthority:
    results.every(
      (row) =>
        row.execution === false,
    ),
};

console.log(
  "\nINVARIANTS",
);

console.log(
  invariants,
);

const passed =
  Object.values(
    invariants,
  ).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.11 FAILED — one or more invariants failed.",
  );

  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.11 PASSED — position lifecycle behavior is valid.",
  );
}