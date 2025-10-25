$ErrorActionPreference='Continue'
$log = Join-Path $PSScriptRoot '..\server\server.log'
if (-not (Test-Path $log)) { Write-Host "[server-watch] Log file not found: $log"; return }
Write-Host "[server-watch] Starting alert watcher on $log (background job)"
function Watch-ServerLog($path) {
    Get-Content $path -Wait -Tail 0 | ForEach-Object {
        $line = $_
        if ($line -match 'Error|Exception|Unhandled|CRITICAL|FATAL') {
            Write-Host "[ALERT][server] $line"
        }
    }
}
Start-Job -ScriptBlock { param($p) & Watch-ServerLog $p } -ArgumentList $log | Out-Null
Write-Host "[server-watch] Background job started. Use Get-Job | Receive-Job to inspect."