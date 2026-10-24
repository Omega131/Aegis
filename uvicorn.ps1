if (Test-Path "$PSScriptRoot\venv\Scripts\uvicorn.exe") {
    & "$PSScriptRoot\venv\Scripts\uvicorn.exe" @args
} else {
    python -m uvicorn @args
}
