import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detect, run } from './detect.js';
import { loadAgents } from './agents.js';
import { loadDict, t } from './i18n.js';
import { statusCcr, ccrNodeOk, gcrStatus } from './router.js';

/** Config files written by the M3 config writer (per agent kind). */
const CONFIG_PATHS = {
  aider: (home) => path.join(home, '.aider.conf.yml'),
  codex: (home) => path.join(home, '.codex', 'config.toml'),
  claude: (home) => path.join(home, '.claude', 'settings.json'),
  opencode: (home) => path.join(home, '.config', 'opencode', 'config.json'),
  hermes: (home) => path.join(home, '.hermes', '.env'),
  gemini: (home) => path.join(home, '.gemini', 'settings.json'),
};

/**
 * `agent-guide doctor` — self-check: environment, installed agents,
 * and written config files. Pure read-only inspection (design §5.5/§11).
 */
export async function printDoctor() {
  const dict = await loadDict(process.env.AGENT_GUIDE_LANG || 'zh-CN');
  const env = await detect();

  console.log('=== agent-guide doctor ===');
  console.log(t(dict, 'dryrun.env'));
  console.log(`  OS:       ${env.platform} (${env.arch}) ${env.osVersion}`);
  console.log(`  Node:     ${env.node ?? 'missing (need >=20)'} ${!env.node ? '⚠' : okBadge(parseNode(env.node) >= 20)}`);
  console.log(`  npm:      ${env.npm ?? 'missing'}`);
  console.log(`  git:      ${env.git ?? 'missing'}`);
  if (env.wsl) console.log(`  WSL:      ${env.wsl.available ? (env.wsl.wsl2 ? 'available (WSL 2)' : 'available (WSL 1)') : 'not available'}`);

  console.log('');
  console.log('Agents installed (launch command found in PATH):');
  const agents = await loadAgents();
  const results = await Promise.all(agents.map(async (a) => {
    const v = await run(a.launchCommand, ['--version'], 5000);
    return { name: a.name, cmd: a.launchCommand, installed: !!v, version: v };
  }));
  for (const r of results) {
    console.log(`  - ${r.name.padEnd(14)} ${r.installed ? `✓ ${r.version || ''}`.trimEnd() : '— not found'}`);
  }

  console.log('');
  console.log('Config files (written by the wizard):');
  const home = os.homedir();
  let anyConfig = false;
  for (const [kind, fn] of Object.entries(CONFIG_PATHS)) {
    const file = fn(home);
    try {
      await fs.access(file);
      const size = (await fs.stat(file)).size;
      console.log(`  - ${kind.padEnd(10)} ✓ ${file} (${size} B)`);
      anyConfig = true;
    } catch { /* not written */ }
  }
  if (!anyConfig) console.log('  (none yet — run the wizard to install and configure an agent)');

  console.log('');
  console.log('Claude Code Router (CCR):');
  const router = await statusCcr();
  console.log(`  Node >=22: ${ccrNodeOk() ? '✓' : '⚠ need Node 22+ for CCR'}`);
  console.log(`  installed: ${router.installed ? '✓' : '— not installed'}`);
  console.log(`  running:   ${router.running ? '✓' : '— stopped'}`);
  if (router.running) {
    console.log(`  management: ${router.managementUrl || '(unknown port)'}`);
    console.log(`  gateway:    ${router.gatewayPort ? `127.0.0.1:${router.gatewayPort}` : '(check CCR UI / gateway.config.json)'}`);
  }

  console.log('');
  console.log('Gemini CLI Router (GCR):');
  const gcr = await gcrStatus();
  console.log(`  installed: ${gcr.installed ? '✓' : '— not installed'}`);
  console.log(`  running:   ${gcr.running ? '✓' : '— stopped'}`);
  console.log(`  health:    ${gcr.healthUrl}`);
  console.log(`  launch:    ${gcr.running ? 'gemini-local' : '(start via the wizard, or run the .cjs launcher directly)'}`);
}

function parseNode(v) {
  const m = /v?(\d+)/.exec(v || '');
  return m ? parseInt(m[1], 10) : 0;
}
function okBadge(ok) {
  return ok ? '✓' : '⚠ need Node 20+';
}
