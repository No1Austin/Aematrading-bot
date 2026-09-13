/**
 * ============================================================
 * AEMA CRYPTO
 * PAPER CRYPTO EXCHANGE ADAPTER
 * Phases 5.18 + 5.28
 * ============================================================
 *
 * Simulated crypto exchange.
 *
 * Responsibilities:
 * - OPEN LONG / SHORT
 * - increase exposure
 * - reduce exposure
 * - close positions
 * - emergency close
 * - partial fills
 * - reduce-only protection
 * - duplicate client-order protection
 * - stop replacement
 * - order cancellation
 * - exchange-state inspection
 * - persistence / restart recovery
 *
 * IMPORTANT:
 * PAPER EXECUTION ONLY.
 *
 * NO network calls.
 * NO live exchange authority.
 */


function finite(
  value,
  fallback = 0,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function positive(
  value,
  fallback = 0,
) {
  return Math.max(
    0,
    finite(
      value,
      fallback,
    ),
  );
}


function normalizeSymbol(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}


function normalizeSide(
  value,
) {
  const side =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    side === "BUY" ||
    side === "SELL"
  ) {
    return side;
  }

  return null;
}


function normalizeDirection(
  value,
) {
  const direction =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return "FLAT";
}


function round(
  value,
  decimals = 8,
) {
  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        finite(value) +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
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


function nowIso() {
  return new Date()
    .toISOString();
}


function oppositeDirection(
  direction,
) {
  return (
    direction === "LONG"
      ? "SHORT"
      : direction === "SHORT"
        ? "LONG"
        : "FLAT"
  );
}


function sideToDirection(
  side,
) {
  if (
    side === "BUY"
  ) {
    return "LONG";
  }

  if (
    side === "SELL"
  ) {
    return "SHORT";
  }

  return "FLAT";
}


function makeFlatPosition(
  symbol,
) {
  return {
    symbol,

    direction:
      "FLAT",

    quantity:
      0,

    averageEntryPrice:
      null,

    exposure:
      0,

    updatedAt:
      nowIso(),
  };
}


/**
 * ============================================================
 * PAPER ADAPTER
 * ============================================================
 */

export class PaperCryptoExchangeAdapter {
  constructor({
    defaultPrice = 100,
    defaultFillRatio = 1,
  } = {}) {
    this.defaultPrice =
      positive(
        defaultPrice,
        100,
      );

    this.defaultFillRatio =
      Math.max(
        0,
        Math.min(
          1,
          finite(
            defaultFillRatio,
            1,
          ),
        ),
      );

    /**
     * Exchange truth.
     */

    this.positions =
      new Map();

    this.orders =
      new Map();

    this.fills =
      [];

    this.stops =
      new Map();

    /**
     * Duplicate submission protection.
     */

    this.processedClientOrderIds =
      new Set();

    this.sequence =
      0;

    /**
     * Hard safety properties.
     */

    this.paperExecution =
      true;

    this.liveExecution =
      false;

    this.executionAuthority =
      false;
  }


  /**
   * ==========================================================
   * INTERNAL HELPERS
   * ==========================================================
   */

  nextOrderId() {
    this.sequence +=
      1;

    return (
      `PAPER-${Date.now()}-${this.sequence}`
    );
  }


  getOrCreatePosition(
    symbol,
  ) {
    const key =
      normalizeSymbol(
        symbol,
      );

    if (!key) {
      return null;
    }

    if (
      !this.positions.has(
        key,
      )
    ) {
      this.positions.set(
        key,
        makeFlatPosition(
          key,
        ),
      );
    }

    return this.positions.get(
      key,
    );
  }


  /**
   * ==========================================================
   * POSITION READ
   * ==========================================================
   */

  async getPosition(
    symbol,
  ) {
    const key =
      normalizeSymbol(
        symbol,
      );

    if (!key) {
      return makeFlatPosition(
        "",
      );
    }

    const position =
      this.positions.get(
        key,
      );

    if (!position) {
      return makeFlatPosition(
        key,
      );
    }

    return clone(
      position,
    );
  }


  async getPositions() {
    return [
      ...this.positions
        .values(),
    ].map(
      clone,
    );
  }


  /**
   * ==========================================================
   * ORDER READ
   * ==========================================================
   */

  async getOrder(
    orderId,
  ) {
    const id =
      String(
        orderId ?? "",
      ).trim();

    if (!id) {
      return null;
    }

    const order =
      this.orders.get(
        id,
      );

    return order
      ? clone(order)
      : null;
  }


  async getOpenOrders(
    symbol = null,
  ) {
    const normalizedSymbol =
      symbol
        ? normalizeSymbol(
            symbol,
          )
        : null;

    return [
      ...this.orders.values(),
    ]
      .filter(
        order => {
          if (
            ![
              "CREATED",
              "SUBMITTED",
              "ACKNOWLEDGED",
              "PARTIALLY_FILLED",
            ].includes(
              order?.status,
            )
          ) {
            return false;
          }

          if (
            normalizedSymbol &&
            order?.symbol !==
              normalizedSymbol
          ) {
            return false;
          }

          return true;
        },
      )
      .map(
        clone,
      );
  }


  /**
   * ==========================================================
   * SUBMIT PAPER ORDER
   * ==========================================================
   */

  async submitOrder(
    request = {},
    options = {},
  ) {
    const symbol =
      normalizeSymbol(
        request?.symbol,
      );

    const side =
      normalizeSide(
        request?.side,
      );

    const quantity =
      positive(
        request?.quantity,
      );

    const reduceOnly =
      request?.reduceOnly ===
      true;

    const clientOrderId =
      String(
        request
          ?.clientOrderId ??
        "",
      ).trim();

    const orderType =
      String(
        request
          ?.orderType ??
        request?.type ??
        "MARKET",
      )
        .trim()
        .toUpperCase();

    const requestedPrice =
      positive(
        request?.price,
        this.defaultPrice,
      );

    /**
     * Basic validation.
     */

    if (
      !symbol ||
      !side ||
      quantity <= 0
    ) {
      return {
        accepted:
          false,

        status:
          "REJECTED",

        reason:
          "INVALID_ORDER",

        symbol:
          symbol || null,

        filledQuantity:
          0,

        remainingQuantity:
          quantity,

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    /**
     * Duplicate client-order ID.
     */

    if (
      clientOrderId &&
      this
        .processedClientOrderIds
        .has(
          clientOrderId,
        )
    ) {
      return {
        accepted:
          false,

        status:
          "DUPLICATE_CLIENT_ORDER_ID",

        clientOrderId,

        symbol,

        filledQuantity:
          0,

        remainingQuantity:
          quantity,

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    const exchangeOrderId =
      this.nextOrderId();

    const fillRatio =
      Math.max(
        0,
        Math.min(
          1,
          finite(
            options?.fillRatio ??
            request?.fillRatio,
            this
              .defaultFillRatio,
          ),
        ),
      );

    const forceReject =
      options
        ?.reject === true ||
      request
        ?.forceReject === true;

    if (forceReject) {
      const rejected = {
        exchangeOrderId,

        orderId:
          exchangeOrderId,

        clientOrderId:
          clientOrderId ||
          null,

        symbol,

        side,

        quantity,

        filledQuantity:
          0,

        remainingQuantity:
          quantity,

        averageFillPrice:
          null,

        status:
          "REJECTED",

        reduceOnly,

        orderType,

        createdAt:
          nowIso(),

        updatedAt:
          nowIso(),
      };

      this.orders.set(
        exchangeOrderId,
        rejected,
      );

      if (clientOrderId) {
        this
          .processedClientOrderIds
          .add(
            clientOrderId,
          );
      }

      return {
        accepted:
          false,

        ...clone(
          rejected,
        ),

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    const currentPosition =
      this.getOrCreatePosition(
        symbol,
      );

    let actualFillQuantity =
      round(
        quantity *
        fillRatio,
      );

    const fillPrice =
      requestedPrice > 0
        ? requestedPrice
        : this.defaultPrice;


    /**
     * ========================================================
     * REDUCE ONLY PROTECTION
     * ========================================================
     *
     * A reduce-only order may never:
     * - create a new position
     * - cross through FLAT
     * - reverse the position
     */

    if (reduceOnly) {
      if (
        currentPosition
          .direction ===
          "FLAT" ||
        currentPosition
          .quantity <= 0
      ) {
        actualFillQuantity =
          0;
      } else {
        const closingSide =
          currentPosition
            .direction ===
            "LONG"
            ? "SELL"
            : "BUY";

        if (
          side !== closingSide
        ) {
          actualFillQuantity =
            0;
        } else {
          actualFillQuantity =
            Math.min(
              actualFillQuantity,
              currentPosition
                .quantity,
            );
        }
      }
    }


    /**
     * If fill ratio > 0 but reduce-only safety leaves
     * nothing executable, reject rather than flip.
     */

    if (
      reduceOnly &&
      actualFillQuantity <=
        0
    ) {
      const blocked = {
        exchangeOrderId,

        orderId:
          exchangeOrderId,

        clientOrderId:
          clientOrderId ||
          null,

        symbol,

        side,

        quantity,

        filledQuantity:
          0,

        remainingQuantity:
          quantity,

        averageFillPrice:
          null,

        status:
          "REJECTED",

        reduceOnly:
          true,

        reason:
          "REDUCE_ONLY_WOULD_INCREASE_OR_FLIP_POSITION",

        orderType,

        createdAt:
          nowIso(),

        updatedAt:
          nowIso(),
      };

      this.orders.set(
        exchangeOrderId,
        blocked,
      );

      if (clientOrderId) {
        this
          .processedClientOrderIds
          .add(
            clientOrderId,
          );
      }

      return {
        accepted:
          false,

        ...clone(
          blocked,
        ),

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    /**
     * ========================================================
     * APPLY ACTUAL PAPER FILL
     * ========================================================
     */

    if (
      actualFillQuantity >
      0
    ) {
      this.applyPositionFill({
        symbol,

        side,

        quantity:
          actualFillQuantity,

        price:
          fillPrice,

        reduceOnly,
      });
    }


    const remainingQuantity =
      round(
        Math.max(
          0,
          quantity -
          actualFillQuantity,
        ),
      );

    const status =
      actualFillQuantity <= 0
        ? "ACKNOWLEDGED"
        : remainingQuantity > 0
          ? "PARTIALLY_FILLED"
          : "FILLED";


    const order = {
      exchangeOrderId,

      orderId:
        exchangeOrderId,

      clientOrderId:
        clientOrderId ||
        null,

      symbol,

      side,

      quantity,

      filledQuantity:
        actualFillQuantity,

      remainingQuantity,

      averageFillPrice:
        actualFillQuantity > 0
          ? fillPrice
          : null,

      price:
        fillPrice,

      status,

      reduceOnly,

      orderType,

      createdAt:
        nowIso(),

      updatedAt:
        nowIso(),

      paperExecution:
        true,

      liveExecution:
        false,
    };


    this.orders.set(
      exchangeOrderId,
      order,
    );


    if (clientOrderId) {
      this
        .processedClientOrderIds
        .add(
          clientOrderId,
        );
    }


    if (
      actualFillQuantity >
      0
    ) {
      this.fills.push({
        fillId:
          `${exchangeOrderId}:${actualFillQuantity}`,

        exchangeOrderId,

        orderId:
          exchangeOrderId,

        clientOrderId:
          clientOrderId ||
          null,

        symbol,

        side,

        quantity:
          actualFillQuantity,

        filledQuantity:
          actualFillQuantity,

        price:
          fillPrice,

        averageFillPrice:
          fillPrice,

        reduceOnly,

        createdAt:
          nowIso(),
      });
    }


    return {
      accepted:
        true,

      ...clone(
        order,
      ),

      position:
        await this.getPosition(
          symbol,
        ),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  /**
   * Compatibility aliases.
   */

  async executeOrder(
    request,
    options = {},
  ) {
    return this.submitOrder(
      request,
      options,
    );
  }


  async placeOrder(
    request,
    options = {},
  ) {
    return this.submitOrder(
      request,
      options,
    );
  }


  /**
   * ==========================================================
   * POSITION FILL ACCOUNTING
   * ==========================================================
   */

  applyPositionFill({
    symbol,
    side,
    quantity,
    price,
    reduceOnly,
  }) {
    const position =
      this.getOrCreatePosition(
        symbol,
      );

    const fillDirection =
      sideToDirection(
        side,
      );

    const qty =
      positive(
        quantity,
      );

    if (
      qty <= 0
    ) {
      return position;
    }


    /**
     * REDUCE ONLY
     */

    if (reduceOnly) {
      const remaining =
        Math.max(
          0,
          position.quantity -
          qty,
        );

      position.quantity =
        round(
          remaining,
        );

      if (
        position.quantity <=
        0
      ) {
        position.direction =
          "FLAT";

        position.quantity =
          0;

        position.averageEntryPrice =
          null;

        position.exposure =
          0;

        this.stops.delete(
          symbol,
        );
      }

      position.updatedAt =
        nowIso();

      return position;
    }


    /**
     * FLAT → OPEN
     */

    if (
      position.direction ===
        "FLAT" ||
      position.quantity <= 0
    ) {
      position.direction =
        fillDirection;

      position.quantity =
        round(qty);

      position.averageEntryPrice =
        price;

      position.exposure =
        1;

      position.updatedAt =
        nowIso();

      return position;
    }


    /**
     * SAME DIRECTION → ADD
     */

    if (
      position.direction ===
      fillDirection
    ) {
      const oldQuantity =
        position.quantity;

      const newQuantity =
        oldQuantity +
        qty;

      const oldPrice =
        finite(
          position
            .averageEntryPrice,
          price,
        );

      position.averageEntryPrice =
        round(
          (
            oldQuantity *
              oldPrice +
            qty *
              price
          ) /
            newQuantity,
        );

      position.quantity =
        round(
          newQuantity,
        );

      position.updatedAt =
        nowIso();

      return position;
    }


    /**
     * Opposite non-reduce-only fill.
     *
     * The integrated runtime should prevent direct flips,
     * but keep the paper venue deterministic if one arrives.
     */

    if (
      qty <
      position.quantity
    ) {
      position.quantity =
        round(
          position.quantity -
          qty,
        );

      position.updatedAt =
        nowIso();

      return position;
    }


    if (
      qty ===
      position.quantity
    ) {
      position.direction =
        "FLAT";

      position.quantity =
        0;

      position.averageEntryPrice =
        null;

      position.exposure =
        0;

      position.updatedAt =
        nowIso();

      this.stops.delete(
        symbol,
      );

      return position;
    }


    /**
     * Crossing through zero is deliberately prevented.
     *
     * Close existing quantity only.
     */

    position.direction =
      "FLAT";

    position.quantity =
      0;

    position.averageEntryPrice =
      null;

    position.exposure =
      0;

    position.updatedAt =
      nowIso();

    this.stops.delete(
      symbol,
    );

    return position;
  }


  /**
   * ==========================================================
   * CANCEL ORDER
   * ==========================================================
   */

  async cancelOrder(
    request = {},
  ) {
    const orderId =
      String(
        request?.orderId ??
        request?.exchangeOrderId ??
        request,
      ).trim();

    const order =
      this.orders.get(
        orderId,
      );

    if (!order) {
      return {
        accepted:
          false,

        status:
          "ORDER_NOT_FOUND",

        orderId,

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    if (
      [
        "FILLED",
        "CANCELLED",
        "REJECTED",
      ].includes(
        order.status,
      )
    ) {
      return {
        accepted:
          false,

        status:
          order.status,

        order:
          clone(order),

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    order.status =
      "CANCELLED";

    order.updatedAt =
      nowIso();

    this.orders.set(
      orderId,
      order,
    );


    return {
      accepted:
        true,

      status:
        "CANCELLED",

      ...clone(
        order,
      ),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  /**
   * ==========================================================
   * PROTECTIVE STOP
   * ==========================================================
   */

  async replaceStop(
    request = {},
  ) {
    const symbol =
      normalizeSymbol(
        request?.symbol,
      );

    const stopPrice =
      positive(
        request?.stopPrice ??
        request?.stop,
      );

    const quantity =
      positive(
        request?.quantity,
      );

    if (
      !symbol ||
      stopPrice <= 0
    ) {
      return {
        accepted:
          false,

        status:
          "STOP_REJECTED",

        reason:
          "INVALID_STOP_REQUEST",

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    const position =
      this.getOrCreatePosition(
        symbol,
      );

    if (
      position.direction ===
        "FLAT" ||
      position.quantity <= 0
    ) {
      return {
        accepted:
          false,

        status:
          "STOP_REJECTED",

        reason:
          "NO_OPEN_POSITION",

        paperExecution:
          true,

        liveExecution:
          false,

        executionAuthority:
          false,
      };
    }


    const stop = {
      symbol,

      direction:
        position.direction,

      quantity:
        quantity > 0
          ? Math.min(
              quantity,
              position.quantity,
            )
          : position.quantity,

      stopPrice,

      reduceOnly:
        true,

      updatedAt:
        nowIso(),
    };


    this.stops.set(
      symbol,
      stop,
    );


    return {
      accepted:
        true,

      status:
        "STOP_REPLACED",

      stop:
        clone(stop),

      position:
        clone(position),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  async getStop(
    symbol,
  ) {
    const key =
      normalizeSymbol(
        symbol,
      );

    const stop =
      this.stops.get(
        key,
      );

    return stop
      ? clone(stop)
      : null;
  }


  /**
   * ==========================================================
   * FILLS / STATE
   * ==========================================================
   */

  async getFills(
    symbol = null,
  ) {
    const key =
      symbol
        ? normalizeSymbol(
            symbol,
          )
        : null;

    return this.fills
      .filter(
        fill =>
          !key ||
          fill.symbol === key,
      )
      .map(
        clone,
      );
  }


  getState() {
    return {
      positions:
        [
          ...this.positions
            .values(),
        ].map(
          clone,
        ),

      orders:
        [
          ...this.orders
            .values(),
        ].map(
          clone,
        ),

      fills:
        clone(
          this.fills,
        ),

      stops:
        [
          ...this.stops
            .values(),
        ].map(
          clone,
        ),

      processedClientOrderIds:
        [
          ...this
            .processedClientOrderIds,
        ],

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  /**
   * ==========================================================
   * PHASE 5.28 — EXPORT PERSISTENT STATE
   * ==========================================================
   */

  exportPersistentState() {
    return {
      version:
        1,

      positions:
        [
          ...this.positions
            .entries(),
        ].map(
          ([
            symbol,
            position,
          ]) => ({
            symbol,

            position:
              clone(
                position,
              ),
          }),
        ),

      orders:
        [
          ...this.orders
            .entries(),
        ].map(
          ([
            orderId,
            order,
          ]) => ({
            orderId,

            order:
              clone(
                order,
              ),
          }),
        ),

      fills:
        clone(
          this.fills ??
          [],
        ),

      stops:
        [
          ...this.stops
            .entries(),
        ].map(
          ([
            symbol,
            stop,
          ]) => ({
            symbol,

            stop:
              clone(
                stop,
              ),
          }),
        ),

      processedClientOrderIds:
        [
          ...this
            .processedClientOrderIds,
        ],

      sequence:
        finite(
          this.sequence,
          0,
        ),

      defaultPrice:
        finite(
          this.defaultPrice,
          100,
        ),

      defaultFillRatio:
        finite(
          this.defaultFillRatio,
          1,
        ),

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  /**
   * ==========================================================
   * PHASE 5.28 — RESTORE PERSISTENT STATE
   * ==========================================================
   */

  restorePersistentState(
    snapshot,
  ) {
    if (
      !snapshot ||
      typeof snapshot !==
        "object"
    ) {
      return {
        approved:
          false,

        status:
          "EXCHANGE_RESTORE_REJECTED",

        blocker:
          "INVALID_EXCHANGE_SNAPSHOT",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    if (
      snapshot.version !==
      1
    ) {
      return {
        approved:
          false,

        status:
          "EXCHANGE_RESTORE_REJECTED",

        blocker:
          "UNSUPPORTED_EXCHANGE_SNAPSHOT_VERSION",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }


    /**
     * POSITIONS
     */

    this.positions =
      new Map();

    for (
      const item
      of (
        snapshot.positions ??
        []
      )
    ) {
      const symbol =
        normalizeSymbol(
          item?.symbol ??
          item
            ?.position
            ?.symbol,
        );

      if (!symbol) {
        continue;
      }

      this.positions.set(
        symbol,
        clone(
          item?.position ??
          makeFlatPosition(
            symbol,
          ),
        ),
      );
    }


    /**
     * ORDERS
     */

    this.orders =
      new Map();

    for (
      const item
      of (
        snapshot.orders ??
        []
      )
    ) {
      const orderId =
        String(
          item?.orderId ??
          item
            ?.order
            ?.orderId ??
          "",
        ).trim();

      if (!orderId) {
        continue;
      }

      this.orders.set(
        orderId,
        clone(
          item?.order ??
          {},
        ),
      );
    }


    /**
     * FILLS
     */

    this.fills =
      clone(
        snapshot.fills ??
        [],
      );


    /**
     * STOPS
     */

    this.stops =
      new Map();

    for (
      const item
      of (
        snapshot.stops ??
        []
      )
    ) {
      const symbol =
        normalizeSymbol(
          item?.symbol,
        );

      if (!symbol) {
        continue;
      }

      this.stops.set(
        symbol,
        clone(
          item?.stop ??
          {},
        ),
      );
    }


    /**
     * DUPLICATE ORDER PROTECTION
     */

    this.processedClientOrderIds =
      new Set(
        (
          snapshot
            .processedClientOrderIds ??
          []
        ).map(
          value =>
            String(value),
        ),
      );


    /**
     * SEQUENCE / CONFIGURATION
     */

    this.sequence =
      Math.max(
        0,
        finite(
          snapshot.sequence,
          0,
        ),
      );


    const restoredPrice =
      finite(
        snapshot.defaultPrice,
        null,
      );

    if (
      restoredPrice !==
        null &&
      restoredPrice > 0
    ) {
      this.defaultPrice =
        restoredPrice;
    }


    const restoredFillRatio =
      finite(
        snapshot
          .defaultFillRatio,
        null,
      );

    if (
      restoredFillRatio !==
      null
    ) {
      this.defaultFillRatio =
        Math.max(
          0,
          Math.min(
            1,
            restoredFillRatio,
          ),
        );
    }


    return {
      approved:
        true,

      status:
        "EXCHANGE_STATE_RESTORED",

      positionCount:
        this.positions.size,

      orderCount:
        this.orders.size,

      fillCount:
        this.fills.length,

      stopCount:
        this.stops.size,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }
}


/**
 * ============================================================
 * FACTORY
 * ============================================================
 */

export function createPaperCryptoExchangeAdapter(
  options = {},
) {
  return new PaperCryptoExchangeAdapter(
    options,
  );
}


export default
  createPaperCryptoExchangeAdapter;