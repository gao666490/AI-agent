import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** Run a command quietly; return trimmed stdout or null on any failure. */
async function run(cmd, args = [], timeout = 8000) {
  const r = await runResult(cmd, args, timeout);
  return r.code === 0 ? r.out : null;
}

/** Run a command; return { code, out } so callers can judge by exit code. */
async function runResult(cmd, args = [], timeout = 8000) {
  try {
    const { stdout } = await execFileP(cmd, args, { timeout, windowsHide: true });
    return { code: 0, out: stdout.trim() };
  } catch (err) {
    return { code: err?.code === 'ENOENT' ? 127 : (err.status ?? 1), out: (err?.stdout || '').toString().trim() };
  }
}

/**
 * On Windows, npm/python are often .cmd shims that execFile cannot spawn
 * directly; route them through npm.cmd / python.cmd.
 */
function platformCmd(platform, cmd) {
  if (platform === 'win32' && (cmd === 'npm' || cmd === 'python')) return `${cmd}.cmd`;
  return cmd;
}

/**
 * Detect WSL availability on Windows. Judged by EXIT CODE, not output text:
 * `wsl --status` on a broken/disabled setup still prints (localized, UTF-16)
 * error text while exiting non-zero (e.g. E_ACCESSDENIED). Output encoding is
 * unreliable, so we only use ASCII fragments for the WSL2 heuristic.
 */
async function detectWsl(platform) {
  if (platform !== 'win32') {
    return { available: false, reason: 'not-windows', wsl2: false };
  }
  const status = await runResult('wsl.exe', ['--status'], 15000);
  const distros = await runResult('wsl.exe', ['-l', '-v'], 15000);
  const available = status.code === 0 || distros.code === 0;
  const blob = `${status.out} ${distros.out}`;
  const wsl2 = /WSL 2|wsl2|\b2\.\d+\.\d+/i.test(blob);
  return { available, wsl2: available && wsl2, statusCode: status.code, distrosCode: distros.code };
}

/** Full environment snapshot shown on the wizard's first page. */
export async function detect() {
  const platform = process.platform; // win32 | darwin | linux
  const arch = process.arch; // x64 | arm64 | ...
  const started = Date.now();

  const [nodeVersion, npmVersion, gitVersion, pythonVersion, wsl] = await Promise.all([
    run('node', ['--version']),
    run(platformCmd(platform, 'npm'), ['--version']),
    run('git', ['--version']),
    run(platformCmd(platform, 'python3'), ['--version']).then((v) => v ?? run(platformCmd(platform, 'python'), ['--version'])),
    detectWsl(platform),
  ]);

  return {
    platform,
    arch,
    osVersion: os.release(),
    node: nodeVersion,
    npm: npmVersion,
    git: gitVersion,
    python: pythonVersion,
    wsl,
    elapsedMs: Date.now() - started,
  };
}

/** Map Node's process.platform to recipe platform keys used in agents.json. */
export function recipePlatform(platform = process.platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}
