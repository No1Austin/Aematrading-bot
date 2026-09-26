import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseExactAlpacaPair, getAlpacaExactPairQuote } from '../src/crypto/bot/alpaca/botAlpacaQuoteProvider.js';
import buildRisk from '../src/crypto/bot/risk/botAlpacaMultiQuoteRiskManager.js';
import inspectFunding from '../src/crypto/bot/alpaca/botAlpacaFundingInspector.js';
import { appendBotAlpacaObservation } from '../src/crypto/bot/alpaca/botAlpacaOrderJournal.js';
const now = () => new Date().toISOString();
test('pair parser preserves quote currency', () => {
  assert.equal(parseExactAlpacaPair('btc/usdt').quote, 'USDT');
  assert.equal(parseExactAlpacaPair('btc/usdc').quote, 'USDC');
  assert.throws(() => parseExactAlpacaPair('BTC/GBP'));
});
test('exact-pair quotes reject stale data', async () => {
  const quote = await getAlpacaExactPairQuote('BTC/USDT', { fetchQuote: async () => ({ bp: 100, ap: 101, t: now() }) });
  assert.equal(quote.symbol, 'BTC/USDT');
  await assert.rejects(getAlpacaExactPairQuote('BTC/USDT', { fetchQuote: async () => ({ bp: 100, ap: 101, t: '2020-01-01T00:00:00Z' }) }));
});
test('USDT/USDC fail closed without independent provider funding', async () => {
  for (const currency of ['USDT', 'USDC']) {
    const f = await inspectFunding(currency, { accountReader: async () => ({ status: 'ACTIVE', crypto_status: 'ACTIVE', cash: '100000' }) });
    assert.equal(f.verified, false);
    const p = buildRisk({ direction: 'LONG', pair: `BTC/${currency}`, entry: 100, stop: 98,
      verifiedSpendableQuote: 1000, allocationQuote: 1000, minOrderSize: 0.001,
      minTradeIncrement: 0.001, spreadPercent: 0.1, priceSource: 'ALPACA_SAME_PAIR', fundingEvidence: f });
    assert.equal(p.approved, false);
  }
});
test('USD calculation only with verified funding', () => {
  const p = buildRisk({ direction: 'LONG', pair: 'BTC/USD', entry: 100, stop: 98,
    verifiedSpendableQuote: 1000, allocationQuote: 1000, minOrderSize: 0.001,
    minTradeIncrement: 0.001, spreadPercent: 0.1, priceSource: 'ALPACA_SAME_PAIR',
    fundingEvidence: { currency: 'USD', provider: 'ALPACA_PAPER', verified: true, observedAt: now() } });
  assert.equal(p.approved, true);
  assert.equal(p.executionAuthority, false);
});
test('journal is independent and records observations', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'aema-alpaca-')), 'journal.json');
  appendBotAlpacaObservation({ source: 'ALPACA_PAPER', type: 'ACCOUNT_SNAPSHOT', payload: { cashUsd: 100 } }, file);
  assert.equal(JSON.parse(readFileSync(file)).records.length, 1);
});
