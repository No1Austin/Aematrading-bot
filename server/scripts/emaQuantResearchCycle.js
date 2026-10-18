#!/usr/bin/env node
/** Research-only one-shot orchestration. Run from server root. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function summarizeCycle(setups, candles, outcomes, collector) {
  const statusCounts = {};
  for (const item of collector?.skipped ?? []) statusCounts[item.reason] = (statusCounts[item.reason] ?? 0) + 1;
  const outcomeSummary = outcomes?.summary ?? {};
  return {
    researchOnly: true, executionAuthority: false, trainingReady: false,
    setupsExported: Array.isArray(setups) ? setups.length : 0,
    candleBundles: Array.isArray(candles) ? candles.length : 0,
    collectorSkipped: collector?.skipped?.length ?? 0,
    collectorReasons: statusCounts,
    outcomeStatuses: outcomeSummary.byStatus ?? {},
    pendingUntil: [...new Set((collector?.skipped ?? []).filter(x => x.reason === 'OUTCOME_WINDOW_NOT_COMPLETE' && x.readyAt).map(x => x.readyAt))].sort(),
    notes: ['Historical outcomes and model readiness require verified point-in-time observations and market data.', 'Old observations with missing exchange identity are not backfilled.']
  };
}

export function runCycle({ cwd = process.cwd(), output = 'quant-research/output/quant_research_cycle.json', run = spawnSync } = {}) {
  const steps = [
    ['export', 'scripts/emaQuantSetupCaptureExport.js'],
    ['collect', 'scripts/emaQuantCollectFuturesCandles.js'],
    ['resolve', 'scripts/emaQuantResolveOutcomes.js']
  ];
  const stepResults = [];
  for (const [name, script] of steps) {
    if (!fs.existsSync(path.resolve(cwd, script))) throw new Error(`MISSING_SCRIPT: ${script}`);
    const result = run(process.execPath, [script], { cwd, encoding: 'utf8', timeout: 180000 });
    stepResults.push({ name, exitCode: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() });
    if (result.error || result.status !== 0) {
      const error = new Error(`RESEARCH_STEP_FAILED: ${name}: ${result.error?.message ?? result.stderr ?? result.status}`);
      error.steps = stepResults;
      throw error;
    }
  }
  const load = file => JSON.parse(fs.readFileSync(path.resolve(cwd, file), 'utf8'));
  const setups = load('quant-research/data/historical_setups.json');
  const candles = load('quant-research/data/future_candles.json');
  const outcomes = load('quant-research/output/quant_outcomes.json');
  let collector = {};
  const collectorText = stepResults[1].stdout;
  try { collector = JSON.parse(collectorText); } catch { throw new Error('COLLECTOR_OUTPUT_NOT_JSON'); }
  const summary = { generatedAt: new Date().toISOString(), ...summarizeCycle(setups, candles, outcomes, collector), steps: stepResults.map(({name,exitCode}) => ({name,exitCode})) };
  const target = path.resolve(cwd, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(summary, null, 2)}\n`);
  fs.renameSync(`${target}.tmp`, target);
  return { output: target, ...summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = runCycle();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    if (error.steps) console.error(JSON.stringify(error.steps, null, 2));
    process.exitCode = 1;
  }
}
