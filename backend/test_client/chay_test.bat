@echo off
set PYTHONDONTWRITEBYTECODE=1
cd /d "%~dp0\.."

echo =========================================================================
echo       TIEN TRINH KIEM THU BACKEND VA TU DONG DO KET QUA VAO EXCEL
echo =========================================================================
echo.
echo Dang chay kiem thu va dong bo ket qua vao file Excel...
echo.

py -B test_client/runner.py %*

echo.
echo =========================================================================
echo HOAN TAT! File Excel da duoc cap nhat ket qua.
echo =========================================================================

for %%A in (%*) do (
    if /i "%%A"=="--no-pause" goto KET_THUC
)
pause

:KET_THUC
exit /b 0
