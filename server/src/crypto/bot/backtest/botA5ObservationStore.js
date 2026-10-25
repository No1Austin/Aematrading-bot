/** A5 server-side, research-only Supabase persistence. No execution permissions. */
export function a5CollectorConfig(env=process.env) {
  return { enabled:env.EMA_A5_COLLECTOR_ENABLED==='true',
    supabaseEnabled:env.EMA_A5_SUPABASE_ENABLED==='true',
    filePath:env.EMA_A5_LOCAL_FILE || './quant-research/data/ema_a5_observations.jsonl' };
}
export async function persistA5Observations(observations,{env=process.env,fetchImpl=globalThis.fetch}={}) {
  if (!Array.isArray(observations)) throw Error('OBSERVATIONS_ARRAY_REQUIRED');
  if (!observations.length) return {saved:0};
  const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !/^https:\/\/[^/]+/.test(url) || !key) throw Error('A5_SUPABASE_NOT_CONFIGURED');
  // Service-role credential stays server-side. Never use a client/anon key for this operation.
  const endpoint=new URL('/rest/v1/ema_research_observations',url);
  const payload=observations.map(o=>({observation_id:o.observationId,run_id:o.runId,
    captured_at:o.capturedAt, symbol:o.symbol, strategy:o.strategy,
    direction:o.direction,point_in_time_verified:false,
    execution_authority:false, observation:o}));
  const response=await fetchImpl(endpoint.toString(),{method:'POST',headers:{
    apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',
    Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(payload)});
  if(!response.ok) throw Error(`A5_SUPABASE_WRITE_FAILED_${response.status}`);
  return {saved:observations.length};
}
