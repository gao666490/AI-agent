import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPrereqs } from '../src/prereqs.js';

test('checkPrereqs reports node as present (tests run on Node)', async () => {
  const r = await checkPrereqs(['node'], {});
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].name, 'node');
  assert.equal(r.items[0].present, true);
  assert.ok(r.items[0].version);
  assert.equal(r.ok, true);
});

test('unknown requirement reports missing with hint', async () => {
  const r = await checkPrereqs(['made-up-tool'], {});
  assert.equal(r.items[0].present, false);
  assert.ok(r.items[0].hint.length > 0);
  assert.equal(r.ok, false);
});

test('empty requires is trivially ok', async () => {
  const r = await checkPrereqs([], {});
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 0);
});

test('wsl requirement reads from the env snapshot without spawning', async () => {
  const r = await checkPrereqs(['wsl'], { wsl: { available: false } });
  assert.equal(r.items[0].present, false);
  assert.ok(r.items[0].hint.includes('wsl --install'));
  const r2 = await checkPrereqs(['wsl'], { wsl: { available: true, wsl2: true } });
  assert.equal(r2.items[0].present, true);
  assert.equal(r2.items[0].version, 'WSL 2');
});

test('installable tiers: uv=user(auto), git=admin, node=manual', async () => {
  const [uv, git, node] = (await checkPrereqs(['uv', 'git', 'node'], {})).items;
  assert.equal(uv.installable, 'user');
  assert.ok(uv.installCommand, 'uv has an install command');
  assert.ok(Array.isArray(uv.installSteps) && uv.installSteps.length > 0, 'uv has executable install steps');
  assert.equal(git.installable, 'admin');
  assert.ok(git.installCommand, 'git shows the admin command');
  assert.equal(node.installable, 'manual');
  assert.equal(node.installCommand, null);
});

test('present requirements carry no install steps', async () => {
  const items = (await checkPrereqs(['uv', 'node'], {})).items;
  for (const it of items) {
    if (it.present) assert.equal(it.installSteps, undefined, `${it.name} present -> no install steps`);
  }
});
