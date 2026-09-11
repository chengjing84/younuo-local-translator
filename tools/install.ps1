param([string]$PythonPath = 'python')
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HostRoot = Join-Path $ProjectRoot 'host'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $HostRoot 'install.ps1') -PythonPath $PythonPath
if ($LASTEXITCODE -ne 0) { throw '本机环境安装失败，未设置自启动' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-host.ps1')
if ($LASTEXITCODE -ne 0) { throw '后台健康检查失败，未设置自启动' }
$StartScript = Join-Path $PSScriptRoot 'start-host.ps1'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $RunKey -Force | Out-Null
Set-ItemProperty -Path $RunKey -Name 'YounuoTranslatorHost' -Value ('powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $StartScript + '"')
Write-Host '安装成功，已设置登录后自动启动。' -ForegroundColor Green
Write-Host ('在 edge://extensions 中加载：' + (Join-Path $ProjectRoot 'extension'))
Write-Host '更新扩展后请刷新已打开的网页。'
