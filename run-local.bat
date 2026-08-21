@echo off
title Khoi chay He thong Xep hang Tu dong (Queue Management System)
color 0A
cls

echo =======================================================================
echo          KHOI CHAY HE THONG XEP HANG TU DONG (REBUILD v1.0)
echo =======================================================================
echo.

:: 1. Kiem tra SQLite database
echo [1/3] Dang kiem tra SQLite database...
if exist "prisma\dev.db" (
    echo    -^> SQLite database tim thay. Tiep tuc...
) else (
    echo    -^> Chua co SQLite database. Dang tao moi...
    npx prisma db push
    npx prisma db seed
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
