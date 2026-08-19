# Agent Guide — 设计文档

> 工作名称：`agent-guide`（待定，发布前最终确认）
> 状态：设计讨论已完成，待评审

## 1. 项目定位

一个**目录驱动的跨平台 Agent 安装向导**：用户在浏览器里完成"选平台 → 选 Agent → 确认权限 → 选目录 → 装依赖/本体 → 选模型 → 填 Key → 写配置 → 学会启动"的全流程。

- 面向人群：想在本机用上国外主流编码 Agent 的开发者，覆盖 Windows / macOS / Linux。
- 核心价值：把"环境检测、WSL 部署、依赖安装、模型接入、router 配置"这些容易踩坑的步骤，变成可确认、可追溯、可恢复的向导。
- 分发方式：**方案 A**（Node 包 + 一行命令引导脚本），打包桌面版后置。
- 开源：GitHub 公开仓库，社区通过改 JSON 目录（agents.json / models.json）贡献新 Agent 与模型。

## 2. 已确认决策（Decision Log）

| # | 决策 | 内容 |
|---|---|---|
| D1 | Hermes 身份 | NousResearch/hermes-agent（MIT，自进化终端 Agent） |
| D2 | WSL 策略 | 按 Agent 给推荐路径，不强制；Claude Code 在 Windows 推荐 WSL2，Hermes 在 Windows 原生安装（官方明确支持） |
| D3 | 语言 | 中英双语，页面边缘固定按钮实时切换 |
| D4 | 发布形态 | 方案 A：npm 包 + `install.ps1` / `install.sh` 引导脚本（自动确保 Node 20+） |
| D5 | Agent 名单 | Claude Code、Codex CLI、Hermes、Gemini CLI、Aider、OpenCode、Goose，共 7 个 |
| D6 | Router | 集成开源 claude-code-router，仅"Claude Code × 无 Anthropic 兼容端点"时启用 |
| D7 | 安装深度 | 每一步都停下让用户确认；动手前展示"安装计划"汇总页 |
| D8 | 权限透明 | 每步展示将要执行的确切命令；仅 WSL 相关步骤提权；零遥测；API Key 本地存储 |

## 3. 发布形态（方案 A）

- 主体：npm 包，CLI 入口 `agent-guide`（别名待定），启动本地 HTTP 服务并在浏览器打开向导。
- 引导脚本（用户侧体验）：
  - Windows：`irm https://<release-host>/install.ps1 | iex`
  - macOS / Linux：`curl -fsSL https://<release-host>/install.sh | bash`
  - 脚本职责：检测 Node（≥20），没有则用 fnm 装到用户目录（无需管理员），然后执行 `npx agent-guide@latest`。
- 更新：`npx agent-guide@latest` 天然拿到最新版，无需自建更新服务。
- 桌面壳（Tauri）列为 M5+ 的后置选项，不阻塞 v1。

## 4. 总体架构

```text
┌─────────────────────────────────────────────┐
│ 浏览器（向导 UI：HTML/CSS/JS，无构建步骤）      │
│  - 页面流程 + 语言切换按钮（页面边缘）           │
└──────────────▲──────────────────────────────┘
               │ HTTP (127.0.0.1:<随机端口>)
┌──────────────┴──────────────────────────────┐
│ agent-guide 本地服务（Node 20+）              │
│  - 状态机 / 会话持久化 (state.json)            │
│  - 环境检测 (OS/架构/WSL/Node/git/python)     │
│  - 配方执行器（调用 agents.json 中命令）        │
│  - 配置写入器（按 Agent 写 config / env）      │
│  - router 生命周期管理（集成 claude-code-router）│
└──────────────┬──────────────────────────────┘
               │ 子进程（按步骤确认后执行）
               ▼
  wsl / npm / pip / curl / 官方安装器 / 写配置文件
```

关键原则：
1. **委托官方安装器**，不自研安装逻辑；本工具只做编排、检测、配置。
2. **目录驱动**：所有 Agent / 模型 / 文案都是数据（JSON），主程序无硬编码清单。
3. **最小权限**：默认用户态安装；仅 `wsl --install` 等步骤通过 UAC 提权。

