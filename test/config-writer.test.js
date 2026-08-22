import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeProviderConfig } from '../src/config-writer.js';

const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-config-'));
const agent = (kind) => ({ id: 'test-agent', config: { kind } });

const baseArgs = { modelId: 'deepseek-chat', apiKey: 'sk-test-1234567890', baseUrl: 'https://api.deepseek.com/v1' };

test('aider: writes ~/.aider.conf.yml with key and endpoint', async () => {
  const r = await writeProviderConfig({ agent: agent('aider'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'ok');
  const content = await fs.readFile(path.join(tmpHome, '.aider.conf.yml'), 'utf8');
  assert.ok(content.includes('openai-api-base: https://api.deepseek.com/v1'));
  assert.ok(content.includes('openai-api-key: sk-test-1234567890'));
  assert.ok(content.includes('openai-model: deepseek-chat'));
});

test('codex: writes config.toml provider block (real-machine format) + auth.json', async () => {
  const r = await writeProviderConfig({
    agent: agent('codex'), ...baseArgs,
    wireApi: 'responses', homeOverride: tmpHome,
  });
  assert.equal(r.status, 'ok');
  const toml = await fs.readFile(path.join(tmpHome, '.codex', 'config.toml'), 'utf8');
  assert.ok(toml.includes('model = "deepseek-chat"'));
  assert.ok(toml.includes('model_provider = "deepseek-chat"'));
  assert.ok(toml.includes('preferred_auth_method = "apikey"'), 'apikey auth mode');
  assert.ok(toml.includes('forced_login_method = "api"'), 'desktop app skips ChatGPT login');
  assert.ok(toml.includes('base_url = "https://api.deepseek.com/v1/"'), 'trailing slash for codex');
  assert.ok(toml.includes('wire_api = "responses"'), 'wire_api per provider');
  assert.ok(toml.includes('experimental_bearer_token = "sk-test-1234567890"'), 'inline key (no .env indirection)');
  // auth.json for the desktop app
  const auth = JSON.parse(await fs.readFile(path.join(tmpHome, '.codex', 'auth.json'), 'utf8'));
  assert.equal(auth.auth_mode, 'apikey');
  assert.equal(auth.OPENAI_API_KEY, 'sk-test-1234567890');
  // legacy .env approach is gone
  await assert.rejects(fs.readFile(path.join(tmpHome, '.codex', '.env')), 'no .env file anymore');
});

test('codex: defaults to wire_api chat unless the model says responses', async () => {
  const r = await writeProviderConfig({ agent: agent('codex'), ...baseArgs, homeOverride: tmpHome });
  const toml = await fs.readFile(path.join(tmpHome, '.codex', 'config.toml'), 'utf8');
  assert.ok(toml.includes('wire_api = "chat"'));
});

test('claude: writes settings.json env block', async () => {
  const r = await writeProviderConfig({
    agent: agent('claude'), ...baseArgs, anthropicBase: 'https://api.deepseek.com/anthropic', homeOverride: tmpHome,
  });
  assert.equal(r.status, 'ok');
  const settings = JSON.parse(await fs.readFile(path.join(tmpHome, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.env.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic');
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, 'sk-test-1234567890');
});

test('hermes: writes .env', async () => {
  const r = await writeProviderConfig({ agent: agent('hermes'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'ok');
  const env = await fs.readFile(path.join(tmpHome, '.hermes', '.env'), 'utf8');
  assert.ok(env.includes('HERMES_API_KEY=sk-test-1234567890'));
});

test('missing key is rejected before writing', async () => {
  const r = await writeProviderConfig({ agent: agent('aider'), ...baseArgs, apiKey: '', homeOverride: tmpHome });
  assert.equal(r.status, 'error');
  assert.equal(r.error, 'api-key-required');
});

test('gemini has no writer (google auth) — unsupported', async () => {
  const r = await writeProviderConfig({ agent: agent('gemini'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'unsupported');
});

test('unknown kind is unsupported', async () => {
  const r = await writeProviderConfig({ agent: agent('mystery'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'unsupported');
});

test('never leaks the key into state or logs (writer returns paths only)', async () => {
  const r = await writeProviderConfig({ agent: agent('aider'), ...baseArgs, homeOverride: tmpHome });
  const serialized = JSON.stringify(r);
  assert.ok(!serialized.includes('sk-test-1234567890'), 'result must not echo the key');
});
