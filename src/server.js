import { createServer as httpCreateServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { loadState, saveState, confirmStep, sanitizeState, SCHEMA_VERSION } from './state.js';
import { loadAgents, planForAgent } from './agents.js';
import { modelsForAgent, loadModels } from './models.js';
import { loadDict } from './i18n.js';
import { tailLog } from './log.js';
import { recipePlatform } from './detect.js';
import { runCommand } from './exec.js';
import { checkPrereqs } from './prereqs.js';
import { writeProviderConfig } from './config-writer.js';
import { verifyKey } from './verify.js';
import { startCcr, stopCcr, statusCcr, gcrStart, gcrStop, gcrStatus, GCR_DEFAULT_PORT } from './router.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.join(here, '..', 'web');
const i18nDir = path.join(here, '..', 'i18n');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Generate the per-session capability token (CSRF defence). */
export function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

/** Every /api/* request must carry the session token (query or header). */
function isAuthorized(req, url, token) {
  if (!token) return true; // token-less mode (tests with dry server) — disabled in production
  if (url.searchParams.get('token') === token) return true;
  return req.headers['x-agent-guide-token'] === token;
}

/**
 * Create the local HTTP server. ctx: { token, env, state, agents, models, log }.
 * The wizard state lives in `ctx.state` and is persisted through saveState().
 */
export function createServer(ctx) {
  const server = httpCreateServer(async (req, res) => {
    const started = Date.now();
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) {
        if (!isAuthorized(req, url, ctx.token)) {
          return send(res, 401, { error: 'unauthorized' });
        }
        await routeApi(req, res, pathname, url, ctx);
        return;
      }

      await serveStatic(req, res, pathname);
    } catch (err) {
      console.error('[agent-guide] request error:', err?.message || err);
      if (!res.headersSent) send(res, 500, { error: 'internal' });
    } finally {
      if (ctx.log && res.statusCode >= 400) {
        ctx.log(`http ${res.statusCode} ${req.method} ${pathnameSafe(req.url)} (${Date.now() - started}ms)`);
      }
    }
  });
  return server;
}

function pathnameSafe(raw) {
  return String(raw || '').slice(0, 200);
}

