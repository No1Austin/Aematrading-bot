/**
 * AEMA CRYPTO — HELIUS SOLANA INTELLIGENCE PROVIDER
 * Research-only on-chain data provider.
 *
 * Required env:
 *   HELIUS_API_KEY=...
 *
 * Optional:
 *   HELIUS_RPC_URL=https://mainnet.helius-rpc.com
 *   HELIUS_TIMEOUT_MS=12000
 *   HELIUS_MAX_RETRIES=2
 */

const API_KEY = String(process.env.HELIUS_API_KEY ?? "").trim();
const RPC_BASE = String(
  process.env.HELIUS_RPC_URL ?? "https://mainnet.helius-rpc.com",
).replace(/\/+$/, "");

const TIMEOUT_MS = Math.max(1000, Number(process.env.HELIUS_TIMEOUT_MS) || 12000);
const MAX_RETRIES = Math.max(0, Number(process.env.HELIUS_MAX_RETRIES) || 2);

function requireKey() {
  if (!API_KEY) throw new Error("HELIUS_API_KEY is required");
}

function rpcUrl() {
  requireKey();
  return `${RPC_BASE}/?api-key=${encodeURIComponent(API_KEY)}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postRpc(method, params, { timeoutMs = TIMEOUT_MS, retries = MAX_RETRIES } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(rpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `aema-${method}`,
          method,
          params,
        }),
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        const error = new Error(`Helius HTTP ${response.status}: ${text.slice(0, 500)}`);
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          lastError = error;
          await sleep(Math.min(4000, 500 * 2 ** attempt));
          continue;
        }
        throw error;
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Helius returned invalid JSON");
      }

      if (payload?.error) {
        throw new Error(
          `Helius RPC ${payload.error.code ?? "ERROR"}: ${payload.error.message ?? "Unknown error"}`,
        );
      }

      return payload?.result ?? null;
    } catch (error) {
      lastError = error;

      const retryable =
        error?.name === "AbortError" ||
        error instanceof TypeError;

      if (!retryable || attempt >= retries) {
        if (error?.name === "AbortError") {
          throw new Error(`Helius request timed out after ${timeoutMs}ms`);
        }
        throw error;
      }

      await sleep(Math.min(4000, 500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("Helius request failed");
}

/**
 * Fetch token accounts for a mint.
 * Helius getTokenAccounts returns owner + raw amount and supports pagination.
 */
export async function getTokenAccountsByMint(
  mint,
  {
    page = 1,
    limit = 1000,
  } = {},
) {
  const tokenMint = stringOrNull(mint);
  if (!tokenMint) throw new Error("mint is required");

  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 1000));
  const safePage = Math.max(1, Number(page) || 1);

  const result = await postRpc("getTokenAccounts", {
    page: safePage,
    limit: safeLimit,
    displayOptions: {},
    mint: tokenMint,
  });

  const rows =
    Array.isArray(result?.token_accounts)
      ? result.token_accounts
      : Array.isArray(result?.tokenAccounts)
        ? result.tokenAccounts
        : [];

  return {
    mint: tokenMint,
    page: safePage,
    limit: safeLimit,
    tokenAccounts: rows.map(row => ({
      address: stringOrNull(row?.address),
      mint: stringOrNull(row?.mint) ?? tokenMint,
      owner: stringOrNull(row?.owner),
      amountRaw: numberOrNull(row?.amount),
      delegatedAmountRaw: numberOrNull(row?.delegated_amount ?? row?.delegatedAmount),
      frozen: typeof row?.frozen === "boolean" ? row.frozen : null,
    })),
    raw: result,
  };
}

/**
 * Aggregate token accounts into unique owners.
 * Multiple token accounts belonging to one owner are combined.
 *
 * maxPages deliberately bounds API cost. A result can therefore be partial.
 */
export async function getTokenHolderSnapshot(
  mint,
  {
    maxPages = 3,
    pageSize = 1000,
  } = {},
) {
  const owners = new Map();
  const errors = [];
  let pagesFetched = 0;
  let exhausted = false;

  const pages = Math.max(1, Number(maxPages) || 1);

  for (let page = 1; page <= pages; page += 1) {
    try {
      const result = await getTokenAccountsByMint(mint, {
        page,
        limit: pageSize,
      });

      pagesFetched += 1;

      if (!result.tokenAccounts.length) {
        exhausted = true;
        break;
      }

      for (const account of result.tokenAccounts) {
        if (!account.owner) continue;

        const existing = owners.get(account.owner) ?? {
          owner: account.owner,
          amountRaw: 0,
          tokenAccountCount: 0,
          frozenAccountCount: 0,
        };

        if (account.amountRaw !== null) existing.amountRaw += account.amountRaw;
        existing.tokenAccountCount += 1;
        if (account.frozen === true) existing.frozenAccountCount += 1;

        owners.set(account.owner, existing);
      }

      if (result.tokenAccounts.length < Math.min(1000, Number(pageSize) || 1000)) {
        exhausted = true;
        break;
      }
    } catch (error) {
      errors.push({
        page,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const holders = [...owners.values()]
    .filter(row => row.amountRaw > 0)
    .sort((a, b) => b.amountRaw - a.amountRaw);

  const observedAmountRaw = holders.reduce((sum, row) => sum + row.amountRaw, 0);

  return {
    provider: "HELIUS",
    network: "solana",
    mint: stringOrNull(mint),
    holders,
    uniqueHolderCountObserved: holders.length,
    observedAmountRaw,
    pagesFetched,
    complete: exhausted && errors.length === 0,
    partial: !exhausted || errors.length > 0,
    errors,
    observedAt: new Date().toISOString(),
    researchOnly: true,
    executionAuthority: false,
  };
}

export default {
  getTokenAccountsByMint,
  getTokenHolderSnapshot,
};
