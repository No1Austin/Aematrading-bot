import submitOneGuardedAlpacaPaperOrder from '../src/crypto/bot/alpaca/botAlpacaPaperExecutor.js';
// Requires explicit operator command-line confirmation AND environment authorization.
if (process.argv[2] !== 'I_AUTHORIZE_ONE_PAPER_ORDER') throw Error('EXPLICIT_CONFIRMATION_ARGUMENT_REQUIRED');
const stop = Number(process.argv[3]);
if (!Number.isFinite(stop) || stop <= 0) throw Error('VALID_STOP_REQUIRED');
console.log(JSON.stringify(await submitOneGuardedAlpacaPaperOrder({ sourceSymbol: 'BTCUSD', stop,
  allocationQuote: 1000, explicitAuthorization: true }), null, 2));
