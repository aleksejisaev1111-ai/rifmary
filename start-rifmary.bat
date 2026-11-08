@echo off
cd /d "%~dp0server"
echo Starting Rifmary at http://127.0.0.1:8787
start "" http://127.0.0.1:8787/
node index.js
pause