async function routeApi(req, res, pathname, url, ctx) {
  const method = req.method;
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]

  // --- state -------------------------------------------------------------
  if (pathname === '/api/state' && method === 'GET') {
    return send(res, 200, { state: sanitizeState(ctx.state) });
  }
  if (pathname === '/api/state' && method === 'POST') {
    const body = await readBody(req);
    const merged = { ...ctx.state, ...body };
    ctx.state = await saveState(merged);
    ctx.dict = await loadDict(ctx.state.lang); // language switches apply immediately
    return send(res, 200, { state: sanitizeState(ctx.state) });
  }

  // --- detection ---------------------------------------------------------
  if (pathname === '/api/detect' && method === 'GET') {
    return send(res, 200, { env: ctx.env, recipePlatform: recipePlatform(ctx.env.platform) });
  }

  // --- catalogue ---------------------------------------------------------
  if (pathname === '/api/agents' && method === 'GET') {
    const agents = await loadAgents();
    return send(res, 200, { agents: agents.map(publicAgent) });
  }
  const planMatch = pathname.match(/^\/api\/agents\/([^/]+)\/plan$/);
  if (planMatch && method === 'GET') {
    const agents = await loadAgents();
    const agent = agents.find((a) => a.id === planMatch[1]);
    if (!agent) return send(res, 404, { error: 'unknown agent' });
    const platformKey = url.searchParams.get('platform') || recipePlatform(ctx.env.platform);
    const mode = url.searchParams.get('mode') || null;
    return send(res, 200, { plan: planForAgent(agent, platformKey, mode) });
  }
  if (pathname === '/api/models' && method === 'GET') {
    const agentId = url.searchParams.get('agentId') || ctx.state.agentId;
    const models = await modelsForAgent(agentId);
    return send(res, 200, { models });
  }

  // --- i18n --------------------------------------------------------------
  if (pathname === '/api/i18n' && method === 'GET') {
    const lang = url.searchParams.get('lang') || ctx.state.lang;
    return send(res, 200, { lang, dict: await loadDict(lang) });
  }
  if (pathname === '/api/langs' && method === 'GET') {
    const entries = await fs.readdir(i18nDir);
    return send(res, 200, { langs: entries.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) });
  }

  // --- logs --------------------------------------------------------------
  if (pathname === '/api/logs' && method === 'GET') {
    return send(res, 200, { lines: await tailLog(200) });
  }

  // --- step confirmation (design §7/§8) ---------------------------------
  const confirmMatch = pathname.match(/^\/api\/steps\/([^/]+)\/confirm$/);
  if (confirmMatch && method === 'POST') {
    const body = await readBody(req);
    ctx.state = confirmStep(ctx.state, confirmMatch[1]);
    ctx.state = await saveState(ctx.state);
    return send(res, 200, { ok: true, step: confirmMatch[1], at: ctx.state.confirmed.at(-1)?.at });
  }

  // --- prerequisites (design §6 page 6) ---------------------------------
  if (pathname === '/api/prereqs' && method === 'GET') {
    const agent = (ctx.agents || []).find((a) => a.id === ctx.state.agentId);
    const platformKey = url.searchParams.get('platform') || ctx.state.platform || recipePlatform(ctx.env?.platform);
    const plan = agent ? planForAgent(agent, platformKey, ctx.state.mode) : null;
    const requires = plan?.requires || [];
    const check = await checkPrereqs(requires, ctx.env);
    return send(res, 200, { requires, ...check });
  }
  const prereqInstall = pathname.match(/^\/api\/prereqs\/([^/]+)\/install$/);
  if (prereqInstall && method === 'POST') {
    return installPrereq(req, res, prereqInstall[1], ctx);
  }

  // --- M2: step execution (SSE stream) ----------------------------------
  // Design §8: execution requires the step to be confirmed first
  // (confirmation token / audit trail), and only one step runs at a time.
  const execMatch = pathname.match(/^\/api\/steps\/([^/]+)\/execute$/);
  if (execMatch && method === 'POST') {
    return executeStep(req, res, execMatch[1], ctx);
  }
  if (pathname === '/api/keys/verify' && method === 'POST') {
    const body = await readBody(req);
    if (!body.baseUrl || !body.apiKey) return send(res, 400, { error: 'baseUrl-and-apiKey-required' });
    const mode = body.mode === 'anthropic' ? 'anthropic' : 'openai';
    const result = await verifyKey({ baseUrl: body.baseUrl, apiKey: body.apiKey, mode });
    return send(res, result.ok ? 200 : 400, { ok: result.ok, ...result });
  }

  // --- M3: config writing (design §7 POST /api/config) ------------------
  if (pathname === '/api/config' && method === 'POST') {
    return writeConfig(req, res, ctx);
  }
  const routerMatch = pathname.match(/^\/api\/router\/(start|stop|status)$/);
  if (routerMatch && method === 'POST') {
    const action = routerMatch[1];
    const body = await readBody(req).catch(() => ({}));
    const which = body.router === 'gcr' ? 'gcr' : 'ccr';
    if (action === 'start') {
      if (which === 'gcr') {
        // GCR needs the target provider details from the chosen model.
        const models = await loadModels();
        const model = models.find((m) => m.id === body.modelId);
        if (!model) return send(res, 400, { error: 'unknown-model' });
        if (!body.apiKey) return send(res, 400, { error: 'api-key-required' });
        const result = await gcrStart({
          port: body.port || GCR_DEFAULT_PORT,
          provider: 'deepseek',
          baseUrl: model.api?.openaiCompatible,
          model: (body.modelName || model.models?.[0] || model.id),
          apiKey: body.apiKey,
          dryRun: body.dryRun === true,
          log: (line) => ctx.log?.(line),
        });
        if (result.ok && !result.dryRun) ctx.secrets = [...(ctx.secrets || []), body.apiKey];
        return send(res, result.ok ? 200 : 500, result);
      }
      const result = await startCcr({
        port: body.port || null,
        binOverride: body.binOverride || null,
        dryRun: body.dryRun === true,
        log: (line) => ctx.log?.(line),
      });
      if (result.ok && !result.dryRun && body.modelId && body.apiKey) {
        ctx.secrets = [...(ctx.secrets || []), body.apiKey];
        ctx.routerProvider = { modelId: body.modelId, gatewayPort: result.gatewayPort || result.port };
      }
      return send(res, result.ok ? 200 : 500, result);
    }
    if (action === 'stop') {
      const result = which === 'gcr'
        ? await gcrStop({ port: body.port || GCR_DEFAULT_PORT, dryRun: body.dryRun === true })
        : await stopCcr({ binOverride: body.binOverride || null, dryRun: body.dryRun === true });
      return send(res, result.ok ? 200 : 500, result);
    }
    if (action === 'status') {
      const result = which === 'gcr'
        ? await gcrStatus({ port: body.port || GCR_DEFAULT_PORT })
        : await statusCcr({ binOverride: body.binOverride || null });
      return send(res, 200, result);
    }
  }

  return send(res, 404, { error: 'not found' });
}

