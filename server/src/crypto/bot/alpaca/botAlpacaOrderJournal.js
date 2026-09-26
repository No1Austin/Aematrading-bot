import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Separate journal. Never imports or modifies the historical simulator ledger.
const DEFAULT_FILE = path.resolve(process.cwd(), 'data/alpaca-paper/bot-alpaca-order-journal.json');
function read(file) {
  if (!fs.existsSync(file)) return { version: 1, provider: 'ALPACA_PAPER', records: [] };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || data.provider !== 'ALPACA_PAPER' || !Array.isArray(data.records))
    throw new Error('INVALID_ALPACA_JOURNAL');
  return data;
}
export function readBotAlpacaJournal(file = DEFAULT_FILE) { return read(file); }
export function appendBotAlpacaObservation(observation, file = DEFAULT_FILE) {
  if (!observation || observation.source !== 'ALPACA_PAPER' ||
      !['ACCOUNT_SNAPSHOT', 'ORDER_SNAPSHOT', 'POSITION_SNAPSHOT'].includes(observation.type))
    throw new Error('INVALID_ALPACA_OBSERVATION');
  const journal = read(file);
  const record = { id: randomUUID(), observedAt: new Date().toISOString(), ...observation };
  journal.records.push(record);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(journal, null, 2), { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, file);
  return record;
}
