/**
 * server/src/engines/institutionalPositionEngine.js
 *
 * ============================================================
 * INSTITUTIONAL POSITION ENGINE — COMPATIBILITY BRIDGE
 * ============================================================
 *
 * IMPORTANT:
 *
 * The canonical Institutional Position Engine lives at:
 *
 *   server/src/analysis/institutionalPositionEngine.js
 *
 * Historically, parts of the application may have imported the
 * engine from:
 *
 *   server/src/engines/institutionalPositionEngine.js
 *
 * while the main orchestrator and current tests import it from:
 *
 *   server/src/analysis/institutionalPositionEngine.js
 *
 * Maintaining two independent implementations creates a serious
 * risk:
 *
 * - one engine gets updated while the other does not;
 * - the frontend appears unchanged;
 * - tests exercise a different implementation from runtime;
 * - institutional evidence can appear inconsistent;
 * - debugging becomes unnecessarily difficult.
 *
 * Therefore this file intentionally contains NO institutional
 * scoring logic.
 *
 * It forwards every public export to the canonical implementation.
 *
 * This means both of these imports resolve to exactly the same
 * engine:
 *
 *   import analyzeInstitutionalPosition
 *     from "../analysis/institutionalPositionEngine.js";
 *
 *   import analyzeInstitutionalPosition
 *     from "../engines/institutionalPositionEngine.js";
 *
 * Do NOT add independent scoring logic to this file.
 * ============================================================
 */

export {
  INSTITUTIONAL_POSITION_STATUS,
  INSTITUTIONAL_POSITION_SIGNAL,
  DEFAULT_INSTITUTIONAL_POSITION_CONFIG,
  analyzeInstitutionalPosition,
} from "../analysis/institutionalPositionEngine.js";

export {
  default,
} from "../analysis/institutionalPositionEngine.js";