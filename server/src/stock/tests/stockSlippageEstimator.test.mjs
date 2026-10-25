import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateStockSlippage} from '../providers/stockSlippageEstimator.js';
const quote={available:true,bid:100,ask:100.02,bidSize:500,askSize:600,spreadPercent:0.019998};
test('estimates conservative research-only cost for small size',()=>{
 const r=estimateStockSlippage({quote,assumedOrderShares:10});
 assert.equal(r.available,true); assert.equal(r.evidenceType,'ESTIMATED_NOT_OBSERVED'); assert.ok(r.percent>0.05);
});
test('fails closed for missing quote',()=>{
 assert.equal(estimateStockSlippage({quote:{available:false}}).available,false);
});
test('fails closed for excessive assumed size',()=>{
 assert.equal(estimateStockSlippage({quote,assumedOrderShares:100}).reason,'STOCK_TOP_OF_BOOK_SIZE_INSUFFICIENT');
});
