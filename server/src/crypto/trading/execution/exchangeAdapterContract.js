/**
 * AEMA CRYPTO
 * Phase 5.18
 *
 * Exchange Adapter Contract
 *
 * Defines the interface every execution adapter must implement.
 *
 * IMPORTANT:
 * - This file does not execute trades.
 * - Paper and live adapters must implement the same contract.
 */

export const CRYPTO_EXCHANGE_ADAPTER_METHODS = Object.freeze([
  "submitOrder",
  "cancelOrder",
  "replaceStop",
  "closePosition",
  "emergencyClose",
  "getOrder",
  "getPosition",
  "getOpenOrders",
]);

export class CryptoExchangeAdapterContract {
  constructor({
    name = "UNSPECIFIED",
    paperExecution = false,
    liveExecution = false,
  } = {}) {
    this.name = name;
    this.paperExecution = Boolean(paperExecution);
    this.liveExecution = Boolean(liveExecution);
  }

  async submitOrder() {
    throw new Error("submitOrder() not implemented");
  }

  async cancelOrder() {
    throw new Error("cancelOrder() not implemented");
  }

  async replaceStop() {
    throw new Error("replaceStop() not implemented");
  }

  async closePosition() {
    throw new Error("closePosition() not implemented");
  }

  async emergencyClose() {
    throw new Error("emergencyClose() not implemented");
  }

  async getOrder() {
    throw new Error("getOrder() not implemented");
  }

  async getPosition() {
    throw new Error("getPosition() not implemented");
  }

  async getOpenOrders() {
    throw new Error("getOpenOrders() not implemented");
  }
}

export function validateExchangeAdapter(adapter) {
  const missingMethods =
    CRYPTO_EXCHANGE_ADAPTER_METHODS.filter(
      (method) => typeof adapter?.[method] !== "function",
    );

  return {
    valid: missingMethods.length === 0,
    missingMethods,
    paperExecution: Boolean(adapter?.paperExecution),
    liveExecution: Boolean(adapter?.liveExecution),
  };
}

export default CryptoExchangeAdapterContract;