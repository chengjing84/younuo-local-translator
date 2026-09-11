@echo off
cd /d "%~dp0"
"%~dp0.venv\Scripts\python.exe" "%~dp0server.py" >> "%~dp0host.log" 2>&1
