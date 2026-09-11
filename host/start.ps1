$ErrorActionPreference = "Stop"
$HostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $HostRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "尚未安装。请先运行 .\host\install.ps1"
}

& $PythonExe (Join-Path $HostRoot "server.py")
