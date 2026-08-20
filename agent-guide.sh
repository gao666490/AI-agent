#!/usr/bin/env bash
# Agent Guide launcher for macOS / Linux — double-click or run from terminal.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js（需要 20+）。"
  echo "请访问 https://nodejs.org/ 或使用 fnm 安装: https://github.com/Schniz/fnm"
  read -rp "按回车退出... " _
  exit 1
fi

echo "正在启动 Agent Guide，浏览器将自动打开..."
echo "退出请按 Ctrl+C"
echo
exec node bin/agent-guide.js "$@"
