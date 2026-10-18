import { buildQuantFeatures } from './quantFeatureEngine.js';
/** Nonblocking shadow observer. No invented probability or trade recommendation. */
export function observeQuantResearch(researched, { onRecord = null, asOf = Date.now() } = {}) {
  const records=[];
  for(const candidate of Array.isArray(researched)?researched:[]){
    try {
      const features=buildQuantFeatures(candidate?.researchEvidence,{asOf});
      const record={schemaVersion:'ema-quant-shadow-v1',symbol:candidate?.symbol??null,observedAt:new Date(asOf).toISOString(),features,predictions:{'5m':null,'15m':null,'60m':null},modelVersion:null,validationStatus:'UNTRAINED',decision:'SHADOW_ONLY',executionAuthority:false,liveExecution:false};
      records.push(record);
      if(typeof onRecord==='function') { try { onRecord(record); } catch { /* recording cannot change live research */ } }
    } catch(error) {
      records.push({symbol:candidate?.symbol??null,decision:'SHADOW_ERROR',error:error?.message??String(error),executionAuthority:false,liveExecution:false});
    }
  }
  return records;
}
export default observeQuantResearch;
