$ErrorActionPreference = 'Stop'

$reportPath = Join-Path (Get-Location) 'eslint-report.json'
if (-not (Test-Path $reportPath)) {
  throw "eslint-report.json not found at $reportPath"
}

# Read and parse the ESLint JSON report.
$jsonText = Get-Content $reportPath -Raw
$data = $jsonText | ConvertFrom-Json

# Files that contain the CRLF marker warning (␍) emitted by eslint-plugin-prettier.
$paths = New-Object System.Collections.Generic.HashSet[string]

foreach ($f in $data) {
  if (-not $f.messages) { continue }
  foreach ($m in $f.messages) {
    if ($null -eq $m.ruleId) { continue }
    if ($m.ruleId -ne 'prettier/prettier') { continue }

    # Message includes the literal "␍" character when Prettier detects CRLF.
    if ($m.message -like '*␍*' -or $m.message -like '*Delete*`r*') {
      [void]$paths.Add($f.filePath)
      break
    }
  }
}

$paths | Sort-Object
