import assert from 'node:assert/strict';
import {normalizeKlines,inspectSeries} from './emaQuantCollectHistory.js';
const rows=normalizeKlines([["1760000000000","10","11","9","10.5","100"],["1760000060000","10.5","12","10","11","50"]]);
assert.equal(rows.length,2);
assert.equal(inspectSeries(rows).gaps.length,0);
assert.equal(inspectSeries([rows[0],{...rows[1],timestamp:rows[1].timestamp+60000}]).gaps.length,1);
assert.equal(normalizeKlines([["1760000000000","10","8","9","10.5","100"]]).length,0);
console.log('EMA Quant history collector tests passed');
