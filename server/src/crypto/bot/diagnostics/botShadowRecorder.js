/**
 * AEMA append-only, observation-only shadow recorder.
 * Shadow results never feed into selection, risk, revalidation, or execution.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import evaluateBotEngineShadow from "./botEngineShadowEvaluator.js";

const outputPath = () => path.resolve(process.cwd(),
  process.env.AEMA_BOT_SHADOW_PATH || "./data/aema-bot-shadow.jsonl");
const compact = c => ({
  symbol:c?.symbol ?? null,
  direction:c?.directionDecision?.direction ?? null,
  directionDecision:c?.directionDecision ?? null,
  setup:c?.setup ? {
    approved:c.setup.approved, blockers:c.setup.blockers ?? [],
    riskReward:c.setup.riskReward ?? null,
    spreadPercent:c.setup.spreadPercent ?? null,
    slippagePercent:c.setup.slippagePercent ?? null,
  } : null,
  executionRank:c?.executionRank ?? null,
  executionRankScore:c?.executionRankScore ?? null,
  learnedExecutionScore:c?.learnedExecutionScore ?? null,
});

export function recordBotShadowCycle({startedAt,candidates=[],orderAttempts=[],selected=null,status=null,counts=null}={}) {
  if (process.env.AEMA_BOT_SHADOW_ENABLED === "false") return;
  try {
    const observedAt = new Date().toISOString();
    const cycleId = crypto.randomUUID();
    const attempts = new Map();
    for (const attempt of Array.isArray(orderAttempts) ? orderAttempts : []) {
      const list = attempts.get(attempt.symbol) ?? [];
      list.push(attempt);
      attempts.set(attempt.symbol,list);
    }
    const rows = (Array.isArray(candidates) ? candidates : []).map(candidate => {
      const shadow = evaluateBotEngineShadow(candidate);
      return {
        cycleId, startedAt, observedAt, status, counts,
        symbol:candidate?.symbol ?? null,
        baseline:compact(candidate), shadow,
        // Preserve the legacy single-attempt field and retain every attempt separately.
        attempt:attempts.get(candidate?.symbol)?.at(-1) ?? null,
        attempts:attempts.get(candidate?.symbol) ?? [],
        actuallySelected:Boolean(selected && selected.symbol === candidate?.symbol),
        hypotheticalOnly:true, paperExecutionAuthority:false, liveExecution:false,
      };
    });
    // Include empty cycles to avoid recording only cycles with qualifying candidates.
    if (!rows.length) rows.push({
      cycleId,startedAt,observedAt,status,counts,emptyCycle:true,
      hypotheticalOnly:true,paperExecutionAuthority:false,liveExecution:false,
    });
    const file = outputPath();
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.appendFileSync(file,rows.map(row=>JSON.stringify(row)).join("\n")+"\n", "utf8");
  } catch (error) {
    console.error("[BOT SHADOW] observation failed (execution unchanged):",error?.message ?? String(error));
  }
}
export default recordBotShadowCycle;
