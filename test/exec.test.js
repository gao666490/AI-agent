import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskSecrets, runCommand, shellTarget } from '../src/exec.js';

test('maskSecrets replaces long secrets but skips short values', () => {
  assert.equal(maskSecrets('key=sk-abc123456', ['sk-abc123456']), 'key=***');
  assert.equal(maskSecrets('abc', ['abc']), 'abc', 'short values are skipped');
  assert.equal(maskSecrets('hello', []), 'hello');
  assert.equal(maskSecrets('a=1 b=2', ['b=2']), 'a=1 b=2', '3-char values are skipped');
  assert.equal(maskSecrets('a=1 secretval', ['secretval']), 'a=1 ***');
});

test('shellTarget maps tags to spawn targets', () => {
  assert.equal(shellTarget('powershell').cmd, 'powershell');
  assert.equal(shellTarget('wsl-bash').cmd, 'wsl.exe');
  assert.deepEqual(shellTarget('wsl-bash').args, ['-e', 'bash', '-lc']);
  assert.equal(shellTarget('bash').cmd, 'bash');
  assert.equal(shellTarget('cmd').cmd, 'cmd.exe');
});

test('runCommand dry-run logs and never executes', async () => {
  const logs = [];
  const r = await runCommand({ command: 'echo SHOULD_NOT_RUN', dryRun: true, onLog: (l) => logs.push(l) });
  assert.equal(r.code, 0);
  assert.equal(r.dryRun, true);
  assert.ok(logs[0].includes('[dry-run]'));
  assert.ok(logs[0].includes('SHOULD_NOT_RUN'));
});

test('runCommand succeeds, streams output and statuses', async () => {
  const logs = [];
  const statuses = [];
  const r = await runCommand({ command: 'echo hello-exec', onLog: (l) => logs.push(l), onStatus: (s) => statuses.push(s) });
  assert.equal(r.code, 0);
  assert.ok(logs.some((l) => l.includes('hello-exec')));
  assert.ok(statuses.includes('running'));
  assert.ok(statuses.includes('done'));
});

test('runCommand masks secrets in streamed output', async () => {
  const logs = [];
  const r = await runCommand({
    command: 'echo super-secret-token-123',
    secrets: ['super-secret-token-123'],
    onLog: (l) => logs.push(l),
  });
  assert.equal(r.code, 0);
  assert.ok(!logs.join('\n').includes('super-secret-token-123'));
  assert.ok(logs.some((l) => l.includes('***')));
});

test('runCommand propagates non-zero exit codes', async () => {
  const r = await runCommand({ command: 'exit 3' });
  assert.equal(r.code, 3);
  assert.equal(r.timedOut, false);
});

test('runCommand kills on timeout and reports it', async () => {
  const started = Date.now();
  const r = await runCommand({ command: 'Start-Sleep -Seconds 30', timeoutMs: 400 });
  assert.equal(r.timedOut, true, 'should be flagged as timed out');
  assert.ok(Date.now() - started < 10000, 'must not wait for the full sleep');
  assert.equal(typeof r.code, 'number');
});
