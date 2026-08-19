import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgents, planForAgent } from '../src/agents.js';
import { recipePlatform } from '../src/detect.js';

test('agents.json contains exactly the 7 v1 agents (design D5)', async () => {
  const agents = await loadAgents();
  assert.equal(agents.length, 7);
  const ids = agents.map((a) => a.id).sort();
  assert.deepEqual(ids, ['aider', 'claude-code', 'codex', 'gemini', 'goose', 'hermes', 'opencode']);
});

test('plan for hermes on windows defaults to native (design D2)', async () => {
  const agents = await loadAgents();
  const hermes = agents.find((a) => a.id === 'hermes');
  const plan = planForAgent(hermes, 'windows');
  assert.equal(plan.available, true);
  assert.equal(plan.mode, 'native');
  assert.equal(plan.commands.length, 1);
  assert.ok(plan.commands[0].includes('hermes-agent.nousresearch.com'));
  assert.ok(plan.requires.includes('git'));
});

test('plan for claude-code on windows defaults to wsl (design D2)', async () => {
  const agents = await loadAgents();
  const cc = agents.find((a) => a.id === 'claude-code');
  const plan = planForAgent(cc, 'windows');
  assert.equal(plan.mode, 'wsl');
  assert.ok(plan.commands[0].startsWith('wsl -e bash'));
});

test('unverified recipes are flagged for M2 verification', async () => {
  const agents = await loadAgents();
  assert.ok(agents.every((a) => a.verified === false), 'all recipes start unverified');
});

test('recipePlatform maps node platforms to recipe keys', () => {
  assert.equal(recipePlatform('win32'), 'windows');
  assert.equal(recipePlatform('darwin'), 'macos');
  assert.equal(recipePlatform('linux'), 'linux');
});

test('plan for unknown agent returns unavailable', () => {
  const plan = planForAgent({ id: 'nope', platforms: {} }, 'windows');
  assert.equal(plan.available, false);
});
