$ErrorActionPreference = "Stop"
$HostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvRoot = Join-Path $HostRoot ".venv"
$ConfigPath = Join-Path $HostRoot "config.json"

if (-not (Test-Path -LiteralPath $VenvRoot)) {
    python -m venv $VenvRoot
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    $Token = -join ((1..48) | ForEach-Object { "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[(Get-Random -Maximum 62)] })
    @{
        token = $Token
        port = 8765
        ollama_url = "http://127.0.0.1:11434"
    } | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

Write-Host ""
Write-Host "安装完成。运行 .\host\start.ps1 启动服务。" -ForegroundColor Green
Write-Host "首次运行页需要的访问令牌位于 host\config.json。" -ForegroundColor Cyan
