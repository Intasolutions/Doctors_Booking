# One-time setup for local testing: installs everything and creates a clean
# database with an admin login and four sample doctors.
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Step($title, $dir, [scriptblock]$block) {
    Write-Host ""
    Write-Host "== $title ==" -ForegroundColor Cyan
    Push-Location $dir
    try {
        & $block
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$title failed (exit code $LASTEXITCODE)." }
    } finally {
        Pop-Location
    }
}

try {
    Invoke-Step "API: Python packages" "$root\backend" {
        if (-not (Test-Path "venv\Scripts\python.exe")) { python -m venv venv }
        & .\venv\Scripts\python.exe -m pip install --quiet --disable-pip-version-check -r requirements.txt
    }
    Invoke-Step "API: database" "$root\backend" {
        & .\venv\Scripts\python.exe manage.py migrate --verbosity 0
    }
    Invoke-Step "API: admin and sample doctors" "$root\backend" {
        $env:PYTHONIOENCODING = "utf-8"
        & .\venv\Scripts\python.exe manage.py seed_demo --no-bookings
    }
    Invoke-Step "Website: packages" "$root\web" { npm install --no-audit --no-fund }
    Invoke-Step "Mobile app: packages" "$root\mobile" { npm install --no-audit --no-fund }

    Write-Host ""
    Write-Host "Setup finished. Double-click start.bat to run CareSlot." -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host $_ -ForegroundColor Red
    exit 1
}