## 5. 目录驱动设计

### 5.1 agents.json（Agent 配方）

```json
{
  "id": "hermes",
  "name": "Hermes Agent",
  "homepage": "https://github.com/NousResearch/hermes-agent",
  "license": "MIT",
  "launchCommand": "hermes",
  "platforms": {
    "windows": {
      "recommended": "native",
      "choices": {
        "native": {
          "label": "原生安装（官方推荐，无需 WSL）",
          "command": "powershell -NoProfile -ExecutionPolicy Bypass -Command \"iex (irm https://hermes-agent.nousresearch.com/install.ps1)\"",
          "requires": ["git"],
          "defaultWorkDir": "%USERPROFILE%\\agents\\hermes"
        },
        "wsl": {
          "label": "WSL2（可选）",
          "command": "wsl -e bash -lc \"curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash\"",
          "requires": ["wsl", "git"],
          "defaultWorkDir": "~/agents/hermes"
        }
      }
    },
    "macos": { "recommended": "native", "...": "" },
    "linux": { "recommended": "native", "...": "" }
  },
  "config": {
    "kind": "hermes",
    "homeDir": "~/.hermes",
    "providerCommand": "hermes model"
  }
}
```

### 5.2 七个 Agent 的安装配方（v1 基准）

| Agent | 官方安装方式 | Windows 推荐 | macOS / Linux | 默认工作目录 | 启动命令 |
|---|---|---|---|---|---|
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` / `irm https://claude.ai/install.ps1 \| iex` / npm | **WSL2**（沙箱依赖 WSL2，MCP 生态更顺） | 原生 | Windows: `%USERPROFILE%\agents\claude-code`；WSL: `~/agents/claude-code` | `claude` |
| Codex CLI | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` / `irm ... \| iex` / npm | 原生（沙箱能力弱于 WSL，可在配方中说明） | 原生 | `%USERPROFILE%\agents\codex` | `codex` |
| Hermes | `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash` / `iex (irm ...install.ps1)` | **原生**（官方明确支持，无需 WSL；安装器自带 uv/Python/Node 等全部依赖） | 原生 | `%USERPROFILE%\agents\hermes` | `hermes` |
| Gemini CLI | `npm i -g @google/gemini-cli` | 原生 | 原生 | `%USERPROFILE%\agents\gemini` | `gemini` |
| Aider | `pip install -U aider-chat` 或 `uv tool install aider-chat` | 原生 | 原生 | `%USERPROFILE%\agents\aider` | `aider` |
| OpenCode | `curl -fsSL https://opencode.ai/install \| bash` 或 `npm i -g opencode-ai` | 原生 | 原生 | `%USERPROFILE%\agents\opencode` | `opencode` |
| Goose | 官方脚本 / brew / winget / npm | 原生 | 原生 | `%USERPROFILE%\agents\goose` | `goose` |

> 注：所有命令与推荐路径在 M2 实现时逐一核验并锁定版本；本表是设计基准，不是最终数据。

### 5.3 models.json（模型目录）

```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "region": "cn",
  "api": {
    "openaiCompatible": "https://api.deepseek.com/v1",
    "anthropicCompatible": null,
    "auth": "Bearer <key>"
  },
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "compat": {
    "claude-code": "router",
    "codex": "openai-compatible",
    "hermes": "native",
    "gemini": "unsupported",
    "aider": "openai-compatible",
    "opencode": "openai-compatible",
    "goose": "openai-compatible"
  }
}
```

`compat` 取值：`native`（Agent 官方支持）/ `anthropic-compatible`（厂商提供 Anthropic 兼容端点，直接填 base URL）/ `openai-compatible`（写 provider 配置即可）/ `router`（需要 claude-code-router 翻译）/ `unsupported`（不提供选择或置灰）。

### 5.4 模型系列清单（v1 范围，端点待逐一核验）

**国内**：DeepSeek、通义千问（DashScope）、智谱 GLM、Kimi（Moonshot）、豆包（火山方舟 Ark）、MiniMax、讯飞星火、腾讯混元、阶跃星辰、百川。

