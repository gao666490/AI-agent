import { spawn } from 'node:child_process';

/**
 * Open the wizard URL in the default browser. Best-effort, never fatal.
 * Uses platform-native launchers: start / open / xdg-open.
 */
export function openBrowser(url) {
  let cmd;
  let args;
  if (process.platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch {
    // Non-fatal: the user can copy the printed URL.
  }
}
