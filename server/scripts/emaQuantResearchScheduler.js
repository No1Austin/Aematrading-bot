#!/usr/bin/env node
/** Research-only periodic orchestrator. Never submits orders. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function parseOptions(argv = []) {
  const opts = { intervalMinutes: 60, once: false, maxCycles: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--once') opts.once = true;
    else if (arg === '--interval-minutes' || arg === '--max-cycles') {
      const raw = argv[++i];
      const n = Number(raw);
      if (!raw || !Number.isSafeInteger(n) || n < 1) throw new Error(`INVALID_OPTION: ${arg}`);
      if (arg === '--interval-minutes') opts.intervalMinutes = n;
      else opts.maxCycles = n;
    } else throw new Error(`UNKNOWN_OPTION: ${arg}`);
  }
  if (opts.intervalMinutes < 5) throw new Error('MINIMUM_INTERVAL_IS_FIVE_MINUTES');
  return opts;
}

export function acquireLock(lockPath, pid = process.pid) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let fd;
  try { fd = fs.openSync(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`RESEARCH_SCHEDULER_ALREADY_LOCKED: ${lockPath}. Check whether another scheduler is running; remove a stale lock manually only after confirming it is stopped.`);
    throw error;
  }
  try { fs.writeFileSync(fd, `${JSON.stringify({ pid, startedAt: new Date().toISOString() })}\n`); }
  finally { fs.closeSync(fd); }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Do not remove a lock if another process replaced it.
    try { const info = JSON.parse(fs.readFileSync(lockPath, 'utf8')); if (info.pid === pid) fs.unlinkSync(lockPath); }
    catch (error) { if (error.code !== 'ENOENT') console.error(`LOCK_RELEASE_WARNING: ${error.message}`); }
  };
}

export function runOneResearchCycle({ cwd = process.cwd(), timeoutMs = 240000 } = {}) {
  const script = path.resolve(cwd, 'scripts/emaQuantResearchCycle.js');
  if (!fs.existsSync(script)) throw new Error(`MISSING_RESEARCH_CYCLE: ${script}`);
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  return {
    startedAt, finishedAt: new Date().toISOString(), success: !result.error && result.status === 0,
    exitCode: result.status, error: result.error?.message ?? null,
    stdout: (result.stdout ?? '').slice(-12000), stderr: (result.stderr ?? '').slice(-12000)
  };
}

export async function runScheduler({ cwd = process.cwd(), intervalMinutes = 60, once = false, maxCycles = Infinity, runOnce = runOneResearchCycle, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), shouldStop = () => false, onResult = () => {} } = {}) {
  if (!Number.isSafeInteger(intervalMinutes) || intervalMinutes < 5) throw new Error('MINIMUM_INTERVAL_IS_FIVE_MINUTES');
  const lockPath = path.resolve(cwd, 'quant-research/output/.ema_quant_scheduler.lock');
  const release = acquireLock(lockPath);
  let cycles = 0, failures = 0;
  try {
    while (!shouldStop() && cycles < maxCycles) {
      let result;
      try { result = await runOnce({ cwd }); }
      catch (error) { result = { startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), success: false, error: error.message }; }
      cycles++;
      if (!result.success) failures++;
      const report = { researchOnly: true, executionAuthority: false, liveExecution: false, cycles, failures, ...result };
      const dest = path.resolve(cwd, 'quant-research/output/quant_scheduler_latest.json');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(`${dest}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
      fs.renameSync(`${dest}.tmp`, dest);
      onResult(report);
      if (once || cycles >= maxCycles || shouldStop()) break;
      await wait(intervalMinutes * 60_000);
    }
    return { cycles, failures };
  } finally { release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  try {
    const opts = parseOptions(process.argv.slice(2));
    const result = await runScheduler({ ...opts, shouldStop: () => stopping, onResult: report => console.log(JSON.stringify({ cycle: report.cycles, success: report.success, finishedAt: report.finishedAt, error: report.error })) });
    console.log(JSON.stringify({ schedulerStopped: true, ...result }));
    if (result.failures) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
