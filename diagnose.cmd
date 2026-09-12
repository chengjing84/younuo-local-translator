@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  优诺本地翻译 - 自动诊断
echo  --------------------------------
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\diagnose.ps1"
echo.
pause
