@echo off
if "%~1"=="hold" (
  ping -n 600 127.0.0.1 >nul
  exit /b 0
)
echo probe-tool ran
