import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOriginalSetup} from '../refinement/setupAwareReview.js';
const original={entry:0.004524,stop:0.00460409,target:0.004215,venue:'BYBIT'};
test('different venues must not compare reference price',()=>{
 const x=reviewOriginalSetup({direction:'BEAR',original,referencePrice:0.004461,referenceVenue:'GATE'});
 assert.equal(x.decision,'VENUE_MISMATCH');assert.equal(x.comparisonVerified,false);
 assert.equal(x.original.grossRR>3.8,true);
});
test('same venue can flag a moved short',()=>{
 const x=reviewOriginalSetup({direction:'BEAR',original,referencePrice:0.004461,referenceVenue:'BYBIT'});
 assert.equal(x.comparisonVerified,true);assert.ok(['WAIT_FOR_ORIGINAL_RETEST','DO_NOT_CHASE'].includes(x.decision));
});
test('crossing stop takes priority',()=>{
 const x=reviewOriginalSetup({direction:'BEAR',original,referencePrice:0.0047,referenceVenue:'BYBIT'});
 assert.equal(x.decision,'STOP_LEVEL_CROSSED');
});
test('invalid original levels are not silently accepted',()=>{
 const x=reviewOriginalSetup({direction:'BEAR',original:{entry:10,stop:9,target:8,venue:'BYBIT'},referencePrice:9});
 assert.equal(x.decision,'INVALID_ORIGINAL_LEVELS');
});
test('missing original levels are explained',()=>{
 assert.equal(reviewOriginalSetup({direction:'BULL'}).decision,'ORIGINAL_LEVELS_UNAVAILABLE');
});
