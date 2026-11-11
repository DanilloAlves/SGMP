"""
Robô de Automação para Abertura Direta de Processos no SEI-PE (CBMPE)
Desenvolvido para integração com o Sistema SGMP
"""

import sys
import os
import time
import urllib.parse
from playwright.sync_api import sync_playwright

# Garante que sob pythonw.exe (sem janela CMD) a execução ocorra 100% silenciosa
# e registre saídas em arquivo de log local para diagnóstico
DIR_ATUAL = os.path.dirname(os.path.abspath(__file__))
ARQUIVO_LOG = os.path.join(DIR_ATUAL, "robo_sei.log")

class LoggerSilencioso:
    def __init__(self, caminho_log):
        self.caminho_log = caminho_log
    def write(self, message):
        try:
            with open(self.caminho_log, "a", encoding="utf-8") as f:
                f.write(message)
        except Exception:
            pass
    def flush(self):
        pass

if sys.stdout is None or not sys.stdout.isatty():
    sys.stdout = LoggerSilencioso(ARQUIVO_LOG)
if sys.stderr is None or not sys.stderr.isatty():
    sys.stderr = LoggerSilencioso(ARQUIVO_LOG)

# Configurações de Acesso ao SEI
SEI_URL = "https://sei.pe.gov.br/sip/login.php?sigla_orgao_sistema=GOVPE&sigla_sistema=SEI"
USUARIO_SEI = "07400344480"
SENHA_SEI = "Da@723108"
ORGAO_SEI = "CBMPE"

def limpar_numero_sei(param):
    if not param:
        return ""
    param = urllib.parse.unquote(str(param)).strip()
    for prefix in ["sgmp-sei://", "sgmp-sei:", "sei://", "sei:"]:
        if param.lower().startswith(prefix):
            param = param[len(prefix):]
    return param.strip().strip("/").strip()

def detectar_canal_navegador():
    """
    Detecta se o Google Chrome ou Microsoft Edge estão instalados na máquina.
    Utilizar o navegador nativo (Chrome/Edge) é fundamental pois eles contêm
    o visualizador de PDF proprietário (PDFium nativo completo), permitindo
    a exibição direta e sem falhas de todos os anexos em PDF do SEI.
    """
    caminhos_chrome = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe")
    ]
    for c in caminhos_chrome:
        if os.path.exists(c):
            return "chrome"

    caminhos_edge = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    for e in caminhos_edge:
        if os.path.exists(e):
            return "msedge"

    return None

def abrir_processo_sei(numero_sei):
    numero_limpo = limpar_numero_sei(numero_sei)
    if not numero_limpo:
        print("[ERRO] Nenhum número de processo SEI foi fornecido.")
        return False

    print(f"\n=======================================================")
    print(f"[*] Iniciando Robô SEI para o Processo: {numero_limpo}")
    print(f"=======================================================\n")

    try:
        with sync_playwright() as p:
            canal = detectar_canal_navegador()

            launch_kwargs = {
                "headless": False,
                "args": [
                    "--start-maximized",
                    "--disable-blink-features=AutomationControlled",
                    "--no-default-browser-check",
                    "--no-first-run"
                ],
                # Permite que as extensões e o visualizador interno de PDF do navegador funcionem
                "ignore_default_args": [
                    "--disable-extensions",
                    "--disable-component-extensions-with-background-pages"
                ]
            }

            if canal:
                launch_kwargs["channel"] = canal
                print(f"[1/5] Abrindo navegador nativo ({canal.upper()}) com suporte a tela cheia e PDF...")
            else:
                print("[1/5] Abrindo navegador Chromium com suporte a tela cheia...")

            try:
                browser = p.chromium.launch(**launch_kwargs)
            except Exception as e_launch:
                print(f"[AVISO] Falha ao iniciar com canal {canal}: {e_launch}. Tentando Chromium padrão...")
                launch_kwargs.pop("channel", None)
                browser = p.chromium.launch(**launch_kwargs)

            # no_viewport=True garante que o navegador ocupe 100% da tela (sem restrição 1280x720)
            context = browser.new_context(
                no_viewport=True,
                accept_downloads=True
            )

            # Injeta CSS e utilitário no contexto para garantir que os iframes de visualização
            # de documentos e PDFs do SEI se expandam para 100% da janela
            context.add_init_script("""
                document.addEventListener('DOMContentLoaded', () => {
                    const style = document.createElement('style');
                    style.innerHTML = `
                        html, body {
                            width: 100% !important;
                            height: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                        }
                        #ifrVisualizacao, #ifrArvore, #divArvore, #divVisualizacao,
                        object[type="application/pdf"], embed[type="application/pdf"],
                        iframe[name="ifrVisualizacao"], iframe[name="ifrArvore"] {
                            width: 100% !important;
                            height: 100% !important;
                        }
                    `;
                    if (document.head) document.head.appendChild(style);
                });
            """)

            page = context.new_page()

            # 1. Acessa a página de autenticação
            print("[2/5] Acessando tela de login do SEI-PE...")
            page.goto(SEI_URL, wait_until="domcontentloaded")

            # 2. Preenche credenciais e seleciona CBMPE
            try:
                page.wait_for_selector("input[name='txtUsuario']", timeout=6000)
                print("[3/5] Preenchendo credenciais e selecionando órgão CBMPE...")
                page.fill("input[name='txtUsuario']", USUARIO_SEI)
                page.fill("#pwdSenha", SENHA_SEI)
                try:
                    page.select_option("#selOrgao", label=ORGAO_SEI)
                except:
                    try:
                        page.select_option("#selOrgao", value=ORGAO_SEI)
                    except:
                        pass
                
                # Clica em entrar
                page.click("button[type='submit'], #sbmAcessar")
            except Exception as e_login:
                print(f"[INFO] Tela de login não solicitada ou já autenticado: {e_login}")

            # 3. Aguarda o campo de pesquisa rápida
            print("[4/5] Aguardando tela principal do SEI...")
            page.wait_for_selector("#txtPesquisaRapida", timeout=20000)

            # 4. Tenta fechar pop-ups informativos (se existirem)
            try:
                page.click(".sparkling-modal-close img, .sparkling-modal-close, button:has-text('Fechar')", timeout=2500)
                print("       Pop-up informativo fechado com sucesso.")
            except:
                pass

            # 5. Digita o processo e abre
            print(f"[5/5] Pesquisando e abrindo processo: {numero_limpo}...")
            page.fill("#txtPesquisaRapida", numero_limpo)
            page.press("#txtPesquisaRapida", "Enter")

            print("\n[SUCESSO] Processo carregado no SEI!")
            print("[DICA] O navegador permanecerá aberto em tela cheia com suporte nativo a PDFs.")
            print("       Ao terminar de consultar os documentos, basta fechar a janela do navegador.\n")

            # Mantém a janela aberta enquanto o usuário estiver interagindo com ela
            while browser.is_connected() and len(context.pages) > 0:
                time.sleep(1)

            print("[*] Janela encerrada pelo usuário.")
            return True

    except Exception as e:
        print(f"\n[ERRO] Ocorreu uma falha na execução do robô: {e}")
        return False

if __name__ == "__main__":
    param_sei = ""
    if len(sys.argv) > 1:
        param_sei = sys.argv[1]
    else:
        try:
            param_sei = input("Digite o número do Processo SEI: ").strip()
        except:
            param_sei = "3900000160.000073/2026-04"

    abrir_processo_sei(param_sei)
