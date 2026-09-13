/**
 * ============================================================
 * AEMA CRYPTO
 * PAPER AUTO CHECKPOINT MANAGER
 * Phase 5.29
 * ============================================================
 *
 * Responsibilities:
 *
 * - automatically checkpoint durable paper-trading state
 * - serialize overlapping checkpoint requests
 * - coalesce rapid repeated checkpoint requests
 * - track dirty / degraded persistence state
 * - support checkpoint retry
 * - support optional periodic checkpointing
 * - support final shutdown checkpoint
 *
 * IMPORTANT:
 *
 * Trading/execution state is always the source of truth.
 *
 * A checkpoint failure must NEVER:
 * - roll back a fill
 * - roll back ledger truth
 * - roll back runtime state
 * - pretend the mutation never happened
 *
 * Instead:
 * - mark persistence dirty
 * - surface failure
 * - permit later retry
 *
 * NO execution authority.
 * NO live execution.
 */


const finite = (
  value,
  fallback = 0,
) => {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
};


function nowIso() {
  return new Date()
    .toISOString();
}


function clone(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


export function createCryptoPaperAutoCheckpointManager({
  checkpointManager,

  periodicIntervalMs = 0,

  metadataFactory = null,
} = {}) {
  if (!checkpointManager) {
    throw new Error(
      "CHECKPOINT_MANAGER_REQUIRED",
    );
  }

  if (
    typeof checkpointManager
      .saveCheckpoint !==
    "function"
  ) {
    throw new Error(
      "INVALID_CHECKPOINT_MANAGER",
    );
  }


  let checkpointInFlight =
    null;

  let queuedReason =
    null;

  let dirty =
    false;

  let lastFailure =
    null;

  let lastSuccess =
    null;

  let checkpointCount =
    0;

  let failureCount =
    0;

  let coalescedCount =
    0;

  let periodicTimer =
    null;

  let shutdownStarted =
    false;


  /**
   * ==========================================================
   * METADATA
   * ==========================================================
   */

  function buildMetadata({
    reason,
    metadata = {},
  } = {}) {
    let dynamicMetadata =
      {};

    if (
      typeof metadataFactory ===
      "function"
    ) {
      try {
        dynamicMetadata =
          metadataFactory({
            reason,
          }) ??
          {};
      } catch {
        dynamicMetadata =
          {};
      }
    }

    return {
      ...clone(
        dynamicMetadata,
      ),

      ...clone(
        metadata,
      ),

      automaticCheckpoint:
        true,

      reason:
        reason ??
        "UNSPECIFIED",

      dirtyBeforeCheckpoint:
        dirty,

      requestedAt:
        nowIso(),
    };
  }


  /**
   * ==========================================================
   * SINGLE CHECKPOINT ATTEMPT
   * ==========================================================
   */

  async function performCheckpoint({
    reason =
      "AUTO_CHECKPOINT",

    metadata = {},
  } = {}) {
    const requestedAt =
      nowIso();

    try {
      const result =
        await checkpointManager
          .saveCheckpoint({
            metadata:
              buildMetadata({
                reason,
                metadata,
              }),
          });

      if (
        result?.approved ===
        true
      ) {
        dirty =
          false;

        lastFailure =
          null;

        checkpointCount +=
          1;

        lastSuccess = {
          reason,

          requestedAt,

          completedAt:
            nowIso(),

          status:
            result.status,

          filePath:
            result.filePath ??
            null,

          version:
            result.version ??
            null,
        };

        return {
          approved:
            true,

          status:
            "AUTO_CHECKPOINT_SAVED",

          reason,

          checkpoint:
            result,

          dirty,

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }

      dirty =
        true;

      failureCount +=
        1;

      lastFailure = {
        reason,

        requestedAt,

        failedAt:
          nowIso(),

        status:
          result?.status ??
          "CHECKPOINT_FAILED",

        blocker:
          result?.blocker ??
          null,
      };

      return {
        approved:
          false,

        status:
          "AUTO_CHECKPOINT_FAILED",

        reason,

        checkpoint:
          result,

        blocker:
          result?.blocker ??
          result?.status ??
          "CHECKPOINT_FAILED",

        dirty,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    } catch (error) {
      dirty =
        true;

      failureCount +=
        1;

      lastFailure = {
        reason,

        requestedAt,

        failedAt:
          nowIso(),

        status:
          "CHECKPOINT_EXCEPTION",

        blocker:
          String(
            error?.message ??
            error,
          ),
      };

      return {
        approved:
          false,

        status:
          "AUTO_CHECKPOINT_FAILED",

        reason,

        blocker:
          lastFailure.blocker,

        dirty,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }
  }


  /**
   * ==========================================================
   * QUEUED / COALESCED CHECKPOINT
   * ==========================================================
   *
   * If a checkpoint is already running, we do NOT launch
   * another concurrent save.
   *
   * Instead:
   * - mark state dirty
   * - remember the latest reason
   * - allow one follow-up checkpoint after the current one
   */

  async function drainCheckpointQueue(
    initialRequest,
  ) {
    let currentRequest =
      initialRequest;

    let finalResult =
      null;

    while (currentRequest) {
      queuedReason =
        null;

      finalResult =
        await performCheckpoint(
          currentRequest,
        );

      if (queuedReason) {
        currentRequest = {
          reason:
            queuedReason,

          metadata: {
            coalesced:
              true,
          },
        };
      } else {
        currentRequest =
          null;
      }
    }

    return finalResult;
  }


  /**
   * ==========================================================
   * REQUEST CHECKPOINT
   * ==========================================================
   */

  function requestCheckpoint({
    reason =
      "STATE_MUTATION",

    metadata = {},
  } = {}) {
    dirty =
      true;

    if (shutdownStarted) {
      return Promise.resolve({
        approved:
          false,

        status:
          "AUTO_CHECKPOINT_BLOCKED",

        blocker:
          "SHUTDOWN_IN_PROGRESS",

        dirty,

        executionAuthority:
          false,

        liveExecution:
          false,
      });
    }


    if (checkpointInFlight) {
      queuedReason =
        reason;

      coalescedCount +=
        1;

      return checkpointInFlight
        .then(
          () => ({
            approved:
              true,

            status:
              "AUTO_CHECKPOINT_COALESCED",

            reason,

            dirty,

            executionAuthority:
              false,

            liveExecution:
              false,
          }),
        );
    }


    checkpointInFlight =
      drainCheckpointQueue({
        reason,
        metadata,
      })
        .finally(
          () => {
            checkpointInFlight =
              null;
          },
        );


    return checkpointInFlight;
  }


  /**
   * ==========================================================
   * MARK DIRTY
   * ==========================================================
   */

  function markDirty(
    reason =
      "UNPERSISTED_STATE_MUTATION",
  ) {
    dirty =
      true;

    return {
      approved:
        true,

      status:
        "PERSISTENCE_MARKED_DIRTY",

      reason,

      dirty,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * RETRY
   * ==========================================================
   */

  async function retryDirtyCheckpoint({
    reason =
      "DIRTY_STATE_RETRY",
  } = {}) {
    if (!dirty) {
      return {
        approved:
          true,

        status:
          "CHECKPOINT_RETRY_NOT_REQUIRED",

        dirty:
          false,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    return requestCheckpoint({
      reason,
      metadata: {
        retry:
          true,
      },
    });
  }


  /**
   * ==========================================================
   * PERIODIC CHECKPOINTING
   * ==========================================================
   */

  function startPeriodicCheckpointing() {
    const interval =
      Math.max(
        0,
        finite(
          periodicIntervalMs,
          0,
        ),
      );

    if (
      interval <= 0
    ) {
      return {
        approved:
          true,

        status:
          "PERIODIC_CHECKPOINT_DISABLED",

        intervalMs:
          0,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    if (periodicTimer) {
      return {
        approved:
          true,

        status:
          "PERIODIC_CHECKPOINT_ALREADY_RUNNING",

        intervalMs:
          interval,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    periodicTimer =
      setInterval(
        () => {
          requestCheckpoint({
            reason:
              "PERIODIC_CHECKPOINT",
          }).catch(
            () => {
              /*
               * Failure state is already retained internally.
               * Do not create an unhandled rejection.
               */
            },
          );
        },
        interval,
      );


    if (
      typeof periodicTimer
        ?.unref ===
      "function"
    ) {
      periodicTimer.unref();
    }


    return {
      approved:
        true,

      status:
        "PERIODIC_CHECKPOINT_STARTED",

      intervalMs:
        interval,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  function stopPeriodicCheckpointing() {
    if (periodicTimer) {
      clearInterval(
        periodicTimer,
      );

      periodicTimer =
        null;
    }

    return {
      approved:
        true,

      status:
        "PERIODIC_CHECKPOINT_STOPPED",

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * FINAL SHUTDOWN CHECKPOINT
   * ==========================================================
   */

  async function checkpointBeforeShutdown({
    metadata = {},
  } = {}) {
    stopPeriodicCheckpointing();

    /*
     * Allow any currently running checkpoint to finish first.
     */

    if (checkpointInFlight) {
      await checkpointInFlight;
    }

    const result =
      await performCheckpoint({
        reason:
          "FINAL_SHUTDOWN_CHECKPOINT",

        metadata: {
          ...clone(
            metadata,
          ),

          finalCheckpoint:
            true,
        },
      });

    shutdownStarted =
      true;

    return {
      ...result,

      shutdownCheckpoint:
        true,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ==========================================================
   * HEALTH
   * ==========================================================
   */

  function getHealth() {
    return {
      dirty,

      degraded:
        dirty &&
        Boolean(
          lastFailure,
        ),

      checkpointInFlight:
        Boolean(
          checkpointInFlight,
        ),

      checkpointCount,

      failureCount,

      coalescedCount,

      periodicCheckpointing:
        Boolean(
          periodicTimer,
        ),

      periodicIntervalMs:
        Math.max(
          0,
          finite(
            periodicIntervalMs,
            0,
          ),
        ),

      shutdownStarted,

      lastSuccess:
        clone(
          lastSuccess,
        ),

      lastFailure:
        clone(
          lastFailure,
        ),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  return {
    requestCheckpoint,

    markDirty,

    retryDirtyCheckpoint,

    startPeriodicCheckpointing,

    stopPeriodicCheckpointing,

    checkpointBeforeShutdown,

    getHealth,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  createCryptoPaperAutoCheckpointManager;