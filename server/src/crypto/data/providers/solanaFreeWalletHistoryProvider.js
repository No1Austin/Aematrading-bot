const API_KEY = String(process.env.HELIUS_API_KEY ?? "").trim();
const RPC_BASE = String(process.env.HELIUS_RPC_URL ?? "https://mainnet.helius-rpc.com").replace(/\/+$/, "");
const TIMEOUT_MS = Math.max(1000, Number(process.env.HELIUS_TIMEOUT_MS) || 12000);
const RETRIES = Math.max(0, Number(process.env.HELIUS_MAX_RETRIES) || 2);
const INTERVAL = Math.max(110, Number(process.env.SOLANA_RPC_MIN_INTERVAL_MS) || 110);
let lastAt = 0;

const text = v => v == null ? null : (String(v).trim() || null);
const number = v => (v == null || v === "") ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function throttle() {
  const wait = INTERVAL - (Date.now() - lastAt);
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
}

async function rpc(method, params) {
  if (!API_KEY) throw new Error("HELIUS_API_KEY is required");
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    await throttle();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${RPC_BASE}/?api-key=${encodeURIComponent(API_KEY)}`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({jsonrpc:"2.0", id:`aema-${method}`, method, params}),
        signal: controller.signal,
      });
      const raw = await res.text();
      if (!res.ok) {
        const e = new Error(`Solana RPC HTTP ${res.status}: ${raw.slice(0,300)}`);
        if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
          lastError=e; await sleep(400 * 2**attempt); continue;
        }
        throw e;
      }
      const body = JSON.parse(raw);
      if (body?.error) throw new Error(`Solana RPC ${body.error.code}: ${body.error.message}`);
      return body?.result ?? null;
    } catch(e) {
      lastError=e;
      if (attempt >= RETRIES) {
        if (e?.name === "AbortError") throw new Error(`Solana RPC ${method} timed out`);
        throw e;
      }
      await sleep(400 * 2**attempt);
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export async function getSignaturesForAddress(address,{limit=20,before,until}={}) {
  const a=text(address); if(!a) throw new Error("address is required");
  const cfg={limit:Math.max(1,Math.min(1000,Number(limit)||20)),commitment:"confirmed"};
  if(before) cfg.before=before; if(until) cfg.until=until;
  const rows=await rpc("getSignaturesForAddress",[a,cfg]);
  return (Array.isArray(rows)?rows:[]).map(x=>({
    signature:text(x.signature),slot:number(x.slot),err:x.err??null,
    blockTime:number(x.blockTime),confirmationStatus:text(x.confirmationStatus)
  })).filter(x=>x.signature);
}

export async function getParsedTransaction(signature) {
  const s=text(signature); if(!s) throw new Error("signature is required");
  return rpc("getTransaction",[s,{commitment:"confirmed",encoding:"jsonParsed",maxSupportedTransactionVersion:0}]);
}

export async function getTokenAccountsByOwnerForMint(owner,mint) {
  const w=text(owner),m=text(mint);
  if(!w||!m) throw new Error("owner and mint are required");
  const result=await rpc("getTokenAccountsByOwner",[w,{mint:m},{commitment:"confirmed",encoding:"jsonParsed"}]);
  return (Array.isArray(result?.value)?result.value:[]).map(row=>({
    pubkey:text(row?.pubkey),
    amountRaw:number(row?.account?.data?.parsed?.info?.tokenAmount?.amount),
    decimals:number(row?.account?.data?.parsed?.info?.tokenAmount?.decimals),
  })).filter(x=>x.pubkey);
}

function balance(tx,field,wallet,mint) {
  const rows=Array.isArray(tx?.meta?.[field])?tx.meta[field]:[];
  let raw=0,found=false,decimals=null;
  for(const row of rows){
    if(row?.mint!==mint) continue;
    if(row?.owner && row.owner!==wallet) continue;
    const n=number(row?.uiTokenAmount?.amount); if(n===null) continue;
    raw+=n; found=true; decimals ??= number(row?.uiTokenAmount?.decimals);
  }
  return {found,raw:found?raw:null,decimals};
}

export function parseWalletMintDelta(tx,wallet,mint) {
  if(!tx?.meta) return null;
  const pre=balance(tx,"preTokenBalances",wallet,mint);
  const post=balance(tx,"postTokenBalances",wallet,mint);
  if(!pre.found&&!post.found) return null;
  const preRaw=pre.raw??0,postRaw=post.raw??0,deltaRaw=postRaw-preRaw;
  const decimals=post.decimals??pre.decimals??null;
  return {preRaw,postRaw,deltaRaw,decimals,
    deltaUi:decimals===null?null:deltaRaw/(10**decimals),
    direction:deltaRaw>0?"IN":deltaRaw<0?"OUT":"FLAT"};
}

export async function getWalletMintHistory(wallet,mint,{signaturesPerAddress=15,maxTransactions=20}={}) {
  const tokenAccounts=await getTokenAccountsByOwnerForMint(wallet,mint);
  const addresses=[wallet,...tokenAccounts.map(x=>x.pubkey)].filter(Boolean);
  const signatures=new Map(),errors=[];
  for(const address of addresses){
    try{
      for(const row of await getSignaturesForAddress(address,{limit:signaturesPerAddress})){
        if(!signatures.has(row.signature)) signatures.set(row.signature,row);
      }
    }catch(e){errors.push({stage:"SIGNATURES",address,error:e.message??String(e)});}
  }
  const selected=[...signatures.values()].sort((a,b)=>(b.blockTime??0)-(a.blockTime??0))
    .slice(0,Math.max(1,Number(maxTransactions)||20));
  const events=[];
  for(const row of selected){
    if(row.err) continue;
    try{
      const tx=await getParsedTransaction(row.signature);
      const delta=parseWalletMintDelta(tx,wallet,mint);
      if(delta && delta.direction!=="FLAT") events.push({
        signature:row.signature,slot:number(tx?.slot)??row.slot,
        blockTime:number(tx?.blockTime)??row.blockTime,...delta});
    }catch(e){errors.push({stage:"TRANSACTION",signature:row.signature,error:e.message??String(e)});}
  }
  events.sort((a,b)=>(a.blockTime??0)-(b.blockTime??0));
  return {provider:"SOLANA_STANDARD_RPC_VIA_HELIUS",wallet,mint,tokenAccounts,
    queriedAddresses:addresses,signatureCount:selected.length,eventCount:events.length,events,errors,
    coverage:{walletAddressQueried:true,currentTokenAccountsQueried:tokenAccounts.length,
      closedHistoricalTokenAccountsIncluded:false,completeHistoricalReconstruction:false},
    researchOnly:true,executionAuthority:false,observedAt:new Date().toISOString()};
}

export default {getSignaturesForAddress,getParsedTransaction,getTokenAccountsByOwnerForMint,parseWalletMintDelta,getWalletMintHistory};
