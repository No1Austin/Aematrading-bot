import { getAlpacaCryptoAssets, resolveAlpacaSpotAsset } from "../src/crypto/bot/alpaca/botAlpacaAssetResolver.js";
import { inspectAlpacaPaperState } from "../src/crypto/bot/alpaca/botAlpacaOrderReconciliation.js";
import buildBotAlpacaSpotRiskPlan from "../src/crypto/bot/risk/botAlpacaSpotRiskManager.js";

// Intentionally never starts the bot, calls its execution cycle, or sends an order.
const symbols = process.argv.slice(2).length ? process.argv.slice(2) : ["BTCUSDT", "ETHUSDT", "BTCUSDC"];
try {
  const [assets, state] = await Promise.all([getAlpacaCryptoAssets(), inspectAlpacaPaperState()]);
  const results = symbols.map(symbol => resolveAlpacaSpotAsset(symbol, assets));
  // Static unit-style risk example, NOT a market quote or an order recommendation.
  const sizingExample = buildBotAlpacaSpotRiskPlan({ direction: "LONG", entry: 100,
    stop: 98, availableUsd: 1000, allocationUsd: 1000, alreadyCommittedUsd: 0,
    minOrderSize: 0.001, minTradeIncrement: 0.001, quoteCurrency: "USD",
    priceSource: "ALPACA_SAME_PAIR" });
  console.log(JSON.stringify({ status: "READ_ONLY", mode: process.env.AEMA_BOT_EXECUTION_MODE || "INTERNAL_PAPER",
    supportedAssetCount: assets.length, assetsChecked: results, accountState: state,
    hypotheticalSizingUnitExample: sizingExample,
    nextStep: "Alpaca price revalidation, durable order journal and separate position manager required before execution." }, null, 2));
} catch (e) { console.error("ALPACA_READINESS_FAILED:", e?.response?.status ?? "", e?.message ?? String(e)); process.exitCode = 1; }
