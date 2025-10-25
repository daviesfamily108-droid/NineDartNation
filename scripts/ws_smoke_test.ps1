$ErrorActionPreference = 'Stop'
$uri = 'wss://ninedartnation.onrender.com/ws'
$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ct = [System.Threading.CancellationToken]::None
try {
    Write-Host "Connecting to $uri..."
    $ws.ConnectAsync([System.Uri]$uri, $ct).Wait()
    Write-Host "Connected"
    $msg = '{"type":"cam-create"}'
    $buf = [System.Text.Encoding]::UTF8.GetBytes($msg)
    $seg = New-Object System.ArraySegment[byte] ($buf,0,$buf.Length)
    $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
    $recvBuf = New-Object byte[] 65536
    $seg2 = New-Object System.ArraySegment[byte] ($recvBuf,0,$recvBuf.Length)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $got = $false
    while ($sw.Elapsed.TotalSeconds -lt 8 -and -not $got) {
        if ($ws.State -ne 'Open') { break }
        try {
            $res = $ws.ReceiveAsync($seg2, $ct).Result
            if ($res.Count -gt 0) {
                $s = [System.Text.Encoding]::UTF8.GetString($recvBuf,0,$res.Count)
                Write-Host "Received: $s"
                if ($s -match '"type"\s*:\s*"cam-code"') { Write-Host "CAM CODE RESPONSE: $s"; $got = $true; break }
            }
        } catch {
            Write-Host "Receive error: $($_.Exception.Message)"
            break
        }
    }
    if (-not $got) { Write-Host "Did not receive cam-code within timeout." }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    try { if ($ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,'bye',$ct).Wait() } } catch {}
}
