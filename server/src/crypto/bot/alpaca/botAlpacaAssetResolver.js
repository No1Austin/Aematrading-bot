import { alpacaPaperGet } from "./botAlpacaReadClient.js";

const QUOTES = ["USDT", "USDC", "USD"];
export function parseBinanceSpotCandidate(symbol) {
  const normalized = String(symbol ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]+$/.test(normalized)) return null;
  for (const quote of QUOTES) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      return { base: normalized.slice(0, -quote.length), quote, sourceSymbol: normalized };
    }
  }
  return null;
}
export async function getAlpacaCryptoAssets() {
  const assets = await alpacaPaperGet("/v2/assets", { asset_class: "crypto", status: "active" });
  if (!Array.isArray(assets)) throw new Error("INVALID_ALPACA_ASSET_RESPONSE");
  return assets.filter(a => a?.class === "crypto" && a.status === "active" && a.tradable === true);
}
export function resolveAlpacaSpotAsset(binanceSymbol, assets) {
  const parsed = parseBinanceSpotCandidate(binanceSymbol);
  if (!parsed) return { approved: false, sourceSymbol: binanceSymbol, blockers: ["INVALID_SOURCE_SYMBOL"] };
  // Never silently convert USDT/USDC futures prices into USD spot prices.
  const exact = `${parsed.base}/${parsed.quote}`;
  const asset = assets.find(a => String(a.symbol).toUpperCase() === exact);
  const blockers = [];
  if (!asset) blockers.push("EXACT_PAIR_NOT_AVAILABLE_ON_ALPACA");
  if (asset && (asset.marginable || asset.shortable)) blockers.push("UNEXPECTED_SPOT_ASSET_FLAGS_REVIEW_REQUIRED");
  return {
    approved: blockers.length === 0,
    sourceSymbol: parsed.sourceSymbol,
    alpacaSymbol: asset?.symbol ?? null,
    assetId: asset?.id ?? null,
    minOrderSize: asset?.min_order_size ?? null,
    minTradeIncrement: asset?.min_trade_increment ?? null,
    priceIncrement: asset?.price_increment ?? null,
    quoteCurrency: parsed.quote,
    blockers
  };
}
