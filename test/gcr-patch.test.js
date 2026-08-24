import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureGcrPatched, GCR_PATCH_MARKER } from '../src/gcr-patch.js';

/**
 * Fixture mirroring the relevant GCR 1.0.3 server.js lines (exact indentation),
 * i.e. the UNPATCHED shape the patcher must recognize.
 */
const FIXTURE = [
  "app.all('/v1beta/*', async (req, res) => {",
  '  try {',
  "    if (req.path.includes('/generateContent')) {",
  '      let targetModel = null;',
  '      // Set model priority: custom model > configured model > default',
  '      if (!translatedRequest.model) {',
  '        translatedRequest.model = targetModel || config.provider.model || providerConfig.model;',
  '      }',
  '      const geminiResponse = GeminiTranslator.translateResponse(providerResponse);',
  '      res.json(geminiResponse);',
  '    } else {',
  '      res.json({ models: [] });',
  '    }',
  '  } catch (err) {',
  '    res.status(500).json({ error: { message: err.message } });',
  '  }',
  '});',
  '',
].join('\n');

const makeServiceDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-gcrpatch-'));
  const src = path.join(dir, 'src');
  await fs.mkdir(src, { recursive: true });
  await fs.writeFile(path.join(src, 'server.js'), FIXTURE, 'utf8');
  return dir;
};

test('ensureGcrPatched applies the 3 edits and marks the file', async () => {
  const dir = await makeServiceDir();
  const r = await ensureGcrPatched(dir);
  assert.equal(r.patched, true, 'first run patches');
  const patched = await fs.readFile(path.join(dir, 'src', 'server.js'), 'utf8');
  assert.ok(patched.includes(GCR_PATCH_MARKER), 'marker present');
  assert.ok(patched.includes("req.path.toLowerCase().includes('generatecontent')"), 'colon + stream forms matched (case-insensitive)');
  assert.ok(patched.includes('config.provider.model || providerConfig.model || targetModel'), 'configured model wins over URL alias');
  assert.ok(patched.includes("res.setHeader('Content-Type', 'text/event-stream')"), 'SSE branch present');
  assert.ok(patched.includes('data: ${JSON.stringify(geminiResponse)}\\n\\n'), 'SSE data line present');
});

test('ensureGcrPatched is idempotent and leaves the file untouched on re-run', async () => {
  const dir = await makeServiceDir();
  await ensureGcrPatched(dir);
  const after = await fs.readFile(path.join(dir, 'src', 'server.js'), 'utf8');
  const r2 = await ensureGcrPatched(dir);
  assert.equal(r2.patched, false);
  assert.equal(r2.alreadyPatched, true, 'marker detected -> no rewrite');
  const after2 = await fs.readFile(path.join(dir, 'src', 'server.js'), 'utf8');
  assert.equal(after2, after, 'file content unchanged on second run');
});

test('ensureGcrPatched fails cleanly on an unrecognized file (no corruption)', async () => {
  const dir = await makeServiceDir();
  const file = path.join(dir, 'src', 'server.js');
  await fs.writeFile(file, "app.get('/health', (req, res) => res.json({ status: 'ok' }));\n", 'utf8');
  const r = await ensureGcrPatched(dir);
  assert.equal(r.patched, false);
  assert.ok(r.error, 'error explains the mismatch');
  assert.equal(await fs.readFile(file, 'utf8'), "app.get('/health', (req, res) => res.json({ status: 'ok' }));\n", 'file untouched');
});

test('ensureGcrPatched reports a missing server.js', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-gcrpatch-missing-'));
  const r = await ensureGcrPatched(dir);
  assert.equal(r.patched, false);
  assert.ok(r.error.includes('server.js not found'));
});
