"""
Servidor Local de Integração SGMP <-> Robô SEI
Escuta requisições na porta 18888 e aciona o robô Playwright em segundo plano
"""

import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from robo_sei import abrir_processo_sei, limpar_numero_sei

PORTA = 18888

class RequisicaoHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        # Permite chamadas CORS de qualquer origem (inclusive script.google.com e vercel.app)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "online", "modulo": "Robo SEI CBMPE"}')
            return

        if parsed.path.startswith('/abrir'):
            query_params = urllib.parse.parse_qs(parsed.query)
            numero_sei = query_params.get('sei', [''])[0]
            numero_limpo = limpar_numero_sei(numero_sei)

            if not numero_limpo:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"erro": "Parametro sei obrigatorio"}')
                return

            print(f"[SERVIDOR] Recebida solicitacao para abrir processo: {numero_limpo}")
            
            # Dispara em uma thread separada para não travar a resposta HTTP
            t = threading.Thread(target=abrir_processo_sei, args=(numero_limpo,))
            t.daemon = True
            t.start()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            resp = f'{{"sucesso": true, "processo": "{numero_limpo}"}}'.encode('utf-8')
            self.wfile.write(resp)
            return

        self.send_response(404)
        self.end_headers()

def iniciar_servidor():
    server = HTTPServer(('127.0.0.1', PORTA), RequisicaoHandler)
    print("==================================================================")
    print(f"[*] Servidor Local do Robô SEI Ativo na porta {PORTA}")
    print("    Pronto para receber cliques do Sistema SGMP!")
    print("    Para parar o servidor, pressione Ctrl + C nesta janela.")
    print("==================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Servidor encerrado.")
        server.server_close()

if __name__ == '__main__':
    iniciar_servidor()
