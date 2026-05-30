# Free a TCP port on Windows (e.g. stale VOTRIX API on 5000)
# Usage: .\scripts\kill-port.ps1 5000

param(
  [Parameter(Mandatory = $true)]
  [int]$Port
)

$connections = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING"

if (-not $connections) {
  Write-Host "No process is listening on port $Port."
  exit 0
}

$pids = $connections | ForEach-Object {
  ($_ -split '\s+')[-1]
} | Select-Object -Unique

foreach ($procId in $pids) {
  Write-Host "Stopping PID $procId (port $Port)..."
  taskkill /PID $procId /F 2>$null
}

Write-Host "Done. Start the API again: npm run dev"
