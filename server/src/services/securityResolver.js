/**
 * VERIFIED SECURITY RESOLVER
 *
 * Fail-closed symbol -> CUSIP resolver for SEC 13F holdings.
 *
 * IMPORTANT:
 * - No fuzzy issuer-name matching.
 * - No ticker guessing from CUSIP.
 * - A holding matches only when the requested symbol has a
 *   verified CUSIP identity and the holding CUSIP equals it.
 *
 * The resolver accepts an injected lookup function so production
 * can use a verified security-master source without coupling this
 * service to a particular vendor.
 */

function normalizeSymbol(value) {
  const symbol = String(value ?? "").trim().toUpperCase();
  return symbol || null;
}

export function normalizeCusip(value) {
  const cusip = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z*@#]/g, "");

  return cusip || null;
}

function normalizeIdentity(raw, requestedSymbol) {
  if (!raw || typeof raw !== "object") return null;

  const symbol = normalizeSymbol(
    raw.symbol ??
    raw.ticker ??
    requestedSymbol,
  );

  const cusip = normalizeCusip(
    raw.cusip ??
    raw.securityCusip ??
    raw.identifiers?.cusip,
  );

  const verified =
    raw.verified === true ||
    raw.isVerified === true ||
    raw.confidence === 1 ||
    String(raw.method ?? "").toUpperCase().includes("VERIFIED");

  if (!symbol || !cusip || verified !== true) return null;

  return {
    symbol,
    cusip,
    verified: true,
    source: raw.source ?? null,
    method: raw.method ?? "VERIFIED_SECURITY_MASTER",
  };
}

export function createSecurityResolver({
  lookupSecurityIdentity = null,
  identities = [],
} = {}) {
  const staticMap = new Map();

  for (const raw of Array.isArray(identities) ? identities : []) {
    const symbol = normalizeSymbol(raw?.symbol ?? raw?.ticker);
    const identity = normalizeIdentity(raw, symbol);
    if (symbol && identity) staticMap.set(symbol, identity);
  }

  const identityCache = new Map();

  async function resolveIdentity(symbol) {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return null;

    if (identityCache.has(normalized)) {
      return identityCache.get(normalized);
    }

    let identity = staticMap.get(normalized) ?? null;

    if (!identity && typeof lookupSecurityIdentity === "function") {
      identity = normalizeIdentity(
        await lookupSecurityIdentity({ symbol: normalized }),
        normalized,
      );
    }

    if (identity?.symbol !== normalized) identity = null;
    identityCache.set(normalized, identity);
    return identity;
  }

  async function securityResolver({ symbol, holding } = {}) {
    const normalizedSymbol = normalizeSymbol(symbol);
    const holdingCusip = normalizeCusip(holding?.cusip);

    if (!normalizedSymbol || !holdingCusip) {
      return {
        matched: false,
        symbol: normalizedSymbol,
        reason: "MISSING_SYMBOL_OR_CUSIP",
      };
    }

    const identity = await resolveIdentity(normalizedSymbol);

    if (!identity) {
      return {
        matched: false,
        symbol: normalizedSymbol,
        reason: "NO_VERIFIED_SECURITY_IDENTITY",
      };
    }

    const matched = identity.cusip === holdingCusip;

    return {
      matched,
      symbol: normalizedSymbol,
      cusip: identity.cusip,
      holdingCusip,
      confidence: matched ? 1 : 0,
      method: "VERIFIED_CUSIP",
      source: identity.source,
      reason: matched ? null : "CUSIP_MISMATCH",
    };
  }

  securityResolver.resolveIdentity = resolveIdentity;
  securityResolver.clearCache = () => identityCache.clear();

  return securityResolver;
}

export default createSecurityResolver;
