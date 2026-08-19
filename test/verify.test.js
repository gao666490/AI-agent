import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { verifyKey } from '../src/verify.js';

/** Local stub "model provider" so verification tests never touch the network. */
function stubProvider({ modelsStatus = 200, completionStatus = 200 } = {}) {
  const server = createServer((req, res) => {
    if (req.url === '/models') {
      res.writeHead(modelsStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'x' }] }));
      return;
    }
    if (req.url === '/chat/completions') {
      res.writeHead(completionStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  })));
}

test('valid key passes via /models', async () => {
  const stub = await stubProvider();
  try {
    const r = await verifyKey({ baseUrl: stub.base, apiKey: 'sk-valid-1234' });
    assert.equal(r.ok, true);
    assert.equal(r.method, 'models');
  } finally { await stub.close(); }
});

test('401 from /models -> invalid-key', async () => {
  const stub = await stubProvider({ modelsStatus: 401 });
  try {
    const r = await verifyKey({ baseUrl: stub.base, apiKey: 'sk-bad' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid-key');
  } finally { await stub.close(); }
});

test('vendor without /models falls back to a completion', async () => {
  const stub = await stubProvider({ modelsStatus: 404 });
  try {
    const r = await verifyKey({ baseUrl: stub.base, apiKey: 'sk-valid-1234' });
    assert.equal(r.ok, true);
    assert.equal(r.method, 'completion');
  } finally { await stub.close(); }
});

test('anthropic mode uses x-api-key against /v1/models', async () => {
  const stub = await stubProvider();
  try {
    const r = await verifyKey({ baseUrl: stub.base, apiKey: 'sk-ant-1234', mode: 'anthropic' });
    // stub does not serve /v1/models -> 404 -> falls back to /v1/messages (404 too)
    assert.equal(r.ok, false);
    assert.equal(r.error, 'endpoint-error');
  } finally { await stub.close(); }
});

test('unreachable endpoint -> network error, never hangs forever', async () => {
  const r = await verifyKey({ baseUrl: 'http://127.0.0.1:1', apiKey: 'sk-x' }); // closed port
  assert.equal(r.ok, false);
  assert.ok(['network', 'timeout'].includes(r.error));
});
