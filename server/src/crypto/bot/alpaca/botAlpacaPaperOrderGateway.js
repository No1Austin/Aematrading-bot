// Phase 3D replacement for Phase 3B gateway: adds read-only listOrders and cancellation capability.
// The supervisor NEVER calls cancel; cancellation requires a separate tested exit coordinator.
const BASE='https://paper-api.alpaca.markets';
function credentials(){if(!process.env.ALPACA_CRYPTO_API_KEY||!process.env.ALPACA_CRYPTO_SECRET_KEY)throw Error('ALPACA_CRYPTO_CREDENTIALS_MISSING');return {'APCA-API-KEY-ID':process.env.ALPACA_CRYPTO_API_KEY,'APCA-API-SECRET-KEY':process.env.ALPACA_CRYPTO_SECRET_KEY};}
export function makeAlpacaPaperGateway({http=fetch}={}){
 const request=async(method,url,data)=>{const r=await http(`${BASE}${url}`,{method,headers:{...credentials(),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(12000)});if(!r.ok){const e=Error(`ALPACA_PAPER_HTTP_${r.status}`);e.status=r.status;throw e;}return r.status===204?null:r.json();};
 return {getAccount:()=>request('GET','/v2/account'),getOrderByClientId:id=>request('GET',`/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(id)}`),getOrder:id=>request('GET',`/v2/orders/${encodeURIComponent(id)}`),getPositions:()=>request('GET','/v2/positions'),listOrders:()=>request('GET','/v2/orders?status=all&limit=500&nested=false'),submit:order=>request('POST','/v2/orders',order)};
}
