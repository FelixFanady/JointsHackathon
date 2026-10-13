@echo off
rem ============================================================
rem  SiagaKu - jalankan aplikasi HP (Flutter) di emulator Android
rem  Pemakaian:
rem    run-app.bat                      -> pakai server lokal (10.0.2.2:3000)
rem    run-app.bat https://domain-anda  -> pakai server lain (mis. HP asli)
rem ============================================================
setlocal EnableDelayedExpansion
title SiagaKu - Aplikasi Warga
cd /d "%~dp0"

set "EMULATOR_ID=SiagaKu_Pixel"
set "API_BASE=%~1"

rem --- 1. Cek Flutter -----------------------------------------
where flutter >nul 2>&1
if errorlevel 1 (
  echo [X] Flutter tidak ditemukan di PATH. Pasang Flutter dulu.
  pause & exit /b 1
)

rem --- 2. Pastikan server (dashboard Next.js) jalan -----------
rem Dicek dari port 3000 yang sedang dipakai, bukan dari jawaban halaman:
rem halaman pertama Next.js butuh waktu lama dimuat, jadi cek lewat halaman
rem bisa salah mengira server mati lalu membuka server kedua (EADDRINUSE).
if not "%API_BASE%"=="" goto server_ok
call :port_open
if "!PORT_OPEN!"=="1" (
  echo [OK] Server sudah jalan di port 3000.
  goto server_ok
)
echo [i] Server belum jalan. Membuka server di jendela baru...
if not exist "frontend\node_modules" (
  echo [i] Pertama kali: memasang paket server ^(npm install^)...
  pushd frontend & call npm install & popd
)
start "SiagaKu - Server" cmd /k "cd /d "%~dp0frontend" && npm run dev"
echo [i] Menunggu server siap...
for /l %%i in (1,1,40) do (
  call :port_open
  if "!PORT_OPEN!"=="1" goto server_ok
  timeout /t 3 /nobreak >nul
)
echo [!] Server belum siap, aplikasi tetap dijalankan. Cek jendela "SiagaKu - Server".
:server_ok

rem --- 3. Cari perangkat Android, kalau tidak ada nyalakan emulator
call :find_device
if "!DEVICE!"=="" (
  echo [i] Menyalakan emulator %EMULATOR_ID%...
  start "SiagaKu - Emulator" /min cmd /c flutter emulators --launch %EMULATOR_ID%
  echo [i] Menunggu emulator siap ^(bisa 1-3 menit^)...
  for /l %%i in (1,1,60) do (
    call :find_device
    if not "!DEVICE!"=="" goto device_ok
    timeout /t 3 /nobreak >nul
  )
  echo [X] Emulator tidak muncul. Buka Android Studio ^> Device Manager lalu coba lagi.
  pause & exit /b 1
)
:device_ok
echo [OK] Perangkat: !DEVICE!

rem Tunggu Android selesai booting
adb -s !DEVICE! wait-for-device
:boot_wait
adb -s !DEVICE! shell getprop sys.boot_completed 2>nul | findstr "1" >nul
if errorlevel 1 ( timeout /t 2 /nobreak >nul & goto boot_wait )

rem --- 4. Jalankan aplikasi -----------------------------------
cd /d "%~dp0app"
echo [i] Mengambil paket Flutter...
call flutter pub get
if errorlevel 1 ( echo [X] flutter pub get gagal. & pause & exit /b 1 )

echo.
echo [i] Menjalankan SiagaKu. Tekan r = muat ulang, R = mulai ulang, q = keluar.
echo.
if "%API_BASE%"=="" (
  call flutter run -d !DEVICE!
) else (
  echo [i] Server: %API_BASE%
  call flutter run -d !DEVICE! --dart-define=API_BASE=%API_BASE%
)
pause
exit /b 0

rem --- Ambil ID perangkat Android pertama yang aktif ----------
:find_device
set "DEVICE="
for /f "skip=1 tokens=1,2" %%a in ('adb devices 2^>nul') do (
  if "%%b"=="device" if "!DEVICE!"=="" set "DEVICE=%%a"
)
exit /b 0


rem --- Apakah ada program yang mendengarkan di port 3000? ------
:port_open
set "PORT_OPEN=0"
netstat -ano -p tcp | findstr /r /c:":3000 .*LISTENING" >nul && set "PORT_OPEN=1"
exit /b 0
