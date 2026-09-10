@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  优诺本地翻译插件 - 一键安装
echo  --------------------------------
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install.ps1"
echo.
pause
