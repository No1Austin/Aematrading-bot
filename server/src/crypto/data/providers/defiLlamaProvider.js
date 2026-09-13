const BASE='https://api.llama.fi';
async function fetchJson(url){const r=await fetch(url,{headers:{accept:'application/json'}});if(!r.ok)throw new Error(`DefiLlama ${r.status}: ${await r.text()}`);return r.json();}
export async function listDefiLlamaProtocols(){const rows=await fetchJson(`${BASE}/protocols`);return Array.isArray(rows)?rows:[];}
export default {listDefiLlamaProtocols};