**国外**：OpenAI、Anthropic Claude、Google Gemini、xAI Grok、Mistral、Meta Llama（托管兼容端点）、OpenRouter（聚合入口）。

> 实现前必须完成"端点核验"任务：逐家确认是否提供 OpenAI 兼容 / Anthropic 兼容端点、当前 base URL、模型名清单。该数据只存在于 models.json，运行时随时可更新。

### 5.5 Router 触发规则

仅当 `compat["claude-code"] == "router"` 时：
1. 通过 npm 安装并启动 claude-code-router（本地进程，随机端口）；
2. 生成/更新 router 的 provider 配置（含用户 Key，权限 0600）；
3. 为 Claude Code 写入 `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` 与 `ANTHROPIC_AUTH_TOKEN`；
4. 向导退出时提供"保持 router 后台运行"或"随会话结束"的选项；下次启动 Agent 前由 `agent-guide doctor` 检查。

## 6. 向导页面流程

语言切换：**每页边缘固定两个按钮（中文 / English）**，默认右上角；选择持久化到 `state.json`（跨机器同步由浏览器 localStorage 兜底）。

| # | 页面 | 内容 | 确认动作 |
|---|---|---|---|
| 1 | 欢迎 + 环境检测 | 自动检测 OS/架构/WSL/Node/git/python，展示结果 | 进入下一步 |
| 2 | 平台确认 | 展示检测结果，允许手动覆盖（如"我有 Apple Silicon"） | 确认平台 |
| 3 | Agent 选择 | 7 个 Agent 卡片，标注 Windows 推荐路径（如 Claude Code → WSL2） | 选择 Agent |
| 4 | 权限与操作说明 | 说明"将执行哪些操作、请求哪些权限"，展开后可见**确切命令**；右下角"继续"按钮 | 同意后继续（**本页由用户明确提出，固定在右下角**） |
| 5 | 工作目录选择 | 推荐路径默认填入可编辑文本框；WSL 场景显示 Windows↔WSL 路径换算预览 | 确认目录 |
| 6 | 前置环境确认 | 仅当需要时出现（WSL/Ubuntu、Node、git、Python…），解释为什么需要 + 是否继续 | 逐项确认 |
| 7 | 安装执行 | 分步执行，每步执行前展示命令并等待确认，带进度与日志（Key 脱敏） | 每步确认 |
| 8 | 模型系列选择 | 国内/国外分组；每个模型显示与当前 Agent 的兼容标签（原生/厂商兼容/需 router/不支持） | 选择模型 |
| 9 | API Key 输入 | 输入并二次确认；说明存储位置；支持"稍后配置" | 确认 |
| 10 | 配置写入 | 写 config / env / provider，必要时启动 router | 确认 |
| 11 | 完成页 | 启动命令、快捷方式生成、`agent-guide doctor` 自检、"常见问题" | 结束 |

状态机（`state.json` 持久化）：

```text
welcome → platform → agent-select → permission → folder
   → prereqs → install → model-select → api-key → config → finish
```

任意页面可退出；重启程序后从上次中断处恢复（尤其 WSL 安装触发系统重启的场景）。

## 7. 后端 API 设计（草稿）

```text
GET  /api/state                读取会话状态（含语言、当前步骤）
POST /api/state                保存会话状态
GET  /api/detect               环境检测结果
GET  /api/agents               7 个 Agent 的展示信息
GET  /api/agents/:id/plan      某 Agent 在指定平台的完整安装计划
POST /api/steps/:id/confirm    确认某步骤（服务端记录确认时间戳）
POST /api/steps/:id/execute    执行某步骤（SSE 流式返回进度/日志）
GET  /api/models               模型目录（按当前 Agent 过滤兼容项）
POST /api/config               写入配置 / Key（服务端脱敏后落盘）
POST /api/router/start|stop|status
GET  /api/logs                 本地操作日志（尾部）
```

前端 v1 使用原生 HTML/CSS/JS（无构建步骤），i18n 通过 JSON 字典 + `data-i18n` 属性实现。

