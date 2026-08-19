import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, generateToken } from '../src/server.js';
import { detect } from '../src/detect.js';
import { defaultState } from '../src/state.js';

const token = generateToken();
const env = await detect();
const ctx = {
  token,
  env,
  state: defaultState(),
  dict: {},
  log: async () => {},
};
const server = createServer(ctx);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

test.after(() => server.close());

async function get(path, headers = {}) {
  return fetch(`${base}${path}`, { headers });
}

test('API requires the session token (CSRF defence)', async () => {
  const res = await get('/api/state');
  assert.equal(res.status, 401);
});

test('token in header authorizes /api/state', async () => {
  const res = await get('/api/state', { 'X-Agent-Guide-Token': token });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state.step, 'welcome');
});

test('POST /api/state persists and returns sanitized state', async () => {
  const res = await fetch(`${base}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Guide-Token': token },
    body: JSON.stringify({ step: 'platform', lang: 'en', apiKey: 'should-not-persist' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state.step, 'platform');
  assert.equal(body.state.apiKey, undefined);
});

test('/api/detect returns environment with recipe platform', async () => {
  const res = await get('/api/detect', { 'X-Agent-Guide-Token': token });
  const body = await res.json();
  assert.ok(body.env.platform);
  assert.ok(['windows', 'macos', 'linux'].includes(body.recipePlatform));
});

test('/api/agents lists all 7 agents', async () => {
  const res = await get('/api/agents', { 'X-Agent-Guide-Token': token });
  const body = await res.json();
  assert.equal(body.agents.length, 7);
});

test('/api/agents/:id/plan returns hermes windows plan', async () => {
  const res = await get('/api/agents/hermes/plan?platform=windows', { 'X-Agent-Guide-Token': token });
  const body = await res.json();
  assert.equal(body.plan.mode, 'native');
  assert.equal(body.plan.commands.length, 1);
});

test('/api/agents/:id/plan 404s for unknown agent', async () => {
  const res = await get('/api/agents/nope/plan', { 'X-Agent-Guide-Token': token });
  assert.equal(res.status, 404);
});

test('/api/i18n returns the requested dictionary', async () => {
  const res = await get('/api/i18n?lang=zh-CN', { 'X-Agent-Guide-Token': token });
  const body = await res.json();
  assert.equal(body.lang, 'zh-CN');
  assert.ok(body.dict['welcome.title']);
});

test('M2/M3 endpoints are explicit placeholders (501)', async () => {
  const post = (path, body = '{}') => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Guide-Token': token },
    body,
  });
  assert.equal((await post('/api/steps/install/execute')).status, 501);
  assert.equal((await post('/api/config')).status, 501);
  assert.equal((await post('/api/router/start')).status, 501);
  const status = await post('/api/router/status');
  assert.equal(status.status, 200);
  assert.equal((await status.json()).running, false);
});

test('step confirmation records audit trail', async () => {
  const res = await fetch(`${base}/api/steps/permission/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Guide-Token': token },
    body: '{}',
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.step, 'permission');
  assert.ok(body.at);
});

test('static index.html is served at /', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('Agent Guide'));
});

test('path traversal is blocked', async () => {
  const res = await get('/../src/state.js');
  assert.ok([403, 404].includes(res.status));
});
