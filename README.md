# Agent Guide

> 目录驱动的跨平台 Agent 安装向导 · A directory-driven, cross-platform agent installer wizard
>
> 在浏览器里把「选平台 → 选 Agent → 确认权限 → 装依赖 → 选模型 → 填 Key → 写配置 → 学会启动」走完，每一步都先展示确切命令、经你确认后才执行。

An in-browser wizard that installs and configures mainstream coding agents on **Windows / macOS / Linux** — every step shows the exact command and waits for your confirmation before running it.

设计文档: [DESIGN.md](./DESIGN.md) · License: MIT

---

## ✨ 特性 / Features

- 🧭 **11 步向导**：环境检测 → 平台 → Agent → 权限说明 → 工作目录 → 前置依赖 → 安装 → 模型 → API Key → 配置 → 完成，断点可恢复
- 🤖 **7 个 Agent**：Claude Code、Codex CLI、Hermes、Gemini CLI、Aider、OpenCode、Goose（配方在 `data/agents.json`，社区可 PR）
- 🇨🇳 **国内模型优先**：DeepSeek / 通义千问 / 智谱 GLM / Kimi / 腾讯混元 / 阶跃星辰 / 豆包 / MiniMax / 讯飞星火 / 百川，端点已核验；其中 6 家提供 Anthropic 兼容端点，可直接接入 Claude Code
- 🔐 **安全**：本地服务仅绑 127.0.0.1 + 随机端口 + 会话 token（防 CSRF）；每步确认后执行；Key 只写进 Agent 自己的配置文件（0600/ACL），不进状态、不进日志；零遥测
- 🖱️ **双击即启动**：Windows 双击 `启动向导.bat`，macOS/Linux 双击 `agent-guide.sh`
- 🌐 **中英双语**：页面右上角一键切换

---

## 🚀 快速开始 / Quick Start

要求：**Node.js ≥ 20**（没有的话先装：<https://nodejs.org/>，或双击启动脚本会提示）

### 方式一：双击启动（推荐）

| 平台 | 操作 |
|---|---|
| Windows | 双击 `启动向导.bat` |
| macOS / Linux | 双击 `agent-guide.sh`（或终端 `./agent-guide.sh`） |

启动后浏览器自动打开向导。

### 方式二：命令行

```bash
# 克隆后运行（零 npm 依赖，无需 npm install）
git clone https://github.com/gao666490/AI-agent.git
cd AI-agent
node bin/agent-guide.js            # 启动向导并打开浏览器
```

```bash
# 常用命令
node bin/agent-guide.js --dry-run  # 只打印 7 个 Agent 的完整安装计划，不执行任何命令
node bin/agent-guide.js doctor     # 自检：环境 / 已装 Agent / 已写配置
node bin/agent-guide.js --port 8123
node bin/agent-guide.js --lang en  # 初始英文界面
node bin/agent-guide.js --no-open  # 不自动打开浏览器
```

> 发布形态（方案 A，M5 后）：`npx -y agent-guide@latest`，引导脚本自动确保 Node 20+。

---

## 🧭 向导流程（11 步）

| # | 页面 | 你会看到 / 做什么 |
|---|---|---|
| 1 | 欢迎 + 环境检测 | OS/架构/Node/npm/git/python/WSL 实测结果 |
| 2 | 平台确认 | 自动检测的平台，可手动改 |
| 3 | 选择 Agent | 7 张卡片，标注推荐路径（如 Claude Code→WSL2、OpenCode→WSL） |
| 4 | 权限说明 | 安装计划汇总：每步标题 + **确切命令** + 前置依赖 + 工作目录；未核验配方有 ⚠️ 提示 |
| 5 | 工作目录 | 预填推荐目录，可改；WSL 场景显示路径换算预览 |
| 6 | 前置环境 | 实测依赖是否缺失：`uv` 可**一键自动安装**，`git`/`wsl` 显示命令（复制后用管理员执行），`node`/`python` 给官网指引 |
| 7 | 安装执行 | 逐步骤「确认 → 执行」，右侧**实时流式日志**（密钥脱敏、超时自动终止） |
| 8 | 模型系列 | 国内优先；每个模型标注兼容方式（原生 / 厂商 Anthropic 兼容 / OpenAI 兼容 / 需 router / 不支持） |
| 9 | API Key | 输入 + 二次确认 → **在线验证** → 写入配置（或「稍后配置」） |
| 10 | 配置写入 | 自动写 `~/.claude/settings.json`、`~/.codex/config.toml`、`~/.aider.conf.yml`、`~/.config/opencode/config.json`、`~/.hermes/.env` |
| 11 | 完成 | 启动命令、写入的文件清单、`agent-guide doctor` 自检 |

状态存在 `~/.agent-guide/state.json`，**中途退出后重新启动会自动回到上次步骤**（WSL 安装触发重启的场景也能恢复）。

---

## 🧩 支持矩阵

