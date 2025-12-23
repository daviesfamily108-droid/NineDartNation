[CmdletBinding()]
param(
  [string]$ReportPath = 'eslint-report.json'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ReportPath)) {
  throw "Report not found: $ReportPath. Run 'npm run lint' first (or regenerate eslint-report.json)."
}

$jsonText = Get-Content $ReportPath -Raw
$data = $jsonText | ConvertFrom-Json

$targets = New-Object System.Collections.Generic.HashSet[string]
foreach ($f in $data) {
  if (-not $f.messages) { continue }
  foreach ($m in $f.messages) {
    if ($m.ruleId -ne 'prettier/prettier') { continue }

    # Prettier shows CRLF issues as the visible '␍' glyph in the message
    if ($m.message -like '*␍*') {
      [void]$targets.Add($f.filePath)
      break
    }
  }
}

$files = $targets | Sort-Object
Write-Host "Normalizing line endings to LF for $($files.Count) files..."

$changed = 0
foreach ($path in $files) {
  if (-not (Test-Path $path)) { continue }

  $raw = Get-Content -LiteralPath $path -Raw
  if ($raw -notmatch "`r") { continue }

  # Replace CRLF with LF only; keep file contents otherwise identical.
  $raw2 = $raw -replace "`r`n", "`n"

  if ($raw2 -eq $raw) { continue }

  # Write back as UTF8 without BOM (matches common TS repo conventions)
  Set-Content -LiteralPath $path -Value $raw2 -NoNewline -Encoding utf8
  $changed++
}

Write-Host "Done. Updated $changed files."
