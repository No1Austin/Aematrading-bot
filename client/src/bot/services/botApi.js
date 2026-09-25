const BASE=`${(import.meta.env.VITE_API_BASE_URL??"").replace(/\/+$/ ,"")}/api/crypto/bot`;
async function req(path,options={}){const r=await fetch(`${BASE}${path}`,{credentials:"include",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});let b=null;try{b=await r.json()}catch{}if(!r.ok){const e=new Error(b?.error||`HTTP_${r.status}`);e.status=r.status;throw e}return b}
export const getBotAuthStatus=()=>req("/auth/status");
export const loginBot=accessKey=>req("/auth/login",{method:"POST",body:JSON.stringify({accessKey})});
export const logoutBot=()=>req("/auth/logout",{method:"POST"});
export const getBotDashboard=()=>req("/dashboard");
export const getBotHistory=()=>req("/history");
export const getTradeExplanation=id=>req(`/positions/${encodeURIComponent(id)}/explanation`);
export const setBotAllocation=allocationUsd=>req("/controls/allocation",{method:"PUT",body:JSON.stringify({allocationUsd:Number(allocationUsd)})});
export const pauseBot=()=>req("/controls/pause",{method:"POST"});
export const resumeBot=()=>req("/controls/resume",{method:"POST"});
export const closeBotPosition=id=>req(`/positions/${encodeURIComponent(id)}/close`,{method:"POST"});
export const emergencyStopBot=()=>req("/controls/emergency-stop",{method:"POST"});
