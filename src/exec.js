import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Replace secrets in a text stream (keys, tokens) before they reach
 * logs/UI (design §8: 全程脱敏). Short values are skipped to avoid
 * mangling innocent text.
 */
export function maskSecrets(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (typeof s === 'string' && s.length >= 4) {
      out = out.split(s).join('***');
    }
  }
  return out;
}

/**
 * Map a recipe's `shell` tag to a real spawn target.
 * Recipe commands are shell strings by design (official installers rely on
 * pipes/redirects: `irm ... | iex`, `curl ... | bash`), so we always run
 * them inside the matching shell — never string-interpolated into argv.
 */
export function shellTarget(shell) {
  switch (shell) {
    case 'powershell':
      return { cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command'] };
    case 'wsl-bash':
      return { cmd: 'wsl.exe', args: ['-e', 'bash', '-lc'] };
    case 'bash':
      return { cmd: 'bash', args: ['-lc'] };
    case 'cmd':
      return { cmd: 'cmd.exe', args: ['/d', '/s', '/c'] };
    default:
      return process.platform === 'win32'
        ? { cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command'] }
        : { cmd: 'bash', args: ['-lc'] };
  }
}

/**
 * Run one step command. Events:
 *   onLog(line)     — one masked output line
 *   onStatus(state) — 'running' | 'done'
 * Resolves { code, durationMs, timedOut, dryRun, error? }.
 */
export function runCommand({
  command,
  shell = null,
  cwd = null,
  env = {},
  timeoutMs = 300000,
  secrets = [],
  dryRun = false,
  onLog = () => {},
  onStatus = () => {},
}) {
  return new Promise((resolve) => {
    if (dryRun) {
      onLog(`[dry-run] ${command}`);
      onStatus('dry-run');
      return resolve({ code: 0, durationMs: 0, dryRun: true });
    }

    const started = Date.now();
    const { cmd, args } = shellTarget(shell);
    let child;
    try {
      child = spawn(cmd, [...args, command], {
        cwd: cwd || undefined,
        env: { ...process.env, ...env },
        windowsHide: true,
      });
    } catch (err) {
      onLog(`[error] cannot start ${cmd}: ${err.message}`);
      return resolve({ code: -1, durationMs: Date.now() - started, error: err.message });
    }

    onStatus('running');

    let didTimeout = false;
    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        didTimeout = true;
        onLog('[warn] command timed out, killing…');
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      }, timeoutMs);
    }

    const emitLine = (line) => onLog(maskSecrets(line, secrets));
    const rlOut = createInterface({ input: child.stdout });
    const rlErr = createInterface({ input: child.stderr });
    rlOut.on('line', emitLine);
    rlErr.on('line', emitLine);

    child.on('error', (err) => {
      onLog(`[error] ${err.message}`);
      if (timer) clearTimeout(timer);
      resolve({ code: -1, durationMs: Date.now() - started, error: err.message });
    });

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      onStatus('done');
      resolve({
        code: code ?? (signal ? -2 : -1),
        durationMs: Date.now() - started,
        timedOut: didTimeout,
        signal: signal || null,
      });
    });
  });
}
