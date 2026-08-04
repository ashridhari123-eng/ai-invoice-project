$ErrorActionPreference = "Stop"

$cloudflared = "C:\Users\ashri\cloudflared\cloudflared.exe"
$dir = $PSScriptRoot
$log = Join-Path $dir "tunnel.log"
$err = Join-Path $dir "tunnel.err"
$pidFile = Join-Path $dir "tunnel.pid"

Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$args = @(
  "tunnel",
  "--url", "http://localhost:3000",
  "--protocol", "http2",
  "--no-autoupdate"
)

$proc = Start-Process -FilePath $cloudflared -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
Set-Content -Path $pidFile -Value $proc.Id

Write-Host "cloudflared started with PID $($proc.Id), logging to tunnel.err"
