import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('./emaQuantResearchCycle.js', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ema research path with spaces '));
try {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'quant-research/data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'quant-research/output'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  fs.copyFileSync(source, path.join(root, 'scripts/emaQuantResearchCycle.js'));
  const steps = [
    ['emaQuantSetupCaptureExport.js', "import fs from 'node:fs';fs.writeFileSync('quant-research/data/historical_setups.json','[]');"],
    ['emaQuantCollectFuturesCandles.js', "import fs from 'node:fs';fs.writeFileSync('quant-research/data/future_candles.json','[]');console.log(JSON.stringify({skipped:[]}));"],
    ['emaQuantResolveOutcomes.js', "import fs from 'node:fs';fs.writeFileSync('quant-research/output/quant_outcomes.json',JSON.stringify({summary:{byStatus:{}}}));"]
  ];
  for (const [name, content] of steps) fs.writeFileSync(path.join(root, 'scripts', name), content);
  const result = spawnSync(process.execPath, ['scripts/emaQuantResearchCycle.js'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(root, 'quant-research/output/quant_research_cycle.json'), 'utf8'));
  assert.equal(report.steps.length, 3);
  assert.equal(report.researchOnly, true);
  assert.equal(report.executionAuthority, false);
  assert.equal(report.trainingReady, false);
  console.log('EMA research cycle CLI path-with-spaces test passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
