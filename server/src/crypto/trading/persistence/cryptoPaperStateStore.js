/**
 * AEMA CRYPTO
 * Phase 5.28
 *
 * PAPER STATE STORE
 *
 * Responsibilities:
 * - save versioned paper-trading checkpoints
 * - load checkpoints
 * - validate file structure
 * - reject corrupt/unsupported data
 *
 * IMPORTANT
 * ---------
 * This module only persists data.
 *
 * It does NOT:
 * - place orders
 * - restore runtime objects itself
 * - reconcile positions
 * - enable live execution
 */

import fs
  from "node:fs/promises";

import path
  from "node:path";


export const CRYPTO_PAPER_STATE_VERSION =
  1;


function clone(value) {
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


function nowIso() {
  return new Date()
    .toISOString();
}


function normalizePath(
  value,
) {
  return path.resolve(
    String(value),
  );
}


function validateCheckpointShape(
  checkpoint,
) {
  if (
    !checkpoint ||
    typeof checkpoint !==
      "object" ||
    Array.isArray(
      checkpoint,
    )
  ) {
    return {
      valid: false,
      reason:
        "CHECKPOINT_NOT_OBJECT",
    };
  }

  if (
    checkpoint.version !==
    CRYPTO_PAPER_STATE_VERSION
  ) {
    return {
      valid: false,
      reason:
        "UNSUPPORTED_CHECKPOINT_VERSION",
    };
  }

  if (
    !checkpoint.createdAt
  ) {
    return {
      valid: false,
      reason:
        "CHECKPOINT_CREATED_AT_MISSING",
    };
  }

  if (
    !checkpoint.state ||
    typeof checkpoint.state !==
      "object"
  ) {
    return {
      valid: false,
      reason:
        "CHECKPOINT_STATE_MISSING",
    };
  }

  return {
    valid: true,
    reason: null,
  };
}


export function createCryptoPaperStateStore({
  filePath =
    "data/crypto-paper/checkpoint.json",
} = {}) {
  const resolvedPath =
    normalizePath(
      filePath,
    );

  async function ensureDirectory() {
    await fs.mkdir(
      path.dirname(
        resolvedPath,
      ),
      {
        recursive: true,
      },
    );
  }


  async function save({
    state,
    metadata = {},
  } = {}) {
    if (
      !state ||
      typeof state !==
        "object"
    ) {
      return {
        approved: false,
        status:
          "CHECKPOINT_SAVE_REJECTED",
        blocker:
          "STATE_REQUIRED",
        executionAuthority:
          false,
        liveExecution:
          false,
      };
    }

    await ensureDirectory();

    const checkpoint = {
      version:
        CRYPTO_PAPER_STATE_VERSION,

      createdAt:
        nowIso(),

      metadata:
        clone(metadata),

      state:
        clone(state),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };

    const temporaryPath =
      `${resolvedPath}.tmp`;

    const serialized =
      JSON.stringify(
        checkpoint,
        null,
        2,
      );

    /**
     * Atomic-ish write strategy:
     *
     * 1. write temporary file
     * 2. rename temporary file to final file
     *
     * This avoids leaving a half-written checkpoint behind.
     */

    await fs.writeFile(
      temporaryPath,
      serialized,
      "utf8",
    );

    await fs.rename(
      temporaryPath,
      resolvedPath,
    );

    return {
      approved: true,

      status:
        "CHECKPOINT_SAVED",

      filePath:
        resolvedPath,

      version:
        checkpoint.version,

      createdAt:
        checkpoint.createdAt,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  async function load() {
    let raw;

    try {
      raw =
        await fs.readFile(
          resolvedPath,
          "utf8",
        );
    } catch (error) {
      if (
        error?.code ===
        "ENOENT"
      ) {
        return {
          approved: false,

          status:
            "CHECKPOINT_NOT_FOUND",

          checkpoint:
            null,

          blocker:
            "CHECKPOINT_FILE_NOT_FOUND",

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }

      return {
        approved: false,

        status:
          "CHECKPOINT_READ_FAILED",

        checkpoint:
          null,

        blocker:
          String(
            error?.message ??
            error,
          ),

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    let checkpoint;

    try {
      checkpoint =
        JSON.parse(raw);
    } catch {
      return {
        approved: false,

        status:
          "CHECKPOINT_CORRUPT",

        checkpoint:
          null,

        blocker:
          "INVALID_JSON",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    const validation =
      validateCheckpointShape(
        checkpoint,
      );

    if (!validation.valid) {
      return {
        approved: false,

        status:
          validation.reason ===
          "UNSUPPORTED_CHECKPOINT_VERSION"
            ? "CHECKPOINT_VERSION_UNSUPPORTED"
            : "CHECKPOINT_INVALID",

        checkpoint:
          null,

        blocker:
          validation.reason,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    return {
      approved: true,

      status:
        "CHECKPOINT_LOADED",

      checkpoint:
        clone(checkpoint),

      filePath:
        resolvedPath,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  async function exists() {
    try {
      await fs.access(
        resolvedPath,
      );

      return true;
    } catch {
      return false;
    }
  }


  async function remove() {
    try {
      await fs.unlink(
        resolvedPath,
      );

      return {
        approved: true,

        status:
          "CHECKPOINT_REMOVED",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    } catch (error) {
      if (
        error?.code ===
        "ENOENT"
      ) {
        return {
          approved: true,

          status:
            "CHECKPOINT_ALREADY_ABSENT",

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }

      return {
        approved: false,

        status:
          "CHECKPOINT_REMOVE_FAILED",

        blocker:
          String(
            error?.message ??
            error,
          ),

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }
  }


  return {
    save,
    load,
    exists,
    remove,

    getFilePath() {
      return resolvedPath;
    },

    version:
      CRYPTO_PAPER_STATE_VERSION,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  createCryptoPaperStateStore;