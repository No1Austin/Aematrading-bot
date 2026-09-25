import {
  getCryptoFundamentalEvidence,
} from "../src/crypto/data/providers/cryptoFundamentalEvidenceProvider.js";

import {
  buildOnChainSupportingIntelligenceFromEvidence,
} from "../src/crypto/research/cryptoSupportingIntelligenceContext.js";

const symbol = String(process.argv[2] ?? "SOL").trim().toUpperCase();
const known = {
  SOL: { symbol: "SOL", name: "Solana", assetId: "solana" },
  BTC: { symbol: "BTC", name: "Bitcoin", assetId: "bitcoin" },
  ETH: { symbol: "ETH", name: "Ethereum", assetId: "ethereum" },
};
const asset = known[symbol] ?? { symbol, name: symbol, assetId: symbol.toLowerCase() };

try {
  const evidence = await getCryptoFundamentalEvidence(asset, { refresh: true });
  const derived = buildOnChainSupportingIntelligenceFromEvidence(evidence);

  console.log("\n=== AEMA ON-CHAIN HANDOFF DIAGNOSTIC ===");
  console.log("Asset:", asset);
  console.log("\n--- Provider diagnostics ---");
  console.dir(derived?.diagnostics, { depth: 8, colors: true });
  console.log("\n--- Freshness ---");
  console.dir(derived?.freshness, { depth: 8, colors: true });
  console.log("\n--- Families ---");
  console.dir(derived?.families, { depth: 8, colors: true });
  console.log("\n--- Aggregated on-chain ---");
  console.dir(derived?.onChain, { depth: 8, colors: true });

  if (!derived?.onChain) process.exitCode = 2;
} catch (error) {
  console.error("\nON-CHAIN DIAGNOSTIC FAILED");
  console.error(error);
  process.exitCode = 1;
}
