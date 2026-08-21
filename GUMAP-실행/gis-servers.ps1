param([switch]$Stop, [switch]$Status)

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PY = "C:\Users\dryou\AppData\Local\Programs\Python\Launcher\py.exe"
$CORS = Join-Path $SCRIPT_DIR "cors_server.py"
$BASE = "C:\Users\dryou\OneDrive\${env:USERNAME}\학교지도\GUMI-KUMHO\USB 드라이브 3\금오공대_최종산출물"
# 경로 오버라이드 (OneDrive 경로)
$BASE = "C:\Users\dryou\OneDrive\바탕 화면\학교지도\GUMI-KUMHO\USB 드라이브 3\금오공대_최종산출물"

$PORTS = @(8765, 8766, 8767)
$NAMES = @("Orthophoto", "3DTiles", "DEM")
$DIRS  = @(
    "$BASE\2. 정사영상",
    "$BASE\5. 3Dtile",
    "$BASE\1. DEM\kumoh_DEM"
)

function IsListening($port) {
    return $null -ne (netstat -an 2>$null | Select-String ":$port .*LISTEN")
}

function StartServer($port, $dir) {
    $args = "/k `"$PY`" `"$CORS`" $port `"$dir`""
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = $args
    $psi.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($psi) | Out-Null
}

if ($Stop) {
    for ($i = 0; $i -lt 3; $i++) {
        $conns = Get-NetTCPConnection -LocalPort $PORTS[$i] -ErrorAction SilentlyContinue
        foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
        Write-Host "Stopped port $($PORTS[$i])"
    }
    return
}

if ($Status) {
    Write-Host "`n=== GIS Server Status ==="
    for ($i = 0; $i -lt 3; $i++) {
        $ok = IsListening $PORTS[$i]
        $s = if ($ok) { "RUNNING" } else { "STOPPED" }
        Write-Host "  Port $($PORTS[$i]) ($($NAMES[$i])): $s"
    }
    return
}

Write-Host "`n=== Starting G-map GIS Servers ===`n"
for ($i = 0; $i -lt 3; $i++) {
    if (IsListening $PORTS[$i]) {
        Write-Host "  [SKIP] Port $($PORTS[$i]) already running"
    } else {
        Write-Host "  [START] Port $($PORTS[$i]) $($NAMES[$i])..."
        StartServer $PORTS[$i] $DIRS[$i]
        Start-Sleep -Milliseconds 1000
    }
}

Start-Sleep -Seconds 4
Write-Host "`n=== Status ==="
$allOk = $true
for ($i = 0; $i -lt 3; $i++) {
    $ok = IsListening $PORTS[$i]
    if ($ok) {
        Write-Host "  OK  Port $($PORTS[$i]) $($NAMES[$i])" -ForegroundColor Green
    } else {
        Write-Host "  ERR Port $($PORTS[$i]) $($NAMES[$i])" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""
if ($allOk) {
    Write-Host "All servers running!" -ForegroundColor Green
    Write-Host "  Browser: http://localhost:8000/"
    Write-Host "  3D View: http://localhost:8000/3d-viewer.html"
} else {
    Write-Host "Some servers failed. Check the cmd windows." -ForegroundColor Yellow
}
Write-Host ""
