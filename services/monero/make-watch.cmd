@echo off
REM Viarela - view-only cuzdani (viarela-watch) olusturur.
REM Hazirlik: ana (final) cuzdanindan su iki degeri al
REM   1) address     : monero-wallet-cli'de "address" komutu (veya cuzdanin goruyusu)
REM   2) viewkey     : monero-wallet-cli'de "viewkey" komutu (genellikle .keys dosyasindan gelir)
REM Bu betik PAROLLARI terminale sen yapistirirsin; hicbir yere yazilmaz, limitede kalmaz.
setlocal
cd /d "%~dp0"

REM Node secimi:
REM   A) Public node (monerod GEREKMEZ) : set DAEMON=http://node.moneroworld.com:18081
REM   B) Kendi node'un (TAILS PC)      : set DAEMON=http://192.168.1.197:18081
set DAEMON=http://node.moneroworld.com:18081

REM Performans: sync'i cuzdanin ilk kullanim anindan baslat. Gerekirse ELEDEK YUKARIDAKI
REM satira ekle: --restore-height <bugunku-yukseklik>   (orn. --restore-height 4000000)
echo.
echo Viarela watch (view-only) cuzdani olusturuluyor.
echo Ana cuzdanin address + viewkey degerlerini gireceksin, sonra cuzdan sifresi.
echo.
bin\monero-wallet-cli.exe --generate-from-view-key viarela-watch --daemon-address %DAEMON% --subaddress-lookahead 2:500 --restore-height 3200000

if not exist "%~dp0viarela-watch.keys" (
  echo.
  echo [!] viarela-watch olusturulamadi. Yukaridaki hatalara bak.
  exit /b 1
)

echo.
echo [OK] viarela-watch.keys hazir.
echo Sonraki adimlar:
echo   1) start.local.bat  (wallet-rpc + bridge ayakta kalsin)
echo   2) npm run doctor   (her sey [OK] mi?)
echo   3) npm run seed     (adres havuzunu doldur)
echo.