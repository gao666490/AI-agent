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
src/                  Node 服务：server / state / detect / agents / models / i18n / log
data/agents.json      7 个 Agent 配方（目录驱动，社区可 PR）
data/models.json      模型目录与兼容矩阵（端点待核验）
i18n/                 zh-CN / en 字典（key 集合一致，CI 校验）
web/                  浏览器向导（原生 HTML/CSS/JS，无构建步骤）
test/                 node:test 单测（state / i18n / plan / server）
```

## 安全设计 / Security

- 本地服务仅绑定 `127.0.0.1`，随机端口；每次启动生成随机会话 token 拼进 URL，所有 `/api/*` 请求必须携带（CSRF 防护）。
- 每步操作先展示确切命令，用户确认后才执行；state.json 落盘前字段白名单化，API Key 永不写入 state。
- 零遥测；`~/.agent-guide/logs/` 记录操作轨迹（不含密钥）。

## 里程碑 / Milestones

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 骨架 | npm 包 + CLI + 本地服务 + 浏览器 UI + i18n + 环境检测 + state 持久化 | ✅ 开发中 |
| M2 安装引擎 | 7 Agent 配方核验 + 分步确认执行器 + 计划汇总页 | ⏳ |
| M3 模型接入 | 端点核验 + 兼容矩阵 + 配置写入器 | ⏳ |
| M4 Router 与 WSL | claude-code-router 集成 + WSL/Ubuntu 流程 + 提权 + 重启恢复 | ⏳ |
| M5 打磨与发布 | doctor、日志、npm 发布、README 双语、验收清单 | ⏳ |

## License

MIT
