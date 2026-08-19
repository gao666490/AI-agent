import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const PLATFORMS = ['windows', 'macos', 'linux'];
const COMPAT = ['native', 'anthropic-compatible', 'openai-compatible', 'router', 'unsupported'];

async function readJson(rel) {
  return JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
}

test('agents.json schema: ids unique and required fields present', async () => {
  const data = await readJson('data/agents.json');
  assert.ok(data._meta, '_meta block required');
  assert.ok(Array.isArray(data.agents) && data.agents.length > 0);
  const ids = data.agents.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'agent ids must be unique');
  for (const a of data.agents) {
    assert.ok(a.id && a.name && a.homepage && a.launchCommand, `agent ${a.id}: id/name/homepage/launchCommand required`);
    assert.equal(typeof a.verified, 'boolean', `agent ${a.id}: verified must be boolean`);
  }
});

test('agents.json schema: platform recipes are well-formed', async () => {
  const data = await readJson('data/agents.json');
  for (const a of data.agents) {
    const keys = Object.keys(a.platforms || {});
    assert.ok(keys.length > 0, `agent ${a.id}: at least one platform`);
    for (const pk of keys) {
      assert.ok(PLATFORMS.includes(pk), `agent ${a.id}: unknown platform key ${pk}`);
      const p = a.platforms[pk];
      assert.ok(p.choices && Object.keys(p.choices).length > 0, `agent ${a.id}/${pk}: choices required`);
      assert.ok(p.recommended && p.choices[p.recommended], `agent ${a.id}/${pk}: recommended must name a choice`);
      for (const [mode, choice] of Object.entries(p.choices)) {
        assert.ok(choice.label, `agent ${a.id}/${pk}/${mode}: label required`);
        assert.ok(Array.isArray(choice.requires), `agent ${a.id}/${pk}/${mode}: requires must be array`);
        const hasSteps = Array.isArray(choice.steps) && choice.steps.length > 0;
        assert.ok(hasSteps || choice.command, `agent ${a.id}/${pk}/${mode}: command or steps required`);
        if (hasSteps) {
          for (const s of choice.steps) {
            assert.ok(s.id && s.title && s.command, `agent ${a.id}/${pk}/${mode}: step needs id/title/command`);
            if (s.shell) assert.ok(['powershell', 'wsl-bash', 'bash', 'cmd'].includes(s.shell), `step ${s.id}: unknown shell ${s.shell}`);
          }
        }
      }
    }
  }
});

test('models.json schema: ids unique, compat values are from the allowed set', async () => {
  const data = await readJson('data/models.json');
  assert.ok(Array.isArray(data.models) && data.models.length > 0);
  const ids = data.models.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'model ids must be unique');
  for (const m of data.models) {
    assert.ok(m.id && m.name && m.region, `model ${m.id}: id/name/region required`);
    assert.ok(['cn', 'global'].includes(m.region), `model ${m.id}: region must be cn|global`);
    assert.ok(m.api && typeof m.api === 'object', `model ${m.id}: api block required`);
    assert.equal(typeof m.verified, 'boolean', `model ${m.id}: verified must be boolean`);
    for (const [agent, compat] of Object.entries(m.compat || {})) {
      assert.ok(COMPAT.includes(compat), `model ${m.id} × ${agent}: compat must be one of ${COMPAT.join('|')} (got ${compat})`);
    }
  }
});
