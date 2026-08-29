@echo off
REM Viarela Monero stack - starts monerod, wallet-rpc and bridge in separate windows
setlocal
set BASE=%~dp0
cd /d %BASE%

REM 1) Node  (pruned)
start "viarela-monerod" monerod.exe --prune-blockchain

REM 2) Wallet RPC (view-only). Adjust names/password as in README step 4.
start "viarela-wallet-rpc" monero-wallet-rpc.exe --wallet-file viarela-watch --rpc-login viarela:CHANGE_ME --rpc-bind-port 18283 --daemon-address http://127.0.0.1:18081

REM 3) Bridge (set SUPABASE env from config.json automatically)
start "viarela-bridge" node xmr-bridge.js

echo Viarela Monero stack started. Close each window to stop that process.