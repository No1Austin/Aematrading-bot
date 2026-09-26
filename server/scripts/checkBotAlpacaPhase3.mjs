import prepareAlpacaPaperOrderPreview from '../src/crypto/bot/alpaca/botAlpacaOrderPreview.js';
const symbol = process.argv[2] || 'BTCUSD';
const stop = Number(process.argv[3]);
const allocationQuote = Number(process.argv[4] || 1000);
if (!(stop > 0)) { console.error('Usage: node --env-file=.env scripts/checkBotAlpacaPhase3.mjs BTCUSD <hypothetical-stop-price> [allocation-usd]'); process.exit(2); }
try {
  const preview = await prepareAlpacaPaperOrderPreview({ sourceSymbol: symbol, stop, allocationQuote });
  console.log(JSON.stringify({ mode: process.env.AEMA_BOT_EXECUTION_MODE || 'INTERNAL_PAPER', ...preview }, null, 2));
} catch (error) { console.error('ALPACA_PHASE3_PREVIEW_FAILED:', error?.message || String(error)); process.exitCode = 1; }
