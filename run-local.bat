@echo off
title Khoi chay He thong Xep hang Tu dong (Queue Management System)
color 0A
cls

echo =======================================================================
echo          KHOI CHAY HE THONG XEP HANG TU DONG (REBUILD v1.0)
echo =======================================================================
echo.

:: 1. Kiem tra PostgreSQL tren cong 5433
echo [1/3] Dang kiem tra PostgreSQL tren cong 5433...
netstat -ano | findstr :5433 >nul
if %errorlevel% equ 0 (
    echo    -^> PostgreSQL dang chay san tren cong 5433. Tiep tuc...
) else (
    echo    -^> PostgreSQL chua chay. Dang khoi dong database...
    start /B "PostgreSQL Server" "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D d:\Bamso\pgdata > pg_start.log 2>&1
    timeout /t 3 /nobreak >nul
    netstat -ano | findstr :5433 >nul
    if %errorlevel% equ 0 (
        echo    -^> Khoi dong PostgreSQL thanh cong!
    ) else (
        echo    -^> [CANH BAO] Khong the tu dong chay Postgres. Vui long kiem tra pgdata.
    )
)
echo.

:: 2. Tu dong mo trinh duyet den trang demo sau khi server san sang
echo [2/3] Dang chuan bi mo trang Demo tren trinh duyet...
start "" "http://localhost:3000/demo"
echo.

:: 3. Khoi chay Next.js Dev Server
echo [3/3] Dang khoi chay Next.js Development Server...
echo -----------------------------------------------------------------------
echo Nhan [Ctrl + C] de dung server va ket thuc phien lam viec.
echo -----------------------------------------------------------------------
echo.
npm run dev
