/** AEMA CRYPTO — HYPERLIQUID INTELLIGENCE PROVIDER (read-only, research only) */
const INFO_URL = process.env.HYPERLIQUID_INFO_URL || "https://api.hyperliquid.xyz/info";

function finiteOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
function validWallet(v) { return /^0x[a-fA-F0-9]{40}$/.test(String(v ?? "")); }

async function postInfo(body, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "User-Agent": "AEMA-Research/1.0" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!r.ok) throw new Error(`HYPERLIQUID_HTTP_${r.status}:${(await r.text().catch(()=>" ")).slice(0,200)}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export async function getHyperliquidMarketContexts(options = {}) {
  const raw = await postInfo({ type: "metaAndAssetCtxs" }, options);
  const universe = Array.isArray(raw?.[0]?.universe) ? raw[0].universe : [];
  const contexts = Array.isArray(raw?.[1]) ? raw[1] : [];
  return universe.map((meta, i) => ({
    symbol: String(meta?.name ?? "").toUpperCase(),
    szDecimals: finiteOrNull(meta?.szDecimals),
    maxLeverage: finiteOrNull(meta?.maxLeverage),
    markPrice: finiteOrNull(contexts[i]?.markPx),
    oraclePrice: finiteOrNull(contexts[i]?.oraclePx),
    openInterest: finiteOrNull(contexts[i]?.openInterest),
    funding: finiteOrNull(contexts[i]?.funding),
    volume24hUsd: finiteOrNull(contexts[i]?.dayNtlVlm),
    premium: finiteOrNull(contexts[i]?.premium),
    source: "HYPERLIQUID",
    researchOnly: true,
  }));
}

export async function getHyperliquidWalletState(user, options = {}) {
  if (!validWallet(user)) throw new Error("HYPERLIQUID_INVALID_WALLET");
  const raw = await postInfo({ type: "clearinghouseState", user }, options);
  return {
    wallet: user.toLowerCase(),
    accountValueUsd: finiteOrNull(raw?.marginSummary?.accountValue),
    totalNotionalUsd: finiteOrNull(raw?.marginSummary?.totalNtlPos),
    marginUsedUsd: finiteOrNull(raw?.marginSummary?.totalMarginUsed),
    withdrawableUsd: finiteOrNull(raw?.withdrawable),
    positions: (Array.isArray(raw?.assetPositions) ? raw.assetPositions : []).map(x => x?.position).filter(Boolean).map(p => ({
      symbol: String(p?.coin ?? "").toUpperCase(),
      size: finiteOrNull(p?.szi),
      direction: finiteOrNull(p?.szi) === null ? null : finiteOrNull(p?.szi) > 0 ? "BULL" : finiteOrNull(p?.szi) < 0 ? "BEAR" : "FLAT",
      entryPrice: finiteOrNull(p?.entryPx),
      positionValueUsd: finiteOrNull(p?.positionValue),
      unrealizedPnlUsd: finiteOrNull(p?.unrealizedPnl),
      leverage: p?.leverage ?? null,
      liquidationPrice: finiteOrNull(p?.liquidationPx),
    })),
    source: "HYPERLIQUID", researchOnly: true, executionAuthority: false, liveExecution: false,
  };
}

export async function getHyperliquidUserFills(user, { aggregateByTime = true, ...options } = {}) {
  if (!validWallet(user)) throw new Error("HYPERLIQUID_INVALID_WALLET");
  const raw = await postInfo({ type: "userFills", user, aggregateByTime }, options);
  return (Array.isArray(raw) ? raw : []).map(f => ({
    wallet: user.toLowerCase(), symbol: String(f?.coin ?? "").toUpperCase(),
    side: f?.side === "B" ? "BUY" : f?.side === "A" ? "SELL" : null,
    direction: String(f?.dir ?? ""), price: finiteOrNull(f?.px), size: finiteOrNull(f?.sz),
    closedPnlUsd: finiteOrNull(f?.closedPnl), feeUsd: finiteOrNull(f?.fee),
    timestamp: finiteOrNull(f?.time), txHash: f?.hash ?? null,
    source: "HYPERLIQUID", researchOnly: true,
  }));
}

export default { getHyperliquidMarketContexts, getHyperliquidWalletState, getHyperliquidUserFills };
