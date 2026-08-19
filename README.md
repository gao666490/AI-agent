# Agent Guide

> 目录驱动的跨平台 Agent 安装向导 · A directory-driven, cross-platform agent installer wizard
>
> 状态: **M1 骨架（开发中）** / Status: **M1 skeleton (in development)**

在浏览器里完成「选平台 → 选 Agent → 确认权限 → 选目录 → 装依赖/本体 → 选模型 → 填 Key → 写配置 → 学会启动」的全流程，每一步都先展示确切命令、经你确认后才执行。覆盖 Claude Code、Codex CLI、Hermes、Gemini CLI、Aider、OpenCode、Goose 七个 Agent 与国内外主流模型系列。

An in-browser wizard that walks you through installing and configuring mainstream coding agents on Windows / macOS / Linux — every step shows the exact command and waits for your confirmation before executing.

设计文档: [DESIGN.md](./DESIGN.md)

## 快速开始 / Quick start

要求: Node.js ≥ 20（零运行时依赖，无 npm 安装步骤）

```bash
# 开发模式 / development
node bin/agent-guide.js            # 启动向导并打开浏览器
node bin/agent-guide.js --dry-run  # 只打印计划，不执行任何命令
node bin/agent-guide.js --help
```

```bash
# 测试 / tests
npm test
```

发布形态（方案 A，M5）: `npx -y agent-guide@latest`，引导脚本 `install.ps1` / `install.sh`（自动确保 Node 20+）。

## 项目结构 / Layout

```
bin/agent-guide.js    CLI 入口（无依赖）
src/                  Node 服务：server / state / detect / agents / models / i18n / log / exec / prereqs
data/agents.json      7 个 Agent 配方（目录驱动，社区可 PR；含分步安装步骤 steps）
data/models.json      模型目录与兼容矩阵（端点待核验）
i18n/                 zh-CN / en 字典（key 集合一致，CI 校验）
web/                  浏览器向导（原生 HTML/CSS/JS，无构建步骤）
test/                 node:test 单测（state / i18n / plan / schema / exec / prereqs / server）
```

## 安全设计 / Security

- 本地服务仅绑定 `127.0.0.1`，随机端口；每次启动生成随机会话 token 拼进 URL，所有 `/api/*` 请求必须携带（CSRF 防护）。
- 每步操作先展示确切命令，用户确认后才执行；state.json 落盘前字段白名单化，API Key 永不写入 state。
- 零遥测；`~/.agent-guide/logs/` 记录操作轨迹（不含密钥）。

## 里程碑 / Milestones

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 骨架 | npm 包 + CLI + 本地服务 + 浏览器 UI + i18n + 环境检测 + state 持久化 | ✅ 完成 |
| M2 安装引擎 | 分步确认执行器（SSE 流式日志）+ 前置环境确认 + 计划汇总页 + 7 Agent 配方核验 | ✅ 完成 |
| M3 模型接入 | 国内 10 家端点核验 + 兼容矩阵 + 模型/Key 页 + 配置写入器 + doctor | ✅ 完成 |
| M4 Router 与 WSL | claude-code-router 集成 + WSL 流程深化 + 提权 + 重启恢复 | ⏳ |
| M5 打磨与发布 | npm 发布、README 双语、验收清单 | ⏳ |

## 国内模型接入现状（M3）

| 提供商 | OpenAI 兼容端点 | Anthropic 兼容 | Claude Code |
|---|---|---|---|
| DeepSeek | api.deepseek.com | ✅ /anthropic | ✅ 直连 |
| 通义千问 Qwen | dashscope compatible-mode/v1 | ✅ /apps/anthropic | ✅ 直连 |
| 智谱 GLM | open.bigmodel.cn/api/paas/v4 | ✅ /api/anthropic | ✅ 直连 |
| Kimi Moonshot | api.moonshot.cn/v1 | ✅ /anthropic | ✅ 直连 |
| 腾讯混元 | tokenhub.tencentmaas.com/v1 | ✅ | ✅ 直连 |
| 阶跃星辰 StepFun | api.stepfun.com/v1 | ✅ | ✅ 直连 |
| 豆包 (火山方舟) | ark.cn-beijing.volces.com/api/v3 | — | 需 router (M4) |
| MiniMax | api.minimax.chat/v1 | — | 需 router (M4) |
| 讯飞星火 | spark-api-open.xf-yun.com/v1 | — | 需 router (M4) |
| 百川 Baichuan | api.baichuan-ai.com/v1 | — | 不支持 |

## License

MIT
