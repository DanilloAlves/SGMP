@echo off
chcp 65001 >nul
title Instalador do Robô SEI - SGMP CBMPE
color 0F

echo ====================================================================
echo      INSTALADOR AUTOMÁTICO DO ROBÔ SEI-PE (SISTEMA SGMP - CBMPE)
echo ====================================================================
echo.
echo Este assistente irá verificar e configurar todos os componentes
echo necessários para que o SGMP abra e pesquise processos no SEI
echo automaticamente com 1 clique neste computador.
echo.

:: 1. Verificando o Python
echo [1/4] Verificando instalação do Python...
for /f "delims=" %%i in ('where python 2^>nul') do set PYTHON_EXE=%%i & goto :found_python
:found_python

if not defined PYTHON_EXE (
    echo.
    echo --------------------------------------------------------------------
    echo [ATENÇÃO] O Python 3 não foi detectado no seu computador.
    echo.
    echo Abrindo a página do Python na Microsoft Store do Windows...
    echo Basta clicar em "Obter" ou "Instalar" (não precisa de senha de admin).
    echo --------------------------------------------------------------------
    start ms-windows-store://pdp/?ProductId=9NCVDN91XZQP
    echo.
    echo Após concluir a instalação do Python na Microsoft Store,
    pause
    for /f "delims=" %%i in ('where python 2^>nul') do set PYTHON_EXE=%%i & goto :found_python2
    :found_python2
    if not defined PYTHON_EXE (
        echo [ERRO] Python ainda não detectado. Por favor, reinicie o instalador após a instalação.
        pause
        exit /b 1
    )
)

echo [OK] Python detectado: %PYTHON_EXE%
echo.

:: 2. Instalando Playwright e Chromium
echo [2/4] Verificando e instalando o módulo de automação (Playwright)...
"%PYTHON_EXE%" -m pip install --upgrade pip >nul 2>&1
"%PYTHON_EXE%" -m pip install playwright
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar a biblioteca Playwright via pip.
    pause
    exit /b 1
)

echo Instalando o navegador Chromium para o robô...
"%PYTHON_EXE%" -m playwright install chromium
echo [OK] Módulo Playwright e Chromium prontos!
echo.

:: 3. Definindo pasta de instalação local permanente
set DEST_DIR=%USERPROFILE%\SGMP_Robo_SEI
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

set SRC_DIR=%~dp0
copy /y "%SRC_DIR%robo_sei.py" "%DEST_DIR%\" >nul
copy /y "%SRC_DIR%servidor_sei.py" "%DEST_DIR%\" >nul
copy /y "%SRC_DIR%iniciar_servidor.bat" "%DEST_DIR%\" >nul

:: 4. Registrando o protocolo no Windows (HKCU)
echo [3/4] Registrando protocolo sgmp-sei:// no Windows...
reg add "HKCU\Software\Classes\sgmp-sei" /ve /d "URL:Protocolo SGMP SEI" /f >nul
reg add "HKCU\Software\Classes\sgmp-sei" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\sgmp-sei\shell" /f >nul
reg add "HKCU\Software\Classes\sgmp-sei\shell\open" /f >nul

:: Busca se existe pythonw.exe para rodar sem tela preta
set PYTHONW_EXE=%PYTHON_EXE:python.exe=pythonw.exe%
if not exist "%PYTHONW_EXE%" set PYTHONW_EXE=%PYTHON_EXE%

reg add "HKCU\Software\Classes\sgmp-sei\shell\open\command" /ve /d "\"%PYTHONW_EXE%\" \"%DEST_DIR%\robo_sei.py\" \"%%1\"" /f >nul
echo [OK] Protocolo sgmp-sei:// registrado com sucesso no Windows!
echo.

:: 5. Opcional: Configuração de Credenciais
echo [4/4] Configuração de Acesso ao SEI
echo.
set /p CONFIG_LOGIN="Deseja configurar seu CPF e Senha do SEI para login 100%% automático? (S/N): "
if /i "%CONFIG_LOGIN%"=="S" (
    echo.
    set /p CPF_SEI="Digite seu CPF (apenas números ou com pontos): "
    set /p PWD_SEI="Digite sua Senha do SEI: "
    echo {"usuario": "%CPF_SEI%", "senha": "%PWD_SEI%", "orgao": "CBMPE"} > "%DEST_DIR%\config_sei.json"
    echo [OK] Credenciais salvas com segurança em: %DEST_DIR%\config_sei.json
) else (
    echo [INFO] Configuração padrão mantida.
)

echo.
echo ====================================================================
echo               INSTALAÇÃO CONCLUÍDA COM SUCESSO!
echo ====================================================================
echo.
echo Todos os recursos necessários foram instalados.
echo Agora ao clicar em qualquer processo SEI no SGMP, o robô irá
echo inicializar automaticamente e abrir seu processo na tela.
echo.
pause
