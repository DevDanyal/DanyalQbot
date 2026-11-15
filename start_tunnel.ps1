param(
  [int]$Port = 8000
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$qt = Join-Path $root "quotex_bot"
$log = Join-Path $env:TEMP "quotex-tunnel"
New-Item -ItemType Directory -Force -Path $log | Out-Null

function Ensure-Backend {
  $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listening) { Write-Host "Backend already listening on :$Port"; return }
  Write-Host "Starting Flask backend..."
  Start-Process python -ArgumentList "-m","quotex_bot.web.app" -WorkingDirectory $qt -RedirectStandardOutput "$log\flask.out.log" -RedirectStandardError "$log\flask.err.log" -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 4
}

function Start-Tunnel {
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Write-Host "Starting Cloudflare quick tunnel..."
  Start-Process cloudflared -ArgumentList "tunnel","--url","http://127.0.0.1:$Port","--no-autoupdate","--protocol","http2" -RedirectStandardOutput "$log\cf.out.log" -RedirectStandardError "$log\cf.err.log" -WindowStyle Hidden | Out-Null
  $url = $null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    $m = Select-String -Path "$log\cf.err.log" -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($m) { $url = $m.Matches[0].Value; break }
  }
  if (-not $url) { throw "Tunnel URL not found. Check $log\cf.err.log" }
  Set-Content -Path (Join-Path $root "TUNNEL_URL.txt") -Value $url -Encoding UTF8
  Write-Host ""
  Write-Host "FLASK_URL=$url"
  Write-Host "Saved to TUNNEL_URL.txt"
  Write-Host "Set this in Vercel env FLASK_URL and redeploy if it changed."
}

Ensure-Backend
Start-Tunnel
