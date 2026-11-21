# Starts CareSlot for local testing, each part in its own window.
#   start.bat            API + website
#   start.bat -WithApp   API + website + mobile app (Expo)
param([switch]$WithApp)

$root = Split-Path -Parent $PSScriptRoot

# This PC's address on the Wi-Fi/Ethernet network, for testing from a phone.
$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -match '^(Wi-Fi|WLAN|Ethernet)' -and $_.IPAddress -notlike '169.254*' } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) { $ip = "127.0.0.1" }

# The app on a phone must call the API at this PC's network address.
Set-Content -Path "$root\mobile\.env" -Encoding ascii -Value "EXPO_PUBLIC_API_BASE_URL=http://$($ip):8000/api"

function Start-Window($title, $dir, $command) {
    $full = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$dir'; $command"
    Start-Process powershell -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $full)
}

Start-Window "CareSlot API" "$root\backend" "`$env:PYTHONIOENCODING='utf-8'; .\venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"
# npx, not "npm run dev --": Windows PowerShell drops the "--" before npm sees it.
Start-Window "CareSlot website" "$root\web" "npx next dev -H 0.0.0.0 -p 3000"
if ($WithApp) {
    Start-Window "CareSlot mobile app" "$root\mobile" "npx expo start --lan"
}

Write-Host ""
Write-Host "CareSlot is starting in separate windows. Give it about 20 seconds." -ForegroundColor Green
Write-Host ""
Write-Host "  On this PC:        http://localhost:3000"
Write-Host "  On a phone (Wi-Fi): http://$($ip):3000"
Write-Host "  Admin panel:       http://localhost:8000/admin/"
Write-Host ""
Write-Host "  Admin login:   admin / careslot123"
Write-Host "  Doctor logins: dr.anitha, dr.rahul, dr.fathima, dr.joseph / careslot123"
if ($WithApp) {
    Write-Host ""
    Write-Host "  Mobile app: scan the QR code in the 'CareSlot mobile app' window with Expo Go."
}
Write-Host ""
Write-Host "Close the windows to stop CareSlot."
