import test from 'node:test';
import assert from 'node:assert/strict';
import {refineEntry} from '../aemaV2/refinement/refineEntry.js';
const original={direction:'BULL',entryReference:100,stopReference:98,targetIllustration:105,asOf:1};
const invalid={status:'NO_SETUP',direction:null};
test('invalidates original when fresh confirmation is lost',()=>{
 const r=refineEntry({original,fresh:invalid});
 assert.equal(r.decision,'SETUP_INVALIDATED');
 assert.equal(r.executionAuthority,false);
});
test('does not switch BULL to BEAR on fresh opposite direction',()=>{
 const r=refineEntry({original,fresh:{status:'RESEARCH_CANDIDATE',direction:'BEAR'}});
 assert.equal(r.decision,'SETUP_INVALIDATED');assert.equal(r.direction,'BULL');
});
test('requires server-side original direction',()=>{
 assert.throws(()=>refineEntry({original:{direction:'NEUTRAL'},fresh:invalid}),/ORIGINAL_DIRECTION_REQUIRED/);
});
