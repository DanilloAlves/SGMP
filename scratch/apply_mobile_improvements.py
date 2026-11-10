# -*- coding: utf-8 -*-
import sys

with open('App.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Remessas actions bar HTML
old_remessas = """        <!-- BARRA DE AÇÕES: BOTÕES EM DESTAQUE À ESQUERDA E ATUALIZAR NO CANTO DIREITO -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <!-- BOTÕES DE AÇÃO DESTACADOS -->
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <button class="btn btn-primary fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-2" onclick="abrirModalTransferenciaEntreOmes()" title="Transferir materiais para outra OME">
              <i class="fa-solid fa-paper-plane"></i>
              <span>Transferir para outra OME</span>
            </button>
            <button class="btn btn-warning text-dark fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-2 border" onclick="abrirModalMovimentacaoInterna()" title="Remanejar materiais entre locais da sua OME">
              <i class="fa-solid fa-arrows-split-up-and-left"></i>
              <span>Remanejamento Interno</span>
            </button>
            <button class="btn btn-danger fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-2" onclick="abrirModalDescarregamentoDireto()" title="Descarregar materiais definitivamente da carga (Processo SEI)">
              <i class="fa-solid fa-box-archive"></i>
              <span>Descarregamento</span>
            </button>
          </div>

          <!-- CANTO DIREITO: FILTRO ADMIN E BOTÃO ATUALIZAR -->
          <div class="d-flex align-items-center gap-2 ms-auto">
            <div id="blocoFiltroOmeAdminRemessas" style="width: 230px; display: none;">
              <select class="form-select form-select-sm" id="selectFiltroOmeRemessas" onchange="carregarRemessasAdminPorOme()" title="Filtrar por OME">
                <option value="TODAS">Todas as OMEs</option>
              </select>
            </div>
            <!-- BOTÃO DE ATUALIZAR REMESSAS NO CANTO DIREITO -->
            <button class="btn btn-outline-secondary fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-1" onclick="carregarRemessasPendentesOme(true)" title="Atualizar lista de remessas">
              <i class="fa-solid fa-rotate me-1"></i> Atualizar
            </button>
          </div>
        </div>"""

new_remessas = """        <!-- BARRA DE AÇÕES: BOTÕES EM DESTAQUE À ESQUERDA E ATUALIZAR NO CANTO DIREITO -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 barra-acoes-remessas">
          <!-- BOTÕES DE AÇÃO DESTACADOS -->
          <div class="d-flex align-items-center gap-2 flex-wrap botoes-remessas-container">
            <button class="btn btn-primary fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-2" onclick="abrirModalTransferenciaEntreOmes()" title="Transferir materiais para outra OME">
              <i class="fa-solid fa-paper-plane"></i>
              <span>Transferir para outra OME</span>
            </button>
            <button class="btn btn-warning text-dark fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-2 border" onclick="abrirModalMovimentacaoInterna()" title="Remanejar materiais entre locais da sua OME">
              <i class="fa-solid fa-arrows-split-up-and-left"></i>
              <span>Remanejamento Interno</span>
            </button>
            <button class="btn btn-danger fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-2" onclick="abrirModalDescarregamentoDireto()" title="Descarregar materiais definitivamente da carga (Processo SEI)">
              <i class="fa-solid fa-box-archive"></i>
              <span>Descarregamento</span>
            </button>
          </div>

          <!-- CANTO DIREITO: FILTRO ADMIN E BOTÃO ATUALIZAR -->
          <div class="d-flex align-items-center gap-2 ms-auto container-filtro-remessas">
            <div id="blocoFiltroOmeAdminRemessas" style="width: 230px; display: none;">
              <select class="form-select form-select-sm" id="selectFiltroOmeRemessas" onchange="carregarRemessasAdminPorOme()" title="Filtrar por OME">
                <option value="TODAS">Todas as OMEs</option>
              </select>
            </div>
            <!-- BOTÃO DE ATUALIZAR REMESSAS NO CANTO DIREITO -->
            <button class="btn btn-outline-secondary fw-bold px-3 py-2 shadow-sm d-flex align-items-center gap-1 btn-atualizar-remessas" onclick="carregarRemessasPendentesOme(true)" title="Atualizar lista de remessas">
              <i class="fa-solid fa-rotate me-1"></i> Atualizar
            </button>
          </div>
        </div>"""

if old_remessas in content:
    content = content.replace(old_remessas, new_remessas, 1)
    print("1. Remessas markup updated")
else:
    print("1. FAILED: Remessas markup not found")

# 2. Update Checklist filter and Sign button markup
old_chk_filtros = """            <div class="col-12 d-flex justify-content-between align-items-center mt-2 pt-1 border-top">
              <span class="small text-muted" id="resumoFiltrosChecklist"><i class="fa-solid fa-filter me-1"></i>Filtre os materiais da inspeção por hierarquia ou utilize a busca rápida acima.</span>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-sm btn-outline-danger shadow-xs" onclick="abrirModalQrCodeFiltroAtual()" title="Gerar QR Code da visão selecionada">
                  <i class="fa-solid fa-qrcode me-1"></i> QR Code Deste Checklist
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="limparTodosFiltrosChecklist()">
                  <i class="fa-solid fa-eraser me-1"></i> Limpar Filtros
                </button>
              </div>
            </div>"""

new_chk_filtros = """            <div class="col-12 mt-2 pt-2 border-top barra-filtros-checklist">
              <div class="small text-muted mb-2 text-center text-md-start" id="resumoFiltrosChecklist">
                <i class="fa-solid fa-filter me-1 text-primary"></i>Filtre os materiais por hierarquia ou utilize a busca rápida.
              </div>
              <div class="d-flex align-items-center gap-2 justify-content-end botoes-filtro-checklist">
                <button type="button" class="btn btn-sm btn-outline-danger shadow-xs flex-fill flex-md-grow-0" onclick="abrirModalQrCodeFiltroAtual()" title="Gerar QR Code da visão selecionada">
                  <i class="fa-solid fa-qrcode me-1"></i> QR Code do Checklist
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary flex-fill flex-md-grow-0" onclick="limparTodosFiltrosChecklist()">
                  <i class="fa-solid fa-eraser me-1"></i> Limpar Filtros
                </button>
              </div>
            </div>"""

if old_chk_filtros in content:
    content = content.replace(old_chk_filtros, new_chk_filtros, 1)
    print("2. Checklist filters markup updated")
else:
    print("2. FAILED: Checklist filters markup not found")

old_chk_sign_btn = """              <div class="col-md-5 col-12 text-md-end text-center mt-3 mt-md-0">
                <button class="btn btn-primary fw-bold px-4 py-2 w-100 shadow-sm" onclick="enviarChecklistInconsistencias()">
                  <i class="fa-solid fa-paper-plane me-1"></i> Assinar e Enviar Checklist
                </button>
              </div>"""

new_chk_sign_btn = """              <div class="col-md-5 col-12 text-md-end text-center mt-3 mt-md-0 d-none d-md-block">
                <button class="btn btn-primary fw-bold px-4 py-2 w-100 shadow-sm" onclick="enviarChecklistInconsistencias()">
                  <i class="fa-solid fa-paper-plane me-1"></i> Assinar e Enviar Checklist
                </button>
              </div>"""

if old_chk_sign_btn in content:
    content = content.replace(old_chk_sign_btn, new_chk_sign_btn, 1)
    print("3. Checklist desktop card button hidden on mobile")
else:
    print("3. FAILED: Checklist sign button markup not found")

# 4. Update Inclusão form buttons
old_cint_btns = """          <div class="text-end mt-4">
            <button type="button" class="btn btn-secondary px-4 py-2 fw-bold me-2" onclick="limparFormularioRecebimentoCint()"><i class="fa-solid fa-eraser me-1"></i> Limpar</button>
            <button type="submit" class="btn btn-success px-5 py-2 fw-bold"><i class="fa-solid fa-check me-1"></i> Confirmar Baixa e Gerar Inventário</button>
          </div>"""

new_cint_btns = """          <div class="text-end mt-4 botoes-form-inclusao">
            <button type="button" class="btn btn-secondary px-4 py-2 fw-bold me-2 btn-limpar-inclusao" onclick="limparFormularioRecebimentoCint()"><i class="fa-solid fa-eraser me-1"></i> Limpar</button>
            <button type="submit" class="btn btn-success px-5 py-2 fw-bold btn-salvar-inclusao"><i class="fa-solid fa-check me-1"></i> Confirmar Baixa e Gerar Inventário</button>
          </div>"""

if old_cint_btns in content:
    content = content.replace(old_cint_btns, new_cint_btns, 1)
    print("4. Inclusao buttons markup updated")
else:
    print("4. FAILED: Inclusao buttons markup not found")

# 5. Update Árvore Toolbar markup
old_arvore_toolbar = """    html += `<div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
               <div class="d-flex gap-2 align-items-center flex-wrap">
                 <button class="btn btn-sm btn-outline-primary fw-bold shadow-sm" onclick="carregarLocaisArvoreGeral(true)" title="Recarregar árvore e sincronizar alterações mais recentes">
                   <i class="fa-solid fa-rotate me-1 btn-atualizar-arvore-ico"></i> Atualizar
                 </button>
                 ${podeGerenciarLocais ? `<button class="btn btn-sm btn-primary" onclick="adicionarNoArvore('', '${ome}')"><i class="fa-solid fa-plus me-1"></i> Adicionar Subunidade</button>` : ''}
                 <button class="btn btn-sm btn-outline-secondary" onclick="alternarExpansaoArvore(true)" title="Expandir Todos os Locais"><i class="fa-solid fa-angles-down me-1"></i> Expandir Tudo</button>
                 <button class="btn btn-sm btn-outline-secondary" onclick="alternarExpansaoArvore(false)" title="Recolher Todos os Locais"><i class="fa-solid fa-angles-up me-1"></i> Recolher Tudo</button>
               </div>
               <div>
                 <button class="btn btn-sm btn-outline-danger fw-bold shadow-sm" onclick="imprimirArvorePdf()" title="Imprimir em PDF a visão atual da árvore com os filtros aplicados">
                   <i class="fa-solid fa-file-pdf me-1"></i> Imprimir Árvore (PDF)
                 </button>
               </div>
             </div>`;"""

new_arvore_toolbar = """    html += `<div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2 toolbar-arvore-container">
               <div class="d-flex gap-2 align-items-center flex-wrap toolbar-arvore-btns">
                 <button class="btn btn-sm btn-outline-primary fw-bold shadow-sm" onclick="carregarLocaisArvoreGeral(true)" title="Recarregar árvore e sincronizar alterações mais recentes">
                   <i class="fa-solid fa-rotate me-1 btn-atualizar-arvore-ico"></i> Atualizar
                 </button>
                 ${podeGerenciarLocais ? `<button class="btn btn-sm btn-primary" onclick="adicionarNoArvore('', '${ome}')"><i class="fa-solid fa-plus me-1"></i> Adicionar Subunidade</button>` : ''}
                 <button class="btn btn-sm btn-outline-secondary" onclick="alternarExpansaoArvore(true)" title="Expandir Todos os Locais"><i class="fa-solid fa-angles-down me-1"></i> Expandir Tudo</button>
                 <button class="btn btn-sm btn-outline-secondary" onclick="alternarExpansaoArvore(false)" title="Recolher Todos os Locais"><i class="fa-solid fa-angles-up me-1"></i> Recolher Tudo</button>
               </div>
               <div class="toolbar-arvore-pdf">
                 <button class="btn btn-sm btn-outline-danger fw-bold shadow-sm" onclick="imprimirArvorePdf()" title="Imprimir em PDF a visão atual da árvore com os filtros aplicados">
                   <i class="fa-solid fa-file-pdf me-1"></i> Imprimir Árvore (PDF)
                 </button>
               </div>
             </div>`;"""

if old_arvore_toolbar in content:
    content = content.replace(old_arvore_toolbar, new_arvore_toolbar, 1)
    print("5. Arvore toolbar markup updated")
else:
    print("5. FAILED: Arvore toolbar markup not found")

# 6. Update Árvore node header markup (Filhos and Raízes)
old_filho_btns = """          if (htmlFilhoBtns) {
            botoesAcaoFilho = `<div>${htmlFilhoBtns}</div>`;
          }"""

new_filho_btns = """          if (htmlFilhoBtns) {
            botoesAcaoFilho = `<div class="node-actions-box">${htmlFilhoBtns}</div>`;
          }"""

if old_filho_btns in content:
    content = content.replace(old_filho_btns, new_filho_btns, 1)
    print("6.1 Filho actions box markup updated")
else:
    print("6.1 FAILED: Filho actions box markup not found")

old_filho_node = """          subHtml += `
            <div class="node-item flex-column align-items-stretch mb-2" data-id="${f.id}">
              <div class="d-flex align-items-center justify-content-between w-100">
                <span>
                  ${temMateriais ? `<button class="btn btn-sm btn-light border me-1 py-0 px-1" onclick="alternarListaMateriaisLocal('${f.id}')" id="btn_toggle_${f.id}"><i class="fa-solid fa-${filtrosAtivos.length > 0 ? 'minus' : 'plus'} small" id="icon_toggle_${f.id}"></i></button>` : ''}
                  ${iconeFilho}<strong ${ehVtrFilho ? `style="cursor:pointer;" onclick="abrirModalViaturaHibrida('${f.id}', '${f.nome.replace(/'/g, "\\'")}', '${ome}')"` : ''}>${f.nome}</strong>
                  ${badgeVtr}
                  <span class="badge bg-secondary ms-2">${totalItens} ite(ns)</span>
                </span>
                ${botoesAcaoFilho}
              </div>`;"""

new_filho_node = """          subHtml += `
            <div class="node-item flex-column align-items-stretch mb-2" data-id="${f.id}">
              <div class="d-flex align-items-center justify-content-between w-100 node-header-content">
                <div class="node-title-box">
                  ${temMateriais ? `<button class="btn btn-sm btn-light border me-1 py-0 px-1" onclick="alternarListaMateriaisLocal('${f.id}')" id="btn_toggle_${f.id}"><i class="fa-solid fa-${filtrosAtivos.length > 0 ? 'minus' : 'plus'} small" id="icon_toggle_${f.id}"></i></button>` : ''}
                  ${iconeFilho}<strong ${ehVtrFilho ? `style="cursor:pointer;" onclick="abrirModalViaturaHibrida('${f.id}', '${f.nome.replace(/'/g, "\\'")}', '${ome}')"` : ''}>${f.nome}</strong>
                  ${badgeVtr}
                  <span class="badge bg-secondary ms-1">${totalItens} ite(ns)</span>
                </div>
                ${botoesAcaoFilho}
              </div>`;"""

if old_filho_node in content:
    content = content.replace(old_filho_node, new_filho_node, 1)
    print("6.2 Filho node markup updated")
else:
    print("6.2 FAILED: Filho node markup not found")

old_raiz_btns = """        if (botoesRaizInternos.length > 0) {
          botoesAcaoRaiz = `<div>${botoesRaizInternos.join('')}</div>`;
        }"""

new_raiz_btns = """        if (botoesRaizInternos.length > 0) {
          botoesAcaoRaiz = `<div class="node-actions-box">${botoesRaizInternos.join('')}</div>`;
        }"""

if old_raiz_btns in content:
    content = content.replace(old_raiz_btns, new_raiz_btns, 1)
    print("6.3 Raiz actions box markup updated")
else:
    print("6.3 FAILED: Raiz actions box markup not found")

old_raiz_node = """        html += `
          <div class="node-item mt-2 flex-column align-items-stretch raiz-item" data-id="${l.id}">
            <div class="d-flex align-items-center justify-content-between w-100">
              <span>
                ${temMateriais ? `<button class="btn btn-sm btn-light border me-1 py-0 px-1" onclick="alternarListaMateriaisLocal('${l.id}')" id="btn_toggle_${l.id}"><i class="fa-solid fa-${filtrosAtivos.length > 0 ? 'minus' : 'plus'} small" id="icon_toggle_${l.id}"></i></button>` : ''}
                <i class="fa-solid fa-building text-primary me-2"></i><strong>${l.nome}</strong>
                <span class="badge bg-secondary ms-2">${totalItens} ite(ns)</span>
              </span>
              ${botoesAcaoRaiz}
            </div>`;"""

new_raiz_node = """        html += `
          <div class="node-item mt-2 flex-column align-items-stretch raiz-item" data-id="${l.id}">
            <div class="d-flex align-items-center justify-content-between w-100 node-header-content">
              <div class="node-title-box">
                ${temMateriais ? `<button class="btn btn-sm btn-light border me-1 py-0 px-1" onclick="alternarListaMateriaisLocal('${l.id}')" id="btn_toggle_${l.id}"><i class="fa-solid fa-${filtrosAtivos.length > 0 ? 'minus' : 'plus'} small" id="icon_toggle_${l.id}"></i></button>` : ''}
                <i class="fa-solid fa-building text-primary me-2"></i><strong>${l.nome}</strong>
                <span class="badge bg-secondary ms-1">${totalItens} ite(ns)</span>
              </div>
              ${botoesAcaoRaiz}
            </div>`;"""

if old_raiz_node in content:
    content = content.replace(old_raiz_node, new_raiz_node, 1)
    print("6.4 Raiz node markup updated")
else:
    print("6.4 FAILED: Raiz node markup not found")

# 7. Update Mobile CSS in App.html
old_mobile_css = """    /* REGRAS EXCLUSIVAS PARA SMARTPHONES E MODO MOBILE FORÇADO */
    @media (max-width: 768px), (pointer: coarse) {
      body.modo-mobile-ativo, body {
        overflow-x: hidden;
      }
      .app-header-top {
        padding: 10px 12px;
      }
      .app-title {
        font-size: 1.05rem;
      }
      .app-subtitle {
        display: none;
      }
      .top-nav-bar {
        padding: 8px 10px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        flex-wrap: nowrap;
        position: sticky;
        top: 0;
        z-index: 1020;
        background: #ffffff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.04);
      }
      .top-tabs {
        display: flex;
        gap: 6px;
        flex-wrap: nowrap;
        scrollbar-width: none;
      }
      .top-tabs::-webkit-scrollbar { display: none; }
      .top-tab-btn {
        font-size: 0.85rem;
        padding: 7px 14px;
        min-height: 42px;
        white-space: nowrap;
        border-radius: 20px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
      }
      .top-tab-btn.active {
        background-color: #991b1b !important;
        color: white !important;
        box-shadow: 0 2px 4px rgba(153, 27, 27, 0.25);
      }
      .main-layout {
        display: block;
        min-height: auto;
      }
      #sub-sidebar {
        width: 100% !important;
        border-right: none;
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 10px;
      }
      #content {
        padding: 8px 6px !important;
        width: 100% !important;
        max-width: 100vw;
        box-sizing: border-box;
      }
      .card-custom {
        padding: 10px 8px !important;
        border-radius: 10px;
      }

      /* Compactação e eliminação de bordas aninhadas na aba Checklist */
      #aba-checklist .card-custom {
        padding: 4px 2px !important;
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .ome-accordion-group {
        border-radius: 8px !important;
        margin-bottom: 8px !important;
      }
      .ome-accordion-group > .card-body {
        padding: 4px 2px !important;
      }

      .subunidade-accordion-group {
        border-radius: 8px !important;
        margin-bottom: 6px !important;
      }
      .subunidade-accordion-group > .card-header {
        padding: 6px 8px !important;
      }
      .subunidade-accordion-group > .collapse > .card-body {
        padding: 4px 2px !important;
      }

      .item-local-accordion {
        border-radius: 8px !important;
        margin-bottom: 6px !important;
      }
      .item-local-accordion .accordion-button {
        padding: 8px 34px 8px 8px !important;
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 4px !important;
        font-size: 0.92rem !important;
      }
      .item-local-accordion .accordion-button::after {
        position: absolute !important;
        right: 8px !important;
        margin-left: auto !important;
      }
      .item-local-accordion .accordion-body {
        padding: 6px 4px !important;
      }

      .card-grupo-objeto-mobile {
        margin-bottom: 6px !important;
        border-radius: 8px !important;
      }
      .header-grupo-mob {
        padding: 8px 10px !important;
      }
      .corpo-grupo-mob {
        padding: 6px 4px !important;
      }

      .card-item-checklist-mobile {
        padding: 10px 8px !important;
        margin-bottom: 8px !important;
        border-radius: 8px !important;
      }

      .banner-subnivel-mobile {
        padding: 6px 8px !important;
        margin-top: 6px !important;
        margin-bottom: 6px !important;
        font-size: 0.86rem !important;
      }

      .marca-dagua-cbmpe-container {
        top: calc(50% + 50px) !important;
      }

      .visao-desktop-checklist { display: none !important; }
      .visao-mobile-checklist { display: block !important; }

      .txt-avaria-mobile, #inputCpfMilitarChecklist, #filtroBuscaMaterialChecklist {
        font-size: 16px !important;
      }

      /* Barra de Envio Fixa no Rodapé do Mobile */
      .barra-fixa-envio-mobile {
        display: flex;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #ffffff;
        border-top: 1px solid #cbd5e1;
        padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)) 14px;
        box-shadow: 0 -4px 12px rgba(0,0,0,0.08);
        z-index: 1030;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .espacador-rodape-mobile {
        height: 80px;
        display: block;
      }
    }"""

new_mobile_css = """    /* ESTILOS DE ESTRUTURA GERAL DA ÁRVORE (DESKTOP E BASE) */
    .node-header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 8px;
    }
    .node-title-box {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px 6px;
      min-width: 0;
    }
    .node-actions-box {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    /* REGRAS EXCLUSIVAS PARA SMARTPHONES E MODO MOBILE FORÇADO */
    @media (max-width: 768px), (pointer: coarse) {
      body.modo-mobile-ativo, body {
        overflow-x: hidden;
      }

      /* 1. TOPO / CABEÇALHO COMPACTO E ELEGANTE */
      .app-header-top {
        padding: 8px 12px !important;
      }
      .app-header-top .d-flex {
        flex-wrap: nowrap !important;
      }
      .app-title {
        font-size: 0.98rem !important;
      }
      .app-subtitle {
        display: none !important;
      }
      #spanUsuarioLogado {
        max-width: 135px !important;
        display: inline-block !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        vertical-align: middle !important;
        font-size: 0.78rem !important;
      }
      .app-header-top .btn-outline-light {
        padding: 3px 8px !important;
        font-size: 0.75rem !important;
      }

      /* 2. BARRA DE ABAS SUPERIOR (PILLS MODERNAS, SEM SCROLLBAR) */
      .top-nav-bar {
        padding: 6px 8px !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        flex-wrap: nowrap !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 1020 !important;
        background: #ffffff !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
        scrollbar-width: none !important;
      }
      .top-nav-bar::-webkit-scrollbar { display: none !important; }
      .top-tabs {
        display: flex !important;
        gap: 5px !important;
        flex-wrap: nowrap !important;
        scrollbar-width: none !important;
      }
      .top-tabs::-webkit-scrollbar { display: none !important; }
      .top-tab-btn {
        font-size: 0.8rem !important;
        padding: 6px 12px !important;
        min-height: 35px !important;
        white-space: nowrap !important;
        border-radius: 18px !important;
        background: #f1f5f9 !important;
        border: 1px solid #e2e8f0 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
      }
      .top-tab-btn i {
        font-size: 0.82rem !important;
      }
      .top-tab-btn.active {
        background-color: #991b1b !important;
        color: white !important;
        box-shadow: 0 2px 4px rgba(153, 27, 27, 0.25) !important;
      }

      /* 3. LAYOUT GERAL E CARDS */
      .main-layout {
        display: block !important;
        min-height: auto !important;
      }
      #sub-sidebar {
        width: 100% !important;
        border-right: none !important;
        border-bottom: 1px solid #e2e8f0 !important;
        margin-bottom: 8px !important;
      }
      #content {
        padding: 6px 4px !important;
        width: 100% !important;
        max-width: 100vw !important;
        box-sizing: border-box !important;
      }
      .card-custom, #painelConfirmacaoOme, .card {
        padding: 10px 8px !important;
        border-radius: 10px !important;
      }

      /* 4. TABELAS RESPONSIVAS E COMPACTAS NO SMARTPHONE */
      .table {
        font-size: 0.76rem !important;
      }
      .table th, .table td {
        padding: 5px 8px !important;
        white-space: nowrap !important;
      }
      .table-responsive {
        border-radius: 8px !important;
        box-shadow: inset 0 0 3px rgba(0,0,0,0.04) !important;
        -webkit-overflow-scrolling: touch !important;
        scrollbar-width: thin !important;
      }

      /* 5. ABA MOVIMENTAÇÃO / REMESSAS PENDENTES (BOTÕES E FILTROS EM GRADE INTELIGENTE) */
      .barra-acoes-remessas {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 8px !important;
      }
      .botoes-remessas-container {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 6px !important;
        width: 100% !important;
      }
      .botoes-remessas-container .btn {
        padding: 8px 4px !important;
        font-size: 0.72rem !important;
        flex-direction: column !important;
        gap: 3px !important;
        text-align: center !important;
        border-radius: 8px !important;
        min-height: 52px !important;
        justify-content: center !important;
        line-height: 1.15 !important;
      }
      .botoes-remessas-container .btn i {
        font-size: 0.95rem !important;
      }
      .botoes-remessas-container .btn span {
        white-space: normal !important;
        display: block !important;
      }
      .container-filtro-remessas {
        width: 100% !important;
        margin-left: 0 !important;
        display: flex !important;
        gap: 6px !important;
      }
      #blocoFiltroOmeAdminRemessas {
        width: auto !important;
        flex: 1 1 auto !important;
      }
      .btn-atualizar-remessas {
        flex-shrink: 0 !important;
        padding: 6px 12px !important;
        font-size: 0.8rem !important;
      }

      /* 6. ABA INCLUSÃO / FORMULÁRIO RECEPÇÃO CINT */
      .botoes-form-inclusao {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        width: 100% !important;
        margin-top: 14px !important;
      }
      .btn-limpar-inclusao {
        flex: 0 0 32% !important;
        padding: 9px 6px !important;
        font-size: 0.82rem !important;
        margin-right: 0 !important;
        border-radius: 8px !important;
      }
      .btn-salvar-inclusao {
        flex: 1 1 68% !important;
        padding: 9px 6px !important;
        font-size: 0.82rem !important;
        border-radius: 8px !important;
        white-space: normal !important;
        line-height: 1.2 !important;
      }
      #cint_arquivoFoto {
        font-size: 0.8rem !important;
      }
      .input-group:has(#cint_arquivoFoto) .btn {
        padding: 6px 10px !important;
        font-size: 0.8rem !important;
      }

      /* 7. ABA ARMAZENAMENTO / ÁRVORE DE LOCAIS HARMONIOSA */
      #barraModoExibicaoArmazenamento {
        flex-direction: column !important;
        align-items: stretch !important;
        padding: 6px !important;
        gap: 6px !important;
      }
      #barraModoExibicaoArmazenamento > .d-flex {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 4px !important;
        width: 100% !important;
      }
      #barraModoExibicaoArmazenamento .btn-group {
        display: flex !important;
        width: 100% !important;
      }
      #barraModoExibicaoArmazenamento .btn-group .btn {
        flex: 1 1 50% !important;
        font-size: 0.78rem !important;
        padding: 6px 4px !important;
        text-align: center !important;
      }
      #acoesBarraModoArvore {
        display: none !important;
      }

      .toolbar-arvore-container {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 6px !important;
      }
      .toolbar-arvore-btns {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 6px !important;
        width: 100% !important;
      }
      .toolbar-arvore-btns .btn {
        font-size: 0.76rem !important;
        padding: 6px 6px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 6px !important;
      }
      .toolbar-arvore-pdf {
        width: 100% !important;
      }
      .toolbar-arvore-pdf .btn {
        width: 100% !important;
        font-size: 0.78rem !important;
        padding: 6px 8px !important;
        border-radius: 6px !important;
      }

      .tree-node {
        margin-left: 6px !important;
        border-left: 2px dashed #cbd5e1 !important;
        padding-left: 6px !important;
        margin-top: 4px !important;
      }
      .node-item {
        padding: 6px 8px !important;
        margin-bottom: 5px !important;
        border-radius: 8px !important;
      }
      .node-header-content {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 5px !important;
      }
      .node-title-box {
        width: 100% !important;
        font-size: 0.85rem !important;
        display: flex !important;
        align-items: center !important;
        flex-wrap: wrap !important;
        gap: 3px 5px !important;
      }
      .node-title-box strong {
        font-size: 0.86rem !important;
      }
      .node-actions-box {
        width: 100% !important;
        justify-content: flex-end !important;
        padding-top: 4px !important;
        border-top: 1px dashed #e2e8f0 !important;
        gap: 4px !important;
        display: flex !important;
      }
      .node-actions-box .btn {
        width: 30px !important;
        height: 30px !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 0.78rem !important;
        border-radius: 6px !important;
        margin: 0 !important;
        flex-shrink: 0 !important;
      }

      .node-item .list-group-item {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 4px !important;
        padding: 6px 8px !important;
      }
      .node-item .list-group-item a {
        max-width: 100% !important;
        white-space: normal !important;
        font-size: 0.82rem !important;
      }
      .node-item .list-group-item > div {
        max-width: 100% !important;
        justify-content: space-between !important;
        width: 100% !important;
      }

      /* 8. ABA CHECKLIST & INSPEÇÃO */
      .barra-filtros-checklist {
        display: flex !important;
        flex-direction: column !important;
        gap: 5px !important;
      }
      .botoes-filtro-checklist {
        display: flex !important;
        gap: 6px !important;
        width: 100% !important;
      }
      .botoes-filtro-checklist .btn {
        flex: 1 1 50% !important;
        padding: 7px 4px !important;
        font-size: 0.76rem !important;
        border-radius: 6px !important;
        text-align: center !important;
        white-space: nowrap !important;
      }

      /* Compactação e eliminação de bordas aninhadas na aba Checklist */
      #aba-checklist .card-custom {
        padding: 4px 2px !important;
        border: none !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .ome-accordion-group {
        border-radius: 8px !important;
        margin-bottom: 8px !important;
      }
      .ome-accordion-group > .card-body {
        padding: 4px 2px !important;
      }

      .subunidade-accordion-group {
        border-radius: 8px !important;
        margin-bottom: 6px !important;
      }
      .subunidade-accordion-group > .card-header {
        padding: 6px 8px !important;
      }
      .subunidade-accordion-group > .collapse > .card-body {
        padding: 4px 2px !important;
      }

      .item-local-accordion {
        border-radius: 8px !important;
        margin-bottom: 6px !important;
      }
      .item-local-accordion .accordion-button {
        padding: 8px 34px 8px 8px !important;
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 4px !important;
        font-size: 0.92rem !important;
      }
      .item-local-accordion .accordion-button::after {
        position: absolute !important;
        right: 8px !important;
        margin-left: auto !important;
      }
      .item-local-accordion .accordion-body {
        padding: 6px 4px !important;
      }

      .card-grupo-objeto-mobile {
        margin-bottom: 6px !important;
        border-radius: 8px !important;
      }
      .header-grupo-mob {
        padding: 8px 10px !important;
      }
      .corpo-grupo-mob {
        padding: 6px 4px !important;
      }

      .card-item-checklist-mobile {
        padding: 10px 8px !important;
        margin-bottom: 8px !important;
        border-radius: 8px !important;
      }

      .banner-subnivel-mobile {
        padding: 6px 8px !important;
        margin-top: 6px !important;
        margin-bottom: 6px !important;
        font-size: 0.86rem !important;
      }

      .marca-dagua-cbmpe-container {
        top: calc(50% + 50px) !important;
      }

      .visao-desktop-checklist { display: none !important; }
      .visao-mobile-checklist { display: block !important; }

      .txt-avaria-mobile, #inputCpfMilitarChecklist, #filtroBuscaMaterialChecklist {
        font-size: 16px !important;
      }

      /* Barra de Envio Fixa no Rodapé do Mobile */
      .barra-fixa-envio-mobile {
        display: flex;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #ffffff;
        border-top: 1px solid #cbd5e1;
        padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px)) 12px;
        box-shadow: 0 -4px 12px rgba(0,0,0,0.08);
        z-index: 1030;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .espacador-rodape-mobile {
        height: 75px;
        display: block;
      }
    }"""

if old_mobile_css in content:
    content = content.replace(old_mobile_css, new_mobile_css, 1)
    print("7. Mobile CSS block updated")
else:
    print("7. FAILED: Mobile CSS block not found")

with open('App.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("App.html written successfully.")
