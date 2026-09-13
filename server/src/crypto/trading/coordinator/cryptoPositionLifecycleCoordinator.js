/**
 * AEMA CRYPTO
 * Phase 5.11 — Position Lifecycle Coordinator
 *
 * PURPOSE
 * -------
 * Converts trading-system recommendations into one coherent
 * position lifecycle decision.
 *
 * This coordinator DOES NOT:
 * - place orders
 * - cancel orders
 * - modify exchange positions
 * - change leverage on an exchange
 *
 * It only determines:
 * - lifecycle state
 * - allowed action
 * - target exposure
 * - whether adding/reducing/exiting is permitted
 * - protection priority
 */

const STATES = Object.freeze({
  ENTRY_PENDING: "ENTRY_PENDING",
  OPEN: "OPEN",
  BUILDING: "BUILDING",
  PROTECTED: "PROTECTED",
  REDUCED: "REDUCED",
  EXIT_PENDING: "EXIT_PENDING",
  CLOSED: "CLOSED",
});

const ACTIONS = Object.freeze({
  HOLD: "HOLD",
  OPEN_POSITION: "OPEN_POSITION",
  ADD_EXPOSURE: "ADD_EXPOSURE",
  REDUCE_EXPOSURE: "REDUCE_EXPOSURE",
  PROTECT_POSITION: "PROTECT_POSITION",
  EXIT_POSITION: "EXIT_POSITION",
  EMERGENCY_EXIT: "EMERGENCY_EXIT",
  NONE: "NONE",
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(
    max,
    Math.max(
      min,
      finite(value, min),
    ),
  );
}

function upper(value, fallback = "") {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
}

function bool(value) {
  return value === true;
}

function normalizeState(value) {
  const state =
    upper(
      value,
      STATES.OPEN,
    );

  return Object.values(STATES)
    .includes(state)
    ? state
    : STATES.OPEN;
}

function normalizeDirection(value) {
  const direction =
    upper(value);

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return "NEUTRAL";
}

function monitorActionOf(monitor) {
  return upper(
    monitor?.action,
    "HOLD",
  );
}

function riskApproved(riskPlan) {
  if (!riskPlan) {
    return true;
  }

  if (
    riskPlan.approved === false ||
    upper(riskPlan.status) ===
      "RISK_PLAN_BLOCKED"
  ) {
    return false;
  }

  return true;
}

function entryApproved(entryGate) {
  if (!entryGate) {
    return false;
  }

  return (
    entryGate.approved === true &&
    (
      upper(entryGate.state) ===
        "ENTRY_ALLOWED" ||
      upper(entryGate.state) ===
        "ENTRY_ALLOWED_REDUCED"
    )
  );
}

function protectionRequested(
  monitor,
  stopPlan,
) {
  const monitorAction =
    monitorActionOf(monitor);

  const stopMode =
    upper(
      stopPlan?.mode,
      "HOLD",
    );

  return (
    monitorAction ===
      "MOVE_STOP_TO_BREAKEVEN" ||
    monitorAction ===
      "TRAIL_PROFIT" ||
    monitorAction ===
      "TIGHTEN_STOP" ||
    stopMode ===
      "BREAKEVEN" ||
    stopMode ===
      "TRAILING" ||
    stopMode ===
      "AGGRESSIVE_TRAILING" ||
    stopMode ===
      "PROFIT_LOCK" ||
    stopMode ===
      "TIGHTENED"
  );
}

function emergencyRequested(
  monitor,
  stopPlan,
) {
  return (
    monitorActionOf(monitor) ===
      "EMERGENCY_EXIT" ||
    upper(stopPlan?.mode) ===
      "EMERGENCY"
  );
}

function normalExitRequested(
  monitor,
  stopPlan,
  riskPlan,
) {
  return (
    monitorActionOf(monitor) ===
      "EXIT" ||
    upper(stopPlan?.mode) ===
      "EXIT" ||
    upper(riskPlan?.state) ===
      "EXIT_REQUIRED"
  );
}

function reductionRequested(
  monitor,
) {
  return (
    monitorActionOf(monitor) ===
      "REDUCE_EXPOSURE"
  );
}

function additionRequested(
  monitor,
) {
  return (
    monitorActionOf(monitor) ===
      "ADD_EXPOSURE"
  );
}

function directionalSupport(
  decision,
  direction,
) {
  if (!decision) {
    return 0;
  }

  if (direction === "LONG") {
    return finite(
      decision.longScore ??
        decision.long,
      0,
    );
  }

  if (direction === "SHORT") {
    return finite(
      decision.shortScore ??
        decision.short,
      0,
    );
  }

  return 0;
}

function directionalOpposition(
  decision,
  direction,
) {
  if (!decision) {
    return 0;
  }

  if (direction === "LONG") {
    return finite(
      decision.shortScore ??
        decision.short,
      0,
    );
  }

  if (direction === "SHORT") {
    return finite(
      decision.longScore ??
        decision.long,
      0,
    );
  }

  return 0;
}

function directionStillValid(
  decision,
  direction,
) {
  if (!decision) {
    return false;
  }

  const preferred =
    normalizeDirection(
      decision.direction ??
        decision.preferredDirection,
    );

  const support =
    directionalSupport(
      decision,
      direction,
    );

  const opposition =
    directionalOpposition(
      decision,
      direction,
    );

  return (
    preferred === direction &&
    support > opposition
  );
}

function buildResult({
  state,
  action,
  direction,
  currentExposure,
  targetExposure,
  approved,
  urgency = "NONE",
  reasons = [],
  protections = [],
}) {
  return {
    approved,
    state,
    action,
    direction,

    currentExposure:
      clamp(currentExposure),

    targetExposure:
      clamp(targetExposure),

    exposureChange:
      Number(
        (
          clamp(targetExposure) -
          clamp(currentExposure)
        ).toFixed(4),
      ),

    urgency,

    reasons: [
      ...new Set(reasons),
    ],

    protections: [
      ...new Set(protections),
    ],

    executionAuthority: false,

    generatedAt:
      new Date()
        .toISOString(),
  };
}

/**
 * Coordinate lifecycle state.
 */
export default async function
coordinateCryptoPositionLifecycle(
  context = {},
) {
  const position =
    context.position ?? {};

  const monitor =
    context.monitor ?? {};

  const riskPlan =
    context.riskPlan ?? {};

  const stopPlan =
    context.stopPlan ?? {};

  const decision =
    context.decision ?? {};

  const entryGate =
    context.entryGate ?? {};

  const currentState =
    normalizeState(
      position.state,
    );

  const direction =
    normalizeDirection(
      position.direction ??
        decision.direction,
    );

  const currentExposure =
    clamp(
      position.exposure ??
        position.currentExposure ??
        0,
    );

  /*
   * CLOSED positions are terminal.
   *
   * Nothing inside this coordinator may
   * silently reopen them.
   */
  if (
    currentState ===
      STATES.CLOSED
  ) {
    return buildResult({
      state:
        STATES.CLOSED,

      action:
        ACTIONS.NONE,

      direction,

      currentExposure: 0,
      targetExposure: 0,

      approved: false,

      reasons: [
        "POSITION_ALREADY_CLOSED",
      ],
    });
  }

  /*
   * ==========================================================
   * PRIORITY 1
   * EMERGENCY EXIT
   * ==========================================================
   *
   * Highest possible priority.
   *
   * No add/reduce/protection recommendation
   * may override an emergency exit.
   */
  if (
    emergencyRequested(
      monitor,
      stopPlan,
    )
  ) {
    return buildResult({
      state:
        STATES.EXIT_PENDING,

      action:
        ACTIONS.EMERGENCY_EXIT,

      direction,

      currentExposure,
      targetExposure: 0,

      approved: true,
      urgency: "IMMEDIATE",

      reasons: [
        "EMERGENCY_EXIT_SIGNAL",
      ],

      protections: [
        "EMERGENCY_PROTECTION",
      ],
    });
  }

  /*
   * ==========================================================
   * PRIORITY 2
   * NORMAL EXIT
   * ==========================================================
   */
  if (
    normalExitRequested(
      monitor,
      stopPlan,
      riskPlan,
    )
  ) {
    return buildResult({
      state:
        STATES.EXIT_PENDING,

      action:
        ACTIONS.EXIT_POSITION,

      direction,

      currentExposure,
      targetExposure: 0,

      approved: true,
      urgency: "HIGH",

      reasons: [
        "EXIT_REQUIRED",
      ],
    });
  }

  /*
   * Once exit has started, do not permit
   * another component to rebuild exposure.
   */
  if (
    currentState ===
      STATES.EXIT_PENDING
  ) {
    return buildResult({
      state:
        STATES.EXIT_PENDING,

      action:
        ACTIONS.EXIT_POSITION,

      direction,

      currentExposure,
      targetExposure: 0,

      approved: true,
      urgency: "HIGH",

      reasons: [
        "EXIT_ALREADY_PENDING",
      ],
    });
  }

  /*
   * ==========================================================
   * PRIORITY 3
   * REDUCE EXPOSURE
   * ==========================================================
   */
  if (
    reductionRequested(
      monitor,
    )
  ) {
    const monitorExposure =
      clamp(
        monitor.exposure ??
          monitor.targetExposure ??
          0.65,
      );

    const targetExposure =
      Math.min(
        currentExposure,
        monitorExposure,
      );

    return buildResult({
      state:
        STATES.REDUCED,

      action:
        ACTIONS.REDUCE_EXPOSURE,

      direction,

      currentExposure,
      targetExposure,

      approved: true,
      urgency: "MEDIUM",

      reasons: [
        "LIVE_THESIS_DETERIORATING",
      ],
    });
  }

  /*
   * ==========================================================
   * PRIORITY 4
   * POSITION PROTECTION
   * ==========================================================
   *
   * Breakeven, trailing and stop tightening
   * have priority over adding exposure.
   */
  if (
    protectionRequested(
      monitor,
      stopPlan,
    )
  ) {
    const protections = [];

    const monitorAction =
      monitorActionOf(
        monitor,
      );

    const stopMode =
      upper(
        stopPlan?.mode,
      );

    if (
      monitorAction ===
        "MOVE_STOP_TO_BREAKEVEN" ||
      stopMode ===
        "BREAKEVEN"
    ) {
      protections.push(
        "BREAKEVEN",
      );
    }

    if (
      monitorAction ===
        "TRAIL_PROFIT" ||
      stopMode ===
        "TRAILING" ||
      stopMode ===
        "AGGRESSIVE_TRAILING"
    ) {
      protections.push(
        "TRAILING_STOP",
      );
    }

    if (
      monitorAction ===
        "TIGHTEN_STOP" ||
      stopMode ===
        "TIGHTENED"
    ) {
      protections.push(
        "TIGHTEN_STOP",
      );
    }

    if (
      stopMode ===
        "PROFIT_LOCK"
    ) {
      protections.push(
        "PROFIT_LOCK",
      );
    }

    return buildResult({
      state:
        STATES.PROTECTED,

      action:
        ACTIONS.PROTECT_POSITION,

      direction,

      currentExposure,
      targetExposure:
        currentExposure,

      approved: true,

      urgency: "NORMAL",

      reasons: [
        "POSITION_PROTECTION_ACTIVE",
      ],

      protections,
    });
  }

  /*
   * ==========================================================
   * PRIORITY 5
   * ADD EXPOSURE
   * ==========================================================
   *
   * Adding requires:
   *
   * 1. monitor asks for addition
   * 2. direction remains valid
   * 3. risk plan is approved
   * 4. no exit/reduction/protection has priority
   *
   * Profit alone NEVER permits adding.
   */
  if (
    additionRequested(
      monitor,
    )
  ) {
    const directionValid =
      directionStillValid(
        decision,
        direction,
      );

    if (!directionValid) {
      return buildResult({
        state:
          STATES.OPEN,

        action:
          ACTIONS.HOLD,

        direction,

        currentExposure,
        targetExposure:
          currentExposure,

        approved: false,

        reasons: [
          "ADD_BLOCKED_DIRECTION_NOT_RECONFIRMED",
        ],
      });
    }

    if (
      !riskApproved(
        riskPlan,
      )
    ) {
      return buildResult({
        state:
          STATES.OPEN,

        action:
          ACTIONS.HOLD,

        direction,

        currentExposure,
        targetExposure:
          currentExposure,

        approved: false,

        reasons: [
          "ADD_BLOCKED_BY_RISK_MANAGER",
        ],
      });
    }

    const requestedExposure =
      clamp(
        monitor.exposure ??
          monitor.targetExposure ??
          Math.min(
            1,
            currentExposure +
              0.25,
          ),
      );

    /*
     * Never interpret an ADD signal as
     * permission to reduce exposure.
     */
    const targetExposure =
      Math.max(
        currentExposure,
        requestedExposure,
      );

    return buildResult({
      state:
        STATES.BUILDING,

      action:
        ACTIONS.ADD_EXPOSURE,

      direction,

      currentExposure,
      targetExposure,

      approved:
        targetExposure >
        currentExposure,

      urgency: "NORMAL",

      reasons: [
        "THESIS_STRENGTHENING",
        "DIRECTION_RECONFIRMED",
        "RISK_APPROVED",
      ],
    });
  }

  /*
   * ==========================================================
   * ENTRY PENDING
   * ==========================================================
   */
  if (
    currentState ===
      STATES.ENTRY_PENDING
  ) {
    if (
      !entryApproved(
        entryGate,
      )
    ) {
      return buildResult({
        state:
          STATES.ENTRY_PENDING,

        action:
          ACTIONS.NONE,

        direction,

        currentExposure: 0,
        targetExposure: 0,

        approved: false,

        reasons: [
          "ENTRY_NOT_QUALIFIED",
        ],
      });
    }

    if (
      !riskApproved(
        riskPlan,
      )
    ) {
      return buildResult({
        state:
          STATES.ENTRY_PENDING,

        action:
          ACTIONS.NONE,

        direction,

        currentExposure: 0,
        targetExposure: 0,

        approved: false,

        reasons: [
          "ENTRY_BLOCKED_BY_RISK_MANAGER",
        ],
      });
    }

    const entryExposure =
      clamp(
        riskPlan.exposure ??
          entryGate.exposure ??
          1,
      );

    return buildResult({
      state:
        STATES.OPEN,

      action:
        ACTIONS.OPEN_POSITION,

      direction,

      currentExposure: 0,
      targetExposure:
        entryExposure,

      approved: true,

      urgency: "NORMAL",

      reasons: [
        "ENTRY_QUALIFIED",
        "RISK_PLAN_APPROVED",
      ],
    });
  }

  /*
   * ==========================================================
   * DEFAULT
   * HEALTHY OPEN POSITION
   * ==========================================================
   */
  return buildResult({
    state:
      currentState ===
        STATES.REDUCED
        ? STATES.REDUCED
        : STATES.OPEN,

    action:
      ACTIONS.HOLD,

    direction,

    currentExposure,
    targetExposure:
      currentExposure,

    approved: true,

    reasons: [
      "POSITION_THESIS_STABLE",
    ],
  });
}

export {
  STATES as
    CRYPTO_POSITION_STATES,

  ACTIONS as
    CRYPTO_POSITION_ACTIONS,
};