/**
 * POST /api/prereqs/:name/install — install a missing prerequisite.
 * Tier 'user' (e.g. uv): the wizard runs the official installer over SSE.
 * Tiers 'admin'/'manual': rejected with the command/guidance for the user
 * to run themselves (design D8: minimal privilege, no silent elevation).
 */
async function installPrereq(req, res, name, ctx) {
  const body = await readBody(req).catch(() => ({}));
  const agents = Array.isArray(ctx.agents) ? ctx.agents : await loadAgents();
  const agent = agents.find((a) => a.id === ctx.state.agentId);
  const platformKey = ctx.state.platform || recipePlatform(ctx.env?.platform);
  const plan = agent ? planForAgent(agent, platformKey, ctx.state.mode) : null;
  const requires = plan?.requires || [];
  if (!requires.includes(name)) return send(res, 404, { error: 'not-required' });

  const check = await checkPrereqs(requires, ctx.env);
  const item = check.items.find((i) => i.name === name);
  if (!item) return send(res, 404, { error: 'not-required' });
  if (item.present && !body.force) return send(res, 200, { ok: true, alreadyPresent: true });

  if (item.installable !== 'user' || !item.installSteps?.length) {
    return send(res, 400, {
      error: 'requires-manual-install',
      installable: item.installable,
      command: item.installCommand,
      hint: item.hint,
    });
  }
  if (ctx.executing) return send(res, 409, { error: 'already-executing' });

  ctx.executing = true;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const sendEvent = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    sendEvent('status', { state: 'running', step: name });
    for (const step of item.installSteps) {
      const result = await runCommand({
        command: step.command,
        shell: step.shell ?? null,
        timeoutMs: step.timeoutMs ?? 600000,
        secrets: ctx.secrets || [],
        dryRun: body.dryRun === true,
        onLog: (line) => sendEvent('log', { line }),
      });
      ctx.log?.(`prereq install ${name} -> exit ${result.code} ${result.durationMs}ms`);
      if (result.code !== 0) {
        sendEvent('done', { step: name, code: result.code, error: 'install-failed' });
        return;
      }
    }
    sendEvent('done', { step: name, code: 0, dryRun: body.dryRun === true });
  } finally {
    ctx.executing = false;
    res.end();
  }
}

