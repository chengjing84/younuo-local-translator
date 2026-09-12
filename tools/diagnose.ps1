$ErrorActionPreference = 'Continue'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HostRoot = Join-Path $ProjectRoot 'host'
$ConfigPath = Join-Path $HostRoot 'config.json'
$VenvPython = Join-Path $HostRoot '.venv\Scripts\python.exe'
$Lines = New-Object System.Collections.Generic.List[string]
function Add-Line([string]$Name, [string]$Value) { $Lines.Add(('{0}: {1}' -f $Name, $Value)) }
Add-Line 'Younuo diagnostics' (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Add-Line 'Project' $ProjectRoot
Add-Line 'Windows' ([Environment]::OSVersion.VersionString)
Add-Line 'PowerShell' $PSVersionTable.PSVersion.ToString()
Add-Line 'Config file' (Test-Path -LiteralPath $ConfigPath)
Add-Line 'Virtualenv python' (Test-Path -LiteralPath $VenvPython)
if (Test-Path -LiteralPath $VenvPython) {
    try { Add-Line 'Virtualenv version' ((& $VenvPython --version 2>&1) -join ' ') } catch { Add-Line 'Virtualenv version' ('ERROR - ' + $_.Exception.Message) }
}
$SystemPython = Get-Command python.exe -CommandType Application -ErrorAction SilentlyContinue
Add-Line 'System python' $(if ($SystemPython) { $SystemPython.Source } else { 'not found in PATH' })
$Ollama = Get-Command ollama.exe -CommandType Application -ErrorAction SilentlyContinue
Add-Line 'Ollama command' $(if ($Ollama) { $Ollama.Source } else { 'not found in PATH (API may still work)' })
try {
    $OllamaTags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4
    Add-Line 'Ollama API' 'OK'
    Add-Line 'Ollama models' (($OllamaTags.models.name) -join ', ')
} catch { Add-Line 'Ollama API' ('ERROR - ' + $_.Exception.Message) }
if (Test-Path -LiteralPath $ConfigPath) {
    try {
        $Config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        Add-Line 'Host port' $Config.port
        $Health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/health" -f $Config.port) -Headers @{'X-Page-Translator-Token'=$Config.token} -TimeoutSec 4
        Add-Line 'Younuo host' ('OK - version ' + $Health.version)
    } catch { Add-Line 'Younuo host' ('ERROR - ' + $_.Exception.Message) }
}
$ReportPath = Join-Path $ProjectRoot 'diagnostics.txt'
$Lines | Set-Content -LiteralPath $ReportPath -Encoding UTF8
$Lines | ForEach-Object { Write-Host $_ }
Write-Host "`nReport saved without tokens or API keys: $ReportPath" -ForegroundColor Green
