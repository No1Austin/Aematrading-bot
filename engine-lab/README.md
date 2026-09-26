# AEMA Engine Lab — diagnostic, not an execution patch

This package examines the uploaded September 24–25 paper-ledger and Trade Memory snapshots. **It changes no trading parameters and must not be used to execute orders.** Historical subset comparisons include only trades the bot actually placed, not missed opportunities, and are prone to overfitting and selection bias.

## Re-run with newer records

```bash
python3 analyze.py /path/to/aema-bot-trade-memory.json /path/to/aema-bot-paper-ledger.json ./output
```

Outputs: `analysis.json` and `trade_features.csv`. Treat missing entry engine data as missing, never as zero. Join by stable trade ID, not symbol. `botEngineShadowEvaluator.js` can be imported by a future observation-only telemetry pipeline to compare the baseline against two hypotheses without changing order execution.

## Priority 1: reconcile accounting before adjusting engines

Trade Memory: 26 trades, net -$205.33. Ledger: 26 closed positions, closed-position P&L -$326.65; top-level realized P&L -$306.36. Only 25 trade IDs match. Trade Memory contains ENAUSDT not in ledger's closed list; ledger contains 龙虾USDT not in Trade Memory. Matched NILUSDT and TAKEUSDT records differ by amounts equal to partial realized P&L ($20.50 and $24.81). Determine whether partial realized P&L is being included once, twice, or omitted at closure, and whether files were exported at different times. **Do not automatically rewrite any ledger or memory records.**

## Priority 2: experimental observations

- 13 wins, 13 losses; average loss larger than average win.
- Technical directional entry scores: winners 71.34 (n=13), losses 58.08 (n=12).
- Market-structure directional entry scores: winners 91.10, losses 73.12 on the same available sample.
- Both technical and market structure >=60: historical subset 12 trades, 9 wins, +$63.01. At >=65, subset 9 trades, 6 wins, -$139.28. This instability illustrates why **do not hard-code 60 or optimize against these trades**.
- A separation >=20: 22 executed trades, 13 wins, -$0.25. Still not proof of an improved entry rule.
- Trailing exits: 14 trades, +$330.73; regular stop exits contributed major losses. Exit categories are outcomes of management, not independent treatment groups; do not infer that trailing stops would have saved all stopped trades.

## Proposed forward test

1. Keep existing engine weights and risk rules unchanged as baseline. Paper trading only.
2. Shadow-log the baseline and candidate rules for **every** researched candidate, including rejected candidates, with timestamp, data freshness, direction, engine scores, setup and reason for rejection. This avoids the current executed-trade-only blind spot.
3. Capture mark-price paths for candidate setups to evaluate comparable hypothetical entry/exit assumptions. Include spread, slippage and fees (only when actually modeled).
4. Pre-register candidate rules and outcome metrics before collecting new data. Compare expectancy in R, drawdown, profit factor, trade frequency and performance by direction; include uncertainty intervals.
5. Keep candidate strategies observation-only through a separate forward-test period. Promote nothing to execution solely from this historical snapshot.

`botEngineShadowEvaluator.js` returns `executionAuthority:false` and does not call an exchange or mutate ledger state.