## 8. 权限模型与安全

- **每步确认**：后端维护"待确认步骤队列"，执行前必须收到该步骤的确认 token，防止页面状态错乱导致误执行。
- **命令透明**：每个步骤的 `command` 原样展示给用户；不隐藏任何子命令。
- **最小提权**：默认在用户态执行；仅 WSL 安装/启用等步骤单独触发 UAC（`Start-Process -Verb RunAs`），其余一律不要求管理员。
- **Key 安全**：写入对应 Agent 的配置目录（`~/.codex/config.toml`、`~/.hermes/.env`、`~/.claude/settings.json` 等），文件权限 0600；日志与 UI 全程脱敏；本工具零遥测。
- **本地日志**：`~/.agent-guide/logs/` 记录操作轨迹（不含 Key），供用户自查与提 issue。
- **供应链**：依赖尽可能少；claude-code-router 固定版本并记录 hash；npm 包名发布前检查无冲突。

## 9. 状态持久化与重启恢复

- 位置：`~/.agent-guide/state.json`（Windows 为 `%USERPROFILE%\.agent-guide\`）。
- 内容：当前步骤、平台、Agent、目录、模型、已确认步骤时间戳、语言；**不含 API Key**（Key 只写进 Agent 自己的配置）。
- WSL 重启场景：用户重启后重新运行引导脚本 → 检测到未完成会话 → 询问"继续上次安装？" → 校验已完成步骤后从断点继续。

## 10. 多语言（i18n）

- 字典：`i18n/zh-CN.json`、`i18n/en.json`，与 agents/models 一样作为数据目录，社区可 PR 扩展语言。
- 切换：每页边缘固定按钮（默认右上角：`中文 | EN`），点击即时重渲染；选择写入 `state.json` + localStorage。
- 字符串约定：页面文案、步骤标题、权限说明、命令注释全部走字典；**命令本身不翻译**（保持可复制、可审查）。

## 11. 测试与 CI

- GitHub Actions 矩阵：`windows-latest` / `macos-latest` / `ubuntu-latest`。
- 自动化测试：
  - 环境检测与平台判断的单元测试；
  - 每个 Agent 的"计划生成"（plan）快照测试（dry-run，不实际安装）；
  - 配置写入器单测（写临时 HOME，校验文件内容与权限）；
  - i18n 完整性检查（zh/en key 集合一致）；
  - router 集成测试（mock OpenAI 端点，验证 Claude Code 配置被正确写入）。
- 手工验收清单：每平台 × 每 Agent × 每模型类别的 E2E checklist，随 release 发布。
- `agent-guide --dry-run`：只打印完整计划与命令，不执行，供审查与 CI 使用。

## 12. 里程碑

| 里程碑 | 内容 | 出口标准 |
|---|---|---|
| M1 骨架 | npm 包 + CLI + 本地服务 + 浏览器 UI + i18n 框架 + 环境检测 | 三个平台可启动向导、切语言 |
| M2 安装引擎 | 7 个 Agent 配方入库 + 每步确认执行器 + 计划汇总页 | 三个平台可完成 7 个 Agent 安装 |
| M3 模型接入 | models.json + 兼容矩阵 + 配置写入器 | 主要国内/国外模型可写入配置 |
| M4 Router 与 WSL | claude-code-router 集成 + WSL/Ubuntu 流程 + 提权 + 重启恢复 | Windows 全流程（含 WSL 场景）跑通 |
| M5 打磨与发布 | 完成页、doctor 自检、日志、npm 发布、README 双语 | 发布 v1.0 并附验收清单 |

## 13. 待定事项

- npm 包名与 GitHub 仓库名（建议 `agent-guide`，需检查占用）。
- 许可证：建议 MIT（与多数目标 Agent 一致）。
- 引导脚本托管位置（GitHub Releases / 独立域名）。
- 各 provider 的 Anthropic 兼容端点现状核验（M3 前必须完成）。
- "本地模型（Ollama）"是否纳入 v1（建议 M3 之后评估）。
