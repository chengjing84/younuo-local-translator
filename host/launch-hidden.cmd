@echo off
cd /d "%~dp0"
".venv\Scripts\python.exe" "server.py" >> "host.log" 2>&1
