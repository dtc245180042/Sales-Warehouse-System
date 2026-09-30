@echo off
title Dong Tuong Lua - Sales Warehouse Dev
echo ======================================================================
echo   DONG TUONG LUA (REMOVE FIREWALL RULE - SALES WAREHOUSE DEV)
echo ======================================================================
echo.

powershell -Command "if (Get-NetFirewallRule -DisplayName 'Sales-Warehouse-Dev' -ErrorAction SilentlyContinue) { try { Remove-NetFirewallRule -DisplayName 'Sales-Warehouse-Dev' -ErrorAction Stop; Write-Host '[Thanh cong] Da dong va xoa luat tuong lua cho cac cong 5173 va 8000.' -ForegroundColor Green } catch { Write-Host '[Loi] Khong the xoa luat. Vui long click chuot phai va chon: Run as Administrator.' -ForegroundColor Red } } else { Write-Host '[Thong bao] Luat tuong lua Sales-Warehouse-Dev hien tai khong ton tai hoac da duoc dong truoc do.' -ForegroundColor Cyan }"

echo.
echo ======================================================================
echo.
pause
