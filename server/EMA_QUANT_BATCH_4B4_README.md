# EMA Quant Phase 4B.4 — integrated archive capture and audit

**Research-only. No strategy thresholds, rankings, trading or execution are modified.**

## Files
- Replace `src/crypto/bot/orchestration/botMarketSearchCycle.js`
- Add `scripts/emaQuantArchiveAudit.js`
- Add `scripts/emaQuantArchiveAudit.test.js`

## Run checks
```sh
node --check src/crypto/bot/orchestration/botMarketSearchCycle.js
node scripts/emaQuantSnapshotArchive.test.js
node scripts/emaQuantArchiveAudit.test.js
```

## Opt-in capture
In the existing JS caller of `runBotMarketSearch`, enable:
```js
quantArchive: {
  enabled: true,
  filePath: 'quant-research/data/futures_snapshots.jsonl',
  candleInterval: '5m',
  includeDetails: true
}
```
The result includes `quantArchive.saved`, `rejected`, `reasons` and optional `records`.
Only the market's existing `candles` array is considered. If the provider uses another field or returns insufficient/gapped candles, capture is rejected and summarized. No candles or derivatives inputs are fabricated.

## Audit
```sh
node scripts/emaQuantArchiveAudit.js quant-research/data/futures_snapshots.jsonl
```
**Integrity checks are not independent proof of point-in-time capture.** Archives remain `pointInTimeVerified:false`; the strict historical replay engine will not accept them. Phase 4B.5 must establish trusted point-in-time provenance and a suitable verified replay adapter. Do not manually change the verification flag.

Do not commit archives containing market/candidate data without reviewing privacy and licensing constraints. Avoid uploading secrets; the archive sanitizer strips common credential fields but is not a substitute for secret hygiene.
