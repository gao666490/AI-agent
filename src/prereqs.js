import { run } from './detect.js';

/**
 * Check recipe `requires` against the live environment (design §6 page 6:
 * 前置环境确认). Each requirement reports presence + version + a hint when
 * missing. `env` is the cached environment snapshot from /api/detect.
 *
 * installable tiers:
 *   user  — the wizard can install it directly (no admin), via installSteps
 *   admin — needs an admin shell (UAC/sudo); the wizard shows the command
 *   manual— point the user at official downloads
 */
const INSTALL_PLAN = {
  git: {
    installable: 'admin',
    installCommand: process.platform === 'win32'
      ? 'winget install --id Git.Git -e --source winget'
      : process.platform === 'darwin'
        ? 'brew install git'
        : 'sudo apt-get update && sudo apt-get install -y git',
    hint: 'git 未安装：以管理员身份运行上面的命令（或 https://git-scm.com/downloads）',
  },
  node: {
    installable: 'manual',
    installCommand: null,
    hint: 'Node.js ≥ 20 未安装：https://nodejs.org/ 或使用 fnm（https://github.com/Schniz/fnm）',
  },
  uv: {
    installable: 'user',
    installCommand: process.platform === 'win32'
      ? 'powershell -NoProfile -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
      : 'curl -LsSf https://astral.sh/uv/install.sh | sh',
    installSteps: [{
      id: 'install-uv',
      title: '安装 uv',
      command: process.platform === 'win32'
        ? 'powershell -NoProfile -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
        : 'curl -LsSf https://astral.sh/uv/install.sh | sh',
      shell: process.platform === 'win32' ? 'powershell' : 'bash',
      timeoutMs: 600000,
      verify: true,
    }],
    hint: 'uv 未安装：向导将自动执行官方安装脚本（用户态，无需管理员）',
  },
  python: {
    installable: 'manual',
    installCommand: null,
    hint: 'Python 未安装：https://www.python.org/downloads/（勾选 Add to PATH）',
  },
  wsl: {
    installable: 'admin',
    installCommand: 'wsl --install',
    hint: 'WSL 未就绪：以管理员身份运行 `wsl --install`，重启后重新运行向导（支持断点恢复）',
  },
};

export async function checkPrereqs(requires = [], env = {}) {
  const out = [];
  for (const req of requires) {
    out.push(await checkOne(req, env));
  }
  return { ok: out.every((r) => r.present), items: out };
}

async function checkOne(req, env) {
  const plan = INSTALL_PLAN[req] || {
    installable: 'manual',
    installCommand: null,
    hint: `未知前置依赖：${req}（请更新配方）`,
  };
  let present = false;
  let version = null;
  switch (req) {
    case 'git': {
      version = await run('git', ['--version']);
      present = !!version;
      break;
    }
    case 'node': {
      version = await run('node', ['--version']);
      present = !!version;
      break;
    }
    case 'uv': {
      version = await run('uv', ['--version']);
      present = !!version;
      break;
    }
    case 'python': {
      version = await run('python', ['--version']);
      present = !!version;
      break;
    }
    case 'wsl': {
      const wsl = env.wsl || {};
      version = wsl.wsl2 ? 'WSL 2' : wsl.available ? 'WSL' : null;
      present = wsl.available === true;
      break;
    }
    default:
      break;
  }
  return {
    name: req,
    present,
    version,
    installable: plan.installable,
    installCommand: plan.installCommand,
    installSteps: present ? undefined : plan.installSteps,
    hint: present ? '' : plan.hint,
  };
}
