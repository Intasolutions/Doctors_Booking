# Wipes ALL data (bookings, patients, accounts, WhatsApp messages, leave,
# blocked time) and recreates only the admin login and the four sample doctors.
param([switch]$Force)

$root = Split-Path -Parent $PSScriptRoot

if (-not $Force) {
    Write-Host "This deletes every booking, patient, account and WhatsApp message." -ForegroundColor Yellow
    $answer = Read-Host "Type YES to clear all data"
    if ($answer -ne "YES") {
        Write-Host "Nothing was deleted."
        exit 0
    }
}

Push-Location "$root\backend"
try {
    $env:PYTHONIOENCODING = "utf-8"
    & .\venv\Scripts\python.exe manage.py flush --no-input
    if ($LASTEXITCODE -ne 0) { throw "Clearing the database failed." }
    & .\venv\Scripts\python.exe manage.py seed_demo --no-bookings
    if ($LASTEXITCODE -ne 0) { throw "Recreating the sample doctors failed." }
    Write-Host ""
    Write-Host "All data cleared. Fresh start: admin + 4 sample doctors, no bookings, no patients." -ForegroundColor Green
    Write-Host "If you were signed in on the website or app, sign in again (old logins no longer exist)."
} catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
