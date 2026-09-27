
// Alpaca market-data API is distinct from the paper trading API.
const DATA_BASE = 'https://data.alpaca.markets';
const QUOTES = new Set(['USD', 'USDT', 'USDC']);
export function parseExactAlpacaPair(symbol) {
  const match = /^([A-Z0-9]+)\/(USD|USDT|USDC)$/.exec(String(symbol ?? '').trim().toUpperCase());
  if (!match || !QUOTES.has(match[2])) throw new Error('INVALID_EXACT_ALPACA_PAIR');
  return { symbol: `${match[1]}/${match[2]}`, base: match[1], quote: match[2] };
}
export async function getAlpacaExactPairQuote(symbol, { fetchQuote } = {}) {
  const pair = parseExactAlpacaPair(symbol);
  const raw = fetchQuote ? await fetchQuote(pair.symbol) : await (async () => {
    if (!process.env.ALPACA_CRYPTO_API_KEY || !process.env.ALPACA_CRYPTO_SECRET_KEY) throw new Error('ALPACA_CRYPTO_CREDENTIALS_MISSING');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const url = new URL(`${DATA_BASE}/v1beta3/crypto/us/latest/quotes`);
      url.searchParams.set('symbols', pair.symbol);
      const response = await fetch(url, { headers: { 'APCA-API-KEY-ID': process.env.ALPACA_CRYPTO_API_KEY, 'APCA-API-SECRET-KEY': process.env.ALPACA_CRYPTO_SECRET_KEY }, signal: controller.signal });
      if (!response.ok) throw new Error(`ALPACA_QUOTE_HTTP_${response.status}`);
      return (await response.json())?.quotes?.[pair.symbol];
    } finally { clearTimeout(timeout); }
  })();
  const bid = Number(raw?.bp), ask = Number(raw?.ap), timestamp = Date.parse(raw?.t);
  if (!(bid > 0 && ask >= bid && Number.isFinite(timestamp))) throw new Error('INVALID_ALPACA_EXACT_PAIR_QUOTE');
  const ageMs = Date.now() - timestamp;
  if (ageMs < -30000 || ageMs > 30000) throw new Error('STALE_ALPACA_EXACT_PAIR_QUOTE');
  return { ...pair, bid, ask, midpoint: (bid + ask) / 2, spreadPercent: ((ask - bid) / ((ask + bid) / 2)) * 100,
    timestamp: new Date(timestamp).toISOString(), source: 'ALPACA_SAME_PAIR', ageMs };
}
export default getAlpacaExactPairQuote;
