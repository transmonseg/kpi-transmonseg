@echo off
cd /d "%~dp0.."
"C:\Program Files\nodejs\npx.cmd" tsx watch "%~dp0server.ts"
