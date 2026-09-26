import { getAlpacaCryptoAssets, resolveAlpacaSpotAsset } from '../src/crypto/bot/alpaca/botAlpacaAssetResolver.js';
import { inspectAlpacaPaperState } from '../src/crypto/bot/alpaca/botAlpacaOrderReconciliation.js';
import { getAlpacaExactPairQuote } from '../src/crypto/bot/alpaca/botAlpacaQuoteProvider.js';
import { inspectAlpacaQuoteFunding } from '../src/crypto/bot/alpaca/botAlpacaFundingInspector.js';
const symbols = process.argv.slice(2).length ? process.argv.slice(2) : ['BTCUSD', 'BTCUSDT', 'BTCUSDC'];
try {
  const [assets, state] = await Promise.all([getAlpacaCryptoAssets(), inspectAlpacaPaperState()]);
  const checks = [];
  for (const sourceSymbol of symbols) {
    const asset = resolveAlpacaSpotAsset(sourceSymbol, assets);
    if (!asset.approved) { checks.push({ sourceSymbol, asset }); continue; }
    const [quote, funding] = await Promise.allSettled([
      getAlpacaExactPairQuote(asset.alpacaSymbol), inspectAlpacaQuoteFunding(asset.quoteCurrency)
    ]);
    checks.push({ sourceSymbol, asset,
      quote: quote.status === 'fulfilled' ? quote.value : { error: quote.reason.message },
      funding: funding.status === 'fulfilled' ? funding.value : { error: funding.reason.message } });
  }
  console.log(JSON.stringify({ status: 'READ_ONLY', mode: process.env.AEMA_BOT_EXECUTION_MODE || 'INTERNAL_PAPER',
    executionEnabled: false, sharedAccount: true, state, checks }, null, 2));
} catch (e) { console.error('ALPACA_PHASE2_CHECK_FAILED:', e.message); process.exitCode = 1; }
