# RELIASTRA local Windows stack — one API, one worker, one Beat.
#
# Why this script exists: check execution needs all three processes, and
# duplicates actively harm the deployment (two APIs fight over :8000, two
# workers double-probe every target, two Beats double-publish, zero Beats
# means zero checks while /health still says ok). Hand-starting processes in
# separate terminals drifts into exactly that state.
#
# Usage (PowerShell, from repo root):
#   .\backend\scripts\run-local-windows.ps1        # start missing services
#   .\backend\scripts\run-local-windows.ps1 -Stop  # stop all three
#   .\backend\scripts\run-local-windows.ps1 -Status
#
# Notes:
# - API runs WITHOUT --reload: the reloader restarts the server on every file
#   change under backend/ (including tests/), which drops :8000 mid-request.
#   Restart the API yourself after pulling backend changes.
# - Celery on Windows MUST use --pool=solo: prefork (billiard) crash-loops
#   with PermissionError [WinError 5] while tasks pile up in Redis.
# - Logs: backend-dev-out.log, celery-worker-solo-out.log,
#   celery-beat-solo-out.log (repo root).

param([switch]$Stop, [switch]$Status)

$ErrorActionPreference = 'Stop'
$Backend = Join-Path $PSScriptRoot '..' | Resolve-Path | Select-Object -ExpandProperty Path
$VenvPy = Join-Path $Backend '.venv\Scripts\python.exe'
$Celery = Join-Path $Backend '.venv\Scripts\celery.exe'
$Root = (Resolve-Path (Join-Path $Backend '..')).Path

function Find-Procs([string]$Like) {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.CommandLine -like $Like } |
        Select-Object ProcessId, @{n='Cmd'; e={
            $_.CommandLine.Substring(0, [Math]::Min(160, $_.CommandLine.Length)) } }
}

function Start-Detached([string]$Exe, [string]$ArgList, [string]$LogBase) {
    # Start-Process detaches the child so it outlives this shell. Native
    # -Redirect* is used instead of a cmd.exe /c "… >> log" wrapper: the
    # wrapper's quoting silently breaks and the process exits instantly.
    # NOTE: Start-Process overwrites (does not append); each start begins a
    # fresh log, which also bounds log growth on a busy dev box.
    $argv = $ArgList -split ' (?=(?:[^"]*"[^"]*")*[^"]*$)'
    $p = Start-Process -FilePath $Exe -ArgumentList $argv `
        -WorkingDirectory $Backend -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput ($LogBase) -RedirectStandardError ($LogBase + '.err')
    return $p.Id
}

function Show-Status {
    $apis = @(Find-Procs '*uvicorn app.main:app*')
    $workers = @(Find-Procs '*celery_app*worker*')
    $beats = @(Find-Procs '*celery_app*beat*')
    Write-Host ("API      : {0} running (want 1)" -f $apis.Count)
    $apis | ForEach-Object { Write-Host ("  pid {0}" -f $_.ProcessId) }
    Write-Host ("Worker   : {0} running (want 1, --pool=solo)" -f $workers.Count)
    $workers | ForEach-Object { Write-Host ("  pid {0}" -f $_.ProcessId) }
    Write-Host ("Beat     : {0} running (want 1)" -f $beats.Count)
    $beats | ForEach-Object { Write-Host ("  pid {0}" -f $_.ProcessId) }
    try {
        $h = Invoke-RestMethod 'http://127.0.0.1:8000/health/checks' -TimeoutSec 10
        Write-Host ("Pipeline : {0} (queue {1})" -f $h.status, $h.broker.queue_depth)
    } catch { Write-Host 'Pipeline : API not reachable on :8000' }
}

if ($Status) { Show-Status; exit 0 }

if ($Stop) {
    Find-Procs '*uvicorn app.main:app*' | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Find-Procs '*celery_app*' | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host 'Stopped local API/worker/beat.'
    exit 0
}

# Trim duplicates first so we converge on exactly one of each.
$apis = @(Find-Procs '*uvicorn app.main:app*')
if ($apis.Count -gt 1) {
    $owner = (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1).OwningProcess
    $apis | Where-Object { $_.ProcessId -ne $owner } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host ("Killed stray API pid {0}" -f $_.ProcessId) }
    $apis = @(Find-Procs '*uvicorn app.main:app*')
}
$workers = @(Find-Procs '*celery_app*worker*')
if ($workers.Count -gt 1) {
    $workers | Select-Object -Skip 1 | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host ("Killed duplicate worker pid {0}" -f $_.ProcessId) }
}
$beats = @(Find-Procs '*celery_app*beat*')
if ($beats.Count -gt 1) {
    $beats | Select-Object -Skip 1 | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host ("Killed duplicate beat pid {0}" -f $_.ProcessId) }
}

if (@(Find-Procs '*uvicorn app.main:app*').Count -eq 0) {
    $p = Start-Detached $VenvPy '-m uvicorn app.main:app --host 0.0.0.0 --port 8000' `
        (Join-Path $Root 'backend-dev-out.log')
    Write-Host ("Started API (pid {0})" -f $p)
}
if (@(Find-Procs '*celery_app*worker*').Count -eq 0) {
    $p = Start-Detached $Celery ('-A app.infrastructure.celery_app.celery_app worker ' +
        '--pool=solo --concurrency=1 --loglevel=info') `
        (Join-Path $Root 'celery-worker-solo-out.log')
    Write-Host ("Started solo worker (pid {0})" -f $p)
}
if (@(Find-Procs '*celery_app*beat*').Count -eq 0) {
    $p = Start-Detached $Celery ('-A app.infrastructure.celery_app.celery_app beat ' +
        '--loglevel=info') `
        (Join-Path $Root 'celery-beat-solo-out.log')
    Write-Host ("Started beat (pid {0})" -f $p)
}

Start-Sleep -Seconds 5
Show-Status
