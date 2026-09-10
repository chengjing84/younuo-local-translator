$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Version = "0.5.0"
$DistRoot = Join-Path $ProjectRoot "dist"
$StageRoot = Join-Path $env:TEMP "younuo-package-$Version"
$PackageRoot = Join-Path $StageRoot "younuo-local-translator"
$PackageHost = Join-Path $PackageRoot "host"
$ZipPath = Join-Path $DistRoot "younuo-local-translator-v$Version.zip"

if (Test-Path -LiteralPath $StageRoot) {
    $ResolvedTemp = [System.IO.Path]::GetFullPath($StageRoot)
    $ExpectedTemp = [System.IO.Path]::GetFullPath($env:TEMP)
    if (-not $ResolvedTemp.StartsWith($ExpectedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "临时目录不安全：$ResolvedTemp"
    }
    Remove-Item -LiteralPath $StageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $PackageHost -Force | Out-Null
New-Item -ItemType Directory -Path $DistRoot -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $ProjectRoot "extension") -Destination $PackageRoot -Recurse
Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "host") -File |
    Where-Object { $_.Name -ne "config.json" } |
    Copy-Item -Destination $PackageHost
Copy-Item -LiteralPath (Join-Path $ProjectRoot "tools") -Destination $PackageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $ProjectRoot "README.md") -Destination $PackageRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot "install.cmd") -Destination $PackageRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot "uninstall.cmd") -Destination $PackageRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot "start-host.cmd") -Destination $PackageRoot

if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -Path (Join-Path $StageRoot "*") -DestinationPath $ZipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $StageRoot -Recurse -Force

Write-Host "安装包已生成：$ZipPath" -ForegroundColor Green
