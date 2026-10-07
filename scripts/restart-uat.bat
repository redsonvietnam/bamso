@echo off
setlocal
set "REPO_ROOT=%~dp0.."
pushd "%REPO_ROOT%" || (
  echo Failed to enter BAMSO repository: "%REPO_ROOT%"
  pause
  exit /b 1
)

echo Running UAT preflight before stopping the current runtime...
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0start-uat.ps1" -Restart
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
