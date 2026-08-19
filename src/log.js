import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stateDir } from './state.js';

/**
 * Local operation log (design §8): audit trail without secrets.
 * Path: ~/.agent-guide/logs/guide.log
 */
export async function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}\n`;
  try {
    const dir = path.join(stateDir(), 'logs');
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, 'guide.log'), line, 'utf8');
  } catch {
    // Logging must never crash the wizard.
  }
  console.log(line.trimEnd());
}

/** Return the last `n` lines of the log, for GET /api/logs. */
export async function tailLog(n = 200) {
  try {
    const file = path.join(stateDir(), 'logs', 'guide.log');
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
}
