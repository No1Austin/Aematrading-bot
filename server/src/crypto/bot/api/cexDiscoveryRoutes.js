import express from "express";
import {getCexDiscoveryState,startCexDiscoveryRuntime} from "../discovery/cexDiscoveryRuntime.js";
export default function createCexDiscoveryRoutes(){startCexDiscoveryRuntime();const router=express.Router();router.get("/state",(_req,res)=>res.json(getCexDiscoveryState()));return router}
