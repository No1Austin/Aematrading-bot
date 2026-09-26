
/**
 * Offline AEMA Trade Memory repair.
 *
 * Run from the server directory after stopping ALL server processes.
 *
 * DRY RUN:
 * node scripts/repairTradeMemory.mjs
 *
 * APPLY REPAIR:
 * node scripts/repairTradeMemory.mjs --apply
 *
 * Does not import runtime stores or mutate the ledger.
 * Uses the project's configured paths.
 */

import fs from "node:fs";
import path from "node:path";

import PHASE5 from "../src/crypto/bot/config/botPhase5Config.js";
import PHASE6 from "../src/crypto/bot/config/botPhase6Config.js";

const apply = process.argv.includes("--apply");

if (
  process.argv.some(
    arg => arg.startsWith("--") && arg !== "--apply"
  )
) {
  throw Error(
    "Unknown option. Use no arguments (dry run) or --apply."
  );
}

const ledgerPath = path.resolve(
  process.cwd(),
  PHASE5.persistence.ledgerPath
);

const memoryPath = path.resolve(
  process.cwd(),
  PHASE6.memory.path
);

const tolerance = 0.015;

const near = (a, b) =>
  Math.abs(a - b) <= tolerance;

const valid = x =>
  typeof x === "number" && Number.isFinite(x);

const fail = msg => {
  throw Error(`REPAIR_ABORTED: ${msg}`);
};

const read = file => {
  if (!fs.existsSync(file)) {
    fail(`Missing file: ${file}`);
  }

  const bytes = fs.readFileSync(file);

  return {
    bytes,
    data: JSON.parse(bytes.toString("utf8")),
    stat: fs.statSync(file)
  };
};

const ledgerFile = read(ledgerPath);
const memoryFile = read(memoryPath);

const ledger = ledgerFile.data;
const memory = memoryFile.data;

// Validate file structures.

if (
  !Array.isArray(ledger.closedPositions) ||
  !Array.isArray(ledger.positions) ||
  !Array.isArray(memory.records)
) {
  fail("Unexpected ledger or Memory format");
}

// Validate closed positions.

const closed = new Map();

for (const p of ledger.closedPositions) {
  if (
    !p?.id ||
    closed.has(p.id) ||
    !valid(p.realizedPnlUsd) ||
    !valid(p.partialRealizedPnlUsd ?? 0)
  ) {
    fail(
      `Invalid/duplicate closed position ${p?.id}`
    );
  }

  closed.set(p.id, p);
}

// Validate Trade Memory.

const records = new Map();

for (const r of memory.records) {
  if (
    !r?.tradeId ||
    records.has(r.tradeId)
  ) {
    fail(
      `Invalid/duplicate Memory ID ${r?.tradeId}`
    );
  }

  records.set(r.tradeId, r);

  if (!closed.has(r.tradeId)) {
    fail(`Memory-only trade ${r.tradeId}`);
  }
}

// Validate open positions.

const openIds = new Set();

for (const p of ledger.positions) {
  if (
    !p?.id ||
    openIds.has(p.id) ||
    closed.has(p.id) ||
    !valid(p.partialRealizedPnlUsd ?? 0)
  ) {
    fail(`Invalid open position ${p?.id}`);
  }

  openIds.add(p.id);
}

// Check for missing Memory records.

const missing = [...closed.keys()].filter(
  id => !records.has(id)
);

if (missing.length) {
  fail(
    `Missing Memory records (${missing.length}). ` +
    `Resolve separately: ${missing.join(", ")}`
  );
}

// Recalculate the ledger's realized P&L.

const totalClosed = [...closed.values()].reduce(
  (sum, p) =>
    sum +
    p.realizedPnlUsd +
    (p.partialRealizedPnlUsd ?? 0),
  0
);

const totalOpenPartial = ledger.positions.reduce(
  (sum, p) =>
    sum + (p.partialRealizedPnlUsd ?? 0),
  0
);

const expectedRealized =
  totalClosed + totalOpenPartial;

// Verify that the ledger is internally balanced.

if (
  ![
    ledger.startingEquityUsd,
    ledger.cashUsd,
    ledger.realizedPnlUsd
  ].every(valid) ||
  !near(
    ledger.realizedPnlUsd,
    expectedRealized
  ) ||
  !near(
    ledger.cashUsd,
    ledger.startingEquityUsd + expectedRealized
  )
) {
  fail(
    "Ledger cash/realized P&L do not reconcile. " +
    "No repair attempted."
  );
}

// Identify incorrect Trade Memory records.

const changes = [];

