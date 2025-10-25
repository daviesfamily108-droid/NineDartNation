$ErrorActionPreference='Continue'
$renderLog = Join-Path $PSScriptRoot '..\render_watch.log'
$netlifyLog = Join-Path $PSScriptRoot '..\netlify_watch.log'

function Watch-Log($path, $source) {
    if (-not (Test-Path $path)) { Write-Host "[$source] Log file not found: $path"; return }
    Write-Host "[$source] Watching $path (will print ALERT lines only)"
    Get-Content $path -Wait -Tail 0 | ForEach-Object {
        $line = $_
        if ($line -match 'HTTP 200') {
            # normal
        } elseif ($line -match 'HTTP' -or $line -match 'Error' -or $line -match 'Exception') {
            Write-Host "[ALERT][$source] $line"
        }
    }
}

# Start watchers in background jobs
Start-Job -ScriptBlock { param($p,$s) & Watch-Log $p $s } -ArgumentList $renderLog,'render' | Out-Null
Start-Job -ScriptBlock { param($p,$s) & Watch-Log $p $s } -ArgumentList $netlifyLog,'netlify' | Out-Null
Write-Host "Started background log watchers (jobs). Use Get-Job | Receive-Job to inspect output."