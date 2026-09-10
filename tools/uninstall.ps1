$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ServerFile = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "host\server.py"))
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

if (Test-Path -LiteralPath $RunKey) {
    Remove-ItemProperty -Path $RunKey -Name "YounuoTranslatorHost" -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -in @("python.exe", "pythonw.exe") -and
        $_.CommandLine -and
        $_.CommandLine.IndexOf($ServerFile, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Write-Host "已取消优诺后台自启动并停止后台进程。" -ForegroundColor Green
Write-Host "Edge 扩展请在 edge://extensions 中手动删除。"
Write-Host "项目文件、访问令牌和术语表没有删除。"
