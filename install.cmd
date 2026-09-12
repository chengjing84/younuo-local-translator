@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  优诺本地翻译插件 - 一键安装
echo  --------------------------------
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install.ps1"
if errorlevel 1 (
  echo.
  echo  安装没有完成。请按上方红色提示处理，再重新双击 install.cmd。
  echo  常见情况：未安装 Python 3.10+，或安装 Python 后尚未重新打开本窗口。
)
echo.
pause
