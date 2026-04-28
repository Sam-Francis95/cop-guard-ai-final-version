import os
import subprocess
import sys

# Change directory into backend
backend_dir = os.path.join(os.path.dirname(__file__), 'backend')
if os.path.exists(backend_dir):
    os.chdir(backend_dir)
else:
    print(f"Error: Backend directory not found at {backend_dir}")
    sys.exit(1) 

# Paths to the venv python and the real app.py
venv_python = os.path.join('venv', 'Scripts', 'python.exe')
app_script = 'app.py'

if not os.path.exists(venv_python):
    print(f"Error: Virtual environment not found at {os.path.abspath(venv_python)}")
    print("Please ensure the backend is set up correctly.")
    sys.exit(1)

# Launch the backend
print(f"--- Starting CopGuard Backend via {venv_python} ---")
try:
    subprocess.run([venv_python, app_script], check=True)
except KeyboardInterrupt:
    print("\n--- Backend stopped by user ---")
except subprocess.CalledProcessError as e:
    print(f"\n--- Backend crashed with error code {e.returncode} ---")
