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
  assert.equal(plan.steps.length, 2, 'install + verify steps');
  assert.equal(plan.steps[0].id, 'install');
  assert.equal(plan.steps[0].shell, 'powershell');
  assert.equal(plan.steps[1].id, 'verify');
  assert.equal(plan.steps[1].verify, true);
  assert.equal(plan.commands.length, 2);
  assert.ok(plan.commands[0].includes('hermes-agent.nousresearch.com'));
  assert.ok(plan.requires.includes('git'));
});

test('plan for claude-code on windows defaults to wsl (design D2)', async () => {
  const agents = await loadAgents();
  const cc = agents.find((a) => a.id === 'claude-code');
  const plan = planForAgent(cc, 'windows');
  assert.equal(plan.mode, 'wsl');
  assert.equal(plan.steps[0].shell, 'wsl-bash');
  assert.ok(plan.steps[0].command.includes('claude.ai/install.sh'));
  assert.ok(plan.requires.includes('wsl'));
});

test('M2 verification pass: 6 of 7 recipes verified, goose pending E2E', async () => {
  const agents = await loadAgents();
  const verified = agents.filter((a) => a.verified);
  const unverified = agents.filter((a) => !a.verified);
  assert.equal(verified.length, 6, 'claude-code/codex/hermes/gemini/aider/opencode verified');
  assert.deepEqual(unverified.map((a) => a.id), ['goose'], 'goose remains the M2 wrap-up item');
  assert.ok(verified.every((a) => a.verifiedAt), 'verified recipes carry a verification date');
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
