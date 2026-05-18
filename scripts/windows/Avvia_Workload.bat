@echo off
setlocal

cd /d "%~dp0..\.."

echo Avvio Workload Ufficio Progettazione...
echo Cartella progetto: %CD%
echo.

npm run start

echo.
echo Il server si e' fermato oppure si e' verificato un errore.
echo Premi un tasto per chiudere questa finestra.
pause >nul
