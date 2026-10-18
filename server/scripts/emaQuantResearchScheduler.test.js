import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseOptions, acquireLock, runScheduler } from './emaQuantResearchScheduler.js';

assert.deepEqual(parseOptions(['--once', '--interval-minutes', '5', '--max-cycles', '2']), { once: true, intervalMinutes: 5, maxCycles: 2 });
assert.throws(() => parseOptions(['--interval-minutes', '1']), /MINIMUM_INTERVAL/);
assert.throws(() => parseOptions(['--bad']), /UNKNOWN_OPTION/);
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ema-scheduler-'));
try {
  const lock = path.join(cwd, 'test.lock');
  const release = acquireLock(lock);
  assert.throws(() => acquireLock(lock), /ALREADY_LOCKED/);
  release();
  assert.equal(fs.existsSync(lock), false);
  let called = 0, waits = 0;
  const result = await runScheduler({ cwd, intervalMinutes: 5, maxCycles: 2, runOnce: async () => { called++; return { success: true, startedAt: 't', finishedAt: 't' }; }, wait: async ms => { assert.equal(ms, 300000); waits++; } });
  assert.deepEqual(result, { cycles: 2, failures: 0 });
  assert.equal(called, 2);
  assert.equal(waits, 1);
  const report = JSON.parse(fs.readFileSync(path.join(cwd, 'quant-research/output/quant_scheduler_latest.json')));
  assert.equal(report.liveExecution, false);
  assert.equal(report.executionAuthority, false);
  assert.equal(fs.existsSync(path.join(cwd, 'quant-research/output/.ema_quant_scheduler.lock')), false);
  const failure = await runScheduler({ cwd, once: true, runOnce: async () => { throw new Error('API_DOWN'); } });
  assert.equal(failure.failures, 1);
} finally { fs.rmSync(cwd, { recursive: true, force: true }); }
console.log('EMA research scheduler tests passed');
