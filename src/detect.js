import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * Run a command; return { code, out }. Judged by EXIT CODE, not output text.
 * `opts.shell` routes through cmd.exe/sh (needed for .cmd shims like npm on
 * Windows — execFile cannot spawn those directly, it throws EINVAL).
 * `opts.encoding` handles UTF-16LE output from wsl.exe.
 */
async function runResult(cmd, args = [], timeout = 8000, opts = {}) {
  try {
    const { stdout } = await execFileP(cmd, args, {
      timeout,
      windowsHide: true,
      shell: !!opts.shell,
      encoding: opts.encoding || 'utf8',
    });
    return { code: 0, out: String(stdout).trim() };
  } catch (err) {
    const raw = err?.stdout ?? Buffer.from('');
    let out = '';
    try {
      out = String(Buffer.isBuffer(raw) ? raw : Buffer.from(raw)).trim();
      if (opts.encoding === 'utf16le') out = Buffer.from(out, 'utf16le').toString('utf16le').trim();
    } catch {
      out = '';
    }
    return { code: err?.code === 'ENOENT' ? 127 : (err.status ?? 1), out };
  }
}

/** Quiet probe: trimmed stdout or null on any failure. */
async function run(cmd, args = [], timeout = 8000, opts = {}) {
  const r = await runResult(cmd, args, timeout, opts);
  return r.code === 0 ? r.out : null;
}

/**
 * Detect WSL availability on Windows.
 * - Exit code decides availability (a broken setup still prints error text
 *   but exits non-zero — e.g. Wsl/EnumerateDistros/E_ACCESSDENIED).
 * - wsl.exe emits UTF-16LE, so decode with utf16le for the WSL2 heuristic
 *   (e.g. "默认版本: 2" or the VERSION column in `wsl -l -v`).
 */
async function detectWsl(platform) {
  if (platform !== 'win32') {
    return { available: false, reason: 'not-windows', wsl2: false };
  }
  const status = await runResult('wsl.exe', ['--status'], 15000, { encoding: 'utf16le' });
  const distros = await runResult('wsl.exe', ['-l', '-v'], 15000, { encoding: 'utf16le' });
  const ok = status.code === 0 || distros.code === 0;
  const blob = `${status.out} ${distros.out}`;
  const errorish = /error|E_ACCESSDENIED|access denied|错误代码|无法访问/i.test(blob);
  const wsl2 = ok && !errorish && (/WSL 2|wsl2|默认版本:\s*2|VERSION[\s\S]*\n[^\n]*\s2\s*$/i.test(blob));
  return { available: ok && !errorish, wsl2, statusCode: status.code, distrosCode: distros.code, hasDistros: /\bUbuntu|Debian|kali|openSUSE|Alpine|docker-desktop/i.test(blob) };
}

/**
 * Probe npm/python on Windows: they are .cmd shims that execFile cannot
 * spawn directly (EINVAL), and Node >=24 deprecates shell:true + args.
 * Routing through cmd.exe /c with a static command string avoids both.
 */
function winShimProbe(cmd) {
  return run('cmd.exe', ['/d', '/s', '/c', `${cmd} --version`], 8000);
}

/** Full environment snapshot shown on the wizard's first page. */
export async function detect() {
  const platform = process.platform; // win32 | darwin | linux
  const arch = process.arch; // x64 | arm64 | ...
  const started = Date.now();

  const npmProbe = platform === 'win32' ? () => winShimProbe('npm') : () => run('npm', ['--version']);
  const pythonProbe = platform === 'win32'
    ? () => winShimProbe('python3').then((v) => v ?? winShimProbe('python'))
    : () => run('python3', ['--version']).then((v) => v ?? run('python', ['--version']));

  const [nodeVersion, npmVersion, gitVersion, pythonVersion, wsl] = await Promise.all([
    run('node', ['--version']),
    npmProbe(),
    run('git', ['--version']),
    pythonProbe(),
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
