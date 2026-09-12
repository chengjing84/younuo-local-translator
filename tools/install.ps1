param([string]$PythonPath = 'python')
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HostRoot = Join-Path $ProjectRoot 'host'
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $HostRoot 'install.ps1') -PythonPath $PythonPath
    if ($LASTEXITCODE -ne 0) { throw '本机环境安装失败，未设置自启动' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-host.ps1')
    if ($LASTEXITCODE -ne 0) { throw '后台健康检查失败，未设置自启动' }
    $StartScript = Join-Path $PSScriptRoot 'start-host.ps1'
    $RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    $AutoStartReady = $false
    try {
        New-Item -Path $RunKey -Force | Out-Null
        Set-ItemProperty -Path $RunKey -Name 'YounuoTranslatorHost' -Value ('powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $StartScript + '"')
        $AutoStartReady = $true
    } catch {
        Write-Host '系统策略不允许设置登录自启动；核心功能已安装，不影响当前使用。' -ForegroundColor Yellow
        Write-Host '以后开机后请双击 start-host.cmd 启动后台。' -ForegroundColor Yellow
    }
    if ($AutoStartReady) {
        Write-Host '安装成功，已设置登录后自动启动。' -ForegroundColor Green
    } else {
        Write-Host '安装成功，当前后台已启动。' -ForegroundColor Green
    }
    Write-Host ('在 edge://extensions 中加载：' + (Join-Path $ProjectRoot 'extension'))
    Write-Host '更新扩展后请刷新已打开的网页。'
} catch {
    Write-Host ('安装未完成：' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '按上面的提示处理后重新双击 install.cmd；详细排错见 docs\USAGE.md。' -ForegroundColor Yellow
    exit 1
}
