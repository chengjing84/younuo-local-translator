$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HostRoot = Join-Path $ProjectRoot 'host'
$ConfigPath = Join-Path $HostRoot 'config.json'
$PythonExe = Join-Path $HostRoot '.venv\Scripts\python.exe'
$ServerPath = Join-Path $HostRoot 'server.py'
if (-not (Test-Path -LiteralPath $ConfigPath) -or -not (Test-Path -LiteralPath $PythonExe)) {
    Write-Host '当前目录尚未初始化。请先运行 install.cmd，再启动后台。' -ForegroundColor Yellow
    exit 1
}
$Config = Get-Content -Raw -LiteralPath $ConfigPath -Encoding UTF8 | ConvertFrom-Json
$ExpectedVersion = (Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot 'extension\manifest.json') -Encoding UTF8 | ConvertFrom-Json).version
$HealthUrl = "http://127.0.0.1:$($Config.port)/health"
$Headers = @{ 'X-Page-Translator-Token' = $Config.token }
function Get-Health {
    try { Invoke-RestMethod -Uri $HealthUrl -Headers $Headers -TimeoutSec 4 } catch { return $null }
}
$Health = Get-Health
if ($Health -and $Health.ok) {
    if ($Health.version -ne $ExpectedVersion) {
        Write-Host "旧后台 $($Health.version) 仍在运行，请先停止它再启动 $ExpectedVersion。" -ForegroundColor Red
        exit 1
    }
    Write-Host "优诺后台已在运行，版本 $($Health.version)。" -ForegroundColor Green
    exit 0
}
Write-Host '正在启动优诺后台...' -ForegroundColor Cyan
Start-Process -FilePath $PythonExe -ArgumentList @("`"$ServerPath`"") -WorkingDirectory $HostRoot -WindowStyle Hidden
for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
    Start-Sleep -Milliseconds 250
    $Health = Get-Health
    if ($Health -and $Health.ok -and $Health.version -eq $ExpectedVersion) {
        Write-Host "启动成功：优诺 $($Health.version)。可以关闭此窗口。" -ForegroundColor Green
        exit 0
    }
}
Write-Host '后台未能启动。请运行 host\start.ps1 查看具体错误，或检查 host\host.log。' -ForegroundColor Red
exit 1
