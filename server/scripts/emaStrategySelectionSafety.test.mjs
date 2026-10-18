import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = mkdtempSync(join(tmpdir(), 'aema-strategy-test-'));
try {
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  const target = join(root, 'src/crypto/bot/setup/botSetupStrategyEngine.js');
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(new URL('../src/crypto/bot/setup/botSetupStrategyEngine.js', import.meta.url), target);
  const strategies = ['trendPullbackSetup','breakoutRetestSetup','liquiditySweepSetup','momentumBreakoutSetup','rangeRotationSetup'];
  for (const name of strategies) {
    const file = join(root, `src/crypto/bot/setup/strategies/${name}.js`);
    mkdirSync(dirname(file), {recursive:true});
    writeFileSync(file, `export default () => ({ matched: true, strategy: 'SPOOFED', direction: 'BULL', preferredEntry: 100, stop: 99, targets: [102], entryZone: {available:true}, patternScore: 90, blockers: [] });`);
  }
  const {default: select} = await import(pathToFileURL(target).href);
  const candidate = { directionDecision: { direction: 'BULL' } };
  const market = { approved:true, markPrice:100 };
  const structure = { approved:true };
  const regime = { approved:true, regime:'TRENDING', eligibleStrategies:['TREND_PULLBACK'] };
  const result = select(candidate, market, structure, regime);
  assert.equal(result.approved, true);
  assert.equal(result.selectedStrategy, 'TREND_PULLBACK');
  assert.equal(result.attemptedStrategies.length, 1);
  assert.equal(result.registeredStrategies.length, 5);
  assert.equal(result.skippedStrategies.length, 4);
  const invalid = select(candidate, {...market, approved:false}, structure, regime);
  assert.equal(invalid.approved, false);
  assert.equal(invalid.attemptedStrategies.length, 0);
  assert.equal(invalid.evaluationSkipped, true);
  const unknown = select(candidate, market, structure, {...regime, eligibleStrategies:['FAKE_STRATEGY']});
  assert.equal(unknown.approved, false);
  assert.ok(unknown.blockers.includes('UNKNOWN_ELIGIBLE_SETUP_STRATEGY'));
  console.log('PASS: registry, regime gating, spoof resistance, fail-closed prerequisites, unknown strategies');
} finally { rmSync(root, {recursive:true, force:true}); }
