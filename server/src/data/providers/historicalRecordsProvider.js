/**
 * AEMA dependency recovery adapter: historicalRecordsProvider.js
 * CAUTION: Original provider implementation absent from supplied server archive.
 * This adapter prevents ESM import failures, but intentionally returns UNAVAILABLE
 * rather than manufacturing market, macroeconomic, or research evidence.
 * Restore original provider for full functionality.
 */
const unavailable = (name) => ({ approved:false, status:"PROVIDER_NOT_RESTORED", source:name, data:null, news:[], events:[], bars:[], errors:["Original provider implementation missing from archive"] });
export async function getHistoricalRecords(...args) { return unavailable("historicalRecordsProvider.js"); }
export default getHistoricalRecords;
export const HISTORICAL_RECORDS_MODE = Object.freeze({ UNAVAILABLE:"UNAVAILABLE" });
export function clearHistoricalRecordsCache(){}
export function getHistoricalRecordsCacheStatus(){return unavailable("HISTORICAL_RECORDS");}
