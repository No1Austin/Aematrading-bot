import assert from 'node:assert/strict';
import { assess } from './monitorAlpacaProtection.js';
const pin='test-paper-account';
const account={id:pin};
const entry='aema-pilot-test',stop='aema-protect-test';
const journal={records:[{type:'PREPARED',clientOrderId:entry},{type:'PROTECTION_PREPARED',clientOrderId:stop}]};
const buy={symbol:'BTCUSD',side:'buy',status:'filled',client_order_id:entry,qty:'0.000295005',filled_qty:'0.000295005'};
const position={symbol:'BTCUSD',qty:'0.000294267'}; // fee-adjusted position
const sell={symbol:'BTCUSD',side:'sell',type:'stop_limit',status:'new',client_order_id:stop,qty:'0.000294267',filled_qty:'0'};
const run=(positions,orders)=>assess({account,positions,orders,journal,pin});
assert.equal(run([], [buy,{...sell,status:'filled'}]).status,'FLAT');
assert.equal(run([position],[buy]).status,'MANUAL_REVIEW');
assert.equal(run([position],[buy,sell]).status,'COVERAGE_OBSERVED');
assert.equal(run([position],[buy,{...sell,status:'rejected'}]).status,'MANUAL_REVIEW');
assert.equal(run([], [buy,{...sell,status:'new'}]).status,'MANUAL_REVIEW');
assert.equal(assess({account,positions:[],orders:[],journal,pin:'wrong'}).status,'BLOCKED');
console.log('PASS: six read-only monitor scenarios');
