import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeProviderConfig, persistUserEnvVars } from '../src/config-writer.js';

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

test('hermes: writes official env vars (HERMES_MODEL + <PROVIDER>_BASE_URL/_API_KEY)', async () => {
  const r = await writeProviderConfig({ agent: agent('hermes'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'ok');
  const env = await fs.readFile(path.join(tmpHome, '.hermes', '.env'), 'utf8');
  assert.ok(env.includes('HERMES_MODEL=deepseek-chat'));
  assert.ok(env.includes('DEEPSEEK_BASE_URL=https://api.deepseek.com/v1'), 'per-provider prefix per official docs');
  assert.ok(env.includes('DEEPSEEK_API_KEY=sk-test-1234567890'));
  assert.ok(!env.includes('HERMES_API_KEY='), 'non-official HERMES_API_KEY must not be written');
});

test('goose: registers custom_providers/<id>.json with api_key_env and surfaces envKey', async () => {
  const r = await writeProviderConfig({ agent: agent('goose'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'ok');
  assert.equal(r.envKey, 'DEEPSEEK_API_KEY', 'key env var name surfaced for persistence');
  const provider = JSON.parse(await fs.readFile(path.join(tmpHome, '.config', 'goose', 'custom_providers', 'deepseek-chat.json'), 'utf8'));
  assert.equal(provider.name, 'deepseek-chat');
  assert.equal(provider.engine, 'openai');
  assert.equal(provider.api_key_env, 'DEEPSEEK_API_KEY');
  assert.equal(provider.base_url, 'https://api.deepseek.com/v1');
  assert.equal(provider.models[0].name, 'deepseek-chat');
  assert.equal(provider.base_path, 'v1/chat/completions');
  assert.ok(!JSON.stringify(r).includes('sk-test-1234567890'), 'result must not echo the key');
});

test('missing key is rejected before writing', async () => {
  const r = await writeProviderConfig({ agent: agent('aider'), ...baseArgs, apiKey: '', homeOverride: tmpHome });
  assert.equal(r.status, 'error');
  assert.equal(r.error, 'api-key-required');
});

test('gemini (native): writes settings.json apiKey + model + selectedType=gemini-api-key (skips auth chooser)', async () => {
  const r = await writeProviderConfig({ agent: agent('gemini'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'ok');
  const settings = JSON.parse(await fs.readFile(path.join(tmpHome, '.gemini', 'settings.json'), 'utf8'));
  assert.equal(settings.apiKey, 'sk-test-1234567890');
  assert.deepEqual(settings.model, { default: 'deepseek-chat' }, '0.56.0 requires an object model');
  assert.equal(settings.env.GEMINI_API_KEY, 'sk-test-1234567890', 'env key covers versions that skip settings.apiKey');
  assert.equal(settings.security.auth.selectedType, 'gemini-api-key', 'auth chooser is disabled');
});

test('gemini (GCR router): selectedType=gemini-api-key (gateway is invalid in 0.56.0) + env block pointing at the local proxy', async () => {
  const routerHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-config-gcr-'));
  const r = await writeProviderConfig({
    agent: agent('gemini'), ...baseArgs,
    geminiAuthType: 'gateway',
    geminiEnv: {
      GEMINI_API_KEY: 'agent-guide',
      GEMINI_BASE_URL: 'http://127.0.0.1:3458',
      GOOGLE_GEMINI_BASE_URL: 'http://127.0.0.1:3458',
    },
    homeOverride: routerHome,
  });
  assert.equal(r.status, 'ok');
  const settings = JSON.parse(await fs.readFile(path.join(routerHome, '.gemini', 'settings.json'), 'utf8'));
  assert.equal(settings.env.GEMINI_API_KEY, 'agent-guide');
  assert.equal(settings.env.GEMINI_BASE_URL, 'http://127.0.0.1:3458');
  assert.equal(settings.env.GOOGLE_GEMINI_BASE_URL, 'http://127.0.0.1:3458', 'current gemini-cli reads GOOGLE_GEMINI_BASE_URL');
  assert.equal(settings.apiKey, 'sk-test-1234567890');
  assert.equal(settings.security.auth.selectedType, 'gemini-api-key', "'gateway' is rejected by gemini-cli 0.56.0 -> mapped to api-key + proxy env");
  assert.deepEqual(settings.model, { default: 'deepseek-chat' }, 'model pinned for CLI display (proxy still translates)');
});

test('gemini: existing settings.json is merged, stale oauth selection is overridden', async () => {
  const file = path.join(tmpHome, '.gemini', 'settings.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({
    model: 'gemini-2.5-flash',
    bidi: true,
    security: { auth: { selectedType: 'oauth-personal' } }, // stale failed Google login
  }), 'utf8');
  const r = await writeProviderConfig({ agent: agent('gemini'), ...baseArgs, homeOverride: tmpHome });
  assert.equal(r.status, 'ok');
  const settings = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(settings.apiKey, 'sk-test-1234567890');
  assert.equal(settings.bidi, true, 'unrelated fields survive the merge');
  assert.deepEqual(settings.model, { default: 'deepseek-chat' }, 'model is replaced with the chosen one');
  assert.equal(settings.security.auth.selectedType, 'gemini-api-key', 'stale oauth-personal is replaced');
});

test('persistUserEnvVars: dry-run lists commands without executing (Windows setx)', async () => {
  const r = persistUserEnvVars({ GOOGLE_GEMINI_BASE_URL: 'http://127.0.0.1:3458', GEMINI_API_KEY: 'agent-guide' }, { dryRun: true });
  assert.ok(r.commands.some((c) => c.startsWith('setx GOOGLE_GEMINI_BASE_URL')), 'windows command listed');
  assert.ok(r.notes.some((n) => n.startsWith('[dry-run]')), 'dry-run note');
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
