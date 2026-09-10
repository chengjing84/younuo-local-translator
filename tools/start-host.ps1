$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HostRoot = Join-Path $ProjectRoot "host"
$ConfigPath = Join-Path $HostRoot "config.json"
$RunnerPath = Join-Path $HostRoot "run-hidden.vbs"
$PythonwPath = Join-Path $HostRoot ".venv\Scripts\pythonw.exe"
$LogPath = Join-Path $HostRoot "host.log"

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "尚未安装，请先双击 install.cmd"
}
if (-not (Test-Path -LiteralPath $PythonwPath)) {
    throw "Python 环境不存在，请先双击 install.cmd"
}

$Config = Get-Content -Raw -LiteralPath $ConfigPath -Encoding UTF8 | ConvertFrom-Json
$Headers = @{ "X-Page-Translator-Token" = $Config.token }
$HealthUrl = "http://127.0.0.1:$($Config.port)/health"

try {
    $Health = Invoke-RestMethod -Uri $HealthUrl -Headers $Headers -TimeoutSec 2
    if ($Health.ok) {
        Write-Host "优诺后台已经在运行，版本 $($Health.version)。" -ForegroundColor Green
        exit 0
    }
} catch {
    # Not running yet.
}

Write-Host "正在启动优诺后台..." -ForegroundColor Cyan
Start-Process -FilePath "wscript.exe" -ArgumentList @("`"$RunnerPath`"") -WindowStyle Hidden

for ($Attempt = 1; $Attempt -le 20; $Attempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $Health = Invoke-RestMethod -Uri $HealthUrl -Headers $Headers -TimeoutSec 2
        if ($Health.ok) {
            Write-Host "启动成功：本机服务已连接，版本 $($Health.version)。" -ForegroundColor Green
            exit 0
        }
    } catch {
        # Continue polling.
    }
}

Write-Host "启动失败。请查看日志：$LogPath" -ForegroundColor Red
if (Test-Path -LiteralPath $LogPath) {
    Get-Content -LiteralPath $LogPath -Tail 12
}
exit 1
