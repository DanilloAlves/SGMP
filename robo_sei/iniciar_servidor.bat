@echo off
chcp 65001 >nul
title Servidor Local SGMP - Robô SEI
cd /d "%~dp0"
echo ====================================================================
echo  Iniciando Servidor Local do Robô SEI (Porta 18888)
echo ====================================================================
python servidor_sei.py
pause
