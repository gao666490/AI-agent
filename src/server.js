import { createServer as httpCreateServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { loadState, saveState, confirmStep, sanitizeState, SCHEMA_VERSION } from './state.js';
import { loadAgents, planForAgent } from './agents.js';
import { modelsForAgent } from './models.js';
import { loadDict } from './i18n.js';
import { tailLog } from './log.js';
import { recipePlatform } from './detect.js';

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

  // --- M2+ placeholders (installed later in the milestone plan) ----------
  if (pathname === '/api/config' && method === 'POST') {
    return send(res, 501, { error: 'config-writer-lands-in-M3' });
  }
  const execMatch = pathname.match(/^\/api\/steps\/([^/]+)\/execute$/);
  if (execMatch && method === 'POST') {
    return send(res, 501, { error: 'execution-engine-lands-in-M2' });
  }
  const routerMatch = pathname.match(/^\/api\/router\/(start|stop|status)$/);
  if (routerMatch && method === 'POST') {
    if (routerMatch[1] === 'status') {
      return send(res, 200, { running: false, reason: 'router-integration-lands-in-M4' });
    }
    return send(res, 501, { error: 'router-integration-lands-in-M4' });
  }

  return send(res, 404, { error: 'not found' });
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
