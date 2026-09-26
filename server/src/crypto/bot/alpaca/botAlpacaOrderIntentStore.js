import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// A separate PREVIEW journal. No orders are placed by this module.
const DEFAULT_PATH = path.resolve(process.cwd(), 'data/alpaca-paper/bot-alpaca-intents.json');
export function readAlpacaOrderIntents(file = DEFAULT_PATH) {
  if (!fs.existsSync(file)) return { version: 1, provider: 'ALPACA_PAPER', intents: [] };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || data.provider !== 'ALPACA_PAPER' || !Array.isArray(data.intents)) throw Error('INVALID_ALPACA_INTENT_JOURNAL');
  return data;
}
export function recordAlpacaOrderPreview(preview, file = DEFAULT_PATH) {
  if (preview?.executionAuthority !== false || preview?.status !== 'PREVIEW_ONLY' ||
      !/^([A-Z0-9]+)\/(USD|USDT|USDC)$/.test(preview?.pair || '')) throw Error('INVALID_ALPACA_PREVIEW');
  const journal = readAlpacaOrderIntents(file);
  // Preview identifiers must never be submitted as actual client_order_id values.
  const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...preview };
  journal.intents.push(record);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(journal, null, 2), { flag: 'wx', mode: 0o600 });
  fs.renameSync(tmp, file);
  return record;
}
