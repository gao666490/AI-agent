import { createServer, generateToken } from './server.js';
import { detect } from './detect.js';
import { loadState, SCHEMA_VERSION } from './state.js';
import { loadAgents } from './agents.js';
import { loadModels } from './models.js';
import { loadDict } from './i18n.js';
import { openBrowser } from './browser.js';
import { printDryRun } from './dryrun.js';
import { log } from './log.js';

const HELP = `agent-guide — 目录驱动的跨平台 Agent 安装向导 / directory-driven agent installer wizard

Usage:
  agent-guide                启动向导并打开浏览器 (start wizard & open browser)
  agent-guide --dry-run      打印完整计划，不执行任何命令 (print plan only)
  agent-guide --port 8123    固定端口 (default: random free port)
  agent-guide --no-open      不自动打开浏览器 (do not auto-open browser)
  agent-guide --lang zh-CN   初始语言 (default: zh-CN)
  agent-guide --help         显示帮助 (show help)

State & logs: ~/.agent-guide/   (override with AGENT_GUIDE_HOME)
Requirements: Node.js >= 20
`;

export function parseArgs(argv) {
  const opts = { port: null, noOpen: false, dryRun: false, help: false, lang: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--no-open') opts.noOpen = true;
    else if (a === '--port') opts.port = parseInt(argv[++i], 10);
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a.startsWith('--port=')) opts.port = parseInt(a.slice(7), 10);
    else if (a.startsWith('--lang=')) opts.lang = a.slice(7);
    else {
      console.error(`[agent-guide] unknown option: ${a}`);
      process.exitCode = 1;
    }
  }
  return opts;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.dryRun) {
    await printDryRun();
    return;
  }

  const env = await detect();
  const state = await loadState();
  const lang = opts.lang || state.lang || 'zh-CN';
  const dict = await loadDict(lang);
  const token = generateToken();

  const ctx = {
    token,
    env,
    state,
    dict,
    agents: await loadAgents(),
    models: await loadModels(),
    port: opts.port,
    log,
  };

  const server = createServer(ctx);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port || 0, '127.0.0.1', resolve);
  });
  const actualPort = server.address().port;

  await log(
    `agent-guide v${process.env.npm_package_version || '0.1.0'} started (schema v${SCHEMA_VERSION}) ` +
      `platform=${env.platform}/${env.arch} wsl=${env.wsl?.available ?? 'n/a'} lang=${lang}`
  );
  const url = `http://127.0.0.1:${actualPort}/?token=${token}`;
  console.log('');
  console.log(`  agent-guide is running at: ${url}`);
  console.log(`  (press Ctrl+C to stop)`);
  console.log('');

  if (!opts.noOpen) openBrowser(url);

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}
