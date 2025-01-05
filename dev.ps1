# Kill any existing processes on ports 8000 and 3000
$processes8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
$processes3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess

# Function to safely stop a process
function Stop-ProcessSafely {
    param($ProcessId)
    try {
        $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -ne "Idle") {
            Write-Host "Stopping process $($process.ProcessName) (ID: $ProcessId)..."
            Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "Could not stop process $ProcessId"
    }
}

# Stop processes if they exist
if ($processes8000) {
    Stop-ProcessSafely $processes8000
}

if ($processes3000) {
    Stop-ProcessSafely $processes3000
}

# Wait a moment for ports to be released
Start-Sleep -Seconds 2

# Start Python API in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd python; python -m uvicorn api:app --reload --port 8000"

# Start Next.js app in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd qr-campaign-next; npm run dev" 