@echo off
setlocal enabledelayedexpansion
title Workload - Ufficio Progettazione Meccanica

set "PORT=3000"

REM ============================================================
REM  1. Verifica Node.js
REM ============================================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRORE] Node.js non e' installato o non e' nel PATH.
  echo Scarica Node.js LTS da https://nodejs.org e reinstalla, poi riprova.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%V in ('node --version') do set "NODE_VER=%%V"

REM ============================================================
REM  2. Verifica npm
REM ============================================================
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRORE] npm non e' disponibile nel PATH.
  echo Reinstalla Node.js LTS ^(include npm^), poi riprova.
  echo.
  pause
  exit /b 1
)

REM ============================================================
REM  3. Posizionamento nella cartella del progetto
REM ============================================================
cd /d "%~dp0..\.."
if not exist "package.json" (
  echo [ERRORE] package.json non trovato in:
  echo    %CD%
  echo Questo file deve restare in   ...\workload-ufficio-progettazione\scripts\windows\
  echo.
  pause
  exit /b 1
)

echo ============================================================
echo   WORKLOAD - Ufficio Progettazione Meccanica
echo ============================================================
echo   Node:     !NODE_VER!
echo   Cartella: %CD%
echo ============================================================
echo.

REM ============================================================
REM  4. Controllo porta 3000
REM ============================================================
set "PID_ON_PORT="
for /f "tokens=2,5" %%A in ('netstat -ano ^| findstr /R /C:"LISTENING"') do (
  echo %%A | findstr /R /C:":%PORT%$" >nul && set "PID_ON_PORT=%%B"
)

if defined PID_ON_PORT (
  echo [ATTENZIONE] La porta %PORT% e' gia' occupata dal processo con PID !PID_ON_PORT!:
  echo.
  tasklist /FI "PID eq !PID_ON_PORT!"
  echo.
  echo Di solito significa che il server Workload e' GIA' avviato in un'altra finestra.
  echo.
  choice /C CAE /N /M "Scegli:  [C]=chiudi il processo e riavvia   [A]=apri solo l'app   [E]=esci  "
  if errorlevel 3 goto :fine
  if errorlevel 2 goto :apri_app
  echo.
  echo Chiusura del processo PID !PID_ON_PORT! in corso...
  taskkill /PID !PID_ON_PORT! /F >nul 2>nul
  ping -n 3 127.0.0.1 >nul
  echo Processo chiuso. Procedo con l'avvio.
  echo.
)

REM ============================================================
REM  5-8. Link, apertura browser e avvio server
REM ============================================================
call :mostra_link

REM Apre il browser su localhost dopo ~3s, il tempo che il server parta.
start "" /min cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:%PORT%"

echo.
echo ************************************************************
echo *  NON CHIUDERE QUESTA FINESTRA: il server si spegne.      *
echo *  Per fermare il server: chiudi la finestra o premi Ctrl+C *
echo ************************************************************
echo.
echo Avvio del server in corso...
echo.

call npm run start

echo.
echo Il server si e' fermato (finestra chiusa, Ctrl+C o errore).
goto :fine

REM ============================================================
REM  Ramo: server gia' attivo, apri solo l'app
REM ============================================================
:apri_app
echo.
call :mostra_link
start "" http://localhost:%PORT%
echo.
echo App aperta nel browser. Il server era gia' attivo: questa finestra puo' essere chiusa.
goto :fine

REM ============================================================
REM  Subroutine: stampa i link locale e di rete
REM ============================================================
:mostra_link
set "LAN_IP="
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4"') do (
  if not defined LAN_IP (
    set "CAND=%%I"
    set "CAND=!CAND: =!"
    echo !CAND! | findstr /R /C:"^127\." >nul || set "LAN_IP=!CAND!"
  )
)
echo  Link locale  (questo PC):  http://localhost:%PORT%
if defined LAN_IP (
  echo  Link in rete (colleghi):   http://!LAN_IP!:%PORT%
) else (
  echo  Link in rete (colleghi):   http://IP_DEL_PC:%PORT%    ^(IP non rilevato: vedi README^)
)
echo.
exit /b 0

:fine
echo.
echo Premi un tasto per chiudere questa finestra.
pause >nul
endlocal
