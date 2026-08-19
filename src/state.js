import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const SCHEMA_VERSION = 1;

/** Fields that may be persisted. Everything else (e.g. API keys) is dropped. */
const ALLOWED_FIELDS = new Set([
  'schemaVersion',
  'lang',
  'step',
  'platform',
  'mode',
  'agentId',
  'workDir',
  'modelId',
  'confirmed',
  'updatedAt',
]);

/**
 * State directory. Overridable via AGENT_GUIDE_HOME (used by tests).
 */
export function stateDir() {
  return process.env.AGENT_GUIDE_HOME
    ? path.join(process.env.AGENT_GUIDE_HOME, '.agent-guide')
    : path.join(os.homedir(), '.agent-guide');
}

export function stateFile() {
  return path.join(stateDir(), 'state.json');
}

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    lang: 'zh-CN',
    step: 'welcome',
    platform: null,
    mode: null,
    agentId: null,
    workDir: null,
    modelId: null,
    confirmed: [],
    updatedAt: null,
  };
}

/** Keep only known fields so secrets can never leak into state.json. */
export function sanitizeState(state) {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (state[key] !== undefined) out[key] = state[key];
  }
  return { ...defaultState(), ...out };
}

export async function loadState() {
  try {
    const raw = await fs.readFile(stateFile(), 'utf8');
    const data = JSON.parse(raw);
    return sanitizeState(data);
  } catch {
    return defaultState();
  }
}

export async function saveState(state) {
  const clean = sanitizeState(state);
  clean.updatedAt = new Date().toISOString();
  const dir = stateDir();
  await fs.mkdir(dir, { recursive: true });
  const file = stateFile();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(clean, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return clean;
}

/** Mark a step as confirmed (design §8: confirmation tokens / audit trail). */
export function confirmStep(state, stepId) {
  const clean = sanitizeState(state);
  const list = Array.isArray(clean.confirmed) ? clean.confirmed : [];
  if (!list.find((s) => s.id === stepId)) {
    list.push({ id: stepId, at: new Date().toISOString() });
  }
  clean.confirmed = list;
  return clean;
}
