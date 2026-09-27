import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { submitOneGuardedAlpacaPaperOrder } from '../src/crypto/bot/alpaca/botAlpacaPaperExecutor.js';
import { readExecutionJournal } from '../src/crypto/bot/alpaca/botAlpacaExecutionJournal.js';
import { reconcileBotAlpacaPaperPositions } from '../src/crypto/bot/alpaca/botAlpacaPaperPositionManager.js';
const journal = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aema-test-')), 'execution.json');
const preview = async () => ({ approvedForPreview: true, executionAuthority: false, pair: 'BTC/USD', direction: 'LONG',
  quantity: .002, indicativeAsk: 84000, quoteObservedAt: new Date().toISOString() });
const gateway = { submit: async o => ({ id: 'paper-test-id', status: 'new' }), getOrderByClientId: async id => ({ id: 'paper-test-id', symbol: 'BTC/USD', status: 'filled', filled_qty: '.0002', filled_avg_price: '84000', side: 'buy' }), getPositions: async () => [] };
test('default never submits', async () => { let count = 0; await assert.rejects(submitOneGuardedAlpacaPaperOrder({ sourceSymbol: 'BTCUSD', gateway: { submit: async () => count++ } }), /AUTHORIZATION/); assert.equal(count, 0); });
test('pilot submits once and journal blocks duplicate', async () => { const file = journal(); process.env.AEMA_ALPACA_MANUAL_PAPER_ORDER = 'I_AUTHORIZE_ONE_PAPER_ORDER'; process.env.AEMA_BOT_EXECUTION_MODE = 'INTERNAL_PAPER'; let count = 0; const g = { ...gateway, submit: async o => { count++; return gateway.submit(o); } }; const opts = { sourceSymbol: 'BTCUSD', stop: 80000, allocationQuote: 1000, explicitAuthorization: true, gateway: g, previewer: preview, journalFile: file }; const r = await submitOneGuardedAlpacaPaperOrder(opts); assert.equal(r.status, 'PAPER_ORDER_SUBMITTED'); await assert.rejects(submitOneGuardedAlpacaPaperOrder(opts), /PILOT_ALREADY_ATTEMPTED/); assert.equal(count, 1); assert.equal(readExecutionJournal(file).records.length, 2); });
test('network timeout remains unknown, no duplicate', async () => { const file = journal(); const g = { ...gateway, submit: async () => { throw Object.assign(Error('timeout'), { code: 'ETIMEDOUT' }); } }; const opts = { sourceSymbol: 'BTCUSD', stop: 80000, allocationQuote: 1000, explicitAuthorization: true, gateway: g, previewer: preview, journalFile: file }; const r = await submitOneGuardedAlpacaPaperOrder(opts); assert.equal(r.status, 'SUBMISSION_UNKNOWN_RECONCILE_BEFORE_RETRY'); await assert.rejects(submitOneGuardedAlpacaPaperOrder(opts), /PILOT_ALREADY_ATTEMPTED/); });
test('reconciliation uses provider order ID and never modifies positions', async () => { const file = journal(); const opts = { sourceSymbol: 'BTCUSD', stop: 80000, allocationQuote: 1000, explicitAuthorization: true, gateway, previewer: preview, journalFile: file }; await submitOneGuardedAlpacaPaperOrder(opts); const r = await reconcileBotAlpacaPaperPositions({ gateway, journalFile: file }); assert.equal(r.ownedOrders[0].status, 'filled'); assert.equal(r.readOnly, true); });
