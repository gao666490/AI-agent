import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadState, saveState, confirmStep, sanitizeState, stateFile, SCHEMA_VERSION } from '../src/state.js';

const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-guide-test-'));
process.env.AGENT_GUIDE_HOME = tmpHome;

test('default state has schema version and welcome step', () => {
  const s = sanitizeState({});
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.equal(s.step, 'welcome');
  assert.equal(s.lang, 'zh-CN');
});

test('save/load roundtrip', async () => {
  const saved = await saveState({ step: 'platform', lang: 'en', agentId: 'hermes' });
  const loaded = await loadState();
  assert.equal(loaded.step, 'platform');
  assert.equal(loaded.lang, 'en');
  assert.equal(loaded.agentId, 'hermes');
  assert.ok(saved.updatedAt);
});

test('sanitizeState strips unknown fields (secrets never persisted)', async () => {
  await saveState({ apiKey: 'sk-super-secret', claudeKey: 'xxx', step: 'agent' });
  const raw = await fs.readFile(stateFile(), 'utf8');
  assert.ok(!raw.includes('sk-super-secret'));
  assert.ok(!raw.includes('xxx'));
  const loaded = await loadState();
  assert.equal(loaded.step, 'agent');
  assert.equal(loaded.apiKey, undefined);
});

test('confirmStep records timestamp audit trail', () => {
  const s = confirmStep({ confirmed: [] }, 'permission');
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.confirmed[0].id, 'permission');
  assert.ok(s.confirmed[0].at);
  const again = confirmStep(s, 'permission');
  assert.equal(again.confirmed.length, 1, 'no duplicate entries');
});
