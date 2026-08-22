import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startCcr, stopCcr, statusCcr, ccrNodeOk, isCcrInstalled, routerStateFile } from '../src/router.js';

const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-router-'));
process.env.AGENT_GUIDE_HOME = tmpHome;

test('ccrNodeOk gates on Node 22+', () => {
  assert.equal(ccrNodeOk('v24.19.0'), true);
  assert.equal(ccrNodeOk('v20.11.0'), false);
  assert.equal(ccrNodeOk('v22.0.0'), true);
  assert.equal(ccrNodeOk('v18.0.0'), false);
});

test('isCcrInstalled returns true when the bin responds (node as probe)', async () => {
  assert.equal(await isCcrInstalled('node'), true);
});

test('startCcr dry-run writes state and reports ports without spawning', async () => {
  const r = await startCcr({ port: 3458, dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
  assert.equal(r.port, 3458);
  assert.equal(r.gatewayPort, 3459);
  const state = JSON.parse(await fs.readFile(routerStateFile(), 'utf8'));
  assert.equal(state.running, true);
});

test('statusCcr reflects the dry-run state (installed probes PATH for real)', async () => {
  const s = await statusCcr();
  assert.equal(s.installed, false, 'no real ccr binary on PATH in tests');
  assert.equal(s.running, true, 'dry-run marked running in state');
  assert.equal(s.port, 3458);
});

test('stopCcr dry-run stops and clears the port', async () => {
  const r = await stopCcr({ dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.running, false);
  const s = await statusCcr();
  assert.equal(s.running, false);
});

test('startCcr without dryRun and no ccr on PATH fails cleanly (no silent npm install in tests)', async () => {
  // Use a bin that does not exist so the install path is hit; guard: this test
  // only asserts the function returns an error object (npm install would be
  // attempted against the real registry — acceptable in this sandbox, but we
  // assert the error shape rather than a successful install).
  const r = await startCcr({ port: 3459, binOverride: 'definitely-not-a-real-bin-xyz' });
  assert.equal(r.ok, false);
  assert.ok(r.error, 'install failure surfaces an error message');
});
