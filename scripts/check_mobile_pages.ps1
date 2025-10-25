$ErrorActionPreference = 'Continue'
$code = 'VPRZ'
$sites = @(
    @{ name='netlify'; url = "https://ninedartnation.netlify.app/mobile-cam.html?code=$code" },
    @{ name='render'; url = "https://ninedartnation.onrender.com/mobile-cam.html?code=$code" }
)
foreach ($s in $sites) {
    try {
        Write-Host "\nChecking $($s.name): $($s.url)"
        $r = Invoke-WebRequest -Uri $s.url -UseBasicParsing -TimeoutSec 20
        Write-Host "[$($s.name)] Status: $($r.StatusCode) Len=$($r.Content.Length)"
        $previewLen = [Math]::Min(800, $r.Content.Length)
        if ($previewLen -gt 0) {
            $preview = $r.Content.Substring(0, $previewLen)
            Write-Host "--- Preview (${previewLen} chars) ---"
            Write-Host $preview
            Write-Host "--- End preview ---"
        }
    } catch {
        Write-Host "[$($s.name)] Error: $($_.Exception.Message)"
    }
}
