@echo off
echo Dang khoi chay Backend va Frontend...

:: Mo cua so moi chay Backend
start cmd /k "cd backend && python main.py"

:: Mo cua so moi chay Frontend
start cmd /k "cd frontend && npm run dev"

echo Da gui lenh khoi chay thanh cong!