import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { stateDir } from './state.js';

/**
 * M4 router lifecycle manager.
 *
 * Claude Code Router (CCR, @musistudio/claude-code-router 3.x): a local
 * management service + Anthropic-compatible gateway. Claude Code points its
 * ANTHROPIC_BASE_URL at the gateway; the gateway translates to an upstream
 * OpenAI-compatible provider (DeepSeek / Kimi / GLM / …).
 *
 * `binOverride` lets tests inject a fake `ccr` executable; production uses
 * the globally installed `ccr` (or `npx` when absent).
 */

const CCR_PKG = '@musistudio/claude-code-router';
export const CCR_VERSION = '3.0.21';

export function routerDir() {
  return path.join(stateDir(), 'router');
}

export function routerStateFile() {
  return path.join(routerDir(), 'router.json');
}

/** CCR requires Node >= 22 (our wizard baseline is 20). */
export function ccrNodeOk(nodeVersion = process.version) {
  const m = /v?(\d+)\./.exec(nodeVersion || '');
  const major = m ? parseInt(m[1], 10) : 0;
  return major >= 22;
}

function ccrCmd(binOverride) {
  return binOverride || 'ccr';
}

/** Check whether a TCP port is currently listening. */
export function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host, timeout: 1200 });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
  });
}

export async function readRouterState() {
  try {
    return JSON.parse(await fs.readFile(routerStateFile(), 'utf8'));
  } catch {
    return { installed: false, running: false, port: null, gatewayPort: null, provider: null, updatedAt: null };
  }
}

async function writeRouterState(state) {
  await fs.mkdir(routerDir(), { recursive: true });
  await fs.writeFile(routerStateFile(), JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

/** Is the ccr CLI available on PATH? */
export async function isCcrInstalled(binOverride = null) {
  if (binOverride) {
    const r = spawnSync(binOverride, ['--version'], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
    return r.status === 0;
  }
  const r = spawnSync('ccr', ['--version'], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
  return r.status === 0;
}

/** Install CCR globally via npm (pinned version, per design §8 supply chain). */
export async function installCcr(log = () => {}) {
  log(`npm install -g ${CCR_PKG}@${CCR_VERSION}`);
  const r = spawnSync('npm', ['install', '-g', `${CCR_PKG}@${CCR_VERSION}`], {
    windowsHide: true,
    timeout: 300000,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    return { ok: false, error: r.stderr?.slice(0, 500) || `npm exit ${r.status}` };
  }
  await writeRouterState({ installed: true, running: false, port: null, gatewayPort: null, provider: null });
  return { ok: true };
}

/**
 * Start the CCR management service + gateway on a preferred port.
 * `ccr start --host 127.0.0.1 --port <port> --no-open` runs detached; we then
 * poll the port (management UI) and read gateway.config.json for the gateway
 * port when available. `dryRun` skips the actual spawn (tests/CI).
 */
export async function startCcr({ port, binOverride = null, dryRun = false, log = () => {} } = {}) {
  const state = await readRouterState();
  const chosen = port || 3458;
  if (dryRun) {
    await writeRouterState({ ...state, installed: true, running: true, port: chosen, gatewayPort: chosen + 1 });
    return { ok: true, dryRun: true, port: chosen, gatewayPort: chosen + 1, managementUrl: `http://127.0.0.1:${chosen}` };
  }
  if (!(await isCcrInstalled(binOverride))) {
    const installed = await installCcr(log);
    if (!installed.ok) return { ok: false, error: `ccr install failed: ${installed.error}` };
  }
  if (state.running) return { ok: true, ...state, alreadyRunning: true };

  const cmd = ccrCmd(binOverride);
  log(`ccr start --host 127.0.0.1 --port ${chosen} --no-open`);
  const child = spawn(cmd, ['start', '--host', '127.0.0.1', '--port', String(chosen), '--no-open'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  // Poll the management port until it answers (or timeout).
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isPortOpen(chosen)) { ready = true; break; }
  }
  const gatewayPort = await discoverGatewayPort();
  await writeRouterState({ ...state, installed: true, running: ready, port: chosen, gatewayPort });
  return { ok: ready, running: ready, port: chosen, gatewayPort, managementUrl: `http://127.0.0.1:${chosen}` };
}

/** Read the gateway port from CCR's generated runtime config, if present. */
async function discoverGatewayPort() {
  for (const dir of [
    path.join(os.homedir(), '.claude-code-router'),
    path.join(os.homedir(), '.config', 'claude-code-router'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'claude-code-router'),
  ]) {
    try {
      const raw = await fs.readFile(path.join(dir, 'gateway.config.json'), 'utf8');
      const cfg = JSON.parse(raw);
      const p = cfg?.port ?? cfg?.gateway?.port ?? cfg?.server?.port;
      if (typeof p === 'number') return p;
    } catch { /* try next */ }
  }
  return null;
}

/** Stop the CCR detached service. */
export async function stopCcr({ binOverride = null, dryRun = false } = {}) {
  const state = await readRouterState();
  if (!state.running && !dryRun) return { ok: true, running: false, alreadyStopped: true };
  if (dryRun) {
    await writeRouterState({ ...state, running: false, port: null });
    return { ok: true, dryRun: true, running: false };
  }
  const r = spawnSync(ccrCmd(binOverride), ['stop'], { windowsHide: true, timeout: 30000, encoding: 'utf8' });
  await writeRouterState({ ...state, running: r.status === 0, port: r.status === 0 ? null : state.port });
  return { ok: r.status === 0, running: false, output: r.stdout?.slice(0, 200) };
}

/** Combined status: installed? running? ports? */
export async function statusCcr({ binOverride = null } = {}) {
  const state = await readRouterState();
  const installed = await isCcrInstalled(binOverride);
  const portOpen = state.port ? await isPortOpen(state.port) : false;
  return {
    installed,
    running: portOpen || state.running === true,
    port: state.port,
    gatewayPort: state.gatewayPort,
    managementUrl: state.port ? `http://127.0.0.1:${state.port}` : null,
    nodeOk: ccrNodeOk(),
    note: ccrNodeOk() ? null : 'CCR 需要 Node.js ≥ 22（当前 Node 较低，请升级后重试）',
  };
}
