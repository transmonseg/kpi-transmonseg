@echo off
cd /d "%~dp0.."
"C:\Program Files\nodejs\npx.cmd" tsx "%~dp0server.ts"
