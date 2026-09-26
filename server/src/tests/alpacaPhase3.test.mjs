import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import prepare from '../src/crypto/bot/alpaca/botAlpacaOrderPreview.js';
import { readAlpacaOrderIntents } from '../src/crypto/bot/alpaca/botAlpacaOrderIntentStore.js';
const fixture = (currency = 'USD') => ({ approved: true, blockers: [],
  asset: { alpacaSymbol: `BTC/${currency}`, quoteCurrency: currency },
  funding: { verified: true, currency },
  quote: { symbol: `BTC/${currency}`, source: 'ALPACA_SAME_PAIR', ageMs: 500, ask: 100, timestamp: new Date().toISOString() },
  riskPlan: { approved: true, quantity: 1, notionalQuote: 100 } });
test('USD preview never grants execution authority', async () => {
  const r = await prepare({ sourceSymbol: 'BTCUSD', stop: 95, allocationQuote: 1000, validator: async () => fixture() });
  assert.equal(r.approvedForPreview, true); assert.equal(r.executionAuthority, false); assert.equal(r.status, 'PREVIEW_ONLY');
});
test('USDT and USDC remain blocked even if a validator incorrectly approves them', async () => {
  for (const currency of ['USDT', 'USDC']) {
    const r = await prepare({ sourceSymbol: `BTC${currency}`, stop: 95, allocationQuote: 1000, validator: async () => fixture(currency) });
    assert.equal(r.approvedForPreview, false); assert.ok(r.blockers.includes('NON_USD_EXECUTION_NOT_ENABLED'));
  }
});
test('stale or mismatched quotes fail closed', async () => {
  for (const override of [{ ageMs: 45000 }, { symbol: 'ETH/USD' }]) {
    const r = await prepare({ sourceSymbol: 'BTCUSD', stop: 95, allocationQuote: 1000,
      validator: async () => ({ ...fixture(), quote: { ...fixture().quote, ...override } }) });
    assert.ok(r.blockers.includes('FRESH_EXACT_PAIR_QUOTE_REQUIRED'));
  }
});
test('preview journal is isolated and durable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aema-p3-'));
  try {
    const file = path.join(dir, 'intents.json');
    const r = await prepare({ sourceSymbol: 'BTCUSD', stop: 95, allocationQuote: 1000,
      validator: async () => fixture(), persist: true, journalFile: file });
    assert.ok(r.id); assert.equal(readAlpacaOrderIntents(file).intents.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('invalid sizing inputs rejected', async () => {
  await assert.rejects(() => prepare({ sourceSymbol: 'BTCUSD', stop: NaN, allocationQuote: 1000 }), /INVALID_PREVIEW_ARGUMENTS/);
});
