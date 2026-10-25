/**
 * AEMA dependency recovery adapter: alpacaLiveMarketStream.js
 * CAUTION: Original provider implementation absent from supplied server archive.
 * This adapter prevents ESM import failures, but intentionally returns UNAVAILABLE
 * rather than manufacturing market, macroeconomic, or research evidence.
 * Restore original provider for full functionality.
 */
const unavailable = (name) => ({ approved:false, status:"PROVIDER_NOT_RESTORED", source:name, data:null, news:[], events:[], bars:[], errors:["Original provider implementation missing from archive"] });
export const ALPACA_STREAM_FEED = Object.freeze({ IEX:"iex", SIP:"sip" });
export const ALPACA_STREAM_STATUS = Object.freeze({ DISCONNECTED:"DISCONNECTED", UNAVAILABLE:"UNAVAILABLE", CONNECTED:"CONNECTED" });
export default class AlpacaLiveMarketStream { constructor(opts={}) {this.options=opts;this.authenticated=false;this.socket=null;} async addSymbol(){return unavailable("ALPACA_STREAM");} async connect(){return unavailable("ALPACA_STREAM");} async disconnect(){return unavailable("ALPACA_STREAM");} }
