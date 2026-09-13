export const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
export const clamp=(v,a=0,b=100)=>Math.min(b,Math.max(a,finite(v)));
export const round=(v,d=2)=>{const p=10**d;return Math.round(finite(v)*p)/p;};
export function complete(engine,score,direction="LONG",evidence={}){
 const s=round(clamp(score)),x=String(direction??"NEUTRAL").toUpperCase();
 return{approved:true,engine,status:"COMPLETE",score:s,confidence:round(s/100,4),direction:x,
 directionalSupport:x==="SHORT"?{long:round((1-s/100)*.35,4),short:round(s/100,4)}:{long:round(s/100,4),short:round((1-s/100)*.35,4)},evidence,warnings:[],errors:[]};
}
export const insufficient=(engine,evidence={},warning="REAL_PROVIDER_DATA_REQUIRED")=>({approved:false,engine,status:"INSUFFICIENT_DATA",score:null,confidence:0,direction:"NEUTRAL",directionalSupport:{long:0,short:0},evidence,warnings:[warning],errors:[]});
