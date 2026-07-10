@echo off
color 0B
title AutoBib - Smart Auto Runner
cd /d "%~dp0"

echo ==========================================
echo        AutoBib - Smart Auto Runner
echo ==========================================
echo.

if not exist "node_modules" (
    echo [!] Dependensi belum terinstall. Menginstall sekarang (harap tunggu)...
    call npm run install:all
    echo.
)

echo [1/3] Mengatur Sertifikat Keamanan SSL (Klik "Yes" jika muncul peringatan)...
call npx office-addin-dev-certs install
echo.

echo [2/3] Mendaftarkan Add-in ke Microsoft Word secara otomatis...
powershell -Command "$manifestPath = '%~dp0manifest.xml'; $manifestId = '815ccf8d-db32-45e5-aa06-d7168c74a009'; New-Item -Path 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer' -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer' -Name $manifestId -Value $manifestPath"
echo.

echo [3/3] Menyalakan Server Backend dan Frontend...
echo ==================================================
echo.
echo SERVER SEDANG BERJALAN. JANGAN TUTUP JENDELA INI!
echo Anda bisa langsung membuka Microsoft Word 2021.
echo.
echo ==================================================
call npm run dev

pause
