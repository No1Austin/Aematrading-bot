const ENDPOINT = 'https://data.alpaca.markets/v1beta1/news';
const clamp = (v, d = 20) => Math.max(1, Math.min(50, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d));
const symbolsOf = value => [...new Set((Array.isArray(value) ? value : []).map(x => String(x).trim().toUpperCase()).filter(Boolean))];
const failure = (status, message, httpStatus = null) => ({approved:false, provider:'ALPACA', status, httpStatus, news:[], warnings:[], errors:[message]});
export async function getMarketNews({symbols = [], limit = 20, includeContent = false, sort = 'desc', maxRetries = 1} = {}) {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) return failure('NOT_CONFIGURED', 'ALPACA_API_KEY or ALPACA_SECRET_KEY is missing');
  const query = new URLSearchParams({limit:String(clamp(limit)),sort:sort === 'asc' ? 'asc' : 'desc',include_content:String(includeContent === true)});
  const tickers = symbolsOf(symbols);
  if (tickers.length) query.set('symbols', tickers.join(','));
  const retries = Math.max(0, Math.min(2, Number(maxRetries) || 0));
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${ENDPOINT}?${query}`, {headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if ((response.status === 429 || response.status >= 500) && attempt < retries) { await new Promise(r => setTimeout(r, 600 * (attempt + 1))); continue; }
        return failure('HTTP_ERROR', `Alpaca news HTTP ${response.status}: ${body.slice(0,180)}`, response.status);
      }
      const body = await response.json();
      if (!Array.isArray(body?.news)) return failure('INVALID_RESPONSE', 'Alpaca response does not contain a news array', response.status);
      const news = body.news.map(item => ({id:item.id,headline:item.headline || '',summary:item.summary || '',source:item.source || 'Alpaca',provider:'ALPACA',url:item.url || null,imageUrl:item.images?.[0]?.url || null,symbols:symbolsOf(item.symbols),createdAt:item.created_at || null,updatedAt:item.updated_at || null, ...(includeContent ? {content:item.content || null} : {})})).filter(item => item.headline);
      return {approved:true,provider:'ALPACA',status:'COMPLETE',httpStatus:response.status,news,count:news.length,nextPageToken:body.next_page_token || null,warnings:[],errors:[]};
    } catch (error) {
      if (attempt === retries) return failure('NETWORK_ERROR', error?.message || String(error));
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return failure('UNKNOWN_ERROR', 'Alpaca request failed');
}
export default getMarketNews;
