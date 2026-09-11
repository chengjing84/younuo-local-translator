param([string]$PythonPath = 'python')
$ErrorActionPreference = 'Stop'
$HostRoot = $PSScriptRoot
$VenvRoot = Join-Path $HostRoot '.venv'
$PythonExe = Join-Path $VenvRoot 'Scripts\python.exe'
$ConfigPath = Join-Path $HostRoot 'config.json'
if (-not (Test-Path -LiteralPath $PythonExe)) {
    & $PythonPath -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'
    if ($LASTEXITCODE -ne 0) { throw '需要可运行的 Python 3.10 或更高版本' }
    & $PythonPath -m venv --without-pip $VenvRoot
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $PythonExe)) { throw 'Python 虚拟环境创建失败' }
}
& $PythonExe -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'
if ($LASTEXITCODE -ne 0) { throw '本机虚拟环境不可用，请修复 Python 后重试' }
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    $TokenBytes = New-Object byte[] 32
    $Generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Generator.GetBytes($TokenBytes) } finally { $Generator.Dispose() }
    $Token = [Convert]::ToBase64String($TokenBytes)
    @{token=$Token; port=8765; ollama_url='http://127.0.0.1:11434'} | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}
Write-Host 'Python 环境就绪。连接令牌位于 host\config.json。' -ForegroundColor Green
