$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Version = (Get-Content -LiteralPath (Join-Path $ProjectRoot 'extension\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$DistRoot = Join-Path $ProjectRoot 'dist'
$StageRoot = Join-Path $env:TEMP ('younuo-package-' + [guid]::NewGuid().ToString('N'))
$PackageRoot = Join-Path $StageRoot 'younuo-local-translator'
$ZipPath = Join-Path $DistRoot "younuo-local-translator-v$Version.zip"
$ResolvedStage = [IO.Path]::GetFullPath($StageRoot)
$ExpectedPrefix = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not $ResolvedStage.StartsWith($ExpectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '打包临时目录不安全' }
try {
    New-Item -ItemType Directory -Path (Join-Path $PackageRoot 'host') -Force | Out-Null
    New-Item -ItemType Directory -Path $DistRoot -Force | Out-Null
    foreach ($Directory in @('extension','tools','tests','docs')) {
        $Source = Join-Path $ProjectRoot $Directory
        $Destination = Join-Path $PackageRoot $Directory
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]__pycache__[\\/]' -and $_.Extension -notin @('.pyc','.log') } | ForEach-Object {
            $Relative = $_.FullName.Substring($Source.Length).TrimStart('\')
            $Target = Join-Path $Destination $Relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $Target) -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $Target
        }
    }
    foreach ($Name in @('server.py','config.example.json','requirements.txt','install.ps1','start.ps1','run-hidden.vbs','launch-hidden.cmd')) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot "host\$Name") -Destination (Join-Path $PackageRoot 'host')
    }
    foreach ($Name in @('README.md','README_EN.md','LICENSE','CHANGELOG.md','CONTRIBUTING.md','package.json','install.cmd','uninstall.cmd','start-host.cmd','build-package.cmd')) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot $Name) -Destination $PackageRoot
    }
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package-lock.json')) { Copy-Item -LiteralPath (Join-Path $ProjectRoot 'package-lock.json') -Destination $PackageRoot }
    Compress-Archive -Path (Join-Path $StageRoot '*') -DestinationPath $ZipPath -CompressionLevel Optimal -Force
} finally {
    if (Test-Path -LiteralPath $ResolvedStage) { Remove-Item -LiteralPath $ResolvedStage -Recurse -Force }
}
Write-Host "安装包已生成：$ZipPath" -ForegroundColor Green
