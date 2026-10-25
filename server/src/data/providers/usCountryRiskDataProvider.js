/**
 * AEMA dependency recovery adapter: usCountryRiskDataProvider.js
 * CAUTION: Original provider implementation absent from supplied server archive.
 * This adapter prevents ESM import failures, but intentionally returns UNAVAILABLE
 * rather than manufacturing market, macroeconomic, or research evidence.
 * Restore original provider for full functionality.
 */
const unavailable = (name) => ({ approved:false, status:"PROVIDER_NOT_RESTORED", source:name, data:null, news:[], events:[], bars:[], errors:["Original provider implementation missing from archive"] });
export async function getUSCountryRiskData(...args) { return unavailable("usCountryRiskDataProvider.js"); }
export default getUSCountryRiskData;
