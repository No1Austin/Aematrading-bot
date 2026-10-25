/**
 * AEMA dependency recovery adapter: alpacaHistoricalDataService.js
 * CAUTION: Original provider implementation absent from supplied server archive.
 * This adapter prevents ESM import failures, but intentionally returns UNAVAILABLE
 * rather than manufacturing market, macroeconomic, or research evidence.
 * Restore original provider for full functionality.
 */
const unavailable = (name) => ({ approved:false, status:"PROVIDER_NOT_RESTORED", source:name, data:null, news:[], events:[], bars:[], errors:["Original provider implementation missing from archive"] });
export const ALPACA_FEED = Object.freeze({ IEX:"iex", SIP:"sip" });
export const ALPACA_TIMEFRAME = Object.freeze({ ONE_MINUTE:"1Min", FIVE_MINUTES:"5Min", FIFTEEN_MINUTES:"15Min", ONE_HOUR:"1Hour", ONE_DAY:"1Day", DAY:"1Day" });
export async function getHistoricalBars(...args) { return unavailable("alpacaHistoricalDataService.js"); }
export async function getHistoricalBarsBatch(...args) { return unavailable("alpacaHistoricalDataService.js"); }
export async function loadHistoricalBarsBatchIntoHub(...args) { return unavailable("alpacaHistoricalDataService.js"); }
export async function loadEngineWarmupHistory(...args) { return unavailable("alpacaHistoricalDataService.js"); }
export default getHistoricalBars;
