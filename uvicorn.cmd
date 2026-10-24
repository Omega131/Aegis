@echo off
if exist "%~dp0venv\Scripts\uvicorn.exe" (
  "%~dp0venv\Scripts\uvicorn.exe" %*
) else (
  python -m uvicorn %*
)
