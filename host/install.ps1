param([string]$PythonPath = 'python')
$ErrorActionPreference = 'Stop'
$HostRoot = $PSScriptRoot
$VenvRoot = Join-Path $HostRoot '.venv'
$PythonExe = Join-Path $VenvRoot 'Scripts\python.exe'
$ConfigPath = Join-Path $HostRoot 'config.json'

function Stop-Install([string]$Message) {
    Write-Host $Message -ForegroundColor Red
    exit 1
}

function Test-Python([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        & $Path -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>$null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Find-Python {
    if ($PythonPath -and $PythonPath -ne 'python') {
        $Explicit = Get-Command $PythonPath -CommandType Application -ErrorAction SilentlyContinue
        if ($Explicit -and (Test-Python $Explicit.Source)) { return $Explicit.Source }
        Stop-Install "指定的 Python 不可用或低于 3.10：$PythonPath"
    }
    $PythonCommand = Get-Command python.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($PythonCommand -and (Test-Python $PythonCommand.Source)) { return $PythonCommand.Source }
    $Launcher = Get-Command py.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($Launcher) {
        try {
            $FromLauncher = (& $Launcher.Source -3 -c 'import sys; print(sys.executable)' 2>$null | Select-Object -First 1)
            if (Test-Python $FromLauncher) { return $FromLauncher }
        } catch {}
    }
    $Candidates = @()
    if ($env:LocalAppData) { $Candidates += Get-ChildItem (Join-Path $env:LocalAppData 'Programs\Python\Python*\python.exe') -File -ErrorAction SilentlyContinue }
    if ($env:ProgramFiles) { $Candidates += Get-ChildItem (Join-Path $env:ProgramFiles 'Python*\python.exe') -File -ErrorAction SilentlyContinue }
    foreach ($Candidate in ($Candidates | Sort-Object FullName -Descending)) {
        if (Test-Python $Candidate.FullName) { return $Candidate.FullName }
    }
    Stop-Install '未找到 Python 3.10+。请先运行：winget install -e --id Python.Python.3.12；完成后重新双击 install.cmd。'
}

$VenvHealthy = Test-Python $PythonExe
if (-not $VenvHealthy) {
    $BasePython = Find-Python
    if (Test-Path -LiteralPath $VenvRoot) {
        $ResolvedVenv = [IO.Path]::GetFullPath($VenvRoot)
        $ExpectedVenv = [IO.Path]::GetFullPath((Join-Path $HostRoot '.venv'))
        if ($ResolvedVenv -ne $ExpectedVenv) { Stop-Install '拒绝清理异常的虚拟环境路径' }
        Write-Host '检测到不完整或失效的虚拟环境，正在自动重建…' -ForegroundColor Yellow
        Remove-Item -LiteralPath $ResolvedVenv -Recurse -Force
    }
    & $BasePython -m venv --without-pip $VenvRoot
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $PythonExe)) { Stop-Install 'Python 虚拟环境创建失败' }
}
if (-not (Test-Python $PythonExe)) { Stop-Install '本机虚拟环境不可用，请重新运行 install.cmd' }
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    $TokenBytes = New-Object byte[] 32
    $Generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Generator.GetBytes($TokenBytes) } finally { $Generator.Dispose() }
    $Token = [Convert]::ToBase64String($TokenBytes)
    @{token=$Token; port=8765; ollama_url='http://127.0.0.1:11434'} | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}
Write-Host 'Python 环境就绪。连接令牌位于 host\config.json。' -ForegroundColor Green
