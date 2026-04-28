@echo off
echo ===================================================
echo   Starting CopGuard AI Parametric Fraud System
echo ===================================================
echo.

echo [1/2] Booting up Python Backend (Port 5000)...
start "CopGuard Backend API" cmd /k "cd backend && venv\Scripts\python.exe app.py"

echo [2/2] Booting up React Frontend (Port 5173)...
start "CopGuard Frontend UI" cmd /k "cd frontend && npm run dev"

echo Waiting 5 seconds for the local servers to boot up...
ping 127.0.0.1 -n 6 > nul

echo Opening the CopGuard Dashboard in your default browser...
start http://localhost:5173/

echo.
echo Done! The two server terminals are running in the background.
echo You can close this window now.
pause
