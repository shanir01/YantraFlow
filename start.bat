@echo off
title YantraFlow
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Trying to install it with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo Could not install automatically. Please install Node.js LTS from https://nodejs.org
    echo then double-click start.bat again.
    start https://nodejs.org
    pause
    exit /b 1
  )
  echo.
  echo Node.js installed! Close this window and double-click start.bat again.
  pause
  exit /b 0
)

if "%PORT%"=="" set PORT=5679
echo Starting YantraFlow on http://localhost:%PORT% ...
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"
node src\server.js
pause
