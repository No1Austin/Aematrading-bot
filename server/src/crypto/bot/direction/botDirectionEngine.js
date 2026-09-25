/**
 * Direction is comparative LONG vs SHORT evidence.
 * No fixed total score is required to receive a direction.
 */
import BOT_CONFIG from "../config/botConfig.js";

export function determineBotDirection(candidate, options={}) {
  const weights={...BOT_CONFIG.research.weights,...(options.weights||{})};
  const engines=candidate?.engines||{};
  let longWeighted=0, shortWeighted=0, weightUsed=0, confidenceWeighted=0;
  const contributions={};

  for(const [key,weight] of Object.entries(weights)){
    const e=engines[key];
    if(!e?.available || !Number.isFinite(e.long) || !Number.isFinite(e.short)){
      contributions[key]={available:false,weight};
      continue;
    }
    longWeighted += e.long*weight;
    shortWeighted += e.short*weight;
    confidenceWeighted += (e.confidence||0)*weight;
    weightUsed += weight;
    contributions[key]={available:true,weight,long:e.long,short:e.short,confidence:e.confidence};
  }

  if(weightUsed<=0) return {...candidate,directionDecision:{
    direction:null,longScore:null,shortScore:null,separation:null,confidence:0,
    availableWeight:0,reason:"NO_DIRECTIONAL_EVIDENCE",contributions
  }};

  const longScore=longWeighted/weightUsed;
  const shortScore=shortWeighted/weightUsed;
  const direction=longScore>=shortScore?"LONG":"SHORT";
  const separation=Math.abs(longScore-shortScore);
  const confidence=confidenceWeighted/weightUsed;

  return {...candidate,directionDecision:{
    direction,
    longScore:Number(longScore.toFixed(4)),
    shortScore:Number(shortScore.toFixed(4)),
    separation:Number(separation.toFixed(4)),
    confidence:Number(confidence.toFixed(4)),
    availableWeight:Number(weightUsed.toFixed(4)),
    contributions,
    executionAuthority:false,
    liveExecution:false,
  }};
}

export default determineBotDirection;
