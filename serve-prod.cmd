@echo off
REM ============================================================
REM  Avvio PRODUZIONE (senza PM2): installa, builda e avvia il
REM  server che serve frontend + API su http://<questo-pc>:3000
REM  Per tenerlo sempre online usa invece PM2 (vedi DEPLOY-LAN.md).
REM ============================================================
cd /d "%~dp0"
call npm ci || goto :err
call npm run build || goto :err
set NODE_ENV=production
set PORT=3000
set HOST=0.0.0.0
echo.
echo Server in avvio su http://localhost:3000  (LAN: http://IP-DI-QUESTO-PC:3000)
echo Premere CTRL+C per fermare.
echo.
node server/index.js
goto :eof
:err
echo.
echo [ERRORE] build o avvio non riusciti.
exit /b 1
