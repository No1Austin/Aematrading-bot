/**
 * AEMA — Solana Token-2022 Extension Inspector
 * Uses jsonParsed getAccountInfo through the existing Helius RPC.
 * Unknown/unparsed extension data remains UNKNOWN; never silently treated safe.
 */
const API_KEY=String(process.env.HELIUS_API_KEY??"").trim();
const RPC_BASE=String(process.env.HELIUS_RPC_URL??"https://mainnet.helius-rpc.com").replace(/\/+$/,"");
const TIMEOUT=Math.max(1000,Number(process.env.HELIUS_TIMEOUT_MS)||12000);
async function rpc(method,params){
  if(!API_KEY)throw new Error("HELIUS_API_KEY is required");
  const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT);
  try{
    const r=await fetch(`${RPC_BASE}/?api-key=${encodeURIComponent(API_KEY)}`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:"aema-token2022",method,params}),signal:c.signal});
    const raw=await r.text();
    if(!r.ok)throw new Error(`RPC HTTP ${r.status}: ${raw.slice(0,300)}`);
    const b=JSON.parse(raw);if(b?.error)throw new Error(`RPC ${b.error.code}: ${b.error.message}`);
    return b?.result??null;
  }finally{clearTimeout(t);}
}
const norm=s=>String(s??"").replace(/[^a-z0-9]/gi,"").toLowerCase();

export async function inspectToken2022Extensions(mint){
  const r=await rpc("getAccountInfo",[mint,{commitment:"confirmed",encoding:"jsonParsed"}]);
  const v=r?.value??null,parsed=v?.data?.parsed??null,info=parsed?.info??{};
  const program=v?.data?.program??null;
  const isToken2022=program==="spl-token-2022";
  const rawExtensions=Array.isArray(info?.extensions)?info.extensions:[];
  const extensions=rawExtensions.map((x,i)=>{
    const type=x?.extension??x?.type??x?.extensionType??`UNKNOWN_${i}`;
    return {type,data:x?.state??x};
  });
  const names=extensions.map(x=>norm(x.type));
  const has=(...needles)=>names.some(x=>needles.some(n=>x.includes(norm(n))));
  const flags={
    transferFee:has("transferFeeConfig"),
    permanentDelegate:has("permanentDelegate"),
    transferHook:has("transferHook"),
    nonTransferable:has("nonTransferable"),
    defaultAccountState:has("defaultAccountState"),
    confidentialTransfer:has("confidentialTransfer"),
    interestBearing:has("interestBearing"),
    mintCloseAuthority:has("mintCloseAuthority"),
    metadataPointer:has("metadataPointer"),
    tokenMetadata:has("tokenMetadata"),
    pausable:has("pausable"),
    scaledUiAmount:has("scaledUiAmount","uiAmountMultiplier"),
  };
  return {mint,isToken2022,program,space:v?.space??null,extensionCount:extensions.length,
    extensions,flags,parserExposedExtensions:Array.isArray(info?.extensions),
    source:"SOLANA_GET_ACCOUNT_INFO_JSON_PARSED",observedAt:new Date().toISOString()};
}
export default {inspectToken2022Extensions};