### Agents（7）

| Agent | Windows 推荐 | macOS / Linux | 启动命令 |
|---|---|---|---|
| Claude Code | **WSL2**（官方推荐） | 原生 | `claude` |
| Codex CLI | 原生（**CLI 与桌面版共用配置**） | 原生 | `codex` |
| Hermes Agent | **原生**（官方支持，无需 WSL） | 原生 | `hermes` |
| Gemini CLI | 原生 (npm) | 原生 | `gemini` |
| Aider | 原生 (uv tool) | 原生 | `aider` |
| OpenCode | **WSL**（原生为实验性） | 原生 (npm) | `opencode` |
| Goose | 原生（PowerShell 官方脚本 / npm） | brew cask `block-goose` / 官方脚本 | `goose` |

### 国内模型（10，端点已核验）

| 提供商 | OpenAI 兼容端点 | Anthropic 兼容 | 可直连 Claude Code |
|---|---|---|---|
| DeepSeek | api.deepseek.com | ✅ /anthropic | ✅ |
| 通义千问 Qwen | dashscope compatible-mode/v1 | ✅ /apps/anthropic | ✅ |
| 智谱 GLM | open.bigmodel.cn/api/paas/v4 | ✅ /api/anthropic | ✅ |
| Kimi Moonshot | api.moonshot.cn/v1 | ✅ /anthropic | ✅ |
| 腾讯混元 | tokenhub.tencentmaas.com/v1 | ✅ | ✅ |
| 阶跃星辰 StepFun | api.stepfun.com/v1 | ✅ | ✅ |
| 豆包 (火山方舟) | ark.cn-beijing.volces.com/api/v3 | — | 需 router (M4) |
| MiniMax | api.minimax.chat/v1 | — | 需 router (M4) |
| 讯飞星火 | spark-api-open.xf-yun.com/v1 | — | 需 router (M4) |
| 百川 Baichuan | api.baichuan-ai.com/v1 | — | 不支持 |

国外模型（OpenAI / Anthropic / Gemini / Grok / Mistral / OpenRouter 等）保留设计基准条目，未做额外核验。完整数据在 `data/models.json`。

---

## 🔐 安全设计

- 本地服务只监听 `127.0.0.1`，随机端口，每次启动生成会话 token 拼进 URL，所有 `/api/*` 请求必须携带（**防 CSRF**）
- **每步确认**：执行前必须收到该步骤的确认（服务端记录时间戳审计）
- **命令透明**：要执行的命令原样展示，不隐藏任何子命令；不自动提权（git/wsl 的命令由你手动以管理员执行）
- **Key 安全**：只写入 Agent 自己的配置文件，Unix 0600 + Windows ACL 收紧；state.json 字段白名单化，日志/UI 全程脱敏；零遥测
- 供应链：零运行时依赖；配方与模型数据为 JSON，社区 PR 可审

---

## 🛠️ 开发 / Development

```bash
npm test              # 63 个单测：state / i18n / plan / schema / exec / prereqs / verify / config-writer / server
node bin/agent-guide.js --dry-run
node bin/agent-guide.js doctor
```

项目结构：

```
bin/agent-guide.js    CLI 入口（零依赖）
src/                  服务端：server / state / detect / agents / models / i18n / exec / prereqs / config-writer / verify / doctor / log / browser
data/agents.json      7 个 Agent 配方（分步 install+verify）
data/models.json      模型目录 + 兼容矩阵（10 家国内模型已核验）
i18n/                 zh-CN / en 字典（key 集合 CI 校验）
web/                  浏览器向导（原生 HTML/CSS/JS，无构建步骤）
test/                 node:test 单测
启动向导.bat / agent-guide.sh   双击启动脚本
```

---

## 🤝 贡献 / Contributing

- **加 Agent / 模型**：编辑 `data/agents.json` / `data/models.json`（结构由 `test/schema.test.js` 校验），提交 PR
- **加语言**：复制 `i18n/zh-CN.json` 为你的语言，保持 key 集合一致
- **提 Issue**：附上 `agent-guide doctor` 输出和 `~/.agent-guide/logs/guide.log`（不含密钥）

---

## 🗺️ 里程碑 / Milestones

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 骨架 | CLI + 本地服务 + 浏览器 UI + i18n + 环境检测 + state 持久化 | ✅ |
| M2 安装引擎 | 分步确认执行器（SSE 日志）+ 前置依赖（含自动安装）+ 7 Agent 配方核验 | ✅ |
| M3 模型接入 | 国内 10 家端点核验 + 模型/Key 页 + 配置写入器 + doctor | ✅ |
| M4 Router 与 WSL | claude-code-router 集成（豆包/MiniMax/讯飞 → Claude Code）+ WSL 流程深化 | ⏳ |
| M5 打磨与发布 | npm 发布（npx agent-guide@latest）、验收清单 | ⏳ |

---

## License

MIT
