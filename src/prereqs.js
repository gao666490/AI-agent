import { run } from './detect.js';

/**
 * Check recipe `requires` against the live environment (design §6 page 6:
 * 前置环境确认). Each requirement reports presence + version + a hint when
 * missing. `env` is the cached environment snapshot from /api/detect.
 */
export async function checkPrereqs(requires = [], env = {}) {
  const out = [];
  for (const req of requires) {
    out.push(await checkOne(req, env));
  }
  return { ok: out.every((r) => r.present), items: out };
}

async function checkOne(req, env) {
  switch (req) {
    case 'git': {
      const version = await run('git', ['--version']);
      return { name: 'git', present: !!version, version, hint: 'git 未安装：https://git-scm.com/downloads' };
    }
    case 'node': {
      const version = await run('node', ['--version']);
      return { name: 'node', present: !!version, version, hint: 'Node.js ≥ 20 未安装' };
    }
    case 'uv': {
      const version = await run('uv', ['--version']);
      return { name: 'uv', present: !!version, version, hint: 'uv 未安装：https://docs.astral.sh/uv/（winget install astral-sh.uv / curl -LsSf https://astral.sh/uv/install.sh | sh）' };
    }
    case 'python': {
      const version = await run('python', ['--version']);
      return { name: 'python', present: !!version, version, hint: 'Python 未安装' };
    }
    case 'wsl': {
      const wsl = env.wsl || {};
      const version = wsl.wsl2 ? 'WSL 2' : wsl.available ? 'WSL' : null;
      return {
        name: 'wsl',
        present: wsl.available === true,
        version,
        hint: 'WSL 未就绪：以管理员身份运行 `wsl --install`，重启后继续本向导（向导支持断点恢复）',
      };
    }
    default:
      return { name: req, present: false, version: null, hint: `未知前置依赖：${req}（请更新配方）` };
  }
}
