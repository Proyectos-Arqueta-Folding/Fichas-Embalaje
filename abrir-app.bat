@echo off
title Fichas de Embalaje - Arqueta Folding
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
timeout /t 2 /nobreak >nul
start "" http://localhost:8123/
exit
