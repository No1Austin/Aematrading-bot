import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const DEFAULT = path.resolve(process.cwd(), 'data/alpaca-paper/execution-journal.json');
export const journalPath = () => process.env.AEMA_ALPACA_EXECUTION_JOURNAL || DEFAULT;
export function readExecutionJournal(file = journalPath()) {
  if (!fs.existsSync(file)) return { version: 1, provider: 'ALPACA_PAPER', records: [] };
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (j.version !== 1 || j.provider !== 'ALPACA_PAPER' || !Array.isArray(j.records)) throw Error('INVALID_EXECUTION_JOURNAL');
  return j;
}
// A write-ahead journal: unknown outcomes remain blocked until reconciled.
export function appendExecutionEvent(event, file = journalPath()) {
  const j = readExecutionJournal(file);
  if (!event?.clientOrderId || !event?.type) throw Error('INVALID_EXECUTION_EVENT');
  const row = { eventId: randomUUID(), at: new Date().toISOString(), ...event };
  j.records.push(row);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(j, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
  return row;
}
export function latestExecutionState(file = journalPath()) {
  const rows = readExecutionJournal(file).records;
  const state = new Map();
  for (const row of rows) state.set(row.clientOrderId, row);
  return [...state.values()];
}