/**
 * POST /api/steps/:id/execute — run one confirmed plan step over SSE.
 * Events: status (running), log (masked line), done ({code, durationMs, timedOut, dryRun}).
 * Body: { dryRun?: true } for review/CI/testing; { confirm?: true } to
 * confirm-and-run in one call (UI still uses the separate confirm endpoint).
 */
async function executeStep(req, res, stepId, ctx) {
  const body = await readBody(req).catch(() => ({}));

  const confirmed = Array.isArray(ctx.state.confirmed) && ctx.state.confirmed.some((c) => c.id === stepId);
  if (!confirmed && !body.confirm) {
    return send(res, 409, { error: 'step-not-confirmed' });
  }
  if (ctx.executing) {
    return send(res, 409, { error: 'already-executing' });
  }

  const agents = Array.isArray(ctx.agents) ? ctx.agents : await loadAgents();
  const agent = agents.find((a) => a.id === ctx.state.agentId);
  const platformKey = ctx.state.platform || recipePlatform(ctx.env?.platform);
  const plan = agent ? planForAgent(agent, platformKey, ctx.state.mode) : null;
  const step = plan?.steps?.find((s) => s.id === stepId);
  if (!step) {
    return send(res, 404, { error: 'unknown-step', hint: 'select an agent and platform first' });
  }

  ctx.executing = true;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const sendEvent = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Work dir: create it for native installs; WSL-mode dirs are WSL paths
  // (e.g. ~/agents/...) and must never touch the Windows filesystem.
  let cwd = ctx.state.workDir || undefined;
  if (cwd && step.shell !== 'wsl-bash') {
    try {
      await fs.mkdir(cwd, { recursive: true });
    } catch (err) {
      cwd = undefined;
      sendEvent('log', { line: `[warn] workdir unavailable (${err?.message || err}), running without cwd` });
    }
  }

  try {
    sendEvent('status', { state: 'running', step: stepId });
    const result = await runCommand({
      command: step.command,
      shell: step.shell ?? null,
      cwd,
      env: {},
      timeoutMs: step.timeoutMs ?? 300000,
      secrets: ctx.secrets || [],
      dryRun: body.dryRun === true,
      onLog: (line) => sendEvent('log', { line }),
      onStatus: (s) => sendEvent('status', { state: s, step: stepId }),
    });
    ctx.log?.(`step ${stepId} -> exit ${result.code}${result.timedOut ? ' (timeout)' : ''} ${result.durationMs}ms`);
    sendEvent('done', {
      step: stepId,
      code: result.code,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      dryRun: result.dryRun === true,
    });
  } catch (err) {
    sendEvent('done', { step: stepId, code: -1, error: err?.message || String(err) });
  } finally {
    ctx.executing = false;
    res.end();
  }
}

/**
 * POST /api/config — verify the key, then write the provider config into the
 * chosen agent's own config directory (design §7/§8). The key is kept only in
 * memory (ctx.secrets for log masking) and in the agent config file — never
 * in state.json.
 */
