@echo off
REM Viarela Monero yigin: monerod + wallet-rpc + bridge (ayri pencereler)
REM Once README'deki Adim 1-6'yi yapin (config.json + viarela-watch cuzdani).
REM Asagidaki iki sifreyi KENDINIZE GORE degistirin.
setlocal
set BASE=%~dp0
cd /d %BASE%

REM 1) Node (pruned). Kendi node'unuzu kullanmazsaniz bu satiri kapatin (# koyun) ve
REM    2. satirda --daemon-address http://node.moneroworld.com:18081 kullanin.
start "viarela-monerod" monerod.exe --prune-blockchain

REM 2) Wallet RPC (view-only). PAROLA = viarela-watch cuzdani parolasi, SIFRE = rpc-login (devamini gorun)
REM    Stagenet testi icin: her iki yere de --stagenet ekleyin, daemon 38081 olur.
start "viarela-wallet-rpc" monero-wallet-rpc.exe --wallet-file viarela-watch --wallet-password PAROLA --rpc-login viarela:SIFRE --rpc-bind-port 18283 --daemon-address http://127.0.0.1:18081

REM 3) Bridge (Supabase'e yazar; havuzu her tiklama da 50 boş adrese tamamlar)
start "viarela-bridge" node xmr-bridge.js

echo Viarela Monero yigin baslatildi. Her pencereyi kapatmak o sureci durdurur.
echo Ilk kez calistiriyorsaniz once cuzdan hazirlayin ve: npm run seed