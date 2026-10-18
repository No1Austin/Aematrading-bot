import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.resolve('src/crypto/bot/ranking/botExecutionRankingEngine.js'), 'utf8');
const mocked = source.replace('import BOT_CONFIG from "../config/botConfig.js";', 'const BOT_CONFIG = { executionRanking: { weights: { research: 1, directionSeparation: 1, riskReward: 1, spread: 1, slippage: 1, depth: 1, freshness: 1 } }, setup: { maximumObservationAgeMs: 60000 } };');
const { rankBotExecutionSetups } = await import('data:text/javascript;base64,' + Buffer.from(mocked).toString('base64'));
const make = (setupOverrides = {}) => ({ symbol: 'TEST_USDT', researchRankScore: 85, directionDecision: { separation: 20 }, setup: { approved: true, direction: 'LONG', entry: 100, stop: 98, target: 105, riskReward: 2.5, spreadPercent: 0.02, slippagePercent: 0.02, depthNotional: 1000000, freshness: { ageMs: 0, available: true, stale: false }, ...setupOverrides } });
const valid = rankBotExecutionSetups([make()]);
assert.equal(valid.rankedSetups.length, 1);
assert.equal(valid.rankedSetups[0].setupRankingDiagnostics.valid, true);
for (const [input, reason] of [
  [{stop: 101}, 'INVALID_SETUP_GEOMETRY'],
  [{target: 99}, 'INVALID_SETUP_GEOMETRY'],
  [{entry: null}, 'INVALID_SETUP_GEOMETRY'],
  [{spreadPercent: 0.5, slippagePercent: 0.5, stop: 99}, 'STOP_DISTANCE_BELOW_COST_AND_NOISE_FLOOR'],
  [{freshness: {ageMs: 70000, available: true, stale: true}}, 'STALE_SETUP_MARKET_DATA'],
]) {
  const result = rankBotExecutionSetups([make(input)]);
  assert.equal(result.rankedSetups.length, 0);
  assert.equal(result.evaluated[0].setupRankingDiagnostics.reason, reason);
}
console.log('AEMA setup ranking safety tests passed');
