// server/src/services/tradingSessionRegistry.js

import createPaperTradingSession from
  "../execution/paperTradingSession.js";

/**
 * ============================================================
 * TRADING SESSION REGISTRY
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Own the runtime PaperTradingSession instances used by the
 * application.
 *
 * IMPORTANT
 * ---------
 *
 * A trading session must NEVER be created inside an HTTP route
 * simply because a user requests position information.
 *
 * The same session must be shared by:
 *
 * - analysis/execution
 * - position management
 * - position APIs
 * - dashboards
 *
 * ============================================================
 * SAAS DESIGN
 * ============================================================
 *
 * Sessions are keyed by an account-scoped identifier.
 *
 * Today:
 *
 *   accountId -> PaperTradingSession
 *
 * Later:
 *
 *   authenticated user
 *        ↓
 *   workspace
 *        ↓
 *   trading account
 *        ↓
 *   accountId
 *        ↓
 *   PaperTradingSession
 *
 * The browser must NEVER be trusted to choose another user's
 * accountId once authentication is introduced.
 *
 * ============================================================
 * PERSISTENCE WARNING
 * ============================================================
 *
 * This registry is intentionally runtime/in-memory storage.
 *
 * It is NOT the final SaaS persistence mechanism.
 *
 * Server restart:
 *
 *   registry state is lost.
 *
 * Later, persistent account/position/trade state should live in
 * the database and the registry should become a runtime cache.
 */

const sessions =
  new Map();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeId(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim();

  return normalized ||
    null;
}

function now() {
  return new Date()
    .toISOString();
}

/**
 * ============================================================
 * DEFAULT DEVELOPMENT ACCOUNT
 * ============================================================
 *
 * This allows the existing single-user development bot to work
 * before SaaS authentication is connected.
 *
 * Production multi-user code should resolve the account from
 * authenticated server-side context instead.
 */

export const DEFAULT_TRADING_ACCOUNT_ID =
  "development-paper-account";

/**
 * ============================================================
 * CREATE SESSION
 * ============================================================
 */

export function createTradingSession({
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,

  account = null,

  historyStore = null,

  analysisRunner,

  executionCoordinator,

  manualOverrideCoordinator,
} = {}) {
  const normalizedAccountId =
    normalizeId(
      accountId,
    );

  if (!normalizedAccountId) {
    throw new Error(
      "A trading account ID is required.",
    );
  }

  if (
    sessions.has(
      normalizedAccountId,
    )
  ) {
    return sessions.get(
      normalizedAccountId,
    ).session;
  }

  const options = {
    account,
    historyStore,
  };

  /**
   * Do not explicitly pass undefined dependencies.
   *
   * createPaperTradingSession() already owns tested defaults.
   */

  if (
    typeof analysisRunner ===
    "function"
  ) {
    options.analysisRunner =
      analysisRunner;
  }

  if (
    executionCoordinator &&
    typeof executionCoordinator ===
      "object"
  ) {
    options.executionCoordinator =
      executionCoordinator;
  }

  if (
    typeof manualOverrideCoordinator ===
    "function"
  ) {
    options.manualOverrideCoordinator =
      manualOverrideCoordinator;
  }

  const session =
    createPaperTradingSession(
      options,
    );

  sessions.set(
    normalizedAccountId,
    {
      accountId:
        normalizedAccountId,

      session,

      createdAt:
        now(),

      lastAccessedAt:
        now(),
    },
  );

  return session;
}

/**
 * ============================================================
 * GET SESSION
 * ============================================================
 *
 * Does NOT create a session.
 *
 * This distinction is important for read-only API routes.
 */

export function getTradingSession(
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,
) {
  const normalizedAccountId =
    normalizeId(
      accountId,
    );

  if (!normalizedAccountId) {
    return null;
  }

  const record =
    sessions.get(
      normalizedAccountId,
    );

  if (!record) {
    return null;
  }

  record.lastAccessedAt =
    now();

  return record.session;
}

/**
 * ============================================================
 * GET OR CREATE
 * ============================================================
 *
 * Use this from the actual trading runtime/bootstrap.
 *
 * Avoid using this from read-only routes.
 */

export function getOrCreateTradingSession({
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,

  ...options
} = {}) {
  const existing =
    getTradingSession(
      accountId,
    );

  if (existing) {
    return existing;
  }

  return createTradingSession({
    accountId,
    ...options,
  });
}

/**
 * ============================================================
 * HAS SESSION
 * ============================================================
 */

export function hasTradingSession(
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,
) {
  const normalizedAccountId =
    normalizeId(
      accountId,
    );

  if (!normalizedAccountId) {
    return false;
  }

  return sessions.has(
    normalizedAccountId,
  );
}

/**
 * ============================================================
 * SESSION STATE
 * ============================================================
 */

export function getTradingSessionState(
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,
) {
  const session =
    getTradingSession(
      accountId,
    );

  if (
    !session ||
    typeof session.getState !==
      "function"
  ) {
    return null;
  }

  return session.getState();
}

/**
 * ============================================================
 * POSITION
 * ============================================================
 */

export function getTradingSessionPosition(
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,
) {
  const session =
    getTradingSession(
      accountId,
    );

  if (!session) {
    return null;
  }

  return session.position ??
    null;
}

/**
 * ============================================================
 * HISTORY
 * ============================================================
 */

export function getTradingSessionHistory(
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,
) {
  const session =
    getTradingSession(
      accountId,
    );

  if (
    !session ||
    typeof session.getHistory !==
      "function"
  ) {
    return [];
  }

  return session.getHistory();
}

/**
 * ============================================================
 * REGISTRY STATUS
 * ============================================================
 */

export function getTradingSessionRegistryStatus() {
  const accounts =
    [];

  for (
    const [
      accountId,
      record,
    ]
    of sessions.entries()
  ) {
    const state =
      typeof record
        .session
        ?.getState ===
        "function"
        ? record
            .session
            .getState()
        : null;

    accounts.push({
      accountId,

      status:
        state?.status ??
        record
          .session
          ?.status ??
        null,

      hasOpenPosition:
        state
          ?.hasOpenPosition ===
        true,

      positionSymbol:
        state
          ?.openPosition
          ?.symbol ??
        null,

      createdAt:
        record.createdAt,

      lastAccessedAt:
        record.lastAccessedAt,
    });
  }

  return {
    service:
      "TRADING_SESSION_REGISTRY",

    sessionCount:
      sessions.size,

    accounts,

    timestamp:
      now(),
  };
}

/**
 * ============================================================
 * REMOVE SESSION
 * ============================================================
 */

export function removeTradingSession(
  accountId,
) {
  const normalizedAccountId =
    normalizeId(
      accountId,
    );

  if (!normalizedAccountId) {
    return false;
  }

  return sessions.delete(
    normalizedAccountId,
  );
}

/**
 * ============================================================
 * CLEAR REGISTRY
 * ============================================================
 *
 * Primarily useful for tests and controlled shutdown.
 */

export function clearTradingSessions() {
  sessions.clear();

  return {
    cleared:
      true,

    sessionCount:
      0,

    timestamp:
      now(),
  };
}

export default {
  createTradingSession,
  getTradingSession,
  getOrCreateTradingSession,
  hasTradingSession,
  getTradingSessionState,
  getTradingSessionPosition,
  getTradingSessionHistory,
  getTradingSessionRegistryStatus,
  removeTradingSession,
  clearTradingSessions,
};