@echo off
chcp 65001 >nul
echo ====================================================================
echo  Configurando Protocolo sgmp-sei:// no Windows (Sem necessidade de Admin)
echo ====================================================================

set SCRIPT_DIR=%~dp0
set PYTHON_SCRIPT=%SCRIPT_DIR%robo_sei.py

:: Obtém o caminho do executável do Python
for /f "delims=" %%i in ('where python') do set PYTHON_EXE=%%i & goto :found_python
:found_python

if not defined PYTHON_EXE (
    echo [ERRO] Python nao encontrado no PATH do sistema.
    pause
    exit /b 1
)

echo Usando Python: %PYTHON_EXE%
echo Usando Script: %PYTHON_SCRIPT%

:: Registra o protocolo no Registro do Windows do usuário atual (HKCU)
reg add "HKCU\Software\Classes\sgmp-sei" /ve /d "URL:Protocolo SGMP SEI" /f >nul
reg add "HKCU\Software\Classes\sgmp-sei" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\sgmp-sei\shell" /f >nul
reg add "HKCU\Software\Classes\sgmp-sei\shell\open" /f >nul
reg add "HKCU\Software\Classes\sgmp-sei\shell\open\command" /ve /d "\"%PYTHON_EXE%\" \"%PYTHON_SCRIPT%\" \"%%1\"" /f >nul

echo.
echo [SUCESSO] Protocolo sgmp-sei:// configurado com sucesso!
echo A partir de agora, qualquer link com "sgmp-sei://[processo]" abrira
echo diretamente o robo e o documento no SEI.
echo.
pause
