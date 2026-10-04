@echo off
title Sales and Warehouse Management System
echo ======================================================================
echo   HE THONG SALES ^& WAREHOUSE MANAGEMENT (KHOI CHAY HE THONG)
echo ======================================================================
echo.

:: 1. Kiem tra va them quy tac mo cong Firewall cho mang LAN (Port 5173, 8000)
powershell -Command "if (-not (Get-NetFirewallRule -DisplayName 'Sales-Warehouse-Dev' -ErrorAction SilentlyContinue)) { try { New-NetFirewallRule -DisplayName 'Sales-Warehouse-Dev' -Direction Inbound -LocalPort 5173,8000 -Protocol TCP -Action Allow -ErrorAction Stop | Out-Null; Write-Host '[Firewall] Da mo thanh cong cong 5173 va 8000 cho mang LAN.' -ForegroundColor Green } catch { Write-Host '[Firewall] Luu y: Chay file nay bang Run as Administrator de tu dong mo Firewall.' -ForegroundColor Yellow } } else { Write-Host '[Firewall] Luat tuong lua Sales-Warehouse-Dev da san sang.' -ForegroundColor Cyan }"

echo.
echo [1/2] Dang khoi chay Backend FastAPI (Port 8000)...
start "Backend API (Port 8000)" cmd /k "cd /d %~dp0backend && python main.py"

echo [2/2] Dang khoi chay Frontend Vite (Port 5173)...
start "Frontend Web (Port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ======================================================================
echo   HE THONG DA KHOI CHAY THANH CONG!
echo.
echo   [+] Truy cap tren may nay (Localhost):
echo       - Frontend : http://localhost:5173/
echo       - API Docs : http://localhost:8000/docs
echo.
echo   [+] Truy cap qua dien thoai / may khac trong mang LAN:
powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { Write-Host ('       - Frontend : http://' + $_.IPAddress + ':5173/  (' + $_.InterfaceAlias + ')') -ForegroundColor Green }"
echo ======================================================================
echo.
pause