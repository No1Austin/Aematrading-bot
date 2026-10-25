import express from 'express';
import {runStockMarketSearch} from '../orchestration/botStockMarketSearchCycle.js';
export function createStockResearchRoutes(){
 const router=express.Router();
 router.post('/market/search',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {res.json(await runStockMarketSearch(req.body?.options??req.body??{}));}
  catch(error){res.status(500).json({status:'STOCK_RESEARCH_ERROR',error:String(error?.message??error),executionDisabled:true});}
 });
 return router;
}
export default createStockResearchRoutes;
