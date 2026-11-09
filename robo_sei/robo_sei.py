"""
Robô de Automação para Abertura Direta de Processos no SEI-PE (CBMPE)
Desenvolvido para integração com o Sistema SGMP
"""

import sys
import os
import time
import urllib.parse
from playwright.sync_api import sync_playwright

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
            # Inicia o navegador Chromium visível para o militar
            print("[1/5] Abrindo navegador...")
            browser = p.chromium.launch(headless=False)
            context = browser.new_context()
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
            print("[DICA] O navegador permanecerá aberto para sua navegação.")
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
