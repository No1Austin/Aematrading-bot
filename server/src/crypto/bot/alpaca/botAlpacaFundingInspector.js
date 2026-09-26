import { alpacaPaperGet } from './botAlpacaReadClient.js';

// Alpaca's USD account.cash is not proof of USDT or USDC spendable funding.
// This deliberately fails closed for currencies without a provider-confirmed balance.
export async function inspectAlpacaQuoteFunding(currency, { accountReader = alpacaPaperGet } = {}) {
  if (!['USD', 'USDT', 'USDC'].includes(currency)) throw new Error('UNSUPPORTED_QUOTE_CURRENCY');
  const account = await accountReader('/v2/account');
  if (account?.status !== 'ACTIVE' || account?.trading_blocked || account?.account_blocked ||
      account?.crypto_status !== 'ACTIVE') throw new Error('ALPACA_ACCOUNT_NOT_CRYPTO_READY');
  const observedAt = new Date().toISOString();
  if (currency !== 'USD') return { currency, verified: false, provider: 'ALPACA_PAPER',
    spendableQuote: null, observedAt, blocker: 'PROVIDER_QUOTE_FUNDING_AND_ORDER_ELIGIBILITY_NOT_ESTABLISHED' };
  const cash = Number(account.cash);
  if (!Number.isFinite(cash) || cash < 0) throw new Error('INVALID_ALPACA_USD_CASH');
  return { currency, verified: true, provider: 'ALPACA_PAPER', spendableQuote: cash,
    observedAt, accountScope: 'SHARED_ALPACA_PAPER_ACCOUNT' };
}
export default inspectAlpacaQuoteFunding;
