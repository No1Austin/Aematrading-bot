import {
  CryptoExchangeAdapterContract,
} from "./exchangeAdapterContract.js";

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value, fallback = 0) {
  return Math.max(0, finite(value, fallback));
}

function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeSide(value) {
  const side = String(value ?? "")
    .trim()
    .toUpperCase();

  return side === "BUY" || side === "SELL"
    ? side
    : null;
}

function round(value, decimals = 8) {
  const factor = 10 ** decimals;

  return Math.round(
    (finite(value) + Number.EPSILON) * factor,
  ) / factor;
}

function clone(value) {
  if (value == null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function oppositeDirection(direction) {
  return direction === "LONG"
    ? "SHORT"
    : "LONG";
}

function sideToDirection(side) {
  return side === "BUY"
    ? "LONG"
    : "SHORT";
}

export class PaperCryptoExchangeAdapter
  extends CryptoExchangeAdapterContract {
  constructor({
    defaultFillRatio = 1,
    defaultPrice = 100,
  } = {}) {
    super({
      name: "AEMA_PAPER_CRYPTO_EXCHANGE",
      paperExecution: true,
      liveExecution: false,
    });

    this.defaultFillRatio = Math.min(
      1,
      positive(defaultFillRatio, 1),
    );

    this.defaultPrice = positive(
      defaultPrice,
      100,
    );

    this.orders = new Map();
    this.positions = new Map();
    this.fills = [];
    this.stops = new Map();

    this.orderSequence = 0;
    this.fillSequence = 0;
  }

  reset() {
    this.orders.clear();
    this.positions.clear();
    this.fills.length = 0;
    this.stops.clear();

    this.orderSequence = 0;
    this.fillSequence = 0;
  }

  nextOrderId() {
    this.orderSequence += 1;

    return `PAPER-ORDER-${String(
      this.orderSequence,
    ).padStart(6, "0")}`;
  }

  nextFillId() {
    this.fillSequence += 1;

    return `PAPER-FILL-${String(
      this.fillSequence,
    ).padStart(6, "0")}`;
  }

  findByClientOrderId(clientOrderId) {
    if (!clientOrderId) {
      return null;
    }

    for (const order of this.orders.values()) {
      if (order.clientOrderId === clientOrderId) {
        return order;
      }
    }

    return null;
  }

  getInternalPosition(symbol) {
    const key = normalizeSymbol(symbol);

    return (
      this.positions.get(key) ?? {
        symbol: key,
        direction: "FLAT",
        quantity: 0,
        averageEntryPrice: null,
        updatedAt: null,
      }
    );
  }

  setInternalPosition(position) {
    const symbol = normalizeSymbol(position?.symbol);

    if (!symbol) {
      return;
    }

    if (positive(position?.quantity) <= 0) {
      this.positions.delete(symbol);
      return;
    }

    this.positions.set(symbol, {
      symbol,
      direction: position.direction,
      quantity: round(position.quantity),
      averageEntryPrice:
        position.averageEntryPrice == null
          ? null
          : round(position.averageEntryPrice),
      updatedAt: nowIso(),
    });
  }

  applyFill({
    symbol,
    side,
    quantity,
    price,
    reduceOnly = false,
  }) {
    const normalizedSymbol =
      normalizeSymbol(symbol);

    const normalizedSide =
      normalizeSide(side);

    const fillQuantity =
      positive(quantity);

    const fillPrice =
      positive(price, this.defaultPrice);

    const current =
      this.getInternalPosition(
        normalizedSymbol,
      );

    const incomingDirection =
      sideToDirection(normalizedSide);

    /*
     * REDUCE-ONLY
     *
     * Absolutely forbidden from:
     * - opening a flat position
     * - increasing a position
     * - flipping a position
     */
    if (reduceOnly) {
      if (
        current.direction === "FLAT" ||
        current.quantity <= 0
      ) {
        return {
          appliedQuantity: 0,
          position:
            this.getInternalPosition(
              normalizedSymbol,
            ),
        };
      }

      const reductionSide =
        current.direction === "LONG"
          ? "SELL"
          : "BUY";

      if (normalizedSide !== reductionSide) {
        return {
          appliedQuantity: 0,
          position: clone(current),
        };
      }

      const appliedQuantity =
        Math.min(
          current.quantity,
          fillQuantity,
        );

      const remaining =
        round(
          current.quantity -
            appliedQuantity,
        );

      if (remaining <= 0) {
        this.positions.delete(
          normalizedSymbol,
        );

        return {
          appliedQuantity,
          position: {
            symbol: normalizedSymbol,
            direction: "FLAT",
            quantity: 0,
            averageEntryPrice: null,
            updatedAt: nowIso(),
          },
        };
      }

      const updated = {
        ...current,
        quantity: remaining,
        updatedAt: nowIso(),
      };

      this.positions.set(
        normalizedSymbol,
        updated,
      );

      return {
        appliedQuantity,
        position: clone(updated),
      };
    }

    /*
     * OPEN / INCREASE
     */
    if (
      current.direction === "FLAT" ||
      current.quantity <= 0
    ) {
      const created = {
        symbol: normalizedSymbol,
        direction: incomingDirection,
        quantity: round(fillQuantity),
        averageEntryPrice:
          round(fillPrice),
        updatedAt: nowIso(),
      };

      this.positions.set(
        normalizedSymbol,
        created,
      );

      return {
        appliedQuantity: fillQuantity,
        position: clone(created),
      };
    }

    /*
     * Same direction = increase.
     */
    if (
      current.direction ===
      incomingDirection
    ) {
      const newQuantity =
        current.quantity +
        fillQuantity;

      const weightedPrice =
        (
          current.quantity *
            finite(
              current.averageEntryPrice,
              fillPrice,
            ) +
          fillQuantity *
            fillPrice
        ) / newQuantity;

      const updated = {
        ...current,
        quantity:
          round(newQuantity),
        averageEntryPrice:
          round(weightedPrice),
        updatedAt: nowIso(),
      };

      this.positions.set(
        normalizedSymbol,
        updated,
      );

      return {
        appliedQuantity: fillQuantity,
        position: clone(updated),
      };
    }

    /*
     * Non-reduce-only opposite order.
     *
     * Paper adapter supports normal netting,
     * including a flip when quantity exceeds
     * the existing position.
     *
     * Risk layers upstream should normally
     * prevent accidental flips.
     */
    if (
      fillQuantity <
      current.quantity
    ) {
      const updated = {
        ...current,
        quantity: round(
          current.quantity -
            fillQuantity,
        ),
        updatedAt: nowIso(),
      };

      this.positions.set(
        normalizedSymbol,
        updated,
      );

      return {
        appliedQuantity: fillQuantity,
        position: clone(updated),
      };
    }

    if (
      fillQuantity ===
      current.quantity
    ) {
      this.positions.delete(
        normalizedSymbol,
      );

      return {
        appliedQuantity: fillQuantity,
        position: {
          symbol: normalizedSymbol,
          direction: "FLAT",
          quantity: 0,
          averageEntryPrice: null,
          updatedAt: nowIso(),
        },
      };
    }

    const remainder =
      fillQuantity -
      current.quantity;

    const flipped = {
      symbol: normalizedSymbol,
      direction:
        oppositeDirection(
          current.direction,
        ),
      quantity: round(remainder),
      averageEntryPrice:
        round(fillPrice),
      updatedAt: nowIso(),
    };

    this.positions.set(
      normalizedSymbol,
      flipped,
    );

    return {
      appliedQuantity: fillQuantity,
      position: clone(flipped),
    };
  }

  async submitOrder(request = {}) {
    const symbol =
      normalizeSymbol(request.symbol);

    const side =
      normalizeSide(request.side);

    const requestedQuantity =
      positive(request.quantity);

    const price =
      positive(
        request.price,
        this.defaultPrice,
      );

    const clientOrderId =
      request.clientOrderId
        ? String(request.clientOrderId)
        : null;

    const reduceOnly =
      Boolean(request.reduceOnly);

    /*
     * Idempotency / duplicate protection.
     */
    const duplicate =
      this.findByClientOrderId(
        clientOrderId,
      );

    if (duplicate) {
      return {
        status:
          "DUPLICATE_CLIENT_ORDER_ID",
        accepted: false,
        duplicate: true,
        order: clone(duplicate),
      };
    }

    if (
      !symbol ||
      !side ||
      requestedQuantity <= 0
    ) {
      return {
        status: "REJECTED",
        accepted: false,
        reason:
          "INVALID_ORDER_REQUEST",
        order: null,
      };
    }

    if (
      request.forceReject === true
    ) {
      const rejected = {
        orderId: this.nextOrderId(),
        clientOrderId,
        symbol,
        side,
        requestedQuantity,
        filledQuantity: 0,
        remainingQuantity:
          requestedQuantity,
        averageFillPrice: null,
        reduceOnly,
        status: "REJECTED",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      this.orders.set(
        rejected.orderId,
        rejected,
      );

      return {
        status: "REJECTED",
        accepted: false,
        reason:
          request.rejectReason ??
          "PAPER_FORCED_REJECTION",
        order: clone(rejected),
      };
    }

    const fillRatio =
      request.fillRatio == null
        ? this.defaultFillRatio
        : Math.min(
            1,
            positive(
              request.fillRatio,
            ),
          );

    const attemptedFillQuantity =
      round(
        requestedQuantity *
          fillRatio,
      );

    const application =
      this.applyFill({
        symbol,
        side,
        quantity:
          attemptedFillQuantity,
        price,
        reduceOnly,
      });

    const actualFillQuantity =
      round(
        application.appliedQuantity,
      );

    const remainingQuantity =
      round(
        requestedQuantity -
          actualFillQuantity,
      );

    let status;

    if (actualFillQuantity <= 0) {
      status =
        reduceOnly
          ? "REJECTED"
          : "ACKNOWLEDGED";
    } else if (
      remainingQuantity > 0
    ) {
      status =
        "PARTIALLY_FILLED";
    } else {
      status = "FILLED";
    }

    const order = {
      orderId: this.nextOrderId(),
      clientOrderId,
      symbol,
      side,
      requestedQuantity,
      filledQuantity:
        actualFillQuantity,
      remainingQuantity,
      averageFillPrice:
        actualFillQuantity > 0
          ? round(price)
          : null,
      reduceOnly,
      status,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    this.orders.set(
      order.orderId,
      order,
    );

    if (actualFillQuantity > 0) {
      this.fills.push({
        fillId: this.nextFillId(),
        orderId: order.orderId,
        clientOrderId,
        symbol,
        side,
        quantity:
          actualFillQuantity,
        price: round(price),
        reduceOnly,
        timestamp: nowIso(),
      });
    }

    return {
      status,
      accepted:
        status !== "REJECTED",
      duplicate: false,
      order: clone(order),
      position:
        clone(application.position),
    };
  }

  async cancelOrder({
    orderId = null,
    clientOrderId = null,
  } = {}) {
    let order = null;

    if (orderId) {
      order =
        this.orders.get(orderId) ??
        null;
    }

    if (
      !order &&
      clientOrderId
    ) {
      order =
        this.findByClientOrderId(
          clientOrderId,
        );
    }

    if (!order) {
      return {
        status: "ORDER_NOT_FOUND",
        cancelled: false,
      };
    }

    if (
      ["FILLED", "CANCELLED", "REJECTED"].includes(
        order.status,
      )
    ) {
      return {
        status:
          "ORDER_NOT_CANCELLABLE",
        cancelled: false,
        order: clone(order),
      };
    }

    order.status = "CANCELLED";
    order.updatedAt = nowIso();

    this.orders.set(
      order.orderId,
      order,
    );

    return {
      status: "CANCELLED",
      cancelled: true,
      order: clone(order),
    };
  }

  async replaceStop({
    symbol,
    stopPrice,
    quantity = null,
  } = {}) {
    const normalizedSymbol =
      normalizeSymbol(symbol);

    const position =
      this.getInternalPosition(
        normalizedSymbol,
      );

    if (
      !normalizedSymbol ||
      position.direction === "FLAT"
    ) {
      return {
        status:
          "STOP_REPLACEMENT_REJECTED",
        replaced: false,
        reason:
          "NO_OPEN_POSITION",
      };
    }

    const normalizedStop =
      positive(stopPrice);

    if (normalizedStop <= 0) {
      return {
        status:
          "STOP_REPLACEMENT_REJECTED",
        replaced: false,
        reason:
          "INVALID_STOP_PRICE",
      };
    }

    const protectedQuantity =
      quantity == null
        ? position.quantity
        : Math.min(
            position.quantity,
            positive(quantity),
          );

    const stop = {
      symbol: normalizedSymbol,
      direction:
        position.direction,
      stopPrice:
        round(normalizedStop),
      quantity:
        round(protectedQuantity),
      reduceOnly: true,
      updatedAt: nowIso(),
    };

    this.stops.set(
      normalizedSymbol,
      stop,
    );

    return {
      status: "STOP_REPLACED",
      replaced: true,
      stop: clone(stop),
    };
  }

  async closePosition({
    symbol,
    quantity = null,
    price = null,
    clientOrderId = null,
  } = {}) {
    const normalizedSymbol =
      normalizeSymbol(symbol);

    const position =
      this.getInternalPosition(
        normalizedSymbol,
      );

    if (
      position.direction === "FLAT"
    ) {
      return {
        status:
          "NO_OPEN_POSITION",
        accepted: false,
      };
    }

    const closeQuantity =
      quantity == null
        ? position.quantity
        : Math.min(
            position.quantity,
            positive(quantity),
          );

    const side =
      position.direction === "LONG"
        ? "SELL"
        : "BUY";

    return this.submitOrder({
      symbol: normalizedSymbol,
      side,
      quantity:
        closeQuantity,
      price:
        positive(
          price,
          this.defaultPrice,
        ),
      reduceOnly: true,
      clientOrderId,
      fillRatio: 1,
    });
  }

  async emergencyClose({
    symbol,
    price = null,
    clientOrderId = null,
  } = {}) {
    const result =
      await this.closePosition({
        symbol,
        price,
        clientOrderId,
      });

    return {
      ...result,
      emergency: true,
    };
  }

  async getOrder({
    orderId = null,
    clientOrderId = null,
  } = {}) {
    let order = null;

    if (orderId) {
      order =
        this.orders.get(orderId) ??
        null;
    }

    if (
      !order &&
      clientOrderId
    ) {
      order =
        this.findByClientOrderId(
          clientOrderId,
        );
    }

    return clone(order);
  }

  async getPosition(symbol) {
    return clone(
      this.getInternalPosition(
        symbol,
      ),
    );
  }

  async getPositions() {
  return Array.from(
    this.positions.values(),
  ).map(
    clone,
  );
}

  async getOpenOrders({
    symbol = null,
  } = {}) {
    const normalizedSymbol =
      symbol
        ? normalizeSymbol(symbol)
        : null;

    const openStatuses =
      new Set([
        "ACKNOWLEDGED",
        "PARTIALLY_FILLED",
        "SUBMITTED",
      ]);

    return Array.from(
      this.orders.values(),
    )
      .filter(
        (order) =>
          openStatuses.has(
            order.status,
          ) &&
          (
            !normalizedSymbol ||
            order.symbol ===
              normalizedSymbol
          ),
      )
      .map(clone);
  }

  getSnapshot() {
    return {
      adapter: this.name,

      paperExecution:
        this.paperExecution,

      liveExecution:
        this.liveExecution,

      orders: Array.from(
        this.orders.values(),
      ).map(clone),

      positions: Array.from(
        this.positions.values(),
      ).map(clone),

      fills:
        this.fills.map(clone),

      stops: Array.from(
        this.stops.values(),
      ).map(clone),
    };
  }

  /*
   * ==========================================================
   * PERSISTENT STATE EXPORT
   * ==========================================================
   *
   * Phase 5.28
   *
   * This exports only PAPER exchange state.
   *
   * It does NOT:
   * - submit orders
   * - contact an exchange
   * - enable live execution
   * - grant execution authority
   *
   * Maps are serialized as arrays so the checkpoint can be
   * safely written as JSON.
   */

  exportPersistentState() {
    return {
      version: 1,

      adapter:
        this.name,

      paperExecution:
        true,

      liveExecution:
        false,

      orders: Array.from(
        this.orders.values(),
      ).map(clone),

      positions: Array.from(
        this.positions.values(),
      ).map(clone),

      fills:
        this.fills.map(clone),

      stops: Array.from(
        this.stops.values(),
      ).map(clone),

      exportedAt:
        new Date()
          .toISOString(),
    };
  }

  /*
   * ==========================================================
   * PERSISTENT STATE RESTORE
   * ==========================================================
   *
   * Reconstructs the in-memory PAPER exchange after restart.
   *
   * Important:
   *
   * We restore:
   * - orders
   * - positions
   * - fills
   * - protective stops
   *
   * We deliberately do NOT restore execution authority or
   * live-execution capability from the checkpoint.
   */

  restorePersistentState(
    snapshot = {},
  ) {
    if (
      !snapshot ||
      typeof snapshot !== "object"
    ) {
      return {
        approved: false,

        status:
          "EXCHANGE_STATE_RESTORE_BLOCKED",

        blocker:
          "INVALID_EXCHANGE_STATE",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    if (
      snapshot.version !== undefined &&
      Number(snapshot.version) !== 1
    ) {
      return {
        approved: false,

        status:
          "EXCHANGE_STATE_RESTORE_BLOCKED",

        blocker:
          "UNSUPPORTED_EXCHANGE_STATE_VERSION",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    /*
     * ----------------------------------------------------------
     * ORDERS
     * ----------------------------------------------------------
     */

    const restoredOrders =
      Array.isArray(
        snapshot.orders,
      )
        ? snapshot.orders
        : [];

    this.orders =
      new Map();

    for (
      const rawOrder
      of restoredOrders
    ) {
      if (
        !rawOrder ||
        typeof rawOrder !== "object"
      ) {
        continue;
      }

      const order =
        clone(rawOrder);

      const orderId =
        order.orderId ??
        order.id ??
        null;

      if (!orderId) {
        continue;
      }

      this.orders.set(
        orderId,
        order,
      );
    }

    /*
     * ----------------------------------------------------------
     * POSITIONS
     * ----------------------------------------------------------
     */

    const restoredPositions =
      Array.isArray(
        snapshot.positions,
      )
        ? snapshot.positions
        : [];

    this.positions =
      new Map();

    for (
      const rawPosition
      of restoredPositions
    ) {
      if (
        !rawPosition ||
        typeof rawPosition !== "object"
      ) {
        continue;
      }

      const position =
        clone(rawPosition);

      const symbol =
        normalizeSymbol(
          position.symbol,
        );

      if (!symbol) {
        continue;
      }

      this.positions.set(
        symbol,
        position,
      );
    }

    /*
     * ----------------------------------------------------------
     * FILLS
     * ----------------------------------------------------------
     */

    this.fills =
      Array.isArray(
        snapshot.fills,
      )
        ? snapshot.fills
            .map(clone)
        : [];

    /*
     * ----------------------------------------------------------
     * PROTECTIVE STOPS
     * ----------------------------------------------------------
     */

    const restoredStops =
      Array.isArray(
        snapshot.stops,
      )
        ? snapshot.stops
        : [];

    this.stops =
      new Map();

    for (
      const rawStop
      of restoredStops
    ) {
      if (
        !rawStop ||
        typeof rawStop !== "object"
      ) {
        continue;
      }

      const stop =
        clone(rawStop);

      const symbol =
        normalizeSymbol(
          stop.symbol,
        );

      if (!symbol) {
        continue;
      }

      this.stops.set(
        symbol,
        stop,
      );
    }

    /*
     * ----------------------------------------------------------
     * SAFETY INVARIANTS
     * ----------------------------------------------------------
     *
     * Persistence must NEVER turn the paper adapter into a live
     * adapter.
     */

    this.paperExecution =
      true;

    this.liveExecution =
      false;

    return {
      approved: true,

      status:
        "EXCHANGE_STATE_RESTORED",

      orders:
        this.orders.size,

      positions:
        this.positions.size,

      fills:
        this.fills.length,

      stops:
        this.stops.size,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }
}
export function createPaperCryptoExchangeAdapter(
  options = {},
) {
  return new PaperCryptoExchangeAdapter(
    options,
  );
}

export default createPaperCryptoExchangeAdapter;