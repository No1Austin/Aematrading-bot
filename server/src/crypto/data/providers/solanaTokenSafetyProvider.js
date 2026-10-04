/**
 * AEMA — Solana Token Safety Provider
 * Standard Solana RPC via Helius. Free-tier compatible.
 * Research only; no execution authority.
 */
const API_KEY=String(process.env.HELIUS_API_KEY??"").trim();
const RPC_BASE=String(process.env.HELIUS_RPC_URL??"https://mainnet.helius-rpc.com").replace(/\/+$/,"");
const TIMEOUT=Math.max(1000,Number(process.env.HELIUS_TIMEOUT_MS)||12000);
const RETRIES=Math.max(0,Number(process.env.HELIUS_MAX_RETRIES)||2);
const INTERVAL=Math.max(110,Number(process.env.SOLANA_RPC_MIN_INTERVAL_MS)||110);
let lastAt=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const n=v=>(v===null||v===undefined||v==="")?null:(Number.isFinite(Number(v))?Number(v):null);
async function throttle(){const w=INTERVAL-(Date.now()-lastAt);if(w>0)await sleep(w);lastAt=Date.now();}
async function rpc(method,params){
  if(!API_KEY)throw new Error("HELIUS_API_KEY is required");
  let last;
  for(let i=0;i<=RETRIES;i++){
    await throttle();
    const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT);
    try{
      const r=await fetch(`${RPC_BASE}/?api-key=${encodeURIComponent(API_KEY)}`,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:`aema-${method}`,method,params}),signal:c.signal});
      const raw=await r.text();
      if(!r.ok){const e=new Error(`RPC HTTP ${r.status}: ${raw.slice(0,250)}`);
        if((r.status===429||r.status>=500)&&i<RETRIES){last=e;await sleep(400*2**i);continue;}throw e;}
      const body=JSON.parse(raw);
      if(body?.error)throw new Error(`RPC ${body.error.code}: ${body.error.message}`);
      return body?.result??null;
    }catch(e){last=e;if(i>=RETRIES)throw e;await sleep(400*2**i);}
    finally{clearTimeout(t);}
  }
  throw last;
}
export async function getAuthoritativeTokenSupply(mint){
  const r=await rpc("getTokenSupply",[mint,{commitment:"confirmed"}]);
  const v=r?.value;
  return {mint,amountRaw:n(v?.amount),decimals:n(v?.decimals),
    uiAmountString:v?.uiAmountString??null,contextSlot:n(r?.context?.slot),
    source:"SOLANA_GET_TOKEN_SUPPLY"};
}
export async function getParsedMintAccount(mint){
  const r=await rpc("getAccountInfo",[mint,{commitment:"confirmed",encoding:"jsonParsed"}]);
  const v=r?.value??null,info=v?.data?.parsed?.info??null;
  return {mint,exists:!!v,ownerProgram:v?.owner??null,executable:v?.executable??null,
    lamports:n(v?.lamports),space:n(v?.space),parsedProgram:v?.data?.program??null,
    parsedType:v?.data?.parsed?.type??null,decimals:n(info?.decimals),
    supplyRaw:n(info?.supply),mintAuthority:info?.mintAuthority??null,
    freezeAuthority:info?.freezeAuthority??null,isInitialized:info?.isInitialized??null,
    source:"SOLANA_GET_ACCOUNT_INFO"};
}
export async function getAccountIdentity(address){
  const r=await rpc("getAccountInfo",[address,{commitment:"confirmed",encoding:"jsonParsed"}]);
  const v=r?.value??null;
  return {address,exists:!!v,ownerProgram:v?.owner??null,executable:v?.executable??null,
    lamports:n(v?.lamports),space:n(v?.space),parsedProgram:v?.data?.program??null,
    parsedType:v?.data?.parsed?.type??null,
    parsedInfo:v?.data?.parsed?.info??null};
}
export async function getSolanaTokenSafetySnapshot(mint){
  const errors=[];let supply=null,mintAccount=null;
  try{supply=await getAuthoritativeTokenSupply(mint);}catch(e){errors.push({stage:"TOKEN_SUPPLY",error:e.message??String(e)});}
  try{mintAccount=await getParsedMintAccount(mint);}catch(e){errors.push({stage:"MINT_ACCOUNT",error:e.message??String(e)});}
  return {mint,supply,mintAccount,errors,status:errors.length?"PARTIAL":"COMPLETE",
    researchOnly:true,executionAuthority:false,observedAt:new Date().toISOString()};
}
export default {getAuthoritativeTokenSupply,getParsedMintAccount,getAccountIdentity,getSolanaTokenSafetySnapshot};
