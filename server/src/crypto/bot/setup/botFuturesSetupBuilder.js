/**
 * AEMA Private Futures Research Bot
 * Futures Setup Builder
 *
 * Converts a direction-qualified research candidate into
 * a potential futures setup.
 *
 * This module:
 * - DOES calculate setup geometry
 * - DOES validate setup quality
 * - DOES NOT calculate position size
 * - DOES NOT choose leverage
 * - DOES NOT execute orders
 */

import BOT_CONFIG from "../config/botConfig.js";

/*
 * Preserve unavailable market evidence as null.
 *
 * IMPORTANT:
 * Number(null) === 0 in JavaScript, so we explicitly
 * reject null / undefined / empty values first.
 */
function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function positiveOrNull(value) {
  const n = finiteOrNull(value);

  return n !== null && n > 0
    ? n
    : null;
}

function percentDistance(from, to) {
  const a = positiveOrNull(from);
  const b = finiteOrNull(to);

  if (a === null || b === null) {
    return null;
  }

  return (
    (Math.abs(b - a) / a) *
    100
  );
}

function unique(values = []) {
  return [...new Set(values)];
}

export function buildBotFuturesSetup(
  candidate,
  market,
  options = {}
) {
  const cfg = {
    ...BOT_CONFIG.setup,
    ...options,
  };

  const qualification = {
    ...BOT_CONFIG.setupQualification,
    ...(options.qualification || {}),
  };

  const direction =
    candidate?.directionDecision?.direction ??
    null;

  const blockers = [
    ...(Array.isArray(market?.blockers)
      ? market.blockers
      : []),
  ];

  /*
   * ---------------------------------------------------------
   * 1. DIRECTION VALIDATION
   * ---------------------------------------------------------
   */

  if (
    candidate?.directionDecision?.qualified !== true
  ) {
    blockers.push(
      "DIRECTION_NOT_QUALIFIED"
    );
  }

  if (
    direction !== "LONG" &&
    direction !== "SHORT"
  ) {
    blockers.push(
      "INVALID_DIRECTION"
    );
  }

  /*
   * ---------------------------------------------------------
   * 2. MARKET VALIDATION
   * ---------------------------------------------------------
   */

  if (market?.approved !== true) {
    blockers.push(
      "MARKET_EVIDENCE_NOT_APPROVED"
    );
  }

  const instrumentType =
    market?.instrumentType ??
    candidate?.asset?.instrumentType ??
    candidate?.asset?.contractType ??
    null;

  const normalizedInstrumentType =
    String(
      instrumentType || ""
    ).toUpperCase();

  const futuresValidated =
    normalizedInstrumentType === "PERPETUAL" ||
    normalizedInstrumentType === "FUTURES";

  if (!futuresValidated) {
    blockers.push(
      "FUTURES_INSTRUMENT_NOT_VALIDATED"
    );
  }

  /*
   * ---------------------------------------------------------
   * 3. NORMALIZE MARKET VALUES
   * ---------------------------------------------------------
   */

  const bid =
    positiveOrNull(market?.bid);

  const ask =
    positiveOrNull(market?.ask);

  const atr =
    positiveOrNull(market?.atr);

  const support =
    positiveOrNull(market?.support);

  const resistance =
    positiveOrNull(market?.resistance);

  const spreadPercent =
    finiteOrNull(
      market?.spreadPercent
    );

  /*
   * LONG enters against the ask.
   * SHORT enters against the bid.
   */
  const entry =
    direction === "LONG"
      ? ask
      : direction === "SHORT"
        ? bid
        : null;

  if (entry === null) {
    blockers.push(
      "ENTRY_PRICE_UNAVAILABLE"
    );
  }

  if (atr === null) {
    blockers.push(
      "ATR_UNAVAILABLE"
    );
  }

  if (support === null) {
    blockers.push(
      "SUPPORT_UNAVAILABLE"
    );
  }

  if (resistance === null) {
    blockers.push(
      "RESISTANCE_UNAVAILABLE"
    );
  }

  /*
   * Spread is required because setup quality cannot
   * be evaluated properly without transaction-friction
   * evidence.
   */
  if (spreadPercent === null) {
    blockers.push(
      "SPREAD_UNAVAILABLE"
    );
  }

  /*
   * ---------------------------------------------------------
   * 4. BUILD SETUP GEOMETRY
   * ---------------------------------------------------------
   */

  let stop = null;
  let target = null;

  if (
    direction === "LONG" &&
    entry !== null &&
    atr !== null &&
    support !== null &&
    resistance !== null
  ) {
    /*
     * Stop below structural support with ATR buffer.
     */
    stop =
      support -
      atr *
        cfg.atrStopBufferMultiplier;

    /*
     * Target must be at least the greater of:
     * - resistance
     * - ATR extension
     */
    target =
      Math.max(
        resistance,
        entry +
          atr *
            cfg.targetAtrExtensionMultiplier
      );
  }

  if (
    direction === "SHORT" &&
    entry !== null &&
    atr !== null &&
    support !== null &&
    resistance !== null
  ) {
    /*
     * Stop above structural resistance with ATR buffer.
     */
    stop =
      resistance +
      atr *
        cfg.atrStopBufferMultiplier;

    /*
     * Target must be at least the lower of:
     * - support
     * - ATR extension
     */
    target =
      Math.min(
        support,
        entry -
          atr *
            cfg.targetAtrExtensionMultiplier
      );
  }

  stop =
    positiveOrNull(stop);

  target =
    positiveOrNull(target);

  /*
   * ---------------------------------------------------------
   * 5. VALIDATE GEOMETRY
   * ---------------------------------------------------------
   */

  let validGeometry = false;

  if (
    direction === "LONG" &&
    entry !== null &&
    stop !== null &&
    target !== null
  ) {
    validGeometry =
      stop < entry &&
      target > entry;
  }

  if (
    direction === "SHORT" &&
    entry !== null &&
    stop !== null &&
    target !== null
  ) {
    validGeometry =
      stop > entry &&
      target < entry;
  }

  if (!validGeometry) {
    blockers.push(
      "INVALID_SETUP_GEOMETRY"
    );
  }

  /*
   * ---------------------------------------------------------
   * 6. RISK / REWARD
   * ---------------------------------------------------------
   */

  const stopDistance =
    validGeometry
      ? Math.abs(entry - stop)
      : null;

  const targetDistance =
    validGeometry
      ? Math.abs(target - entry)
      : null;

  const riskReward =
    stopDistance !== null &&
    stopDistance > 0 &&
    targetDistance !== null
      ? targetDistance /
        stopDistance
      : null;

  if (
    riskReward === null ||
    riskReward <
      qualification.minimumRiskReward
  ) {
    blockers.push(
      "RISK_REWARD_TOO_LOW"
    );
  }

  /*
   * ---------------------------------------------------------
   * 7. SPREAD VALIDATION
   * ---------------------------------------------------------
   */

  if (
    spreadPercent !== null &&
    spreadPercent >
      qualification.maximumSpreadPercent
  ) {
    blockers.push(
      "SPREAD_TOO_WIDE"
    );
  }

  /*
   * ---------------------------------------------------------
   * 8. DIRECTIONAL SLIPPAGE
   * ---------------------------------------------------------
   */

  const directionalSlippage =
    direction === "LONG"
      ? market?.slippage?.buy
      : direction === "SHORT"
        ? market?.slippage?.sell
        : null;

  if (
    directionalSlippage?.available !== true
  ) {
    blockers.push(
      "DIRECTIONAL_SLIPPAGE_UNAVAILABLE"
    );
  }

  const slippagePercent =
    directionalSlippage?.available === true
      ? finiteOrNull(
          directionalSlippage.percent
        )
      : null;

  /*
   * ---------------------------------------------------------
   * 9. FINAL QUALIFICATION
   * ---------------------------------------------------------
   */

  const finalBlockers =
    unique(blockers);

  const approved =
    finalBlockers.length === 0;

  /*
   * ---------------------------------------------------------
   * 10. RETURN RESEARCH SETUP
   * ---------------------------------------------------------
   */

  return {
    ...candidate,

    executionMarket: market,

    setup: {
      approved,

      status:
        approved
          ? "SETUP_READY"
          : "NO_SETUP",

      setupType:
        approved
          ? direction === "LONG"
            ? "BUY"
            : "SELL"
          : "NONE",

      symbol:
        candidate?.symbol ??
        null,

      direction,

      /*
       * Setup geometry
       */
      entry,
      stop,
      target,

      targets:
        target !== null
          ? [target]
          : [],

      /*
       * Risk geometry
       */
      stopDistance:
        stopDistance,

      targetDistance:
        targetDistance,

      stopDistancePercent:
        percentDistance(
          entry,
          stop
        ),

      targetDistancePercent:
        percentDistance(
          entry,
          target
        ),

      riskReward,

      minimumRiskReward:
        qualification.minimumRiskReward,

      /*
       * Market quality
       */
      spreadPercent,

      maximumSpreadPercent:
        qualification.maximumSpreadPercent,

      slippagePercent,

      depthNotional:
        finiteOrNull(
          market?.depth?.totalNotional
        ),

      /*
       * Structural evidence
       */
      atr,
      support,
      resistance,

      /*
       * Observation freshness
       */
      freshness:
        market?.freshness ??
        null,

      /*
       * Instrument validation
       */
      instrumentType,

      futuresValidated,

      /*
       * Qualification result
       */
      blockers:
        finalBlockers,

      /*
       * Explicit safety boundary
       */
      executionAuthority: false,
      liveExecution: false,
    },
  };
}

export default buildBotFuturesSetup;