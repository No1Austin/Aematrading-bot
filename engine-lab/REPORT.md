# AEMA Phase 7: September 24–25 diagnostic

## What the uploads establish

- Trade Memory: 26 closed trades, 13 wins, 13 losses, net **-$205.33**.
- Ledger: 26 closed positions but only 25 matching Trade Memory IDs; ledger reported realized **-$306.36** while the sum of its closed-position P&L is **-$326.65**. These are **different accounting figures**, not interchangeable.
- Directional results: 18 bullish trades **+$69.71**; eight bearish trades **-$275.04**.
- Mean directional entry scores (winners vs losses, 13 vs 12 available snapshots): technical **71.34 vs 58.08**, market structure **91.10 vs 73.12**, fundamental **68.85 vs 70.48**, liquidity **50.26 vs 56.36**.

## What to do next

1. **Audit closure accounting and snapshot timing** before treating realized returns as a training target.
2. **Shadow-test engine agreement** and **directional separation** without changing existing weights or blocking trades. Historical threshold results are unstable and should not be interpreted as validated parameters.
3. **Log all eligible and rejected candidates**, not just executed trades, so that missed opportunities can be measured.
4. **Replay position management** on fresh market paths to isolate whether stop placement, trailing activation or repeated partial reductions account for adverse results.
5. Forward-test paper-only against the unchanged baseline before making execution changes.

See `analysis.json`, `trade_features.csv`, `README.md`, `analyze.py` and `botEngineShadowEvaluator.js` for reproducibility.
