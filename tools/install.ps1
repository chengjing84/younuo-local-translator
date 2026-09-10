$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HostRoot = Join-Path $ProjectRoot "host"
$InstallScript = Join-Path $HostRoot "install.ps1"
$HiddenRunner = Join-Path $HostRoot "run-hidden.vbs"
$ExtensionRoot = Join-Path $ProjectRoot "extension"

Write-Host "正在准备本机服务..." -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $InstallScript

if (-not (Test-Path -LiteralPath $HiddenRunner)) {
    throw "缺少后台启动器：$HiddenRunner"
}

$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValue = "wscript.exe `"$HiddenRunner`""
New-Item -Path $RunKey -Force | Out-Null
Set-ItemProperty -Path $RunKey -Name "YounuoTranslatorHost" -Value $RunValue

Write-Host "正在启动静默后台..." -ForegroundColor Cyan
Start-Process -FilePath "wscript.exe" -ArgumentList @("`"$HiddenRunner`"") -WindowStyle Hidden

Write-Host ""
Write-Host "后台已设置为登录 Windows 后自动启动。" -ForegroundColor Green
Write-Host "接下来请在 Edge 中完成一次侧载：" -ForegroundColor Yellow
Write-Host "  1. 打开 edge://extensions"
Write-Host "  2. 开启开发人员模式"
Write-Host "  3. 点击“加载解压缩的扩展”"
Write-Host "  4. 选择：$ExtensionRoot"

Start-Process "msedge.exe" "edge://extensions"
Start-Process "explorer.exe" "/select,`"$ExtensionRoot`""
