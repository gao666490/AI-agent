@echo off
title Agent Guide Launcher
cd /d "%~dp0"

echo.
echo  ============================================
echo    Agent Guide - Agent Installer Wizard
echo  ============================================
echo.

rem Check Node.js
node --version >nul 2>&1
if errorlevel 1 goto nonode
for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%

echo.
echo  Starting wizard - your browser will open automatically...
echo  Press Ctrl+C to quit.
echo.
node bin/agent-guide.js %*
echo.
echo  Wizard exited.
pause
exit /b 0

:nonode
echo  [Node.js not found]
echo.
echo  This wizard requires Node.js 20 or later.
echo  Download: https://nodejs.org/
echo  Or install via fnm: https://github.com/Schniz/fnm
echo.
pause
exit /b 1
