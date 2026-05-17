@echo off
echo ===================================================
echo   Starting CopGuard AI Parametric Fraud System
echo ===================================================
echo.

echo [1/3] Checking Frontend dependencies...
cd frontend
if not exist node_modules (
    echo Installing Frontend dependencies...
    call npm install
)
cd ..

echo [2/3] Checking Node Backend dependencies...
cd backend-node
if not exist node_modules (
    echo Installing Node Backend dependencies...
    call npm install
)
cd ..

echo [3/3] Checking Python Backend dependencies...
cd backend
if not exist venv (
    echo Creating Python virtual environment...
    python -m venv venv
    echo Installing Python Backend dependencies...
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
    deactivate
)
cd ..

echo.
echo Booting up all 3 servers...
start "CopGuard Node Backend (Port 5001)" cmd /k "cd backend-node && node server.js"
start "CopGuard Python Backend (Port 5000)" cmd /k "cd backend && venv\Scripts\python.exe app.py"
start "CopGuard Frontend UI (Port 5173)" cmd /k "cd frontend && npm run dev"

echo Waiting 5 seconds for the local servers to boot up...
ping 127.0.0.1 -n 6 > nul

echo Opening the CopGuard Dashboard in your default browser...
start http://localhost:5173/

echo.
echo Done! The servers are running in separate background windows.
echo You can close this window now.
pause
