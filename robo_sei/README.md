# Robô de Integração SEI-PE (CBMPE) <-> Sistema SGMP

Este módulo permite abrir qualquer processo do **SEI-PE** diretamente no navegador a partir de um clique no link do SEI na aba **Base de Dados** e no **Histórico do Material** do sistema SGMP.

---

## 🚀 Como Funciona

Ao clicar no número do processo SEI na tabela (ex: `3900000160.000073/2026-04`):

1. **Tentativa 1 (Servidor Local Silencioso):** O navegador tenta contatar o microservidor local em `http://127.0.0.1:18888`. Se estiver rodando, o robô abre o Chromium imediatamente sem exibir nenhuma caixa de confirmação.
2. **Tentativa 2 (Protocolo Windows `sgmp-sei://`):** Se o servidor local não estiver rodando, o navegador aciona o protocolo registrado no Windows `sgmp-sei://[numero_sei]`, iniciando o Python diretamente via sistema operacional.

O robô automatizado:
- Abre o Chromium em modo visível.
- Acessa o SEI do Estado de Pernambuco.
- Digita seu usuário e senha.
- Seleciona o órgão **CBMPE**.
- Efetua o login.
- Fecha eventuais pop-ups institucionais.
- Digita o processo informado na **Pesquisa Rápida** e pressiona Enter.
- Mantém o navegador aberto para que você possa ler e despachar o processo com total liberdade!

---

## 🛠️ Configuração Inicial (Feita Apenas Uma Vez)

### 1. Registrar o Protocolo no Windows
Execute o script PowerShell `configurar_protocolo.ps1` ou o arquivo `.bat`:
- Clique com o botão direito em `configurar_protocolo.ps1` e selecione **"Executar com o PowerShell"**.
- *(Ou execute `python -m pip install playwright && playwright install chromium` caso ainda não tenha instalado os navegadores do Playwright).*

### 2. (Opcional - Recomendado) Iniciar o Servidor Silencioso
Para que os cliques no navegador abram instantaneamente sem perguntar "Deseja abrir o aplicativo?":
- Dê um duplo clique em `iniciar_servidor.bat`.
- *(Dica: você pode criar um atalho para este arquivo na pasta `Inicializar` do Windows `shell:startup` para iniciar com o computador).*

---

## 📁 Arquivos

- `robo_sei.py`: Script principal do robô Playwright.
- `servidor_sei.py`: Micro-servidor local HTTP na porta 18888.
- `configurar_protocolo.ps1`: Registra o protocolo `sgmp-sei://` no Registro do Windows.
- `iniciar_servidor.bat`: Atalho para inicialização rápida do servidor local.