async function writeConfig(req, res, ctx) {
  const body = await readBody(req).catch(() => ({}));
  const agents = Array.isArray(ctx.agents) ? ctx.agents : await loadAgents();
  const agent = agents.find((a) => a.id === (body.agentId || ctx.state.agentId));
  if (!agent) return send(res, 404, { error: 'unknown-agent' });

  const models = await loadModels();
  const model = models.find((m) => m.id === body.modelId || m.name === body.modelName);
  if (!model) return send(res, 404, { error: 'unknown-model' });

  const compat = model.compat?.[agent.id] || 'unsupported';
  if (compat === 'unsupported') {
    return send(res, 400, { error: 'incompatible', reason: `${agent.id} does not support ${model.id}` });
  }
  if (compat === 'router') {
    // M4: gemini × CN providers route through gemini-cli-router (GCR);
    // claude-code × CN providers still need the CCR UI workflow (next).
    if (agent.id === 'gemini') {
      const apiKey = body.apiKey;
      if (!apiKey) return send(res, 400, { error: 'api-key-required' });
      const baseUrl = body.baseUrl || model.api?.openaiCompatible;
      if (!baseUrl) return send(res, 400, { error: 'no-endpoint' });
      ctx.secrets = [...(ctx.secrets || []), apiKey];
      const gcr = await gcrStart({
        provider: 'deepseek',
        baseUrl,
        model: body.modelName || model.models?.[0] || model.id,
        apiKey,
        dryRun: body.dryRun === true,
        log: (line) => ctx.log?.(line),
      });
      ctx.log?.(`gemini × ${model.id} -> GCR ${gcr.ok ? 'started' : 'failed'}`);
      if (!gcr.ok) {
        return send(res, 500, {
          error: gcr.error || 'router-start-failed',
          detail: 'GCR 代理启动失败，请在向导日志或 ~/.agent-guide/logs/guide.log 中查看具体原因',
        });
      }
      return send(res, 200, {
        result: {
          status: 'ok',
          router: 'gcr',
          ...gcr,
          notes: [
            'Gemini CLI 通过 gemini-cli-router 代理转发到国内模型。',
            '启动 Agent 请使用 GCR 改版命令：gemini-local（官方 gemini 命令不会走代理）。',
          ],
        },
      });
    }
    return send(res, 501, { error: 'router-integration-lands-in-M4', hint: 'Claude Code 的 router 配置注入需在 CCR 管理 UI 完成（真机闭环）' });
  }
  if (agent.id === 'claude-code' && compat !== 'anthropic-compatible') {
    return send(res, 501, { error: 'router-integration-lands-in-M4', hint: 'Claude Code 接入 OpenAI 兼容端点需要 router（M4）' });
  }

  const apiKey = body.apiKey;
  if (!apiKey) return send(res, 400, { error: 'api-key-required' });
  const baseUrl = body.baseUrl || model.api?.openaiCompatible;
  const anthropicBase = compat === 'anthropic-compatible'
    ? (body.anthropicBase || model.api?.anthropicCompatible || null)
    : null;
  if (!baseUrl && !anthropicBase) return send(res, 400, { error: 'no-endpoint' });

  if (!body.skipVerify) {
    const mode = anthropicBase ? 'anthropic' : 'openai';
    const v = await verifyKey({ baseUrl: anthropicBase || baseUrl, apiKey, mode });
    if (!v.ok) {
      return send(res, 400, { error: 'key-verification-failed', detail: v });
    }
  }

  ctx.secrets = [...(ctx.secrets || []), apiKey]; // mask in future execution logs
  const result = await writeProviderConfig({
    agent,
    modelId: model.id,
    modelName: body.modelName || null,
    apiKey,
    baseUrl: baseUrl || null,
    anthropicBase,
    wireApi: model.wireApi || 'chat',
  });
  ctx.log?.(`config written: ${agent.id} × ${model.id} -> ${result.status}`);
  return send(res, result.status === 'ok' ? 200 : 400, { result });
}

/** Strip recipes to display-safe fields for the card list. */
function publicAgent(agent) {
  const p = agent.platforms || {};
  const summary = {};
  for (const key of Object.keys(p)) {
    const rec = p[key]?.recommended;
    summary[key] = { recommended: rec, choices: Object.keys(p[key]?.choices || {}) };
  }
  return {
    id: agent.id,
    name: agent.name,
    homepage: agent.homepage,
    license: agent.license,
    launchCommand: agent.launchCommand,
    verified: agent.verified === true,
    platforms: summary,
  };
}

/** Serve the static wizard UI (no build step, per design §4). */
async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'method not allowed' });
  }
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = path.resolve(webDir, rel);
  if (!file.startsWith(webDir + path.sep) && file !== path.join(webDir, 'index.html')) {
    return send(res, 403, { error: 'forbidden' });
  }
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    return send(res, 404, { error: 'not found' });
  }
}
