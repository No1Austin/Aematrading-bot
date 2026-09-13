const s = (v) => String(v ?? "").trim();
const lo = (v) => s(v).toLowerCase();
const up = (v) => s(v).toUpperCase();
const first = (...values) => values.map(s).find(Boolean) || "";

function extractAddress(value) {
  const raw = lo(value);
  const m = raw.match(/0x[a-f0-9]{40}/i);
  return m ? m[0].toLowerCase() : "";
}

function isValidAssetId(value) {
  const raw = lo(value);
  if (!raw) return false;
  if (raw.startsWith("null:")) return false;
  if (raw.startsWith("undefined:")) return false;
  if (raw.startsWith("unknown:")) return false;
  if (/^0x[a-f0-9]{40}$/i.test(raw)) return false;
  if (raw.includes("0x") && extractAddress(raw)) return false;
  return true;
}

export function getCryptoIdentity(candidate = {}) {
  const m = candidate.measurements ?? {};
  const d = candidate.discovery ?? {};
  const v = candidate.venue ?? {};

  const rawAssetId = first(
    candidate.assetId,
    candidate.coinGeckoId,
    m.assetId,
    m.coinGeckoId,
    d.assetId,
    d.coinGeckoId
  );

  const assetId = isValidAssetId(rawAssetId) ? lo(rawAssetId) : "";

  const symbol = up(first(candidate.symbol, m.symbol, d.symbol));
  const name = first(candidate.name, m.name, d.name);

  const chain = lo(first(
    candidate.chain,
    candidate.network,
    candidate.chainId,
    m.chain,
    m.network,
    m.chainId,
    d.chain,
    d.network,
    d.chainId
  ));

  const explicitAddress = first(
    candidate.contractAddress,
    candidate.address,
    m.contractAddress,
    m.address,
    d.contractAddress,
    d.address
  );

  const contractAddress = lo(explicitAddress || extractAddress(rawAssetId));

  const venue = lo(first(
    candidate.venueName,
    candidate.primaryVenue,
    v.name,
    v.id,
    m.primaryVenue
  ));

  const candidateType = up(first(candidate.candidateType, candidate.type)) || "UNKNOWN";

  let canonicalKey;
  let identityStrength;

  if (contractAddress && chain) {
    canonicalKey = `contract:${chain}:${contractAddress}`;
    identityStrength = "STRONG";
  } else if (assetId) {
    canonicalKey = `asset:${assetId}`;
    identityStrength = "STRONG";
  } else if (contractAddress) {
    canonicalKey = `contract:unknown:${contractAddress}`;
    identityStrength = "MEDIUM";
  } else if (symbol && name) {
    canonicalKey = `symbol-name:${symbol}:${lo(name)}`;
    identityStrength = "MEDIUM";
  } else if (symbol && venue) {
    canonicalKey = `symbol-venue:${symbol}:${venue}`;
    identityStrength = "WEAK";
  } else {
    canonicalKey = `symbol:${symbol || "UNKNOWN"}`;
    identityStrength = "WEAK";
  }

  return {
    canonicalKey,
    assetId: assetId || null,
    rawAssetId: rawAssetId || null,
    symbol: symbol || null,
    name: name || null,
    chain: chain || null,
    contractAddress: contractAddress || null,
    venue: venue || null,
    candidateType,
    identityStrength,
    invalidAssetIdNormalized: Boolean(rawAssetId && !assetId),
  };
}

export function analyzeCryptoCandidateIdentities(candidates = []) {
  const rows = candidates.map((candidate, index) => ({
    index,
    candidate,
    identity: getCryptoIdentity(candidate),
  }));

  const byCanonical = new Map();
  const bySymbol = new Map();

  for (const row of rows) {
    const key = row.identity.canonicalKey;
    const symbol = row.identity.symbol || "UNKNOWN";

    if (!byCanonical.has(key)) byCanonical.set(key, []);
    byCanonical.get(key).push(row);

    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(row);
  }

  const duplicateKeys = new Set(
    [...byCanonical.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key]) => key)
  );

  const collisionSymbols = new Set();

  for (const [symbol, items] of bySymbol.entries()) {
    const distinct = new Set(items.map((x) => x.identity.canonicalKey));
    if (items.length > 1 && distinct.size > 1) {
      collisionSymbols.add(symbol);
    }
  }

  return rows.map((row) => ({
    ...row,
    duplicate: duplicateKeys.has(row.identity.canonicalKey),
    symbolCollision: collisionSymbols.has(row.identity.symbol),
  }));
}

export function dedupeCryptoCandidates(candidates = []) {
  const analyzed = analyzeCryptoCandidateIdentities(candidates);
  const seen = new Set();
  const kept = [];
  const duplicates = [];

  for (const row of analyzed) {
    if (seen.has(row.identity.canonicalKey)) {
      duplicates.push(row);
      continue;
    }

    seen.add(row.identity.canonicalKey);
    kept.push(row.candidate);
  }

  return {
    candidates: kept,
    duplicates,
    analyzed,
  };
}
