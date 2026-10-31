const ENDPOINT = 'https://api.marketaux.com/v1/news/all';
const symbolsOf = value => [...new Set((Array.isArray(value) ? value : []).map(x => String(x).trim().toUpperCase()).filter(Boolean))];
const failure = (status, message, httpStatus = null) => ({approved:false,provider:'MARKETAUX',status,httpStatus,news:[],warnings:[],errors:[message]});
export async function getMarketauxNews({symbols = [],limit = 3,includeContent = false,sort = 'desc'} = {}) {
  const token = process.env.MARKETAUX_API_TOKEN;
  if (!token) return failure('NOT_CONFIGURED','MARKETAUX_API_TOKEN is missing');
  const tickers = symbolsOf(symbols);
  const query = new URLSearchParams({api_token:token,limit:String(Math.max(1,Math.min(3,Number(limit) || 3))),language:'en',sort:sort === 'asc' ? 'published_at' : 'published_at',sort_order:sort === 'asc' ? 'asc' : 'desc'});
  if (tickers.length) query.set('symbols',tickers.join(','));
  try {
    const response = await fetch(`${ENDPOINT}?${query}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if (!response.ok) return failure('HTTP_ERROR',`Marketaux news HTTP ${response.status}`,response.status);
    const body = await response.json();
    if (!Array.isArray(body?.data)) return failure('INVALID_RESPONSE',body?.error?.message || 'Marketaux response does not contain a data array',response.status);
    const news = body.data.map(item => ({id:item.uuid || item.url,headline:item.title || '',summary:item.description || item.snippet || '',source:item.source || 'Marketaux',provider:'MARKETAUX',url:item.url || null,imageUrl:item.image_url || null,symbols:symbolsOf((item.entities || []).map(entity => entity.symbol)),createdAt:item.published_at || null,updatedAt:item.published_at || null,...(includeContent ? {content:item.description || null} : {})})).filter(item => item.headline);
    return {approved:true,provider:'MARKETAUX',status:'COMPLETE',httpStatus:response.status,news,count:news.length,warnings:[],errors:[]};
  } catch (error) {return failure('NETWORK_ERROR',error?.message || String(error));}
}
export default getMarketauxNews;