for (const p of closed.values()) {
  const r = records.get(p.id);

  const total =
    p.realizedPnlUsd +
    (p.partialRealizedPnlUsd ?? 0);

  if (
    valid(r.realizedPnlUsd) &&
    near(r.realizedPnlUsd, total)
  ) {
    continue;
  }

  if (
    !valid(r.initialNotionalUsd) ||
    !valid(r.initialQuantity) ||
    !valid(r.entryPrice) ||
    !valid(r.exitPrice)
  ) {
    fail(
      `Memory metrics invalid for ${p.id}; ` +
      "requires manual review"
    );
  }

  const risk = Number(
    p.initialPlannedRiskUsd ??
    p.plannedRiskUsd
  );

  if (
    !Number.isFinite(risk) ||
    risk < 0
  ) {
    fail(
      `Invalid original risk for ${p.id}`
    );
  }

  changes.push({
    id: p.id,
    symbol: p.symbol,
    oldPnl: r.realizedPnlUsd,
    newPnl: total,
    record: r,
    position: p,
    risk
  });
}

// Display the proposed changes.

console.log(
  JSON.stringify(
    {
      mode: apply ? "APPLY" : "DRY_RUN",
      ledgerPath,
      memoryPath,
      closedCount: closed.size,
      memoryCount: records.size,
      expectedRealized,
      ledgerRealized: ledger.realizedPnlUsd,
      changes: changes.map(
        ({
          id,
          symbol,
          oldPnl,
          newPnl
        }) => ({
          id,
          symbol,
          oldPnl,
          newPnl
        })
      )
    },
    null,
    2
  )
);

// Stop here during a dry run.

if (!apply) {
  console.log(
    "DRY RUN: No files modified. " +
    "Stop all server processes before --apply."
  );

  process.exit(0);
}

if (!changes.length) {
  console.log(
    "Already reconciled. Nothing to change."
  );

  process.exit(0);
}

// Refuse to repair stale snapshots.

for (
  const [file, original] of [
    [ledgerPath, ledgerFile],
    [memoryPath, memoryFile]
  ]
) {
  if (
    !fs.readFileSync(file).equals(
      original.bytes
    )
  ) {
    fail(
      `${file} changed since inspection; ` +
      "stop server and retry"
    );
  }
}

// Create backups before modifying Memory.

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const ledgerBackup =
  `${ledgerPath}.backup-${stamp}`;

const memoryBackup =
  `${memoryPath}.backup-${stamp}`;

fs.copyFileSync(
  ledgerPath,
  ledgerBackup,
  fs.constants.COPYFILE_EXCL
);

fs.copyFileSync(
  memoryPath,
  memoryBackup,
  fs.constants.COPYFILE_EXCL
);

console.log(
  "Backups:",
  ledgerBackup,
  memoryBackup
);

// Correct the verified Memory records.

for (
  const {
    record: r,
    position: p,
    newPnl,
    risk
  } of changes
) {
  r.realizedPnlUsd = newPnl;

  r.partialRealizedPnlUsd =
    p.partialRealizedPnlUsd ?? 0;

  r.returnPercent = Number(
    (
      r.initialNotionalUsd > 0
        ? newPnl /
          r.initialNotionalUsd * 100
        : 0
    ).toFixed(4)
  );

  r.rMultiple = Number(
    (
      risk > 0
        ? newPnl / risk
        : 0
    ).toFixed(4)
  );

  r.outcome =
    newPnl > 0
      ? "WIN"
      : newPnl < 0
        ? "LOSS"
        : "BREAKEVEN";

  r.accountingCorrectedAt =
    new Date().toISOString();

  r.accountingCorrectionReason =
    "Reconciled against internally balanced paper ledger";
}

memory.updatedAt =
  new Date().toISOString();

// Check that the original files have not changed.

if (
  !fs.readFileSync(ledgerPath).equals(
    ledgerFile.bytes
  ) ||
  !fs.readFileSync(memoryPath).equals(
    memoryFile.bytes
  )
) {
  fail(
    "Files changed during backup; " +
    "no writes made"
  );
}

// Write a temporary Memory file and verify it.

const tmp =
  `${memoryPath}.repair-${process.pid}.tmp`;

try {
  fs.writeFileSync(
    tmp,
    JSON.stringify(memory, null, 2) + "\n",
    { flag: "wx" }
  );

  const verify = JSON.parse(
    fs.readFileSync(tmp, "utf8")
  );

  for (const p of closed.values()) {
    const r = verify.records.find(
      x => x.tradeId === p.id
    );

    if (
      !r ||
      !valid(r.realizedPnlUsd) ||
      !near(
        r.realizedPnlUsd,
        p.realizedPnlUsd +
        (p.partialRealizedPnlUsd ?? 0)
      )
    ) {
      fail(
        `Verification failed: ${p.id}`
      );
    }
  }

  if (
    !fs.readFileSync(ledgerPath).equals(
      ledgerFile.bytes
    ) ||
    !fs.readFileSync(memoryPath).equals(
      memoryFile.bytes
    )
  ) {
    fail(
      "Files changed before commit; " +
      "no writes made"
    );
  }

  fs.renameSync(tmp, memoryPath);

} finally {
  if (fs.existsSync(tmp)) {
    fs.unlinkSync(tmp);
  }
}

console.log(
  `SUCCESS: Corrected ${changes.length} ` +
  "Memory record(s); ledger untouched. " +
  "Restart one server process."
);
