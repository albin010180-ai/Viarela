@echo off
REM Viarela - view-only cuzdan (viarela-watch) uretici - RPC tabanli (wallet-cli GEREKMEZ, Defender sorununu astar).
REM Kullan: ana (FINAL) cuzdandan "address" (birincil 4...) + "viewkey" degerlerini sorar.
setlocal
set BASE=%~dp0
cd /d %BASE%

if not exist "tools\node_modules" (
  echo [!!] tools node_modules yok. once: cd tools  ^&^&  npm install
  exit /b 1
)

set "DAEMON=http://node.moneroworld.com:18081"
REM ^--- kendi TAILS node'un kullanilacaksa: set "DAEMON=http://192.168.1.197:18081"

node tools\make-watch-rpc.mjs