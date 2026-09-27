// READ-ONLY: dedicated account preflight + existing BTC/USD validator preview.
// Never submits, cancels or changes an order.
import { inspectDedicatedAlpacaStartup } from '../src/crypto/bot/alpaca/botAlpacaStartupPreflight.js';
import { prepareAlpacaPaperOrderPreview } from '../src/crypto/bot/alpaca/botAlpacaOrderPreview.js';
import { readExecutionJournal } from '../src/crypto/bot/alpaca/botAlpacaExecutionJournal.js';
const stop = Number(process.env.AEMA_PILOT_BTC_STOP_USD);
const allocationQuote = Number(process.env.AEMA_PILOT_ALLOCATION_USD || '100');
const clean = x => JSON.stringify(x, null, 2);
try {
  const preflight = await inspectDedicatedAlpacaStartup();
  console.log('PREFLIGHT', clean(preflight));
  if (preflight.status !== 'READY_FOR_GUARDED_TESTS') process.exit(2);
  const journal = readExecutionJournal();
  if (journal.records.length) {
    console.log('BLOCKED: existing execution journal requires reconciliation; records:', journal.records.length);
    process.exit(3);
  }
  if (!Number.isFinite(stop) || stop <= 0 || !Number.isFinite(allocationQuote) || allocationQuote <= 0 || allocationQuote > 100) {
    console.log('BLOCKED: set AEMA_PILOT_BTC_STOP_USD to a deliberate positive USD price, and allocation <= $100.');
    process.exit(4);
  }
  const preview = await prepareAlpacaPaperOrderPreview({sourceSymbol:'BTCUSD',direction:'LONG',stop,allocationQuote,persist:false});
  console.log('READ_ONLY_PREVIEW', clean(preview));
  if (!preview.approvedForPreview) process.exit(5);
  if (stop >= preview.indicativeAsk) { console.log('BLOCKED: stop must be below current BTC/USD ask for bullish spot pilot'); process.exit(6); }
  console.log('READY_FOR_MANUAL_PILOT_REVIEW: NO ORDER HAS BEEN SENT');
} catch (error) {
  console.error('PILOT_PREVIEW_FAILED', error?.message || 'UNKNOWN');
  process.exitCode = 1;
}
