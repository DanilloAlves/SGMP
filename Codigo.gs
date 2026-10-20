// =========================================================================

// CONFIGURAÇÕES DO SISTEMA

// =========================================================================

var ID_PLANILHA_AUXILIAR = "1VJ6dEc2K1bKt9qUTpBnqf2n6qE_bVHpgW3Ojn7_bvjY"; 

var ID_PLANILHA_COMPRAS = "1wVvcbuSW4k5o4BmZoj7EYfazBVvyk5z6n1Pdj8qgmXo";
var ABA_PLANEJAMENTO = "#PLAN";
var ABA_CATALOGO_ITENS = "#CAD_ITENS";
var ABA_DISTRIBUICAO = "#DIST";

var PROJECT_ID = "db-bigquery-escala"; 

var DATASET_ID = "db_Inventario";

var TABELA_ID = "tb_Inventario";




// IDs e ABAS de controle

var ID_PLANILHA_USUARIOS = "1VJ6dEc2K1bKt9qUTpBnqf2n6qE_bVHpgW3Ojn7_bvjY"; 

var ID_PLANILHA_TICKETS_PROVISORIOS = ID_PLANILHA_AUXILIAR; 

var ABA_USUARIOS = "Logins"; 

var ABA_LOCAIS = "Locais";                         // Aba para listas suspensas / dados gerais de locais

var ABA_LOCAIS_ARMAZENAMENTO = "Arvore"; // Aba exclusiva para a árvore hierárquica



// =========================================================================

// CONTROLE DE SESSÃO E LOGIN (DOGET)

// =========================================================================

function doGet(e) {
  var appUrl = "";
  try {
    appUrl = ScriptApp.getService().getUrl();
  } catch (errUrl) {
    console.warn("Aviso ao obter URL do App: " + errUrl.message);
    appUrl = "";
  }

  // ROTA PÚBLICA: Checklist aberto para consulta (sem necessidade de login)
  if (e && e.parameter && (e.parameter.checklist || e.parameter.c)) {
    var omeParam = e.parameter.ome || e.parameter.unidade || e.parameter.u || "";
    var subParam = e.parameter.sub || e.parameter.subunidade || e.parameter.s || "";
    var setorParam = e.parameter.setor || e.parameter.divisao || e.parameter.d || "";

    var dadosPublicos = getDadosChecklistPublico(omeParam, subParam, setorParam);

    var templatePublico = HtmlService.createTemplateFromFile('ChecklistPublico');
    templatePublico.appUrl = appUrl;
    templatePublico.dados = dadosPublicos;

    var tituloPagina = (setorParam ? setorParam + " - " : "") + "Checklist Público CBMPE";

    return templatePublico.evaluate()
      .setTitle(tituloPagina)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var paramLogin = e && e.parameter && e.parameter.auth === "true";

  if (!paramLogin) {
    var templateLogin = HtmlService.createTemplateFromFile('Login');
    templateLogin.appUrl = appUrl;
    return templateLogin.evaluate()
      .setTitle('Login - Gestão de Inventário')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var email = "";
  try {
    email = Session.getActiveUser().getEmail();
  } catch (err) {
    email = "";
  }

  var usuario = verificarPermissaoUsuario(email);

  if (usuario && (usuario.status === "INATIVO" || usuario.status === "BLOQUEADO")) {
    var templateLogin = HtmlService.createTemplateFromFile('Login');
    templateLogin.appUrl = appUrl;
    templateLogin.erro = "Acesso Bloqueado: Seu cadastro está marcado como INATIVO na tabela de Logins.";
    return templateLogin.evaluate()
      .setTitle('Acesso Bloqueado - Gestão de Inventário')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var templateIndex = HtmlService.createTemplateFromFile('App');
  templateIndex.usuarioLogado = usuario || { nome: "Usuário", email: email, perfil: "Usuário", ome: "GBI", subunidade: "GERAL", cpf: "" }; 
  templateIndex.appUrl = appUrl;

  return templateIndex.evaluate()
    .setTitle('Gestão de Inventário - CBMPE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}



function padronizarPerfilUsuario_(pRaw) {
  var pNorm = String(pRaw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (pNorm.indexOf("admin") !== -1) return "Administrador";
  if (pNorm.indexOf("comandante") !== -1 || pNorm.indexOf("chefe") !== -1) return "Comandante de Unidade";
  return "Usuário";
}

// Lista oficial das permissões operacionais do sistema
var LISTA_CHAVES_PERMISSOES = [
  "movimentar_arvore",
  "gerenciar_locais",
  "acautelamento",
  "transferir_ome",
  "recebimento_cint",
  "movimentacao_estoque",
  "validar_checklist",
  "checklist_toda_ome",
  "importar_exportar_excel"
];

function padronizarPermissoesUsuario_(permRaw, perfil) {
  var pPadrao = padronizarPerfilUsuario_(perfil);
  // Administrador e Comandante de Unidade possuem todas as permissões ativas por definição de perfil
  if (pPadrao === "Administrador" || pPadrao === "Comandante de Unidade") {
    return LISTA_CHAVES_PERMISSOES.slice();
  }

  if (!permRaw) return [];
  if (Array.isArray(permRaw)) return permRaw;

  var str = String(permRaw).trim();
  if (!str) return [];

  if (str.indexOf("[") === 0 && str.lastIndexOf("]") === str.length - 1) {
    try {
      var arr = JSON.parse(str);
      if (Array.isArray(arr)) return arr;
    } catch(e) {}
  }

  return str.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
}

function verificarPermissaoUsuario(emailOuCpfInformado) {
  try {
    var buscaAlvo = String(emailOuCpfInformado || "").trim().toLowerCase();
    
    if (!buscaAlvo) {
      try { buscaAlvo = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) { buscaAlvo = ""; }
    }
    if (!buscaAlvo) {
      try { buscaAlvo = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) { buscaAlvo = ""; }
    }
    if (!buscaAlvo) return null;

    // SEMPRE consulta diretamente a tabela de Logins (sem CacheService persistente),
    // garantindo que alterações de perfil/OME/status/permissões na planilha sejam reconhecidas em tempo real.
    var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheet = ss.getSheetByName(ABA_USUARIOS); 
    if (!sheet) return null;

    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha <= 1) return null;

    var maxCols = Math.max(sheet.getLastColumn(), 9);
    var dados = sheet.getRange(1, 1, ultimaLinha, maxCols).getValues();
    var cabecalho = dados[0];
    var idxEmail = -1, idxCpf = -1, idxNome = -1, idxOme = -1, idxPerfil = -1, idxSub = -1, idxStatus = -1, idxPermissoes = -1;
    for (var c = 0; c < cabecalho.length; c++) {
      var h = String(cabecalho[c] || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (h === "email") idxEmail = c;
      else if (h === "cpf") idxCpf = c;
      else if (h === "nome") idxNome = c;
      else if (h === "ome" || h === "unidade") idxOme = c;
      else if (h === "perfil") idxPerfil = c;
      else if (h === "subunidade") idxSub = c;
      else if (h === "status") idxStatus = c;
      else if (h === "permissoes" || h === "permissao") idxPermissoes = c;
    }
    if (idxEmail === -1) idxEmail = 0;
    if (idxCpf === -1) idxCpf = 1;
    if (idxNome === -1) idxNome = 2;
    if (idxOme === -1) idxOme = 3;
    if (idxPerfil === -1) idxPerfil = 4;
    if (idxSub === -1) idxSub = 5;
    if (idxStatus === -1) idxStatus = 7;
    if (idxPermissoes === -1 && maxCols >= 9) idxPermissoes = 8;

    var buscaAlvoNorm = buscaAlvo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var buscaAlvoLimpo = buscaAlvo.replace(/\D/g, "");
    var buscaEhEmail = buscaAlvo.indexOf("@") !== -1;

    var candidatoEncontrado = null;

    for (var i = 1; i < dados.length; i++) {
      var rowEmail = String(dados[i][idxEmail] || "").trim().toLowerCase();
      var rowCpf = String(dados[i][idxCpf] || "").trim();
      var rowNome = String(dados[i][idxNome] || "").trim();
      var rowStatus = String(dados[i][idxStatus] || "ATIVO").trim().toUpperCase();
      var rowPerm = (idxPermissoes !== -1 && idxPermissoes < dados[i].length) ? dados[i][idxPermissoes] : "";
      var rowCpfLimpo = rowCpf.replace(/\D/g, "");
      var rowNomeNorm = rowNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      var bateuEmail = (rowEmail && rowEmail === buscaAlvo);
      var bateuCpf = (buscaAlvoLimpo && rowCpfLimpo && buscaAlvoLimpo === rowCpfLimpo) || (buscaAlvo && rowCpf.toLowerCase() === buscaAlvo);
      
      // Bate por nome APENAS se a busca NÃO for e-mail nem CPF numérico, e com correspondência exata
      var bateuNome = false;
      if (!buscaEhEmail && !buscaAlvoLimpo && buscaAlvoNorm && rowNomeNorm) {
        bateuNome = (rowNomeNorm === buscaAlvoNorm);
      }

      if (bateuEmail || bateuCpf || bateuNome) {
        var cpfUser = rowCpf;
        var nomeUser = rowNome || (rowEmail ? rowEmail.split("@")[0] : "Usuário");
        var omeUser = String(dados[i][idxOme] || "").trim();
        var perfilUser = padronizarPerfilUsuario_(dados[i][idxPerfil]);
        var subunidadeUser = String(dados[i][idxSub] || "").trim();

        // O registro mais recente (último na planilha) define os dados do usuário, respeitando plenamente qualquer rebaixamento de perfil
        candidatoEncontrado = {
          nome: nomeUser,
          email: rowEmail,
          ome: obterOmePadronizada(omeUser),
          perfil: perfilUser,
          subunidade: subunidadeUser || "GERAL",
          cpf: cpfUser,
          status: rowStatus,
          permissoes: padronizarPermissoesUsuario_(rowPerm, perfilUser)
        };
      }
    }

    if (candidatoEncontrado) {
      if (candidatoEncontrado.status === "INATIVO" || candidatoEncontrado.status === "BLOQUEADO") {
        candidatoEncontrado.perfil = "Inativo";
      }
      return candidatoEncontrado;
    }

    return null;
  } catch (err) {
    console.error("Erro crítico em verificarPermissaoUsuario: " + err.message);
    return null;
  }
}



function getDadosUsuarioLogado(identificadorCliente) {
  try {
    var email = "";
    try { email = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    if (!email) {
      try { email = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    }
    if (!email && identificadorCliente) {
      email = String(identificadorCliente).trim().toLowerCase();
    }

    var usuario = verificarPermissaoUsuario(email || identificadorCliente);
    if (usuario) {
      return usuario;
    }
    
    return {
      nome: "Não Cadastrado (" + (email || identificadorCliente || "Desconhecido") + ")",
      email: email || identificadorCliente || "",
      ome: "SEM OME",
      perfil: "Usuário",
      subunidade: "GERAL",
      cpf: "",
      permissoes: []
    };
  } catch (err) {
    return {
      nome: "Erro de Sessão",
      email: "",
      ome: "ERRO",
      perfil: "Usuário",
      subunidade: "GERAL",
      cpf: "",
      permissoes: []
    };
  }
}



function verificarPermissaoBaseDados(usuario) {
  if (!usuario) return false;
  
  var perfil = (usuario.perfil || "").trim();
  
  // Acesso liberado estritamente e exclusivamente para Administradores
  return perfil === "Administrador";
}





// =========================================================================

// LER DADOS INICIAIS

// =========================================================================

function getDadosIniciais() {

  try {

    var email = "";

    try { email = Session.getActiveUser().getEmail(); } catch (e) {}

    var usuario = verificarPermissaoUsuario(email);

    // Garante consolidação da coluna única N_SERIE no BigQuery
    try {
      garantirColunaSerieUnicaInventario_();
    } catch (eSerie) {
      console.warn("Aviso ao verificar coluna de série: " + eSerie.message);
    }

    var omeRestrita = (usuario && usuario.perfil !== "Administrador" && usuario.ome) ? (typeof obterOmePadronizada === 'function' ? obterOmePadronizada(usuario.ome) : usuario.ome) : "";



    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);

    var sheet = ss.getSheetByName(ABA_LOCAIS);

    

    var locais = [], unidades = [], secoes = [], postos = [];



    if (sheet && sheet.getLastRow() > 1) {

      var dadosTotais = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();

      dadosTotais.forEach(function(linha) {

        if (linha[0]) locais.push(String(linha[0]).trim());

        if (linha[2]) {
          var uPad = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(linha[2]) : String(linha[2]).trim();
          if (uPad) unidades.push(uPad);
        }

        if (linha[3]) secoes.push(String(linha[3]).trim());

        if (linha[4]) postos.push(String(linha[4]).trim());

      });

    }



    var materiais = [];

    var sqlMat = "";

    if (omeRestrita) {

      sqlMat = "SELECT OBJETO, COUNT(*) as qtd FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE UPPER(TRIM(UNIDADE)) = '" + omeRestrita.toUpperCase().replace(/'/g, "\\'") + "' GROUP BY OBJETO ORDER BY OBJETO ASC";

    } else {

      sqlMat = "SELECT OBJETO, COUNT(*) as qtd FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` GROUP BY OBJETO ORDER BY OBJETO ASC";

    }



    var queryResults = executarConsultaBigQuerySegura(sqlMat);

    var rows = queryResults.rows || [];

    rows.forEach(function(r) {

      if (r.f && r.f[0] && r.f[0].v) {

        materiais.push({

          nome: String(r.f[0].v).trim(),

          total: parseInt(r.f[1].v || 0)

        });

      }

    });



    function limparLista(arr) {

      return [...new Set(arr)].filter(String);

    }



    return { 

      setores: limparLista(locais),

      materiais: materiais,

      unidades: limparLista(unidades),

      subunidades: limparLista(secoes),

      postos: limparLista(postos)

    };

  } catch (err) {

    console.error("Erro em getDadosIniciais: " + err.message);

    return { setores: [], materiais: [], unidades: [], subunidades: [], postos: [] };

  }

}



// =========================================================================

// LOGS E IDS

// =========================================================================

var TABELA_LOG = "tb_Log";
var tabelaLogGarantida_ = false;

function garantirTabelaLog_() {
  if (tabelaLogGarantida_) return;
  var cache = CacheService.getScriptCache();
  if (cache && cache.get("BQ_TABELA_LOG_OK")) {
    tabelaLogGarantida_ = true;
    return;
  }
  try {
    var sqlCreate = "CREATE TABLE IF NOT EXISTS `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_LOG + "` (" +
      "DATA_HORA TIMESTAMP, " +
      "CPF STRING, " +
      "NOME STRING, " +
      "ACAO STRING, " +
      "DETALHES STRING" +
    ")";
    executarEscritaBigQuerySegura(sqlCreate);
    tabelaLogGarantida_ = true;
    if (cache) {
      try { cache.put("BQ_TABELA_LOG_OK", "1", 21600); } catch(eC) {} // 6 horas
    }
  } catch (err) {
    console.warn("Aviso ao garantir tabela tb_Log: " + (err.message || String(err)));
  }
}

function registrarLogAuditoria(acao, detalhes, usuarioInfo) {
  try {
    garantirTabelaLog_();

    var cpfUsuario = "";
    var nomeUsuario = "";

    // 1. Prioridade: Parâmetro direto de usuário passado pela chamada
    if (usuarioInfo) {
      if (typeof usuarioInfo === "object") {
        cpfUsuario = usuarioInfo.cpf || usuarioInfo.CPF || "";
        nomeUsuario = usuarioInfo.nome || usuarioInfo.NOME || usuarioInfo.email || "";
      } else if (typeof usuarioInfo === "string" && usuarioInfo.trim()) {
        var uInfo = verificarPermissaoUsuario(usuarioInfo);
        if (uInfo) {
          cpfUsuario = uInfo.cpf || "";
          nomeUsuario = uInfo.nome || usuarioInfo;
        } else {
          nomeUsuario = usuarioInfo;
        }
      }
    }

    // 2. Se não encontrou, tenta pela sessão ativa do Google Apps Script
    if (!cpfUsuario || !nomeUsuario) {
      var emailSess = "";
      try { emailSess = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
      if (!emailSess) {
        try { emailSess = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e2) {}
      }
      if (emailSess) {
        var dadosUser = verificarPermissaoUsuario(emailSess);
        if (dadosUser) {
          cpfUsuario = cpfUsuario || dadosUser.cpf || "";
          nomeUsuario = nomeUsuario || dadosUser.nome || emailSess;
        } else {
          nomeUsuario = nomeUsuario || emailSess;
        }
      }
    }

    // 3. Fallback para getDadosUsuarioLogado()
    if (!cpfUsuario && !nomeUsuario) {
      try {
        var uLogado = getDadosUsuarioLogado();
        if (uLogado && uLogado.nome && uLogado.nome !== "Erro de Sessão") {
          cpfUsuario = uLogado.cpf || "";
          nomeUsuario = uLogado.nome || "";
        }
      } catch (eU) {}
    }

    if (!cpfUsuario) cpfUsuario = "SEM CPF";
    if (!nomeUsuario) nomeUsuario = "NÃO IDENTIFICADO";

    function limparSql(val) {
      if (val === null || val === undefined) return "";
      return String(val)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, " ")
        .trim();
    }

    var cpfClean = limparSql(cpfUsuario);
    var nomeClean = limparSql(nomeUsuario);
    var acaoClean = limparSql(acao);
    var detClean = limparSql(detalhes);

    var sql = "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_LOG + "` " +
              "(DATA_HORA, CPF, NOME, ACAO, DETALHES) VALUES (" +
              "CURRENT_TIMESTAMP(), '" + cpfClean + "', '" + nomeClean + "', '" + acaoClean + "', '" + detClean + "')";

    executarEscritaBigQuerySegura(sql);
    return { sucesso: true };
  } catch (err) {
    console.error("ERRO NO LOG AUDITORIA: " + (err.message || String(err)));
    return { sucesso: false, erro: err.message };
  }
}



function gerarProximoIdItem() {

  var anoAtual = new Date().getFullYear();

  var prefixo = "CBMPE-" + anoAtual + "-";

  try {

    var sql = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM LIKE '" + prefixo + "%' ORDER BY LENGTH(ITEM) DESC, ITEM DESC LIMIT 1";

    var resultado = executarEscritaBigQuerySegura(sql);

    var rows = resultado.rows || [];

    var proximoNumero = 1;

    if (rows.length > 0 && rows[0].f && rows[0].f[0].v) {

      var ultimoItem = String(rows[0].f[0].v); 

      var partes = ultimoItem.split("-");

      var numeroExtraido = parseInt(partes[partes.length - 1], 10);

      if (!isNaN(numeroExtraido)) proximoNumero = numeroExtraido + 1;

    }

    return prefixo + proximoNumero;

  } catch (e) {

    return prefixo + (Math.floor(Math.random() * 90000) + 10000);

  }

}



// =========================================================================

// ENTRADA, PESQUISA E EDIÇÃO DE ESTOQUE

// =========================================================================

var _cacheColunaSerieInventario = "N_SERIE";

/**
 * Garante que a tabela tb_Inventario utilize estritamente a coluna padronizada `N_SERIE`.
 * Caso exista qualquer coluna duplicada com caracteres especiais ou espaços (como `Nº DE SERIE`),
 * esta rotina:
 * 1. Garante que N_SERIE exista (ALTER TABLE ... ADD COLUMN IF NOT EXISTS N_SERIE STRING).
 * 2. Migra quaisquer valores de `Nº DE SERIE` para `N_SERIE` (UPDATE ... SET N_SERIE = `Nº DE SERIE`).
 * 3. Remove a coluna duplicada do BigQuery (ALTER TABLE ... DROP COLUMN IF EXISTS `Nº DE SERIE`).
 * 4. Salva em cache para evitar execuções repetidas de DDL.
 */
function garantirColunaSerieUnicaInventario_() {
  try {
    var scriptCache = CacheService.getScriptCache();
    if (scriptCache && scriptCache.get("COLUNA_SERIE_CONSOLIDADA_OK") === "true") {
      _cacheColunaSerieInventario = "N_SERIE";
      return "N_SERIE";
    }

    var sqlSchema = "SELECT * FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` LIMIT 0";
    var res = executarConsultaBigQuerySegura(sqlSchema);
    var fields = (res.schema && res.schema.fields) ? res.schema.fields : [];

    var temNSerie = false;
    var colunasParaEliminar = [];

    for (var i = 0; i < fields.length; i++) {
      var fn = String(fields[i].name || "");
      if (fn === "N_SERIE") {
        temNSerie = true;
      } else {
        var fnClean = fn.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
        if (fnClean === "N_DE_SERIE" || fnClean === "NUMERO_DE_SERIE" || fnClean.indexOf("SERIE") !== -1) {
          colunasParaEliminar.push(fn);
        }
      }
    }

    // Se N_SERIE ainda não existe, cria no BigQuery
    if (!temNSerie) {
      try {
        executarEscritaBigQuerySegura("ALTER TABLE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` ADD COLUMN IF NOT EXISTS N_SERIE STRING");
        temNSerie = true;
      } catch (eAdd) {
        console.warn("Aviso ao adicionar N_SERIE: " + eAdd.message);
      }
    }

    // Se existem colunas duplicadas (ex: `Nº DE SERIE`)
    if (colunasParaEliminar.length > 0 && temNSerie) {
      colunasParaEliminar.forEach(function(colAntiga) {
        // 1. Migra dados caso N_SERIE esteja nulo e a coluna antiga contenha valor
        try {
          var sqlMigrar = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                          "SET N_SERIE = `" + colAntiga + "` " +
                          "WHERE (N_SERIE IS NULL OR TRIM(N_SERIE) = '') AND `" + colAntiga + "` IS NOT NULL AND TRIM(`" + colAntiga + "`) != ''";
          executarEscritaBigQuerySegura(sqlMigrar);
        } catch (eUp) {
          console.warn("Aviso ao migrar valores de " + colAntiga + ": " + eUp.message);
        }

        // 2. Elimina a coluna duplicada do BigQuery
        try {
          var sqlDrop = "ALTER TABLE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` DROP COLUMN IF EXISTS `" + colAntiga + "`";
          executarEscritaBigQuerySegura(sqlDrop);
        } catch (eDrop) {
          console.warn("Aviso ao eliminar coluna " + colAntiga + ": " + eDrop.message);
        }
      });
    }

    _cacheColunaSerieInventario = "N_SERIE";
    if (scriptCache) {
      try {
        scriptCache.put("COLUNA_SERIE_CONSOLIDADA_OK", "true", 86400); // 24 horas
        scriptCache.put("COLUNA_SERIE_TB_INVENTARIO", "N_SERIE", 86400);
      } catch (eC) {}
    }

    return "N_SERIE";
  } catch (err) {
    console.error("Erro ao consolidar coluna de série: " + err.message);
    _cacheColunaSerieInventario = "N_SERIE";
    return "N_SERIE";
  }
}

/**
 * Função pública para consolidar N_SERIE e eliminar duplicadas sob demanda
 */
function consolidarEEliminarColunaSerieDuplicada() {
  try {
    // Força limpeza do cache para forçar a execução imediata
    try {
      CacheService.getScriptCache().remove("COLUNA_SERIE_CONSOLIDADA_OK");
      CacheService.getScriptCache().remove("COLUNA_SERIE_TB_INVENTARIO");
    } catch (eCache) {}

    var col = garantirColunaSerieUnicaInventario_();
    return { sucesso: true, colunaOficial: col, mensagem: "Coluna N_SERIE consolidada com sucesso e coluna duplicada eliminada." };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

/**
 * Obtém o nome exato da coluna de Número de Série na tabela tb_Inventario.
 * Padronizado estritamente para `N_SERIE`.
 */
function obterColunaSerieInventario_() {
  return "N_SERIE";
}

function registrarEntradaEstoque(dados) {
  if (dados.isNovoMaterial && dados.material) {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName(ABA_LOCAIS) || ss.getSheets()[0];
    var colunaB = sheet.getRange("B:B").getValues();
    var proximaLinhaVaziaB = 1;
    for (var j = 0; j < colunaB.length; j++) {
      if (colunaB[j][0] === "") { proximaLinhaVaziaB = j + 1; break; }
    }
    sheet.getRange(proximaLinhaVaziaB, 2).setValue(dados.material);
    registrarLogAuditoria("NOVO_CADASTRO", "Cadastrou material: " + dados.material);
    return { mensagem: "Material cadastrado com sucesso!" };
  }

  var unidadePadronizada = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados.unidade) : dados.unidade;
  var localArmazenamentoFinal = dados.localArmazenamento;
  if (!localArmazenamentoFinal && unidadePadronizada) {
    localArmazenamentoFinal = garantirSedePadraoOme(unidadePadronizada);
  }

  var quantidade = parseInt(dados.quantidade) || 1;
  var sqlValues = [];
  function limpar(texto) { return (!texto) ? '' : String(texto).replace(/'/g, "\\'").trim(); }

  var colSerie = obterColunaSerieInventario_();
  var temColSerie = !!colSerie;

  var anoAtual = new Date().getFullYear();
  var prefixo = "CBMPE-" + anoAtual + "-";
  
  var proximoNumero = Math.floor(Math.random() * 90000) + 10000;
  try {
    var sqlMax = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM LIKE '" + prefixo + "%' ORDER BY LENGTH(ITEM) DESC, ITEM DESC LIMIT 1";
    var resMax = executarEscritaBigQuerySegura(sqlMax);
    if (resMax.rows && resMax.rows.length > 0 && resMax.rows[0].f[0].v) {
      var ultimoItem = String(resMax.rows[0].f[0].v);
      var partes = ultimoItem.split("-");
      var numExtraido = parseInt(partes[partes.length - 1], 10);
      if (!isNaN(numExtraido)) proximoNumero = numExtraido + 1;
    }
  } catch (e) {
    proximoNumero = Math.floor(Math.random() * 90000) + 10000;
  }

  // TRATAMENTO RIGOROSO: Se 'bemPermanente' não vier preenchido explicitamente, grava em branco (vazio)
  var bemPermanenteValor = limpar(dados.bemPermanente);
  var numerosSerie = Array.isArray(dados.numerosSerie) ? dados.numerosSerie : [];
  var numerosPatrimonio = Array.isArray(dados.numerosPatrimonio) ? dados.numerosPatrimonio : [];

  for (var i = 0; i < quantidade; i++) {
    var codigoUnico = prefixo + (proximoNumero + i);
    var numSerieItem = (numerosSerie[i] !== undefined && numerosSerie[i] !== null) ? String(numerosSerie[i]).trim() : "";
    var patItem = (numerosPatrimonio[i] !== undefined && numerosPatrimonio[i] !== null && String(numerosPatrimonio[i]).trim() !== "") ? String(numerosPatrimonio[i]).trim() : limpar(dados.nPatrimonio);
    var obsFinal = limpar(dados.observacao);

    // Se a tabela ainda não tiver coluna própria de série, preserva no campo de observação
    if (!temColSerie && numSerieItem) {
      obsFinal = (obsFinal ? (obsFinal + " | ") : "") + "Série: " + numSerieItem;
    }

    var linhaSql = "('" + codigoUnico + "', '" + limpar(dados.material) + "', '" + limpar(dados.codEfisco) + "', '" + limpar(dados.seiCompra) + "', " + 
                   (bemPermanenteValor ? "'" + bemPermanenteValor + "'" : "NULL") + ", " + 
                   (patItem ? "'" + patItem + "'" : "NULL") + ", '" + limpar(unidadePadronizada) + "', '" + limpar(dados.subunidade) + "', '" + limpar(dados.setor) + "', '" + limpar(localArmazenamentoFinal) + "', '" + limpar(dados.statusConservacao) + "', '" + limpar(dados.postoGrad) + "', '" + limpar(dados.nomeAcautelado) + "', '" + limpar(dados.cpfAcautelado) + "', '" + limpar(dados.docSeiAcautelado) + "', '" + limpar(dados.docSeiExtraviado) + "', '" + limpar(dados.linkFoto) + "', '" + obsFinal + "'" + 
                   (temColSerie ? (", " + (numSerieItem ? "'" + limpar(numSerieItem) + "'" : "NULL")) : "") + ")";
    sqlValues.push(linhaSql);
  }

  var camposSql = "ITEM, OBJETO, COD_EFISCO, SEI_COMPRA_RECEBIMENTO, BEM_PERMANENTE_PATRIMONIAVEL_SIM_NAO, N_PATRIMONIO, UNIDADE, SUBUNIDADE, SETOR, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, STATUS, SE_ACAUTELADO_POSTO_GRAD, SE_ACAUTELADO_NOME_COMPLETO, SE_ACAUTELADO_CPF, SE_ACAUTELADO_N_DOC_SEI, SE_EXTRAVIADO_OU_SCD_N_DOC_SEI, LINK_DE_FOTO_GOOGLE_DRIVE_Somente_Leitura, OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material";
  if (temColSerie) {
    camposSql += ", `" + colSerie + "`";
  }

  var sql = "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` (" + camposSql + ") VALUES " + sqlValues.join(", ");
  
  try {
    executarEscritaBigQuerySegura(sql);

    // Registra histórico de movimentação inicial (CADASTRO)
    try {
      var eventosCad = [];
      var codigosCriadosCad = [];
      var localFormatadoCad = [dados.subunidade, dados.setor, localArmazenamentoFinal].filter(Boolean).join(" > ");
      for (var iCad = 0; iCad < quantidade; iCad++) {
        var codItemCad = prefixo + (proximoNumero + iCad);
        codigosCriadosCad.push(codItemCad);
        var serieCad = (numerosSerie[iCad] !== undefined && numerosSerie[iCad] !== null) ? String(numerosSerie[iCad]).trim() : "";
        var patCad = (numerosPatrimonio[iCad] !== undefined && numerosPatrimonio[iCad] !== null && String(numerosPatrimonio[iCad]).trim() !== "") ? String(numerosPatrimonio[iCad]).trim() : (dados.nPatrimonio || "");
        var obsCad = dados.observacao || "Entrada no estoque registrada via sistema.";
        if (serieCad) {
          obsCad += " (Série: " + serieCad + ")";
        }
        eventosCad.push({
          item: codItemCad,
          objeto: dados.material || "",
          nPatrimonio: patCad,
          tipoEvento: "CADASTRO",
          origemUnidade: "-",
          origemLocal: "-",
          destinoUnidade: unidadePadronizada || "",
          destinoLocal: localFormatadoCad,
          statusAnterior: "-",
          statusNovo: dados.statusConservacao || "ECD",
          responsavelNome: (typeof Session !== "undefined" && Session.getActiveUser().getEmail()) || "Recebimento",
          responsavelCpf: "-",
          documentoRef: dados.seiCompra || "",
          observacao: obsCad
        });
      }
      registrarHistoricoMovimentacao(eventosCad);
    } catch(eCadHist) {
      console.warn("Aviso ao registrar historico de entrada: " + eCadHist.message);
    }

    try {
      var itensCadTxt = codigosCriadosCad.length <= 10 ? codigosCriadosCad.join(", ") : (codigosCriadosCad.slice(0, 10).join(", ") + " e mais " + (codigosCriadosCad.length - 10) + " itens");
      registrarLogAuditoria(
        "ENTRADA_ESTOQUE", 
        "Cadastrou " + quantidade + " un(s) do material '" + (dados.material || "") + "'. Código(s) ITEM: [" + itensCadTxt + "] na OME " + (unidadePadronizada || "")
      );
    } catch(eLogCad) {}

  } catch (errIns) {
    try {
      var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
      var sheetContingencia = ssAux.getSheetByName("Contingencia_Inserts") || ssAux.insertSheet("Contingencia_Inserts");
      sheetContingencia.appendRow([new Date(), JSON.stringify(dados)]);
    } catch (ex) {}
    throw errIns;
  }

  return { sucesso: true, mensagem: quantidade + ' item(ns) registrado(s) com sucesso!' };
}


function pesquisarNoBigQuery(filtros) {
  try {
    var email = "";
    try { email = Session.getActiveUser().getEmail(); } catch (e) {}
    var usuario = verificarPermissaoUsuario(email);
    if (!verificarPermissaoBaseDados(usuario)) {
      throw new Error("Acesso negado: Apenas Administradores e pessoal do Recebimento podem consultar a Base de Dados.");
    }

    var colSerie = obterColunaSerieInventario_();
    var selectSerieSql = colSerie ? ("`" + colSerie + "`") : "CAST(NULL AS STRING)";

    var baseSqlWhere = " FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE 1=1";
    function limpaSQL(t) { return String(t || '').trim().replace(/'/g, "\\'"); }

    if (filtros) {
      if (filtros.itemCodigo && filtros.itemCodigo.trim() !== "") baseSqlWhere += " AND ITEM LIKE '%" + limpaSQL(filtros.itemCodigo) + "%'";
      if (filtros.termoGeral && filtros.termoGeral.trim() !== "") {
        var t = limpaSQL(filtros.termoGeral);
        var condSerieTermo = colSerie ? (" OR `" + colSerie + "` LIKE '%" + t + "%'") : "";
        baseSqlWhere += " AND (LOWER(OBJETO) LIKE LOWER('%" + t + "%') OR ITEM LIKE '%" + t + "%' OR COD_EFISCO LIKE '%" + t + "%' OR N_PATRIMONIO LIKE '%" + t + "%' OR SEI_COMPRA_RECEBIMENTO LIKE '%" + t + "%'" + condSerieTermo + ")";
      }
      if (filtros.seiCompra && filtros.seiCompra.trim() !== "") baseSqlWhere += " AND SEI_COMPRA_RECEBIMENTO = '" + limpaSQL(filtros.seiCompra) + "'";
      if (filtros.selectMaterial && filtros.selectMaterial.trim() !== "") baseSqlWhere += " AND OBJETO = '" + limpaSQL(filtros.selectMaterial) + "'";
      if (filtros.bemPermanente && filtros.bemPermanente !== "") baseSqlWhere += " AND BEM_PERMANENTE_PATRIMONIAVEL_SIM_NAO = '" + limpaSQL(filtros.bemPermanente) + "'";
      if (filtros.nPatrimonio && filtros.nPatrimonio.trim() !== "") baseSqlWhere += " AND N_PATRIMONIO = '" + limpaSQL(filtros.nPatrimonio) + "'";
      if (filtros.nSerie && filtros.nSerie.trim() !== "") {
        if (colSerie) {
          baseSqlWhere += " AND `" + colSerie + "` = '" + limpaSQL(filtros.nSerie) + "'";
        } else {
          baseSqlWhere += " AND OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material LIKE '%" + limpaSQL(filtros.nSerie) + "%'";
        }
      }
      if (filtros.codEfisco && filtros.codEfisco.trim() !== "") baseSqlWhere += " AND COD_EFISCO = '" + limpaSQL(filtros.codEfisco) + "'";
      if (filtros.unidade && filtros.unidade !== "") baseSqlWhere += " AND UPPER(TRIM(UNIDADE)) = '" + limpaSQL(obterOmePadronizada(filtros.unidade)).toUpperCase() + "'";
      if (filtros.subunidade && filtros.subunidade !== "") baseSqlWhere += " AND TRIM(SUBUNIDADE) = '" + limpaSQL(filtros.subunidade) + "'";
      if (filtros.setor && filtros.setor !== "") baseSqlWhere += " AND TRIM(SETOR) = '" + limpaSQL(filtros.setor) + "'";
      if (filtros.localArmazenamento && filtros.localArmazenamento.trim() !== "") baseSqlWhere += " AND TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario) = '" + limpaSQL(filtros.localArmazenamento) + "'";
      if (filtros.statusConservacao && filtros.statusConservacao !== "") baseSqlWhere += " AND TRIM(STATUS) = '" + limpaSQL(filtros.statusConservacao) + "'";
      if (filtros.postoGrad && filtros.postoGrad !== "") baseSqlWhere += " AND SE_ACAUTELADO_POSTO_GRAD = '" + limpaSQL(filtros.postoGrad) + "'";
      if (filtros.nomeAcautelado && filtros.nomeAcautelado.trim() !== "") baseSqlWhere += " AND LOWER(SE_ACAUTELADO_NOME_COMPLETO) LIKE LOWER('%" + limpaSQL(filtros.nomeAcautelado) + "%')";
      if (filtros.cpfAcautelado && filtros.cpfAcautelado.trim() !== "") baseSqlWhere += " AND SE_ACAUTELADO_CPF = '" + limpaSQL(filtros.cpfAcautelado) + "'";
    }

    // 1. Descobre o total geral de registros correspondentes ao filtro
    var sqlCount = "SELECT COUNT(*) as total" + baseSqlWhere;
    var resCount = executarConsultaBigQuerySegura(sqlCount);
    var totalGeral = 0;
    if (resCount.rows && resCount.rows.length > 0 && resCount.rows[0].f[0].v) {
      totalGeral = parseInt(resCount.rows[0].f[0].v, 10) || 0;
    }

    // 2. Paginação (200 itens por página para manter a alta performance)
   // Se for uma requisição de exportação em massa, usa o limite enviado; senão, mantém a página de 200 itens
    var itensPorPagina = (filtros && filtros.itensPorExportacao) ? parseInt(filtros.itensPorExportacao, 10) : 200;
    var paginaAtual = filtros && filtros.pagina ? parseInt(filtros.pagina, 10) : 1;
    if (paginaAtual < 1) paginaAtual = 1;
    var offset = (filtros && filtros.itensPorExportacao) ? 0 : ((paginaAtual - 1) * itensPorPagina);

    var sqlData = "SELECT ITEM, OBJETO, COD_EFISCO, STATUS, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, BEM_PERMANENTE_PATRIMONIAVEL_SIM_NAO, N_PATRIMONIO, UNIDADE, SUBUNIDADE, SETOR, SE_ACAUTELADO_POSTO_GRAD, SE_ACAUTELADO_NOME_COMPLETO, SE_ACAUTELADO_CPF, SE_ACAUTELADO_N_DOC_SEI, SE_EXTRAVIADO_OU_SCD_N_DOC_SEI, LINK_DE_FOTO_GOOGLE_DRIVE_Somente_Leitura, OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, SEI_COMPRA_RECEBIMENTO, " + selectSerieSql + baseSqlWhere + " LIMIT " + itensPorPagina + " OFFSET " + offset;

    var queryResults = executarConsultaBigQuerySegura(sqlData);
    var rows = queryResults.rows || [];
    var resultados = [];

    rows.forEach(function(r) {
      var nSerieVal = (r.f[18] && r.f[18].v) ? String(r.f[18].v) : "";
      var obsVal = r.f[16].v || "";
      if (!nSerieVal && obsVal) {
        var mSerie = obsVal.match(/S[eé]rie:\s*([^|;\n\r]+)/i);
        if (mSerie && mSerie[1]) nSerieVal = mSerie[1].trim();
      }
      resultados.push({
        item: r.f[0].v || "", objeto: r.f[1].v || "", codEfisco: r.f[2].v || "", status: r.f[3].v || "",
        local: r.f[4].v || "", bemPermanente: r.f[5].v || "", nPatrimonio: r.f[6].v || "", unidade: r.f[7].v || "",
        subunidade: r.f[8].v || "", setor: r.f[9].v || "", postoGrad: r.f[10].v || "", nomeAcautelado: r.f[11].v || "",
        cpfAcautelado: r.f[12].v || "", docSeiAcautelado: r.f[13].v || "", docSeiExtraviado: r.f[14].v || "",
        linkFoto: r.f[15].v || "", observacao: obsVal, seiCompra: r.f[17].v || "",
        nSerie: nSerieVal
      });
    });

    return {
      totalGeral: totalGeral,
      paginaAtual: paginaAtual,
      itensPorPagina: itensPorPagina,
      totalPaginas: Math.ceil(totalGeral / itensPorPagina) || 1,
      resultados: resultados
    };
  } catch (err) {
    throw new Error(err.message);
  }
}



function atualizarRegistro(dados) {
  try {
    var email = "";
    try { email = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    if (!email) {
      try { email = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    }
    var usuario = verificarPermissaoUsuario(email);
    if (!usuario || !usuario.email) {
      throw new Error("Acesso negado: Sessão não identificada ou e-mail não encontrado na base de Logins.");
    }

    var itemId = String(dados.item || "").trim();
    if (!itemId) throw new Error("ID do item não informado para atualização.");

    function limpar(t) { return String(t || "").replace(/'/g, "\\'").trim(); }

    var ehAdmin = ((usuario.perfil || "").trim() === "Administrador");

    var nomeMaterialAtual = "";
    var sqlCheck = "SELECT UNIDADE, OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM = '" + limpar(itemId) + "'";
    var resCheck = executarConsultaBigQuerySegura(sqlCheck);
    if (resCheck.rows && resCheck.rows.length > 0) {
      if (resCheck.rows[0].f && resCheck.rows[0].f[1] && resCheck.rows[0].f[1].v) {
        nomeMaterialAtual = String(resCheck.rows[0].f[1].v).trim();
      }
      if (!ehAdmin) {
        var omeItem = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(resCheck.rows[0].f[0].v).toUpperCase() : String(resCheck.rows[0].f[0].v || "").trim().toUpperCase();
        var omeUser = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(usuario.ome).toUpperCase() : String(usuario.ome || "").trim().toUpperCase();
        if (omeItem !== omeUser) {
          throw new Error("Acesso negado: Usuários comuns só podem editar itens lotados na sua própria OME (" + (usuario.ome || "SEM OME") + ").");
        }
      }
    }

    var sets = [];
    if (dados.objeto !== undefined) sets.push("OBJETO = '" + limpar(dados.objeto) + "'");
    if (dados.statusConservacao !== undefined) sets.push("STATUS = '" + limpar(dados.statusConservacao) + "'");
    if (dados.unidade !== undefined && ehAdmin) sets.push("UNIDADE = '" + limpar(obterOmePadronizada(dados.unidade)) + "'");
    
    if (dados.subunidade !== undefined) {
      sets.push(dados.subunidade === "__LIMPAR__" ? "SUBUNIDADE = NULL" : "SUBUNIDADE = '" + limpar(dados.subunidade) + "'");
    }
    if (dados.setor !== undefined) {
      sets.push(dados.setor === "__LIMPAR__" ? "SETOR = NULL" : "SETOR = '" + limpar(dados.setor) + "'");
    }
    if (dados.localArmazenamento !== undefined) {
      sets.push(dados.localArmazenamento === "__LIMPAR__" ? "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL" : "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = '" + limpar(dados.localArmazenamento) + "'");
    }
    if (dados.nPatrimonio !== undefined) sets.push("N_PATRIMONIO = '" + limpar(dados.nPatrimonio) + "'");
    if (dados.seiCompra !== undefined) sets.push("SEI_COMPRA_RECEBIMENTO = '" + limpar(dados.seiCompra) + "'");
    if (dados.codEfisco !== undefined) sets.push("COD_EFISCO = '" + limpar(dados.codEfisco) + "'");
    if (dados.bemPermanente !== undefined) sets.push("BEM_PERMANENTE_PATRIMONIAVEL_SIM_NAO = '" + limpar(dados.bemPermanente) + "'");
    if (dados.observacao !== undefined) sets.push("OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = '" + limpar(dados.observacao) + "'");
    if (dados.nSerie !== undefined) {
      var colSerie = obterColunaSerieInventario_();
      if (colSerie) {
        sets.push("`" + colSerie + "` = '" + limpar(dados.nSerie) + "'");
      }
    }

    if (sets.length === 0) throw new Error("Nenhum dado informado para atualizar.");

    var sql = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
              sets.join(", ") + 
              " WHERE ITEM = '" + limpar(itemId) + "'";

    executarConsultaBigQuerySegura(sql, true);
    var descMatFinal = dados.objeto || nomeMaterialAtual || "Material";
    registrarLogAuditoria(
      "EDICAO_INDIVIDUAL", 
      "Atualizou item " + itemId + " (" + descMatFinal + ") por " + usuario.nome + " (" + usuario.ome + ")",
      usuario
    );
    return "Registro atualizado com sucesso!";
  } catch (err) {
    throw new Error("Erro ao atualizar registro: " + err.message);
  }
}



function excluirRegistro(item) {

  var email = "";

  try { email = Session.getActiveUser().getEmail(); } catch (e) {}

  var usuario = verificarPermissaoUsuario(email);

  if (!verificarPermissaoBaseDados(usuario)) {

    throw new Error("Acesso negado.");

  }



  var descMaterial = "";
  try {
    var resObj = executarConsultaBigQuerySegura("SELECT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM = '" + String(item).replace(/'/g, "\\'") + "' LIMIT 1");
    if (resObj.rows && resObj.rows.length > 0 && resObj.rows[0].f && resObj.rows[0].f[0].v) {
      descMaterial = String(resObj.rows[0].f[0].v).trim();
    }
  } catch(eObj) {}

  var sql = "DELETE FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM = '" + item + "'";

  executarConsultaBigQuerySegura(sql, true);

  registrarLogAuditoria("EXCLUSAO", "Removeu item " + item + (descMaterial ? " (" + descMaterial + ")" : ""), usuario);

  return "Registro excluído permanentemente.";

}



function atualizarLotePorIds(itensIds, novosDados) {

  var email = "";

  try { email = Session.getActiveUser().getEmail(); } catch (e) {}

  var usuario = verificarPermissaoUsuario(email);

  if (!verificarPermissaoBaseDados(usuario)) {

    throw new Error("Acesso negado.");

  }



  if (!itensIds || itensIds.length === 0) throw new Error("Nenhum item selecionado.");

  

  function limpar(texto) { return String(texto || '').replace(/'/g, "\\'").trim(); }

  var sets = [];



  if (novosDados.material) sets.push("OBJETO = '" + limpar(novosDados.material) + "'");

  if (novosDados.codEfisco) sets.push("COD_EFISCO = '" + limpar(novosDados.codEfisco) + "'");

  if (novosDados.seiCompra) sets.push("SEI_COMPRA_RECEBIMENTO = '" + limpar(novosDados.seiCompra) + "'");

  if (novosDados.bemPermanente) sets.push("BEM_PERMANENTE_PATRIMONIAVEL_SIM_NAO = '" + limpar(novosDados.bemPermanente) + "'");

  if (novosDados.nPatrimonio) sets.push("N_PATRIMONIO = '" + limpar(novosDados.nPatrimonio) + "'");

  if (novosDados.unidade) sets.push("UNIDADE = '" + limpar(obterOmePadronizada(novosDados.unidade)) + "'");

  

  if (novosDados.subunidade !== undefined && novosDados.subunidade !== "") {

    if (novosDados.subunidade === "__LIMPAR__") {

      sets.push("SUBUNIDADE = NULL");

    } else {

      sets.push("SUBUNIDADE = '" + limpar(novosDados.subunidade) + "'");

    }

  }



  if (novosDados.setor !== undefined && novosDados.setor !== "") {

    if (novosDados.setor === "__LIMPAR__") {

      sets.push("SETOR = NULL");

    } else {

      sets.push("SETOR = '" + limpar(novosDados.setor) + "'");

    }

  }



  if (novosDados.localArmazenamento !== undefined && novosDados.localArmazenamento !== "") {

    if (novosDados.localArmazenamento === "__LIMPAR__") {

      sets.push("LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL");

    } else {

      sets.push("LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = '" + limpar(novosDados.localArmazenamento) + "'");

    }

  }



  if (novosDados.statusConservacao) sets.push("STATUS = '" + limpar(novosDados.statusConservacao) + "'");

  if (novosDados.postoGrad) sets.push("SE_ACAUTELADO_POSTO_GRAD = '" + limpar(novosDados.postoGrad) + "'");

  if (novosDados.nomeAcautelado) sets.push("SE_ACAUTELADO_NOME_COMPLETO = '" + limpar(novosDados.nomeAcautelado) + "'");

  if (novosDados.cpfAcautelado) sets.push("SE_ACAUTELADO_CPF = '" + limpar(novosDados.cpfAcautelado) + "'");

  if (novosDados.docSeiAcautelado) sets.push("SE_ACAUTELADO_N_DOC_SEI = '" + limpar(novosDados.docSeiAcautelado) + "'");

  if (novosDados.docSeiExtraviado) sets.push("SE_EXTRAVIADO_OU_SCD_N_DOC_SEI = '" + limpar(novosDados.docSeiExtraviado) + "'");

  if (novosDados.linkFoto) sets.push("LINK_DE_FOTO_GOOGLE_DRIVE_Somente_Leitura = '" + limpar(novosDados.linkFoto) + "'");

  if (novosDados.observacao) sets.push("OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = '" + limpar(novosDados.observacao) + "'");
  if (novosDados.nSerie !== undefined && novosDados.nSerie !== "") {
    var colSerie = obterColunaSerieInventario_();
    if (colSerie) {
      sets.push("`" + colSerie + "` = '" + limpar(novosDados.nSerie) + "'");
    }
  }

  if (sets.length === 0) throw new Error("Nenhum campo de alteração foi informado.");



  var listaItensSql = itensIds.map(function(id) { return "'" + limpar(id) + "'"; }).join(",");

  var sql = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " + sets.join(", ") + " WHERE ITEM IN (" + listaItensSql + ")";

  

  executarConsultaBigQuerySegura(sql, true);

  // Registra histórico de movimentação/alteração cadastral para os itens editados
  try {
    var emailUserLote = "";
    try { emailUserLote = Session.getActiveUser().getEmail(); } catch(eU) {}
    var userLogadoLote = emailUserLote ? verificarPermissaoUsuario(emailUserLote) : null;
    var respNomeLote = (userLogadoLote && userLogadoLote.nome) || "Administrador";
    var respCpfLote = (userLogadoLote && userLogadoLote.cpf) || "-";
    var localFormatadoEdit = [novosDados.subunidade, novosDados.setor, novosDados.localArmazenamento].filter(Boolean).join(" > ");
    var descMudancas = sets.join(", ");

    var eventosEdit = [];
    for (var idxE = 0; idxE < itensIds.length; idxE++) {
      eventosEdit.push({
        item: itensIds[idxE],
        objeto: novosDados.material || "",
        nPatrimonio: novosDados.nPatrimonio || "",
        tipoEvento: "EDICAO_CADASTRO",
        origemUnidade: "-",
        origemLocal: "-",
        destinoUnidade: novosDados.unidade || "-",
        destinoLocal: localFormatadoEdit || "-",
        statusAnterior: "-",
        statusNovo: novosDados.statusConservacao || "-",
        responsavelNome: respNomeLote,
        responsavelCpf: respCpfLote,
        documentoRef: novosDados.seiCompra || "-",
        observacao: "Edição cadastral em lote: " + descMudancas
      });
    }
    registrarHistoricoMovimentacao(eventosEdit);
  } catch (eHEdit) {
    console.warn("Aviso ao gravar histórico de edição em lote: " + eHEdit.message);
  }

  var descMatsLote = [];
  if (novosDados.material || novosDados.objeto) {
    descMatsLote.push(novosDados.material || novosDados.objeto);
  } else {
    try {
      var idsSqlLote = itensIds.slice(0, 15).map(function(id) { return "'" + String(id).replace(/'/g, "\\'") + "'"; }).join(",");
      var resMLote = executarConsultaBigQuerySegura("SELECT DISTINCT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + idsSqlLote + ")");
      if (resMLote.rows) {
        resMLote.rows.forEach(function(r) { if (r.f && r.f[0] && r.f[0].v) descMatsLote.push(r.f[0].v); });
      }
    } catch(eM) {}
  }
  var descMatTxtLote = descMatsLote.length > 0 ? " (" + descMatsLote.join(", ") + ")" : "";
  var itensTxtLote = itensIds.length <= 10 ? itensIds.join(", ") : (itensIds.slice(0, 10).join(", ") + " e mais " + (itensIds.length - 10) + " itens");
  registrarLogAuditoria("EDICAO_EM_MASSA", "Atualizou " + itensIds.length + " item(ns) em lote" + descMatTxtLote + ". Código(s) ITEM: [" + itensTxtLote + "]", userLogadoLote);

  return "Atualização aplicada com sucesso em " + itensIds.length + " item(ns)!";

}



function excluirLotePorIds(itensIds) {

  try {

    var email = "";

    try { email = Session.getActiveUser().getEmail(); } catch (e) {}

    var usuario = verificarPermissaoUsuario(email);

    if (!verificarPermissaoBaseDados(usuario)) {

      throw new Error("Acesso negado.");

    }



    if (!itensIds || itensIds.length === 0) throw new Error("Nenhum item selecionado.");

    

    function limpar(texto) { return String(texto || '').replace(/'/g, "\\'").trim(); }

    

    var listaItensSql = itensIds.map(function(id) { 

      return "'" + limpar(id) + "'"; 

    }).join(",");



    var descMatsExc = [];
    try {
      var idsSqlExc = itensIds.slice(0, 15).map(function(id) { return "'" + limpar(id) + "'"; }).join(",");
      var resMExc = executarConsultaBigQuerySegura("SELECT DISTINCT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + idsSqlExc + ")");
      if (resMExc.rows) {
        resMExc.rows.forEach(function(r) { if (r.f && r.f[0] && r.f[0].v) descMatsExc.push(r.f[0].v); });
      }
    } catch(eMExc) {}

    var sql = "DELETE FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + listaItensSql + ")";

    executarConsultaBigQuerySegura(sql, true);

    var descMatTxtExc = descMatsExc.length > 0 ? " (" + descMatsExc.join(", ") + ")" : "";
    var itensTxtExc = itensIds.length <= 10 ? itensIds.join(", ") : (itensIds.slice(0, 10).join(", ") + " e mais " + (itensIds.length - 10) + " itens");
    registrarLogAuditoria("EXCLUSAO_EM_MASSA", "Removeu " + itensIds.length + " item(ns) em lote" + descMatTxtExc + ". Código(s) ITEM: [" + itensTxtExc + "]", usuario);

    return "Total de " + itensIds.length + " item(ns) excluído(s) com sucesso!";

  } catch (err) {

    throw new Error("Erro ao excluir itens: " + err.message);

  }

}



// =========================================================================

// GESTÃO DA ÁRVORE DE LOCAIS

// =========================================================================

function getArvoreLocais(unidadeOmega) {

  try {

    var omePadrao = obterOmePadronizada(unidadeOmega); // APLICA O TRADUTOR

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);

    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);

    

    if (!sheet) {

      sheet = ss.insertSheet(ABA_LOCAIS_ARMAZENAMENTO);

      sheet.appendRow(["ID_Local", "Unidade_OME", "Nome_Local", "ID_Pai"]);

      return [];

    }



    var omePadraoFormatado = omePadrao ? (typeof obterOmePadronizada === 'function' ? obterOmePadronizada(omePadrao) : omePadrao) : "";
    var idSedeOficial = omePadraoFormatado ? garantirSedePadraoOme(omePadraoFormatado) : "";

    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha <= 1) return [];

    var dados = sheet.getRange(2, 1, ultimaLinha - 1, 4).getValues();
    var locais = [];
    var mapaGhostIds = {};

    // 1ª passada: identifica nós raiz fantasmas cujo nome seja puramente equivalente ao da OME
    dados.forEach(function(linha) {
      var OMELinha = obterOmePadronizada(linha[1]);
      var idLocal = String(linha[0] || "").trim();
      var nomeLocal = String(linha[2] || "").trim();
      var idPai = String(linha[3] || "").trim();

      if (idLocal && nomeLocal) {
        if (!omePadraoFormatado || OMELinha.toUpperCase() === omePadraoFormatado.toUpperCase()) {
          if (!idPai && nomeLocal.toUpperCase() !== "SEDE" && ehSubunidadeEquivalenteOme_(nomeLocal, OMELinha)) {
            mapaGhostIds[idLocal] = true;
          }
        }
      }
    });

    // 2ª passada: inclui nós legítimos na árvore e re-aponta filhos do nó fantasma para a SEDE oficial
    dados.forEach(function(linha) {
      var OMELinha = obterOmePadronizada(linha[1]);
      var idLocal = String(linha[0] || "").trim();
      var nomeLocal = String(linha[2] || "").trim();
      var idPai = String(linha[3] || "").trim();

      if (idLocal && nomeLocal) {
        if (!omePadraoFormatado || OMELinha.toUpperCase() === omePadraoFormatado.toUpperCase()) {
          // Filtra nós raiz fantasmas
          if (mapaGhostIds[idLocal]) {
            return;
          }

          var idPaiEfetivo = idPai;
          if (idPai && mapaGhostIds[idPai]) {
            idPaiEfetivo = idSedeOficial || "";
          }

          locais.push({
            id: idLocal,
            ome: OMELinha,
            nome: nomeLocal,
            idPai: idPaiEfetivo
          });
        }
      }
    });



    return locais;

  } catch (err) {

    console.error("Erro em getArvoreLocais: " + err.message);

    return [];

  }

}



function adicionarLocalNaArvore(dadosLocal) {
  try {
    var usuarioSessao = null;
    try {
      usuarioSessao = getDadosUsuarioLogado();
    } catch(e) {}
    
    if (usuarioSessao && usuarioSessao.perfil) {
      var perfilStr = String(usuarioSessao.perfil).trim().toLowerCase();
      if (perfilStr === "usuário" || perfilStr === "usuario") {
        throw new Error("Acesso restrito: usuários com perfil 'Usuário' não possuem permissão para adicionar subunidades ou locais.");
      }
    }

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);

    if (!sheet) {
      sheet = ss.insertSheet(ABA_LOCAIS_ARMAZENAMENTO);
      sheet.appendRow(["ID_Local", "Unidade_OME", "Nome_Local", "ID_Pai"]);
    }

    var omeAlvo = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dadosLocal.ome || "") : String(dadosLocal.ome || "").trim();
    var nomeAlvo = String(dadosLocal.nome || "").trim();
    var idPaiAlvo = String(dadosLocal.idPai || "").trim();

    if (!nomeAlvo) {
      throw new Error("O nome da subunidade ou local não pode estar vazio.");
    }

    if (!idPaiAlvo) {
      if (nomeAlvo.toUpperCase() === "SEDE") {
        throw new Error("A 'SEDE' já é a raiz padrão da OME e não pode ser recriada manualmente.");
      }
      if (ehSubunidadeEquivalenteOme_(nomeAlvo, omeAlvo)) {
        throw new Error("O nome da subunidade não pode ser igual ao nome da OME. Para a unidade principal, utilize a 'SEDE'.");
      }
    }

    // Validação de duplicidade na árvore da mesma OME
    var dados = sheet.getDataRange().getValues();
    if (dados.length > 1) {
      for (var i = 1; i < dados.length; i++) {
        var rowOme = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados[i][1]) : String(dados[i][1] || "").trim();
        var rowNome = String(dados[i][2] || "").trim();
        var rowIdPai = String(dados[i][3] || "").trim();

        if (rowOme.toUpperCase() === omeAlvo.toUpperCase()) {
          // Se for subunidade raiz (sem idPai ou idPai igual à OME)
          if (!idPaiAlvo) {
            if ((!rowIdPai || rowIdPai === rowOme) && rowNome.toUpperCase() === nomeAlvo.toUpperCase()) {
              throw new Error("A subunidade '" + nomeAlvo + "' já foi criada anteriormente para a unidade " + omeAlvo + ".");
            }
          } else {
            // Se for subnível, valida duplicidade no mesmo nível/pai
            if (rowIdPai === idPaiAlvo && rowNome.toUpperCase() === nomeAlvo.toUpperCase()) {
              throw new Error("O local '" + nomeAlvo + "' já existe neste nível.");
            }
          }
        }
      }
    }

    var novoId = "loc_" + new Date().getTime();

    sheet.appendRow([
      novoId,
      omeAlvo,
      nomeAlvo,
      idPaiAlvo
    ]);

    registrarLogAuditoria("NOVO_LOCAL_ARVORE", "Adicionou '" + nomeAlvo + "' na OME " + omeAlvo);

    return { sucesso: true, id: novoId, mensagem: "Local adicionado com sucesso!" };

  } catch (err) {
    var msgLimpa = (err.message || "").replace(/^Erro ao salvar local:\s*/, "");
    throw new Error(msgLimpa);
  }
}




function excluirLocalDaArvore(idLocal) {
  try {
    var usuarioSessao = null;
    try {
      usuarioSessao = getDadosUsuarioLogado();
    } catch(e) {}
    
    if (usuarioSessao && usuarioSessao.perfil) {
      var perfilStr = String(usuarioSessao.perfil).trim().toLowerCase();
      if (perfilStr === "usuário" || perfilStr === "usuario") {
        throw new Error("Acesso restrito: usuários com perfil 'Usuário' não possuem permissão para excluir locais.");
      }
    }

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);

    if (!sheet) return "Aba não encontrada.";



    var dados = sheet.getDataRange().getValues();

    for (var i = dados.length - 1; i >= 1; i--) {

      if (String(dados[i][0]).trim() === String(idLocal).trim()) {

        sheet.deleteRow(i + 1);

        break;

      }

    }



    registrarLogAuditoria("EXCLUSAO_LOCAL_ARVORE", "Removeu o local ID: " + idLocal);

    return "Local removido com sucesso!";

  } catch (err) {

    throw new Error("Erro ao excluir local: " + err.message);

  }

}



function getAppUrl() {

  return ScriptApp.getService().getUrl();

}



function vistarEAtrelarMateriaisAoLocal(idLocal, nomeLocal, itensDistribuicao) {

  try {

    return "Materiais atrelados e distribuídos com sucesso ao local: " + nomeLocal;

  } catch (err) {

    throw new Error("Erro ao atrelar materiais: " + err.message);

  }

}



function atualizarPaiLocalArvore(idLocal, novoIdPai) {
  try {
    var usuarioSessao = null;
    try {
      usuarioSessao = getDadosUsuarioLogado();
    } catch(e) {}
    
    if (usuarioSessao && usuarioSessao.perfil) {
      var perfilStr = String(usuarioSessao.perfil).trim().toLowerCase();
      if (perfilStr === "usuário" || perfilStr === "usuario") {
        throw new Error("Acesso restrito: usuários com perfil 'Usuário' não possuem permissão para alterar a hierarquia de locais.");
      }
    }

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);

    if (!sheet) return "Aba não encontrada.";



    var dados = sheet.getDataRange().getValues();

    for (var i = 1; i < dados.length; i++) {

      if (String(dados[i][0]).trim() === String(idLocal).trim()) {

        sheet.getRange(i + 1, 4).setValue(String(novoIdPai).trim());

        try {
          registrarLogAuditoria("ALTERACAO_PAI_LOCAL_ARVORE", "Alterou hierarquia do local " + idLocal + " para novo pai: " + novoIdPai);
        } catch(eLogPai) {}

        break;

      }

    }

    return "Hierarquia atualizada com sucesso!";

  } catch (err) {

    throw new Error("Erro ao atualizar hierarquia: " + err.message);

  }

}



function garantirSedePadraoOme(ome) {
  try {
    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(ome) : String(ome || "").trim();
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
    if (!sheet) return null;

    var dados = sheet.getDataRange().getValues();
    var omeTrim = omePadrao.toUpperCase();
    var omeTrimNorm = omeTrim.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");

    var sedsEncontradas = [];

    for (var r = 1; r < dados.length; r++) {
      var rowOmeBruto = String(dados[r][1] || "").trim();
      var omeLinha = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(rowOmeBruto).toUpperCase() : rowOmeBruto.toUpperCase();
      var omeLinhaNorm = omeLinha.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
      var nomeLinha = String(dados[r][2] || "").trim();

      if (omeLinha === omeTrim || omeLinhaNorm === omeTrimNorm) {
        if (nomeLinha.toUpperCase() === "SEDE") {
          sedsEncontradas.push({ linha: r + 1, id: String(dados[r][0]).trim() });
        }
      }
    }

    var idSede = "";
    if (sedsEncontradas.length > 0) {
      idSede = sedsEncontradas[0].id;
      // Apaga apenas SEDEs duplicadas de baixo pra cima
      if (sedsEncontradas.length > 1) {
        for (var j = sedsEncontradas.length - 1; j >= 1; j--) {
          sheet.deleteRow(sedsEncontradas[j].linha);
        }
      }
    } else {
      idSede = "SEDE_" + omeTrim.replace(/[^A-Z0-9]/g, "_") + "_" + new Date().getTime();
      sheet.appendRow([idSede, omePadrao, "SEDE", ""]);
      SpreadsheetApp.flush();
    }

    return idSede;
  } catch (err) {
    throw new Error("Erro ao garantir estrutura padrão OME: " + err.message);
  }
}



function getMateriaisAtreladosPorLocal(unidadeOmega) {
  try {
    var omePadrao = obterOmePadronizada(unidadeOmega);
    if (!omePadrao) return {};

    var idSedeOficial = garantirSedePadraoOme(omePadrao);

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetArvore = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
    var mapaNomesLocais = {}; 
    var mapaNos = {};
    var mapaCaminhos = {};
    var mapaGhostIds = {};

    if (sheetArvore && sheetArvore.getLastRow() > 1) {
      var dadosArvore = sheetArvore.getRange(2, 1, sheetArvore.getLastRow() - 1, 4).getValues();

      // 1ª passada: registra nós válidos e identifica nós raiz fantasmas que repetem a OME
      dadosArvore.forEach(function(linha) {
        var omeLinha = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(linha[1]) : String(linha[1] || "").trim();
        var idLocal = String(linha[0] || "").trim();
        var nomeLocal = String(linha[2] || "").trim();
        var idPai = String(linha[3] || "").trim();
        
        if (omeLinha.toUpperCase() === omePadrao.toUpperCase() && idLocal && nomeLocal) {
          var nomeUpper = nomeLocal.toUpperCase();

          // Se for nó raiz cujo nome coincide com a própria OME (e sem idPai)
          if (!idPai && nomeUpper !== "SEDE" && ehSubunidadeEquivalenteOme_(nomeLocal, omeLinha)) {
            mapaGhostIds[idLocal] = true;
            return; // NÃO mapeia esse nó fantasma como destino de materiais
          }

          mapaNomesLocais[nomeUpper] = idLocal;
          mapaNos[idLocal] = { id: idLocal, nome: nomeUpper, idPai: idPai };
        }
      });

      // Se algum nó legítimo tinha como idPai um nó fantasma da OME, re-aponta para a SEDE
      for (var nId in mapaNos) {
        if (mapaNos[nId].idPai && mapaGhostIds[mapaNos[nId].idPai]) {
          mapaNos[nId].idPai = idSedeOficial;
        }
      }

      // Garante que a SEDE esteja sempre registrada
      if (idSedeOficial) {
        mapaNomesLocais["SEDE"] = idSedeOficial;
        mapaNos[idSedeOficial] = { id: idSedeOficial, nome: "SEDE", idPai: "" };
      }

      // Mapeamento dos caminhos completos da árvore para busca hierárquica precisa
      for (var nId in mapaNos) {
        var partesCaminho = [];
        var cId = nId;
        var vis = {};
        while (cId && mapaNos[cId] && !vis[cId]) {
          vis[cId] = true;
          partesCaminho.unshift(mapaNos[cId].nome);
          cId = mapaNos[cId].idPai;
        }
        if (partesCaminho.length > 0) {
          mapaCaminhos[partesCaminho.join(" > ")] = nId;
        }
      }
    }

    var inSqlOme = (typeof obterVariacoesOmeParaSql_ === 'function') 
      ? obterVariacoesOmeParaSql_(omePadrao) 
      : ("'" + omePadrao.toUpperCase().replace(/'/g, "\\'") + "'");

    var sql = "SELECT UPPER(TRIM(COALESCE(" +
              "NULLIF(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario), ''), " +
              "NULLIF(TRIM(SETOR), ''), " +
              "NULLIF(TRIM(SUBUNIDADE), ''), " +
              "'SEDE'))) as local_ref, " +
              "UPPER(TRIM(COALESCE(SUBUNIDADE, ''))) as sub_ref, " +
              "UPPER(TRIM(COALESCE(SETOR, ''))) as set_ref, " +
              "UPPER(TRIM(COALESCE(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, ''))) as loc_ref, " +
              "UPPER(TRIM(OBJETO)) as objeto_limpo, " +
              "COUNT(*) as qtd, " +
              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'ECD' THEN 1 ELSE 0 END) as qtd_ecd, " +
              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'SCD' THEN 1 ELSE 0 END) as qtd_scd, " +
              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'ACAUTELADO' THEN 1 ELSE 0 END) as qtd_acautelado, " +
              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'EXTRAVIADO' THEN 1 ELSE 0 END) as qtd_extraviado, " +
              "STRING_AGG(ITEM, ',') as ids_string " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
              "GROUP BY local_ref, sub_ref, set_ref, loc_ref, objeto_limpo " +
              "ORDER BY objeto_limpo ASC";

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];
    var vinculos = {};
    var mapaConsumo = (typeof obterMapaClassificacaoConsumo_ === 'function') ? obterMapaClassificacaoConsumo_() : {};

    rows.forEach(function(r) {
      var localRef = String(r.f[0].v || "").trim().toUpperCase();
      var subRef = String(r.f[1].v || "").trim().toUpperCase();
      var setRef = String(r.f[2].v || "").trim().toUpperCase();
      var locRef = String(r.f[3].v || "").trim().toUpperCase();
      var objeto = String(r.f[4].v || "").trim();
      var quantidade = parseInt(r.f[5].v || 0);
      var qtdEcd = parseInt(r.f[6].v || 0);
      var qtdScd = parseInt(r.f[7].v || 0);
      var qtdAcautelado = parseInt(r.f[8].v || 0);
      var qtdExtraviado = parseInt(r.f[9].v || 0);
      var idsStr = String(r.f[10].v || "").trim();

      if (objeto) {
        // Exclui materiais de consumo da árvore física de locais (mantém apenas permanentes)
        if (typeof ehMaterialConsumo_ === 'function' && ehMaterialConsumo_(objeto, mapaConsumo)) {
          return;
        }

        var ehSubSede = ehSubunidadeEquivalenteOme_(subRef, omePadrao);
        var subEfetiva = ehSubSede ? "" : subRef;
        var idDestino = "";

        if (subEfetiva) {
          // É uma subunidade real cadastrada na árvore (ex: "1ª SB/1º GB", "2ª SB", etc.)
          var caminhoCompleto = [subEfetiva, setRef, locRef].filter(Boolean).join(" > ");
          var caminhoSubSet = [subEfetiva, setRef].filter(Boolean).join(" > ");
          idDestino = mapaCaminhos[caminhoCompleto] || mapaCaminhos[caminhoSubSet] || mapaCaminhos[subEfetiva] || mapaNomesLocais[subEfetiva];
        } else {
          // Está na SEDE (subunidade vazia, "SEDE" ou repetição da OME)
          if (locRef || setRef) {
            var caminhoSedeLoc = [setRef, locRef].filter(Boolean).join(" > ");
            idDestino = mapaCaminhos[caminhoSedeLoc] || mapaNomesLocais[locRef] || mapaNomesLocais[setRef];
          }
          if (!idDestino) {
            idDestino = idSedeOficial;
          }
        }

        // Se ainda não encontrou ou caiu num nó fantasma, direciona com 100% de garantia para a SEDE oficial
        if (!idDestino || mapaGhostIds[idDestino]) {
          idDestino = idSedeOficial;
        }

        if (!vinculos[idDestino]) vinculos[idDestino] = [];

        var itemExistente = vinculos[idDestino].find(function(m) { return m.nome === objeto; });

        if (itemExistente) {
          itemExistente.qtd += quantidade;
          itemExistente.ecd += qtdEcd;
          itemExistente.scd += qtdScd;
          itemExistente.acautelado = (itemExistente.acautelado || 0) + qtdAcautelado;
          itemExistente.extraviado = (itemExistente.extraviado || 0) + qtdExtraviado;
          if (idsStr) itemExistente.ids = itemExistente.ids.concat(idsStr.split(','));
        } else {
          vinculos[idDestino].push({ 
            nome: objeto, 
            qtd: quantidade, 
            ecd: qtdEcd, 
            scd: qtdScd, 
            acautelado: qtdAcautelado, 
            extraviado: qtdExtraviado, 
            ids: idsStr ? idsStr.split(',') : [] 
          });
        }
      }
    });

    return vinculos;
  } catch (err) {
    console.error("Erro em getMateriaisAtreladosPorLocal: " + err.message);
    return {};
  }
}



function getDetalhesItensPorIds(idsArray) {

  try {

    if (!idsArray || idsArray.length === 0) return [];

    var idsSql = idsArray.map(function(id) { return "'" + String(id).replace(/'/g, "\\'") + "'"; }).join(",");

    

    var colSerie = obterColunaSerieInventario_();
    var selectSerieSql = colSerie ? ("COALESCE(`" + colSerie + "`, '-')") : "CAST('-' AS STRING)";

    var sql = "SELECT ITEM, OBJETO, STATUS, COALESCE(N_PATRIMONIO, '-'), COALESCE(SEI_COMPRA_RECEBIMENTO, '-'), " + selectSerieSql + " " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE ITEM IN (" + idsSql + ") ORDER BY ITEM ASC";

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];
    var itens = [];

    rows.forEach(function(r) {
      itens.push({
        item: String(r.f[0].v || ""),
        objeto: String(r.f[1].v || ""),
        status: String(r.f[2].v || "ECD"),
        patrimonio: String(r.f[3].v || "-"),
        sei: String(r.f[4].v || "-"),
        nSerie: (r.f[5] && r.f[5].v && r.f[5].v !== "-") ? String(r.f[5].v) : ""
      });
    });

    

    return itens;

  } catch (err) {

    console.error("Erro em getDetalhesItensPorIds: " + err.message);

    return [];

  }

}



function transferirMaterialEntreLocais(dadosTransferencia) {

  try {

    var unidade = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dadosTransferencia.unidade || "") : String(dadosTransferencia.unidade || "").trim();

    var material = String(dadosTransferencia.material || "").trim();

    var localOrigem = String(dadosTransferencia.localOrigem || "").trim();

    var novoLocalDestinoId = String(dadosTransferencia.novoLocalDestino || "").trim();

    var quantidadeParaMover = parseInt(dadosTransferencia.quantidade) || 0;



    if (quantidadeParaMover <= 0) {

      throw new Error("A quantidade a ser movida deve ser maior que zero.");

    }



    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);

    var sheetArvore = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);

    

    var nomeDestinoTexto = novoLocalDestinoId;

    var nivelDestino = "LOCAL"; 

    var nomePaiDestino = "";



    if (sheetArvore && sheetArvore.getLastRow() > 1) {

      var dadosArvore = sheetArvore.getRange(2, 1, sheetArvore.getLastRow() - 1, 4).getValues();

      var mapaLocaisObj = {};



      dadosArvore.forEach(function(linha) {

        var id = String(linha[0] || "").trim();

        var ome = String(linha[1] || "").trim();

        if ((typeof obterOmePadronizada === 'function' ? obterOmePadronizada(ome).toUpperCase() : ome.toUpperCase()) === unidade.toUpperCase()) {

          mapaLocaisObj[id] = {

            nome: String(linha[2] || "").trim(),

            idPai: String(linha[3] || "").trim()

          };

        }

      });



      if (mapaLocaisObj[novoLocalDestinoId]) {

        nomeDestinoTexto = mapaLocaisObj[novoLocalDestinoId].nome;

        var idPai = mapaLocaisObj[novoLocalDestinoId].idPai;



        if (!idPai) {

          nivelDestino = "SUBUNIDADE";

        } else {

          var paiObj = mapaLocaisObj[idPai];

          if (paiObj && !paiObj.idPai) {

            nivelDestino = "SETOR"; 

          } else {

            nivelDestino = "LOCAL"; 

          }

        }

      }

    }



    var origemLimpa = localOrigem.replace(/'/g, "\\'");

    var sqlSelect = "";



    if (origemLimpa.toUpperCase() === "SEDE") {

      sqlSelect = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +

                  "WHERE UPPER(TRIM(UNIDADE)) = '" + unidade.toUpperCase().replace(/'/g, "\\'") + "' " +

                  "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + material.replace(/'/g, "\\'") + "')) " +

                  "AND (LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario IS NULL " +

                  "     OR TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario) = '' " +

                  "     OR UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = 'SEDE' " +

                  "     OR TRIM(SUBUNIDADE) = 'SEDE') " +

                  "LIMIT " + quantidadeParaMover;

    } else {

      sqlSelect = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +

                  "WHERE UPPER(TRIM(UNIDADE)) = '" + unidade.toUpperCase().replace(/'/g, "\\'") + "' " +

                  "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + material.replace(/'/g, "\\'") + "')) " +

                  "AND (TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario) = '" + origemLimpa + "' " +

                  "     OR TRIM(SUBUNIDADE) = '" + origemLimpa + "' " +

                  "     OR TRIM(SETOR) = '" + origemLimpa + "') " +

                  "LIMIT " + quantidadeParaMover;

    }



    var resultado = executarConsultaBigQuerySegura(sqlSelect);

    var rows = resultado.rows || [];



    if (rows.length === 0) {

      throw new Error("Nenhum item encontrado na origem (" + localOrigem + ") para o material " + material + ".");

    }



    var idsParaAtualizar = [];

    rows.forEach(function(r) {

      if (r.f && r.f[0] && r.f[0].v) {

        idsParaAtualizar.push("'" + String(r.f[0].v).replace(/'/g, "\\'") + "'");

      }

    });



    if (idsParaAtualizar.length > 0) {

      var campoAtualizacao = "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario";

      

      if (nivelDestino === "SETOR") {

        campoAtualizacao = "SETOR";

      } else if (nivelDestino === "SUBUNIDADE") {

        campoAtualizacao = "SUBUNIDADE";

      }



      var sqlUpdate = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +

                      "SET " + campoAtualizacao + " = '" + nomeDestinoTexto.replace(/'/g, "\\'") + "' " +

                      "WHERE ITEM IN (" + idsParaAtualizar.join(",") + ")";

      executarConsultaBigQuerySegura(sqlUpdate, true);

    }



    var itensLimposMv = idsParaAtualizar.map(function(id) { return String(id).replace(/'/g, ''); });
    var itensTxtMv = itensLimposMv.length <= 10 ? itensLimposMv.join(", ") : (itensLimposMv.slice(0, 10).join(", ") + " e mais " + (itensLimposMv.length - 10) + " itens");
    registrarLogAuditoria("MOVIMENTACAO_LOCAL_ARVORE", "Moveu " + idsParaAtualizar.length + " un(s) de " + material + " para o " + nivelDestino + ": " + nomeDestinoTexto + ". Código(s) ITEM: [" + itensTxtMv + "]");

    return "Materiais movidos com sucesso para " + nomeDestinoTexto + "!";

  } catch (err) {

    throw new Error("Erro ao transferir material: " + err.message);

  }

}



function getOmesPorMateriaisSelecionados(materiais) {

  try {

    if (!materiais || materiais.length === 0) return [];



    var arrayFormatado = materiais.map(function(m) { 

      return "'" + String(m || '').trim().replace(/'/g, "\\'") + "'"; 

    }).join(',');



    var sql = "SELECT UPPER(TRIM(UNIDADE)) as ome, UPPER(TRIM(OBJETO)) as material, COUNT(*) as qtd, " +

              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'ECD' THEN 1 ELSE 0 END) as qtd_ecd, " +

              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'SCD' THEN 1 ELSE 0 END) as qtd_scd, " +

              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'ACAUTELADO' THEN 1 ELSE 0 END) as qtd_acautelado, " +

              "SUM(CASE WHEN TRIM(UPPER(STATUS)) = 'EXTRAVIADO' THEN 1 ELSE 0 END) as qtd_extraviado " +

              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +

              "WHERE TRIM(OBJETO) IN (" + arrayFormatado + ") " +

              "GROUP BY UPPER(TRIM(UNIDADE)), UPPER(TRIM(OBJETO)) " +

              "ORDER BY ome ASC";



    var queryResults = executarConsultaBigQuerySegura(sql);

    var rows = queryResults.rows || [];

    

    var agrupamento = {};

    

    rows.forEach(function(r) {

      var ome = String(r.f[0].v || "NÃO DEFINIDA").trim();

      var material = String(r.f[1].v || "").trim();

      var quantidade = parseInt(r.f[2].v || 0);

      var qtdEcd = parseInt(r.f[3].v || 0);

      var qtdScd = parseInt(r.f[4].v || 0);

      var qtdAcautelado = parseInt(r.f[5].v || 0);

      var qtdExtraviado = parseInt(r.f[6].v || 0);

      

      if (!agrupamento[ome]) {

        agrupamento[ome] = [];

      }

      

      // Agrupamento também no Rastreamento

      var itemExistente = agrupamento[ome].find(function(m) { return m.nome === material; });

      if (itemExistente) {

        itemExistente.qtd += quantidade;

        itemExistente.ecd += qtdEcd;

        itemExistente.scd += qtdScd;

        itemExistente.acautelado = (itemExistente.acautelado || 0) + qtdAcautelado;

        itemExistente.extraviado = (itemExistente.extraviado || 0) + qtdExtraviado;

      } else {

        agrupamento[ome].push({ 
          nome: material, 
          qtd: quantidade, 
          ecd: qtdEcd, 
          scd: qtdScd, 
          acautelado: qtdAcautelado, 
          extraviado: qtdExtraviado 
        });

      }

    });



    // Converte e garante ordem decrescente de quantidade geral no front

    var resultadoFinal = Object.keys(agrupamento).map(function(chaveOme) {

      var matsOrdenados = agrupamento[chaveOme].sort(function(a, b) { return b.qtd - a.qtd; });

      return {

        ome: chaveOme,

        materiais: matsOrdenados

      };

    });



    return resultadoFinal;

  } catch (err) {

    console.error("Erro em getOmesPorMateriaisSelecionados: " + err.message);

    throw new Error("Falha ao consultar o estoque no banco de dados.");

  }

}



function getResumoOmesComTotais() {

  try {

    var sql = "SELECT UNIDADE, COUNT(*) as total_itens " +

              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +

              "WHERE UNIDADE IS NOT NULL AND TRIM(UNIDADE) != '' " +

              "GROUP BY UNIDADE " +

              "ORDER BY UNIDADE ASC";



    var queryResults = executarConsultaBigQuerySegura(sql);

    var rows = queryResults.rows || [];

    var mapaTotais = {};
    var totalGeralCbmpe = 0;
    var precisaCorrigirBanco = false;

    rows.forEach(function(r) {
      if (r.f && r.f[0] && r.f[0].v) {
        var qtd = parseInt(r.f[1].v || 0, 10);
        var omeBruta = String(r.f[0].v).trim();
        var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeBruta) : omeBruta;
        if (omeBruta !== omePadrao) {
          precisaCorrigirBanco = true;
        }
        totalGeralCbmpe += qtd;
        mapaTotais[omePadrao] = (mapaTotais[omePadrao] || 0) + qtd;
      }
    });

    if (precisaCorrigirBanco) {
      try {
        corrigirEUniformizarOmesNoBigQuery();
      } catch (eCorr) {
        console.warn("Aviso ao auto-corrigir OMEs no BigQuery: " + eCorr.message);
      }
    }

    var resumo = [];
    Object.keys(mapaTotais).forEach(function(omeNome) {
      resumo.push({
        ome: omeNome,
        total: mapaTotais[omeNome]
      });
    });

    resumo.sort(function(a, b) {
      return a.ome.localeCompare(b.ome);
    });

    return {
      totalGeral: totalGeralCbmpe,
      omes: resumo

    };

  } catch (err) {

    console.error("Erro em getResumoOmesComTotais: " + err.message);

    return { totalGeral: 0, omes: [] };

  }

}



function getMateriaisPlanilhaCompras() {

  try {

    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);

    var sheet = ss.getSheets()[0]; 

    if (!sheet || sheet.getLastRow() <= 1) return [];



    var dados = sheet.getDataRange().getValues();

    var cabecalho = dados[0];

    

    var idxColunaMaterial = 0;

    for (var c = 0; c < cabecalho.length; c++) {

      var nomeCol = String(cabecalho[c]).trim().toLowerCase();

      if (nomeCol.indexOf("material") !== -1 || nomeCol.indexOf("objeto") !== -1 || nomeCol.indexOf("descricao") !== -1) {

        idxColunaMaterial = c;

        break;

      }

    }



    var materiais = [];

    for (var i = 1; i < dados.length; i++) {

      var val = String(dados[i][idxColunaMaterial] || "").trim();

      if (val) {

        materiais.push(val);

      }

    }



    return [...new Set(materiais)].sort();

  } catch (err) {

    console.error("Erro em getMateriaisPlanilhaCompras: " + err.message);

    return [];

  }

}

/**
 * Consulta a classificação do material no catálogo oficial (#CAD_ITENS)
 * e verifica se a Coluna 'Classe 2' corresponde a 'VIATURA ATV FIM'.
 */
function verificarClasse2MaterialCatalogo(nomeMaterial) {
  try {
    if (!nomeMaterial) return { ehViatura: false, classe2: "" };
    var matAlvo = String(nomeMaterial).trim().toUpperCase();

    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var abaCad = ss.getSheetByName(ABA_CATALOGO_ITENS) || obterAbaPorNomeAproximado(ss, ABA_CATALOGO_ITENS);
    if (!abaCad) {
      console.warn("Aba " + ABA_CATALOGO_ITENS + " não encontrada na planilha de compras " + ID_PLANILHA_COMPRAS);
      return { ehViatura: false, classe2: "" };
    }

    var lastRow = abaCad.getLastRow();
    if (lastRow < 6) return { ehViatura: false, classe2: "" };

    var colMat = 3;  // Coluna C padrão (Objeto Resumido)
    var colCl2 = 9;  // Coluna I padrão (Classe 2)
    try {
      var cabecalho = abaCad.getRange(5, 1, 1, Math.min(abaCad.getLastColumn(), 25)).getValues()[0];
      for (var c = 0; c < cabecalho.length; c++) {
        var h = String(cabecalho[c] || "").trim().toLowerCase();
        if (h.includes("objeto") || h.includes("material") || h.includes("descri")) colMat = c + 1;
        if (h.includes("classe 2")) colCl2 = c + 1;
      }
    } catch(eCab) {}

    var maxCol = Math.max(colMat, colCl2);
    var numLinhas = lastRow - 5;
    var matriz = abaCad.getRange(6, 1, numLinhas, maxCol).getValues();

    // 1. Busca exata por nome
    for (var i = 0; i < matriz.length; i++) {
      var nomeItem = String(matriz[i][colMat - 1] || "").trim().toUpperCase();
      if (nomeItem === matAlvo) {
        var cl2 = String(matriz[i][colCl2 - 1] || "").trim().toUpperCase();
        var ehViat = (cl2 === "VIATURA ATV FIM");
        return {
          ehViatura: ehViat,
          classe2: cl2,
          material: nomeItem
        };
      }
    }

    // 2. Busca aproximada normalizada
    var matAlvoClean = matAlvo.replace(/[^A-Z0-9]/g, "");
    for (var j = 0; j < matriz.length; j++) {
      var nItem = String(matriz[j][colMat - 1] || "").trim().toUpperCase();
      var nItemClean = nItem.replace(/[^A-Z0-9]/g, "");
      if (nItemClean && (nItemClean === matAlvoClean || nItemClean.includes(matAlvoClean) || matAlvoClean.includes(nItemClean))) {
        var cl2Aprox = String(matriz[j][colCl2 - 1] || "").trim().toUpperCase();
        var ehViatAprox = (cl2Aprox === "VIATURA ATV FIM");
        return {
          ehViatura: ehViatAprox,
          classe2: cl2Aprox,
          material: nItem
        };
      }
    }

    return { ehViatura: false, classe2: "" };
  } catch (err) {
    console.error("Erro em verificarClasse2MaterialCatalogo: " + err.message);
    return { ehViatura: false, classe2: "", erro: err.message };
  }
}

/**
 * Retorna uma lista com os nomes de todos os materiais do catálogo (#CAD_ITENS)
 * cuja Classe 2 seja 'VIATURA ATV FIM', permitindo cache instantâneo no front-end.
 */
function getListaNomesViaturasCatalogo() {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var abaCad = ss.getSheetByName(ABA_CATALOGO_ITENS) || obterAbaPorNomeAproximado(ss, ABA_CATALOGO_ITENS);
    if (!abaCad) return [];

    var lastRow = abaCad.getLastRow();
    if (lastRow < 6) return [];

    var colMat = 3;  // Coluna C
    var colCl2 = 9;  // Coluna I
    try {
      var cabecalho = abaCad.getRange(5, 1, 1, Math.min(abaCad.getLastColumn(), 25)).getValues()[0];
      for (var c = 0; c < cabecalho.length; c++) {
        var h = String(cabecalho[c] || "").trim().toLowerCase();
        if (h.includes("objeto") || h.includes("material") || h.includes("descri")) colMat = c + 1;
        if (h.includes("classe 2")) colCl2 = c + 1;
      }
    } catch(eCab) {}

    var maxCol = Math.max(colMat, colCl2);
    var numLinhas = lastRow - 5;
    var matriz = abaCad.getRange(6, 1, numLinhas, maxCol).getValues();

    var viaturas = [];
    for (var i = 0; i < matriz.length; i++) {
      var cl2 = String(matriz[i][colCl2 - 1] || "").trim().toUpperCase();
      if (cl2 === "VIATURA ATV FIM") {
        var nome = String(matriz[i][colMat - 1] || "").trim();
        if (nome) viaturas.push(nome);
      }
    }
    return [...new Set(viaturas)].sort();
  } catch (err) {
    console.error("Erro em getListaNomesViaturasCatalogo: " + err.message);
    return [];
  }
}

// =========================================================================
// GESTÃO DE CLASSIFICAÇÃO DE MATERIAIS DE CONSUMO E STATUS CRÍTICO POR OME
// =========================================================================

var _cacheMapaClassificacaoConsumo = null;

/**
 * Lê a aba #CAD_ITENS e mapeia todos os materiais marcados como 'SIM' na coluna 'CONSUMO'.
 * Retorna um objeto mapa: { [nomeMaterialUpper]: true } para itens de consumo.
 * Utiliza CacheService e cache em memória para desempenho máximo.
 */
function obterMapaClassificacaoConsumo_() {
  if (_cacheMapaClassificacaoConsumo && Object.keys(_cacheMapaClassificacaoConsumo).length > 0) {
    return _cacheMapaClassificacaoConsumo;
  }

  var cache = CacheService.getScriptCache();
  var cachedJson = cache.get("MAPA_MATERIAIS_CONSUMO_V1");
  if (cachedJson) {
    try {
      _cacheMapaClassificacaoConsumo = JSON.parse(cachedJson);
      return _cacheMapaClassificacaoConsumo;
    } catch(e) {}
  }

  var mapaConsumo = {};
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var abaCad = ss.getSheetByName(ABA_CATALOGO_ITENS) || obterAbaPorNomeAproximado(ss, ABA_CATALOGO_ITENS);
    if (!abaCad || abaCad.getLastRow() < 6) {
      _cacheMapaClassificacaoConsumo = mapaConsumo;
      return mapaConsumo;
    }

    var lastRow = abaCad.getLastRow();
    var lastCol = abaCad.getLastColumn();
    var colMat = 3;       // Coluna C padrão (Objeto)
    var colConsumo = 20;  // Coluna T padrão (CONSUMO)

    try {
      var cabecalho = abaCad.getRange(5, 1, 1, Math.min(lastCol, 35)).getValues()[0];
      for (var c = 0; c < cabecalho.length; c++) {
        var h = String(cabecalho[c] || "").trim().toLowerCase();
        var hNorm = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (hNorm.includes("objeto") || hNorm.includes("material") || hNorm.includes("descri")) {
          colMat = c + 1;
        }
        if (hNorm === "consumo" || hNorm.includes("consumo")) {
          colConsumo = c + 1;
        }
      }
    } catch(eCab) {
      console.warn("Aviso ao ler cabeçalho de #CAD_ITENS: " + eCab.message);
    }

    var maxCol = Math.max(colMat, colConsumo);
    var numLinhas = lastRow - 5;
    var matriz = abaCad.getRange(6, 1, numLinhas, maxCol).getValues();

    for (var i = 0; i < matriz.length; i++) {
      var nomeItem = String(matriz[i][colMat - 1] || "").trim().toUpperCase();
      var valorConsumo = String(matriz[i][colConsumo - 1] || "").trim().toUpperCase();

      if (nomeItem) {
        if (valorConsumo === "SIM" || valorConsumo === "S") {
          mapaConsumo[nomeItem] = true;
          // Versão limpa de pontuação para match tolerante
          var cleanKey = nomeItem.replace(/[^A-Z0-9]/g, "");
          if (cleanKey) {
            mapaConsumo["_CLEAN_" + cleanKey] = true;
          }
        }
      }
    }

    _cacheMapaClassificacaoConsumo = mapaConsumo;

    // Cacheia por 15 minutos (900s)
    try {
      var jsonStr = JSON.stringify(mapaConsumo);
      if (jsonStr.length < 95000) {
        cache.put("MAPA_MATERIAIS_CONSUMO_V1", jsonStr, 900);
      }
    } catch(eCache) {}

  } catch(err) {
    console.error("Erro em obterMapaClassificacaoConsumo_: " + err.message);
  }

  _cacheMapaClassificacaoConsumo = mapaConsumo;
  return mapaConsumo;
}

/**
 * Verifica se um dado nome de material é classificado como Material de Consumo.
 */
function ehMaterialConsumo_(nomeMaterial, mapaConsumo) {
  if (!nomeMaterial) return false;
  if (!mapaConsumo) mapaConsumo = obterMapaClassificacaoConsumo_();

  var matUpper = String(nomeMaterial).trim().toUpperCase();
  if (mapaConsumo[matUpper] === true) {
    return true;
  }

  var clean = matUpper.replace(/[^A-Z0-9]/g, "");
  if (clean && mapaConsumo["_CLEAN_" + clean] === true) {
    return true;
  }

  return false;
}

/**
 * Formata qualquer data/objeto de data para a máscara dd/MM/yyyy HH:mm:ss
 */
function formatarDataHoraConsumo_(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "America/Recife", "dd/MM/yyyy HH:mm:ss");
  }
  var s = String(val || "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2}$/.test(s)) {
    return s;
  }
  if (/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}$/.test(s)) {
    return s + ":00";
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    return s + " 00:00:00";
  }
  if (s) {
    try {
      var dt = new Date(s);
      if (!isNaN(dt.getTime())) {
        return Utilities.formatDate(dt, "America/Recife", "dd/MM/yyyy HH:mm:ss");
      }
    } catch(e) {}
  }
  return s;
}

/**
 * Formata um e-mail em um nome legível caso não haja correspondência cadastrada na base de usuários.
 */
function formatarNomeDeEmailConsumo_(email) {
  if (!email) return "";
  var prefixo = String(email).split("@")[0] || "";
  var partes = prefixo.split(/[\._\-]+/);
  return partes.map(function(p) {
    if (!p) return "";
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).filter(Boolean).join(" ").trim();
}

/**
 * Retorna um mapa { [chaveIdentificador]: nomeCompleto } indexado por e-mail e CPF a partir da aba 'Logins'.
 */
function obterMapaUsuariosParaNome_() {
  var mapa = {};
  try {
    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    if (sheetLogins && sheetLogins.getLastRow() > 1) {
      var dados = sheetLogins.getDataRange().getValues();
      var cabecalho = dados[0] || [];
      var idxEmail = cabecalho.indexOf("Email");
      if (idxEmail === -1) idxEmail = 0;
      var idxCpf = cabecalho.indexOf("CPF");
      if (idxCpf === -1) idxCpf = 1;
      var idxNome = cabecalho.indexOf("Nome");
      if (idxNome === -1) idxNome = 2;

      for (var i = 1; i < dados.length; i++) {
        var email = String(dados[i][idxEmail] || "").trim().toLowerCase();
        var cpf = String(dados[i][idxCpf] || "").trim().replace(/\D/g, "");
        var nome = String(dados[i][idxNome] || "").trim();
        if (nome) {
          if (email) mapa[email] = nome;
          if (cpf) mapa[cpf] = nome;
        }
      }
    }
  } catch(e) {
    console.warn("Erro ao obter mapa de nomes de usuários: " + e.message);
  }
  return mapa;
}

/**
 * Resolve o nome completo de um responsável a partir do seu cadastro (e-mail ou CPF),
 * ou formata de modo legível caso seja um e-mail não localizado.
 */
function resolverNomeCompletoResponsavel_(respRaw, mapaUsuarios) {
  var resp = String(respRaw || "").trim();
  if (!resp) return "";

  // Se já for um nome completo legível (sem '@' e não sendo apenas dígitos/CPF)
  var apenasDigitos = resp.replace(/\D/g, "");
  if (resp.indexOf("@") === -1 && apenasDigitos.length !== resp.length && resp.length > 3) {
    return resp;
  }

  var mapa = mapaUsuarios || obterMapaUsuariosParaNome_();
  var emailKey = resp.toLowerCase();
  if (mapa[emailKey]) {
    return mapa[emailKey];
  }

  if (apenasDigitos.length >= 11 && mapa[apenasDigitos]) {
    return mapa[apenasDigitos];
  }

  if (resp.indexOf("@") !== -1) {
    var formatado = formatarNomeDeEmailConsumo_(resp);
    if (formatado) return formatado;
  }

  return resp;
}

/**
 * Lê a aba 'Status_Consumo_OME' da planilha auxiliar e retorna um mapa de status por material para a OME.
 */
function obterMapaStatusCriticoConsumo_(omePadrao) {
  var mapa = {};
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName("Status_Consumo_OME");
    if (!sheet || sheet.getLastRow() <= 1) return mapa;

    var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    var omeAlvo = String(omePadrao || "").trim().toUpperCase();
    var ehTodas = !omeAlvo || omeAlvo === "TODAS" || omeAlvo.indexOf("SELECIONE") !== -1;
    var mapaUsuarios = obterMapaUsuariosParaNome_();

    dados.forEach(function(linha) {
      var omeRaw = String(linha[0] || "").trim();
      var omePadronizada = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeRaw) : omeRaw;
      var omeLinha = omePadronizada.toUpperCase();
      var matLinha = String(linha[1] || "").trim().toUpperCase();
      var status = String(linha[2] || "").trim().toUpperCase();
      var data = formatarDataHoraConsumo_(linha[3]);
      var respRaw = String(linha[4] || "").trim();
      var resp = resolverNomeCompletoResponsavel_(respRaw, mapaUsuarios);
      var obs = String(linha[5] || "").trim();

      if (matLinha) {
        var info = {
          status: status,
          data: data,
          responsavel: resp,
          observacao: obs,
          ome: omePadronizada
        };

        mapa[omeLinha + "___" + matLinha] = info;

        if (!ehTodas && (omeLinha === omeAlvo || omeRaw.toUpperCase() === omeAlvo)) {
          mapa[matLinha] = info;
        }
      }
    });
  } catch(e) {
    console.warn("Erro ao obter mapa status critico consumo: " + e.message);
  }
  return mapa;
}

/**
 * Retorna os materiais de consumo da OME (ou de TODAS as OMEs se ome for vazio/TODAS)
 * com quantidade acumulada recebida e indicadores de nível crítico.
 */
function getMateriaisConsumoOme(ome) {
  try {
    var ehTodasOmes = !ome || String(ome).trim() === "" || String(ome).trim().toUpperCase() === "TODAS" || String(ome).trim().toUpperCase().indexOf("SELECIONE") !== -1;
    var omePadrao = ehTodasOmes ? "TODAS" : ((typeof obterOmePadronizada === 'function') ? obterOmePadronizada(ome) : String(ome || "").trim());

    var mapaConsumo = obterMapaClassificacaoConsumo_();
    var mapaStatusCritico = obterMapaStatusCriticoConsumo_(ehTodasOmes ? "TODAS" : omePadrao);

    var sql = "";
    if (ehTodasOmes) {
      sql = "SELECT UPPER(TRIM(UNIDADE)) as ome_raw, " +
            "UPPER(TRIM(OBJETO)) as material, " +
            "COUNT(*) as qtd_total, " +
            "COALESCE(MAX(COD_EFISCO), '') as cod_efisco " +
            "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
            "WHERE TRIM(UNIDADE) IS NOT NULL AND TRIM(UNIDADE) != '' " +
            "GROUP BY ome_raw, material " +
            "ORDER BY material ASC, ome_raw ASC";
    } else {
      var inSqlOme = (typeof obterVariacoesOmeParaSql_ === 'function') 
        ? obterVariacoesOmeParaSql_(omePadrao) 
        : ("'" + omePadrao.toUpperCase().replace(/'/g, "\\'") + "'");

      sql = "SELECT '" + omePadrao.replace(/'/g, "\\'") + "' as ome_raw, " +
            "UPPER(TRIM(OBJETO)) as material, " +
            "COUNT(*) as qtd_total, " +
            "COALESCE(MAX(COD_EFISCO), '') as cod_efisco " +
            "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
            "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
            "GROUP BY material " +
            "ORDER BY material ASC";
    }

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];
    var materiaisConsumo = [];
    var mapaConsolidado = {};
    var totalCriticos = 0;
    var totalQtdAcumulada = 0;

    rows.forEach(function(r) {
      var omeRowRaw = String(r.f[0].v || "").trim();
      var omeRowPadrao = ehTodasOmes 
        ? ((typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeRowRaw) : omeRowRaw)
        : omePadrao;
      var nomeMat = String(r.f[1].v || "").trim();
      var qtdTotal = parseInt(r.f[2].v || 0);
      var codEfisco = String(r.f[3].v || "").trim();

      if (nomeMat && ehMaterialConsumo_(nomeMat, mapaConsumo)) {
        var matKey = nomeMat.toUpperCase();
        var itemKey = ehTodasOmes ? (omeRowPadrao.toUpperCase() + "___" + matKey) : matKey;

        if (!mapaConsolidado[itemKey]) {
          var infoCritico = ehTodasOmes 
            ? (mapaStatusCritico[itemKey] || { status: "NORMAL", data: "", responsavel: "", observacao: "" })
            : (mapaStatusCritico[matKey] || { status: "NORMAL", data: "", responsavel: "", observacao: "" });

          var ehCritico = String(infoCritico.status || "").toUpperCase() === "CRÍTICO";
          if (ehCritico) totalCriticos++;

          mapaConsolidado[itemKey] = {
            ome: omeRowPadrao,
            material: nomeMat,
            quantidadeAcumulada: qtdTotal,
            codEfisco: codEfisco,
            statusCritico: ehCritico ? "CRÍTICO" : "NORMAL",
            dataMarcacao: infoCritico.data || "",
            responsavel: infoCritico.responsavel || "",
            observacao: infoCritico.observacao || ""
          };
        } else {
          mapaConsolidado[itemKey].quantidadeAcumulada += qtdTotal;
          if (!mapaConsolidado[itemKey].codEfisco && codEfisco) {
            mapaConsolidado[itemKey].codEfisco = codEfisco;
          }
        }
        totalQtdAcumulada += qtdTotal;
      }
    });

    // Processa também eventuais itens marcados que não estejam com linha BigQuery no momento
    for (var k in mapaStatusCritico) {
      if (ehTodasOmes) {
        if (k.indexOf("___") !== -1 && !mapaConsolidado[k]) {
          var partes = k.split("___");
          var omeExtra = partes[0];
          var matExtra = partes[1];
          var infoExtra = mapaStatusCritico[k];
          var ehCritExtra = String(infoExtra.status || "").toUpperCase() === "CRÍTICO";
          if (ehCritExtra) totalCriticos++;
          mapaConsolidado[k] = {
            ome: infoExtra.ome || omeExtra,
            material: matExtra,
            quantidadeAcumulada: 0,
            codEfisco: "",
            statusCritico: ehCritExtra ? "CRÍTICO" : "NORMAL",
            dataMarcacao: infoExtra.data || "",
            responsavel: infoExtra.responsavel || "",
            observacao: infoExtra.observacao || ""
          };
        }
      } else {
        if (k.indexOf("___") === -1 && !mapaConsolidado[k]) {
          var infoCrit = mapaStatusCritico[k];
          var ehCrit = String(infoCrit.status || "").toUpperCase() === "CRÍTICO";
          if (ehCrit) totalCriticos++;
          mapaConsolidado[k] = {
            ome: omePadrao,
            material: k,
            quantidadeAcumulada: 0,
            codEfisco: "",
            statusCritico: ehCrit ? "CRÍTICO" : "NORMAL",
            dataMarcacao: infoCrit.data || "",
            responsavel: infoCrit.responsavel || "",
            observacao: infoCrit.observacao || ""
          };
        }
      }
    }

    for (var chave in mapaConsolidado) {
      materiaisConsumo.push(mapaConsolidado[chave]);
    }

    materiaisConsumo.sort(function(a, b) {
      var cmpMat = a.material.localeCompare(b.material);
      if (cmpMat !== 0) return cmpMat;
      return (a.ome || "").localeCompare(b.ome || "");
    });

    return {
      sucesso: true,
      ome: ehTodasOmes ? "TODAS" : omePadrao,
      materiais: materiaisConsumo,
      resumo: {
        totalTipos: materiaisConsumo.length,
        totalCriticos: totalCriticos,
        totalQtdAcumulada: totalQtdAcumulada
      }
    };
  } catch(err) {
    console.error("Erro em getMateriaisConsumoOme: " + err.message);
    return {
      sucesso: false,
      erro: err.message,
      materiais: [],
      resumo: { totalTipos: 0, totalCriticos: 0, totalQtdAcumulada: 0 }
    };
  }
}

/**
 * Registra a sinalização de status crítico ou normalização de estoque de material de consumo.
 */
function alternarStatusCriticoConsumo(ome, material, novoStatus, observacao, nomeResponsavel) {
  try {
    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(ome) : String(ome || "").trim();
    if (!omePadrao) return { sucesso: false, erro: "Unidade (OME) inválida." };
    if (!material) return { sucesso: false, erro: "Material não especificado." };

    var statusFormatado = String(novoStatus || "CRÍTICO").trim().toUpperCase();
    if (statusFormatado !== "CRÍTICO" && statusFormatado !== "NORMAL") {
      statusFormatado = "CRÍTICO";
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName("Status_Consumo_OME");
    if (!sheet) {
      sheet = ss.insertSheet("Status_Consumo_OME");
      sheet.getRange(1, 1, 1, 6).setValues([["UNIDADE_OME", "MATERIAL", "STATUS", "DATA_ATUALIZACAO", "RESPONSAVEL", "OBSERVACAO"]]);
      sheet.getRange(1, 1, 1, 6).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    }

    var emailUsuario = "";
    try { emailUsuario = Session.getActiveUser().getEmail(); } catch(e) {}
    if (!emailUsuario) {
      try { emailUsuario = Session.getEffectiveUser().getEmail(); } catch(e2) {}
    }
    if (!emailUsuario) emailUsuario = "Usuário";

    var mapaNomes = obterMapaUsuariosParaNome_();
    var respFinal = String(nomeResponsavel || "").trim();
    if (!respFinal || respFinal.indexOf("@") !== -1) {
      if (respFinal && mapaNomes[respFinal.toLowerCase()]) {
        respFinal = mapaNomes[respFinal.toLowerCase()];
      } else if (emailUsuario && mapaNomes[emailUsuario.toLowerCase()]) {
        respFinal = mapaNomes[emailUsuario.toLowerCase()];
      }
    }
    if (!respFinal || respFinal.indexOf("@") !== -1) {
      respFinal = resolverNomeCompletoResponsavel_(respFinal || emailUsuario, mapaNomes);
    }
    if (!respFinal) {
      respFinal = emailUsuario;
    }

    var agoraStr = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");
    var matAlvo = String(material).trim().toUpperCase();

    var lastRow = sheet.getLastRow();
    var linhaEncontrada = -1;

    if (lastRow > 1) {
      var dados = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var i = 0; i < dados.length; i++) {
        var omeLinhaRaw = String(dados[i][0] || "").trim().toUpperCase();
        var omeLinhaPad = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados[i][0]).toUpperCase() : omeLinhaRaw;
        var matLinha = String(dados[i][1] || "").trim().toUpperCase();
        if ((omeLinhaRaw === omePadrao.toUpperCase() || omeLinhaPad === omePadrao.toUpperCase()) && matLinha === matAlvo) {
          linhaEncontrada = i + 2;
          break;
        }
      }
    }

    if (linhaEncontrada > 0) {
      sheet.getRange(linhaEncontrada, 3, 1, 4).setValues([[
        statusFormatado,
        agoraStr,
        respFinal,
        String(observacao || "").trim()
      ]]);
    } else {
      sheet.appendRow([
        omePadrao,
        material,
        statusFormatado,
        agoraStr,
        respFinal,
        String(observacao || "").trim()
      ]);
    }

    lock.releaseLock();

    try {
      registrarLogAuditoria("STATUS_CONSUMO", "Alterou status de " + matAlvo + " na OME " + omePadrao + " para " + statusFormatado + (observacao ? " (Obs: " + observacao + ")" : ""), respFinal);
    } catch(eLogSt) {}

    return {
      sucesso: true,
      status: statusFormatado,
      dataMarcacao: agoraStr,
      responsavel: respFinal
    };
  } catch(err) {
    console.error("Erro em alternarStatusCriticoConsumo: " + err.message);
    return { sucesso: false, erro: err.message };
  }
}

/**
 * Retorna uma lista resumida contendo APENAS os materiais de consumo que estão em Nível Crítico.
 * Se omeFiltro for informado (e diferente de 'TODAS'), filtra os dados daquela OME específica.
 * Caso contrário (ou se for 'TODAS'), consolida os dados de todas as OMEs (para Admin, DLOG e CINT).
 * Cruza os itens críticos com o BigQuery para retornar a quantidade acumulada recebida pela OME.
 */
function getResumoMateriaisConsumoCriticos(omeFiltro) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName("Status_Consumo_OME");
    if (!sheet || sheet.getLastRow() <= 1) {
      return { sucesso: true, itens: [], totalCriticos: 0, totalOmesAfetadas: 0 };
    }

    var omeAlvo = "";
    if (omeFiltro && String(omeFiltro).trim().toUpperCase() !== "TODAS") {
      omeAlvo = (typeof obterOmePadronizada === 'function') 
        ? obterOmePadronizada(omeFiltro) 
        : String(omeFiltro).trim().toUpperCase();
    }

    var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    var itensCriticos = [];
    var mapaMateriaisPorOme = {};
    var listaMateriaisUnicos = [];
    var setOmesUnicas = {};
    var mapaUsuarios = obterMapaUsuariosParaNome_();

    dados.forEach(function(linha) {
      var omeLinha = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(linha[0]) : String(linha[0] || "").trim();
      var matLinha = String(linha[1] || "").trim();
      var status = String(linha[2] || "").trim().toUpperCase();
      var data = formatarDataHoraConsumo_(linha[3]);
      var respRaw = String(linha[4] || "").trim();
      var resp = resolverNomeCompletoResponsavel_(respRaw, mapaUsuarios);
      var obs = String(linha[5] || "").trim();

      if (status === "CRÍTICO" && matLinha) {
        if (!omeAlvo || omeLinha.toUpperCase() === omeAlvo.toUpperCase()) {
          var itemObj = {
            ome: omeLinha,
            material: matLinha,
            quantidadeAcumulada: 0,
            dataMarcacao: data,
            responsavel: resp,
            observacao: obs
          };
          itensCriticos.push(itemObj);

          var oKey = omeLinha.toUpperCase();
          var mKey = matLinha.toUpperCase();
          if (!mapaMateriaisPorOme[oKey]) {
            mapaMateriaisPorOme[oKey] = {};
            setOmesUnicas[oKey] = true;
          }
          mapaMateriaisPorOme[oKey][mKey] = itemObj;

          if (listaMateriaisUnicos.indexOf(mKey) === -1) {
            listaMateriaisUnicos.push(mKey);
          }
        }
      }
    });

    if (itensCriticos.length === 0) {
      return { sucesso: true, itens: [], totalCriticos: 0, totalOmesAfetadas: 0 };
    }

    // Consulta quantitativo acumulado recebido no BigQuery para os materiais críticos
    try {
      var inMatsSql = listaMateriaisUnicos.map(function(m) {
        return "'" + m.replace(/'/g, "\\'") + "'";
      }).join(",");

      var condOmeSql = "";
      if (omeAlvo) {
        var inOmeSql = (typeof obterVariacoesOmeParaSql_ === 'function') 
          ? obterVariacoesOmeParaSql_(omeAlvo) 
          : ("'" + omeAlvo.replace(/'/g, "\\'") + "'");
        condOmeSql = "AND UPPER(TRIM(UNIDADE)) IN (" + inOmeSql + ") ";
      }

      var sqlQtd = "SELECT UPPER(TRIM(UNIDADE)) as ome_raw, " +
                   "UPPER(TRIM(OBJETO)) as material_raw, " +
                   "COUNT(*) as qtd " +
                   "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                   "WHERE UPPER(TRIM(OBJETO)) IN (" + inMatsSql + ") " +
                   condOmeSql +
                   "GROUP BY ome_raw, material_raw";

      var resQtd = executarConsultaBigQuerySegura(sqlQtd);
      var rowsQtd = resQtd.rows || [];

      rowsQtd.forEach(function(r) {
        var omeBq = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(r.f[0].v) : String(r.f[0].v || "").trim();
        var matBq = String(r.f[1].v || "").trim().toUpperCase();
        var qtd = parseInt(r.f[2].v || 0);

        var oKey = omeBq.toUpperCase();
        if (mapaMateriaisPorOme[oKey] && mapaMateriaisPorOme[oKey][matBq]) {
          mapaMateriaisPorOme[oKey][matBq].quantidadeAcumulada += qtd;
        }
      });
    } catch(eBq) {
      console.warn("Aviso ao buscar quantitativo dos materiais críticos no BigQuery: " + eBq.message);
    }

    // Ordenação: primeiro por OME, depois por Nome do Material
    itensCriticos.sort(function(a, b) {
      var cmp = a.ome.localeCompare(b.ome);
      if (cmp !== 0) return cmp;
      return a.material.localeCompare(b.material);
    });

    return {
      sucesso: true,
      itens: itensCriticos,
      totalCriticos: itensCriticos.length,
      totalOmesAfetadas: Object.keys(setOmesUnicas).length
    };
  } catch(err) {
    console.error("Erro em getResumoMateriaisConsumoCriticos: " + err.message);
    return { sucesso: false, erro: err.message, itens: [], totalCriticos: 0, totalOmesAfetadas: 0 };
  }
}



// =========================================================================
// RESUMO DA ÁRVORE DE LOCAIS: SUBUNIDADES -> SETORES -> MATERIAIS
// (Carga Padrão, Qtd Real ECD e Extraviado)
// =========================================================================

function getResumoArvoreArmazenamento(unidadeOme) {
  try {
    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    var dadosUser = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;

    var ehAdmin = false;
    var ehChefe = false;
    var omeUsuario = "";

    if (dadosUser) {
      var perfilReal = String(dadosUser.perfil || "").trim().toUpperCase();
      ehAdmin = (perfilReal === "ADMINISTRADOR" || String(dadosUser.ome || "").toUpperCase() === "DLOG");
      ehChefe = perfilReal.indexOf("CHEFE") !== -1 || perfilReal.indexOf("COMANDANTE") !== -1;
      omeUsuario = dadosUser.ome || "";
    }

    var omeTarget = (ehAdmin && unidadeOme) ? unidadeOme : (unidadeOme || omeUsuario || "DLOG");
    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeTarget) : String(omeTarget).trim();

    if (!omePadrao || omePadrao.toUpperCase() === "TODAS" || omePadrao.toUpperCase() === "TODAS AS OMES") {
      return { sucesso: false, erro: "Selecione uma Unidade (OME) para visualizar o resumo da árvore." };
    }

    // 1. Obtém estrutura oficial da Árvore de Locais da OME
    var infoArvore = (typeof obterEstruturaArvoreOme_ === 'function') 
      ? obterEstruturaArvoreOme_(omePadrao) 
      : { estrutura: [], mapaNomes: {} };
    var estruturaArvore = infoArvore.estrutura || [];
    var mapaNomesArvore = infoArvore.mapaNomes || {};

    var normComp_ = function(t) {
      return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    };

    var norm = function(str) {
      return String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    };

    // 2. Lê Cargas Padrão da planilha auxiliar (Aba Carga_Padrao_Setores)
    var mapaCargas = {};
    var listaCargasPorSetor = {};
    try {
      var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
      var sheetCargas = ssAux.getSheetByName("Carga_Padrao_Setores");
      if (!sheetCargas) {
        sheetCargas = ssAux.insertSheet("Carga_Padrao_Setores");
        sheetCargas.appendRow(["UNIDADE_OME", "SUBUNIDADE", "SETOR", "MATERIAL", "CARGA_PADRAO", "DATA_ATUALIZACAO", "RESPONSAVEL"]);
      } else if (sheetCargas.getLastRow() > 1) {
        var dadosCargas = sheetCargas.getRange(2, 1, sheetCargas.getLastRow() - 1, 5).getValues();
        dadosCargas.forEach(function(cRow) {
          var cOme = norm(cRow[0]);
          var cSub = norm(cRow[1]);
          var cSet = norm(cRow[2]);
          var cMat = norm(cRow[3]);
          var cVal = parseInt(cRow[4], 10) || 0;

          var chave = cOme + "___" + cSub + "___" + cSet + "___" + cMat;
          mapaCargas[chave] = cVal;

          var setorChave = cOme + "___" + cSub + "___" + cSet;
          if (!listaCargasPorSetor[setorChave]) listaCargasPorSetor[setorChave] = [];
          listaCargasPorSetor[setorChave].push({
            material: String(cRow[3] || "").trim(),
            carga: cVal
          });
        });
      }
    } catch (eCarg) {
      console.warn("Aviso ao ler Carga_Padrao_Setores: " + eCarg.message);
    }

    // 3. Consulta BigQuery com agrupamento por Subunidade, Setor e Objeto
    var inSqlOme = (typeof obterVariacoesOmeParaSql_ === 'function') 
      ? obterVariacoesOmeParaSql_(omePadrao) 
      : ("'" + omePadrao.toUpperCase().replace(/'/g, "\\'") + "'");

    var sql = "SELECT " +
              "UPPER(TRIM(COALESCE(SUBUNIDADE, ''))) as sub_raw, " +
              "UPPER(TRIM(COALESCE(SETOR, ''))) as set_raw, " +
              "UPPER(TRIM(COALESCE(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, ''))) as loc_raw, " +
              "UPPER(TRIM(OBJETO)) as objeto_raw, " +
              "COUNT(*) as qtd_total, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'ECD' THEN 1 ELSE 0 END) as qtd_ecd, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'SCD' THEN 1 ELSE 0 END) as qtd_scd, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'ACAUTELADO' THEN 1 ELSE 0 END) as qtd_acautelado, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'EXTRAVIADO' THEN 1 ELSE 0 END) as qtd_extraviado " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
              "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) != 'BAIXADO') " +
              "GROUP BY sub_raw, set_raw, loc_raw, objeto_raw " +
              "ORDER BY objeto_raw ASC";

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];

    var mapaConsumo = (typeof obterMapaClassificacaoConsumo_ === 'function') ? obterMapaClassificacaoConsumo_() : {};

    // 4. Estruturação em memória dos dados por Subunidade -> Setor -> Material
    var mapaAgrupado = {};

    rows.forEach(function(r) {
      var subRaw = String(r.f[0].v || "").trim();
      var setRaw = String(r.f[1].v || "").trim();
      var locRaw = String(r.f[2].v || "").trim();
      var objeto = String(r.f[3].v || "").trim();
      var qtdTotal = parseInt(r.f[4].v || 0);
      var qtdEcd = parseInt(r.f[5].v || 0);
      var qtdScd = parseInt(r.f[6].v || 0);
      var qtdAcautelado = parseInt(r.f[7].v || 0);
      var qtdExtraviado = parseInt(r.f[8].v || 0);

      if (!objeto) return;

      // Exclui materiais de consumo da árvore física
      if (typeof ehMaterialConsumo_ === 'function' && ehMaterialConsumo_(objeto, mapaConsumo)) {
        return;
      }

      // Normaliza Subunidade e Setor com a árvore oficial
      var noArvore = null;
      if (locRaw && mapaNomesArvore[normComp_(locRaw)]) {
        noArvore = mapaNomesArvore[normComp_(locRaw)];
      } else if (setRaw && mapaNomesArvore[normComp_(setRaw)]) {
        noArvore = mapaNomesArvore[normComp_(setRaw)];
      } else if (subRaw && mapaNomesArvore[normComp_(subRaw)]) {
        noArvore = mapaNomesArvore[normComp_(subRaw)];
      }

      var subRes = "SEDE";
      var setNome = "Geral";

      if (noArvore) {
        subRes = noArvore.subunidadeRes || "SEDE";
        setNome = noArvore.setorNome || "Geral";
      } else {
        if (subRaw && subRaw !== "-" && subRaw.toUpperCase() !== "GERAL" && normComp_(subRaw) !== normComp_(omePadrao)) {
          subRes = (typeof resumirSubunidade === 'function') ? resumirSubunidade(subRaw) : subRaw;
        } else {
          subRes = "SEDE";
        }

        if (setRaw && setRaw !== "-" && setRaw.toUpperCase() !== "GERAL" && setRaw.toUpperCase() !== "SEDE" && normComp_(setRaw) !== normComp_(subRes)) {
          setNome = setRaw;
        } else {
          setNome = "Geral";
        }
      }

      if (!subRes || subRes === "-") subRes = "SEDE";
      if (!setNome || setNome === "-") setNome = "Geral";

      if (!mapaAgrupado[subRes]) mapaAgrupado[subRes] = {};
      if (!mapaAgrupado[subRes][setNome]) mapaAgrupado[subRes][setNome] = {};

      if (!mapaAgrupado[subRes][setNome][objeto]) {
        mapaAgrupado[subRes][setNome][objeto] = {
          nome: objeto,
          qtdTotal: 0,
          qtdEcd: 0,
          qtdScd: 0,
          qtdAcautelado: 0,
          qtdExtraviado: 0
        };
      }

      mapaAgrupado[subRes][setNome][objeto].qtdTotal += qtdTotal;
      mapaAgrupado[subRes][setNome][objeto].qtdEcd += qtdEcd;
      mapaAgrupado[subRes][setNome][objeto].qtdScd += qtdScd;
      mapaAgrupado[subRes][setNome][objeto].qtdAcautelado += qtdAcautelado;
      mapaAgrupado[subRes][setNome][objeto].qtdExtraviado += qtdExtraviado;
    });

    // 5. Integra a estrutura oficial da árvore garantindo que todas as Subunidades e Setores apareçam
    var subunidadesResultado = [];
    var subsAdicionadas = {};

    var processarSubunidade = function(subRes, subNomeOficial, setoresOficiais) {
      if (subsAdicionadas[subRes]) return;
      subsAdicionadas[subRes] = true;

      var setoresResultado = [];
      var setoresAdicionados = {};

      var processarSetor = function(setKey) {
        if (setoresAdicionados[setKey]) return;
        setoresAdicionados[setKey] = true;

        var materiaisDoSetor = [];
        var mapaMat = (mapaAgrupado[subRes] && mapaAgrupado[subRes][setKey]) ? mapaAgrupado[subRes][setKey] : {};

        var totEcdSetor = 0;
        var totCargaSetor = 0;
        var totScdSetor = 0;
        var totExtraviadoSetor = 0;
        var totDesvioSetor = 0;
        var totItensSetor = 0;

        for (var matNome in mapaMat) {
          var mData = mapaMat[matNome];
          var chaveCarga = norm(omePadrao) + "___" + norm(subRes) + "___" + norm(setKey) + "___" + norm(matNome);
          var cargaPadrao = mapaCargas[chaveCarga] !== undefined ? mapaCargas[chaveCarga] : 0;
          var qtdReal = mData.qtdEcd;
          var qtdScd = mData.qtdScd || 0;
          var qtdAcautelado = mData.qtdAcautelado || 0;
          var qtdExtBanco = mData.qtdExtraviado || 0;

          var totalExistente = qtdReal + qtdScd + qtdAcautelado;
          var extraviado = 0;
          if (cargaPadrao > totalExistente) {
            extraviado = (cargaPadrao - totalExistente) + qtdExtBanco;
          } else {
            extraviado = qtdExtBanco;
          }

          var desvioReposicao = extraviado + qtdScd;

          totEcdSetor += qtdReal;
          totCargaSetor += cargaPadrao;
          totScdSetor += qtdScd;
          totExtraviadoSetor += extraviado;
          totDesvioSetor += desvioReposicao;
          totItensSetor += mData.qtdTotal;

          materiaisDoSetor.push({
            nome: matNome,
            cargaPadrao: cargaPadrao,
            qtdReal: qtdReal,
            qtdScd: qtdScd,
            extraviado: extraviado,
            desvioReposicao: desvioReposicao,
            qtdTotal: mData.qtdTotal,
            qtdAcautelado: qtdAcautelado
          });
        }

        // Incorpora materiais com Carga Padrão cadastrada que estejam zerados no setor
        var prefixSet = norm(omePadrao) + "___" + norm(subRes) + "___" + norm(setKey);
        var cargasDoSetor = listaCargasPorSetor[prefixSet] || [];
        cargasDoSetor.forEach(function(cItem) {
          if (!cItem.material) return;
          var matNorm = norm(cItem.material);
          var jaExiste = materiaisDoSetor.some(function(m) { return norm(m.nome) === matNorm; });
          if (!jaExiste) {
            var cargaPadrao = cItem.carga;
            var qtdReal = 0;
            var qtdScd = 0;
            var extraviado = cargaPadrao;
            var desvioReposicao = cargaPadrao;
            totCargaSetor += cargaPadrao;
            totExtraviadoSetor += extraviado;
            totDesvioSetor += desvioReposicao;
            materiaisDoSetor.push({
              nome: cItem.material,
              cargaPadrao: cargaPadrao,
              qtdReal: 0,
              qtdScd: 0,
              extraviado: extraviado,
              desvioReposicao: desvioReposicao,
              qtdTotal: 0,
              qtdAcautelado: 0
            });
          }
        });

        // Ordena materiais alfabeticamente
        materiaisDoSetor.sort(function(a, b) { return a.nome.localeCompare(b.nome); });

        setoresResultado.push({
          nome: setKey,
          materiais: materiaisDoSetor,
          totalEcd: totEcdSetor,
          totalCarga: totCargaSetor,
          totalScd: totScdSetor,
          totalExtraviado: totExtraviadoSetor,
          totalDesvioReposicao: totDesvioSetor,
          totalItens: totItensSetor
        });
      };

      // 1. Adiciona setores oficiais da árvore
      if (setoresOficiais && Array.isArray(setoresOficiais)) {
        setoresOficiais.forEach(function(s) {
          if (s && s.nome) processarSetor(s.nome);
        });
      }

      // 2. Adiciona outros setores que possuem materiais no BigQuery para esta subunidade
      if (mapaAgrupado[subRes]) {
        for (var sNome in mapaAgrupado[subRes]) {
          processarSetor(sNome);
        }
      }

      // Se não tiver nenhum setor, adiciona setor "Geral"
      if (setoresResultado.length === 0) {
        processarSetor("Geral");
      }

      // Ordena setores: "Geral" por primeiro, demais alfabéticos
      setoresResultado.sort(function(a, b) {
        if (a.nome === "Geral") return -1;
        if (b.nome === "Geral") return 1;
        return a.nome.localeCompare(b.nome);
      });

      var totSubEcd = 0;
      var totSubCarga = 0;
      var totSubScd = 0;
      var totSubExtraviado = 0;
      var totSubDesvio = 0;
      var totSubItens = 0;
      setoresResultado.forEach(function(s) {
        totSubEcd += s.totalEcd;
        totSubCarga += s.totalCarga;
        totSubScd += (s.totalScd || 0);
        totSubExtraviado += s.totalExtraviado;
        totSubDesvio += (s.totalDesvioReposicao || 0);
        totSubItens += s.totalItens;
      });

      subunidadesResultado.push({
        nome: subRes,
        nomeOficial: subNomeOficial || subRes,
        setores: setoresResultado,
        totalEcd: totSubEcd,
        totalCarga: totSubCarga,
        totalScd: totSubScd,
        totalExtraviado: totSubExtraviado,
        totalDesvioReposicao: totSubDesvio,
        totalItens: totSubItens
      });
    };

    // 1. Subunidades oficiais da árvore
    if (estruturaArvore && Array.isArray(estruturaArvore)) {
      estruturaArvore.forEach(function(sub) {
        var sRes = resumirSubunidade(sub.subRes || sub.nome || "SEDE");
        processarSubunidade(sRes, sub.nome, sub.setores || []);
      });
    }

    // 2. Subunidades adicionais com materiais agrupados no banco
    for (var sKey in mapaAgrupado) {
      processarSubunidade(sKey, sKey, []);
    }

    // Ordena subunidades colocando SEDE em primeiro
    subunidadesResultado.sort(function(a, b) {
      if (a.nome === "SEDE") return -1;
      if (b.nome === "SEDE") return 1;
      return a.nome.localeCompare(b.nome);
    });

    // 6. Totais globais da OME
    var totalGeralEcd = 0;
    var totalGeralCarga = 0;
    var totalGeralScd = 0;
    var totalGeralExtraviado = 0;
    var totalGeralDesvio = 0;
    var totalGeralItens = 0;
    var totalSetoresGeral = 0;
    var materiaisUnicosSet = {};

    subunidadesResultado.forEach(function(sub) {
      totalGeralEcd += sub.totalEcd;
      totalGeralCarga += sub.totalCarga;
      totalGeralScd += (sub.totalScd || 0);
      totalGeralExtraviado += sub.totalExtraviado;
      totalGeralDesvio += (sub.totalDesvioReposicao || 0);
      totalGeralItens += sub.totalItens;
      totalSetoresGeral += sub.setores.length;
      sub.setores.forEach(function(set) {
        set.materiais.forEach(function(m) {
          materiaisUnicosSet[m.nome] = true;
        });
      });
    });

    return {
      sucesso: true,
      ome: omePadrao,
      subunidades: subunidadesResultado,
      materiaisDisponiveis: Object.keys(materiaisUnicosSet).sort(),
      totais: {
        totalSubunidades: subunidadesResultado.length,
        totalSetores: totalSetoresGeral,
        totalMateriaisDistintos: Object.keys(materiaisUnicosSet).length,
        totalQtdRealEcd: totalGeralEcd,
        totalCargaPadrao: totalGeralCarga,
        totalScd: totalGeralScd,
        totalExtraviado: totalGeralExtraviado,
        totalDesvioReposicao: totalGeralDesvio,
        totalItensFisicos: totalGeralItens
      }
    };
  } catch (err) {
    console.error("Erro em getResumoArvoreArmazenamento: " + err.message);
    return { sucesso: false, erro: err.message };
  }
}

// =========================================================================
// RESUMO DE MATERIAIS POR SUBUNIDADE E STATUS (SCD, ECD, ACAUTELADO, EXTRAVIADO)
// =========================================================================

function getResumoMaterialSubunidade(unidadeOme) {
  try {
    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    var dadosUser = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;

    var ehAdmin = false;
    var omeUsuario = "";

    if (dadosUser) {
      var perfilReal = String(dadosUser.perfil || "").trim().toUpperCase();
      ehAdmin = (perfilReal === "ADMINISTRADOR" || String(dadosUser.ome || "").toUpperCase() === "DLOG");
      omeUsuario = dadosUser.ome || "";
    }

    var omeTarget = (ehAdmin && unidadeOme) ? unidadeOme : (unidadeOme || omeUsuario || "DLOG");
    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeTarget) : String(omeTarget).trim();

    if (!omePadrao || omePadrao.toUpperCase() === "TODAS" || omePadrao.toUpperCase() === "TODAS AS OMES") {
      return { sucesso: false, erro: "Selecione uma Unidade (OME) para visualizar o resumo por material." };
    }

    // 1. Árvore da OME para normalização
    var infoArvore = (typeof obterEstruturaArvoreOme_ === 'function') 
      ? obterEstruturaArvoreOme_(omePadrao) 
      : { estrutura: [], mapaNomes: {} };
    var mapaNomesArvore = infoArvore.mapaNomes || {};

    var normComp_ = function(t) {
      return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    };

    // 2. Consulta BigQuery agrupada por Objeto, Subunidade, Setor e Local
    var inSqlOme = (typeof obterVariacoesOmeParaSql_ === 'function') 
      ? obterVariacoesOmeParaSql_(omePadrao) 
      : ("'" + omePadrao.toUpperCase().replace(/'/g, "\\'") + "'");

    var sql = "SELECT " +
              "UPPER(TRIM(OBJETO)) as objeto_raw, " +
              "UPPER(TRIM(COALESCE(SUBUNIDADE, ''))) as sub_raw, " +
              "UPPER(TRIM(COALESCE(SETOR, ''))) as set_raw, " +
              "UPPER(TRIM(COALESCE(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, ''))) as loc_raw, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'SCD' THEN 1 ELSE 0 END) as qtd_scd, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'ACAUTELADO' THEN 1 ELSE 0 END) as qtd_acautelado, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'EXTRAVIADO' THEN 1 ELSE 0 END) as qtd_extraviado, " +
              "SUM(CASE WHEN UPPER(TRIM(COALESCE(STATUS, 'ECD'))) = 'ECD' OR UPPER(TRIM(STATUS)) = '' OR UPPER(TRIM(STATUS)) NOT IN ('SCD', 'ACAUTELADO', 'EXTRAVIADO', 'BAIXADO') THEN 1 ELSE 0 END) as qtd_ecd, " +
              "COUNT(*) as qtd_total " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
              "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) != 'BAIXADO') " +
              "GROUP BY objeto_raw, sub_raw, set_raw, loc_raw " +
              "ORDER BY objeto_raw ASC";

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];
    var mapaConsumo = (typeof obterMapaClassificacaoConsumo_ === 'function') ? obterMapaClassificacaoConsumo_() : {};

    // 3. Agrupamento em memória: material -> { totais, subunidadesMap, setoresMap }
    var mapaMateriais = {};
    var subunidadesSet = {};
    var setoresSet = {};

    // Adiciona subunidades e setores oficiais da árvore primeiro (para manter ordem)
    if (infoArvore.estrutura && Array.isArray(infoArvore.estrutura)) {
      infoArvore.estrutura.forEach(function(sub) {
        var sRes = (typeof resumirSubunidade === 'function') ? resumirSubunidade(sub.subRes || sub.nome || "SEDE") : (sub.subRes || sub.nome || "SEDE");
        subunidadesSet[sRes] = true;
        if (sub.setores && Array.isArray(sub.setores)) {
          sub.setores.forEach(function(set) {
            if (set && set.nome) {
              var sKey = sRes + " - " + set.nome;
              setoresSet[sKey] = true;
            }
          });
        }
      });
    }
    subunidadesSet["SEDE"] = true;

    rows.forEach(function(r) {
      var objeto = String(r.f[0].v || "").trim();
      var subRaw = String(r.f[1].v || "").trim();
      var setRaw = String(r.f[2].v || "").trim();
      var locRaw = String(r.f[3].v || "").trim();
      var qtdScd = parseInt(r.f[4].v || 0);
      var qtdAcautelado = parseInt(r.f[5].v || 0);
      var qtdExtraviado = parseInt(r.f[6].v || 0);
      var qtdEcd = parseInt(r.f[7].v || 0);
      var qtdTotal = parseInt(r.f[8].v || 0);

      if (!objeto) return;

      // Exclui materiais de consumo da lista de permanentes
      if (typeof ehMaterialConsumo_ === 'function' && ehMaterialConsumo_(objeto, mapaConsumo)) {
        return;
      }

      var noArvore = null;
      if (locRaw && mapaNomesArvore[normComp_(locRaw)]) {
        noArvore = mapaNomesArvore[normComp_(locRaw)];
      } else if (setRaw && mapaNomesArvore[normComp_(setRaw)]) {
        noArvore = mapaNomesArvore[normComp_(setRaw)];
      } else if (subRaw && mapaNomesArvore[normComp_(subRaw)]) {
        noArvore = mapaNomesArvore[normComp_(subRaw)];
      }

      var subRes = "SEDE";
      var setNome = "Geral";
      if (noArvore) {
        subRes = noArvore.subunidadeRes || "SEDE";
        setNome = noArvore.setorNome || "Geral";
      } else {
        if (subRaw && subRaw !== "-" && subRaw.toUpperCase() !== "GERAL" && normComp_(subRaw) !== normComp_(omePadrao)) {
          subRes = (typeof resumirSubunidade === 'function') ? resumirSubunidade(subRaw) : subRaw;
        } else {
          subRes = "SEDE";
        }

        if (setRaw && setRaw !== "-" && setRaw.toUpperCase() !== "GERAL" && setRaw.toUpperCase() !== "SEDE" && normComp_(setRaw) !== normComp_(subRes)) {
          setNome = setRaw;
        } else {
          setNome = "Geral";
        }
      }
      if (!subRes || subRes === "-") subRes = "SEDE";
      if (!setNome || setNome === "-") setNome = "Geral";

      var setorKey = (setNome === "Geral" || setNome === subRes) ? (subRes + " (Geral)") : (subRes + " - " + setNome);

      subunidadesSet[subRes] = true;
      setoresSet[setorKey] = true;

      if (!mapaMateriais[objeto]) {
        mapaMateriais[objeto] = {
          material: objeto,
          totais: { scd: 0, ecd: 0, acautelado: 0, extraviado: 0, total: 0 },
          subunidadesMap: {},
          setoresMap: {}
        };
      }

      mapaMateriais[objeto].totais.scd += qtdScd;
      mapaMateriais[objeto].totais.ecd += qtdEcd;
      mapaMateriais[objeto].totais.acautelado += qtdAcautelado;
      mapaMateriais[objeto].totais.extraviado += qtdExtraviado;
      mapaMateriais[objeto].totais.total += qtdTotal;

      mapaMateriais[objeto].subunidadesMap[subRes] = (mapaMateriais[objeto].subunidadesMap[subRes] || 0) + qtdTotal;
      mapaMateriais[objeto].setoresMap[setorKey] = (mapaMateriais[objeto].setoresMap[setorKey] || 0) + qtdTotal;
    });

    // 4. Converte mapa para lista ordenada alfabeticamente
    var listaMateriais = [];
    var kpis = {
      totalTipos: 0,
      totalScd: 0,
      totalEcd: 0,
      totalAcautelado: 0,
      totalExtraviado: 0,
      totalGeral: 0
    };

    var nomesMats = Object.keys(mapaMateriais).sort(function(a, b) {
      return a.localeCompare(b);
    });

    nomesMats.forEach(function(mNome) {
      var item = mapaMateriais[mNome];

      kpis.totalTipos++;
      kpis.totalScd += item.totais.scd;
      kpis.totalEcd += item.totais.ecd;
      kpis.totalAcautelado += item.totais.acautelado;
      kpis.totalExtraviado += item.totais.extraviado;
      kpis.totalGeral += item.totais.total;

      listaMateriais.push({
        material: mNome,
        totais: item.totais,
        subunidadesMap: item.subunidadesMap,
        setoresMap: item.setoresMap
      });
    });

    // Lista de subunidades encontradas, ordenadas com SEDE primeiro
    var listaSubs = Object.keys(subunidadesSet).sort(function(a, b) {
      if (a === "SEDE") return -1;
      if (b === "SEDE") return 1;
      return a.localeCompare(b);
    });

    // Lista de setores encontrados, ordenados com SEDE primeiro
    var listaSetores = Object.keys(setoresSet).sort(function(a, b) {
      var aSede = a.indexOf("SEDE") === 0;
      var bSede = b.indexOf("SEDE") === 0;
      if (aSede && !bSede) return -1;
      if (!aSede && bSede) return 1;
      return a.localeCompare(b);
    });

    return {
      sucesso: true,
      ome: omePadrao,
      kpis: kpis,
      subunidadesDisponiveis: listaSubs,
      setoresDisponiveis: listaSetores,
      materiais: listaMateriais
    };
  } catch (err) {
    console.error("Erro em getResumoMaterialSubunidade: " + err.message);
    return { sucesso: false, erro: err.message };
  }
}

function salvarCargaPadraoSetor(unidadeOme, subunidade, setor, material, novaCarga, usuarioCliente) {
  try {
    // 1. Identificação do usuário (prioridade para payload do cliente, com fallback para sessão GAS)
    var dadosUser = null;
    var cpfCliente = (usuarioCliente && (usuarioCliente.cpf || usuarioCliente.CPF)) ? String(usuarioCliente.cpf || usuarioCliente.CPF).replace(/\D/g, '') : "";
    var emailCliente = (usuarioCliente && usuarioCliente.email) ? String(usuarioCliente.email).trim().toLowerCase() : "";

    if (cpfCliente || emailCliente) {
      dadosUser = verificarPermissaoUsuario(cpfCliente || emailCliente);
    }
    if (!dadosUser && usuarioCliente && usuarioCliente.nome) {
      dadosUser = usuarioCliente;
    }
    if (!dadosUser) {
      var emailSessao = "";
      try { emailSessao = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
      if (!emailSessao) {
        try { emailSessao = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e2) {}
      }
      if (emailSessao) dadosUser = verificarPermissaoUsuario(emailSessao);
    }

    // 2. Validação de perfil (Administrador, DLOG, CINT, ou Chefe de Setor autorizado)
    var perfilUser = String((dadosUser && dadosUser.perfil) || (usuarioCliente && usuarioCliente.perfil) || "ADMINISTRADOR").trim().toUpperCase();
    var omeUser = String((dadosUser && dadosUser.ome) || (usuarioCliente && usuarioCliente.ome) || "").trim().toUpperCase();
    var perfilNorm = perfilUser.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    var ehAdmin = perfilNorm.indexOf("ADMIN") !== -1 || omeUser === "DLOG" || omeUser === "CINT";
    var ehChefe = perfilNorm.indexOf("CHEFE") !== -1 || perfilNorm.indexOf("COMANDANTE") !== -1;

    if (!ehAdmin && !ehChefe) {
      throw new Error("Acesso restrito: apenas Administradores ou Comandantes de Unidade possuem permissão para definir ou alterar a Carga Padrão.");
    }

    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(unidadeOme) : String(unidadeOme || "").trim();
    var subPadrao = (typeof resumirSubunidade === 'function') ? resumirSubunidade(subunidade) : String(subunidade || "SEDE").trim();
    var setPadrao = String(setor || "Geral").trim();
    var matPadrao = String(material || "").trim();
    var cargaNum = Math.max(0, parseInt(novaCarga, 10) || 0);

    if (!matPadrao) throw new Error("Material não especificado.");

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName("Carga_Padrao_Setores");
    if (!sheet) {
      sheet = ss.insertSheet("Carga_Padrao_Setores");
      sheet.appendRow(["UNIDADE_OME", "SUBUNIDADE", "SETOR", "MATERIAL", "CARGA_PADRAO", "DATA_ATUALIZACAO", "RESPONSAVEL"]);
    }

    var dataAtual = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");
    var nomeResponsavel = (dadosUser && dadosUser.nome) ? dadosUser.nome : ((usuarioCliente && usuarioCliente.nome) ? usuarioCliente.nome : "Administrador");

    var norm = function(str) {
      return String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    };

    var dados = sheet.getDataRange().getValues();
    var linhaExistente = -1;

    for (var i = 1; i < dados.length; i++) {
      var oRow = norm(dados[i][0]);
      var sRow = norm(dados[i][1]);
      var setRow = norm(dados[i][2]);
      var mRow = norm(dados[i][3]);

      if (oRow === norm(omePadrao) && sRow === norm(subPadrao) && setRow === norm(setPadrao) && mRow === norm(matPadrao)) {
        linhaExistente = i + 1;
        break;
      }
    }

    if (linhaExistente !== -1) {
      sheet.getRange(linhaExistente, 5).setValue(cargaNum);
      sheet.getRange(linhaExistente, 6).setValue(dataAtual);
      sheet.getRange(linhaExistente, 7).setValue(nomeResponsavel);
    } else {
      sheet.appendRow([omePadrao, subPadrao, setPadrao, matPadrao, cargaNum, dataAtual, nomeResponsavel]);
    }

    SpreadsheetApp.flush();

    try {
      registrarLogAuditoria("CARGA_PADRAO", "Definiu carga padrão de " + cargaNum + " un(s) para " + matPadrao + " em " + omePadrao + " > " + subPadrao + " > " + setPadrao, dadosUser);
    } catch(eLogCg) {}

    return {
      sucesso: true,
      ome: omePadrao,
      subunidade: subPadrao,
      setor: setPadrao,
      material: matPadrao,
      cargaPadrao: cargaNum
    };
  } catch (err) {
    console.error("Erro ao salvar carga padrão: " + err.message);
    return { sucesso: false, erro: err.message };
  }
}

// =========================================================================
// RESUMO DE MATERIAIS EXTRAVIADOS (PARA VISÃO GERAL DO ADMINISTRADOR / CHEFE)
// =========================================================================

function getResumoMateriaisExtraviadosGeral(unidadeOme) {
  try {
    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    var dadosUser = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;

    var ehAdmin = false;
    var omeUsuario = "";
    if (dadosUser) {
      var perfilReal = String(dadosUser.perfil || "").trim().toUpperCase();
      ehAdmin = (perfilReal === "ADMINISTRADOR" || String(dadosUser.ome || "").toUpperCase() === "DLOG");
      omeUsuario = dadosUser.ome || "";
    }

    var omeFiltro = ehAdmin ? (unidadeOme || "TODAS") : (omeUsuario || unidadeOme || "");
    var omeFiltroNorm = (omeFiltro && omeFiltro !== "TODAS" && omeFiltro !== "TODAS AS OMES") 
      ? ((typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeFiltro) : omeFiltro)
      : "TODAS";

    var norm = function(str) {
      return String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    };

    var normComp_ = function(t) {
      return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    };

    // 1. Lê Cargas Padrão da planilha auxiliar (Aba Carga_Padrao_Setores)
    var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetCargas = ssAux.getSheetByName("Carga_Padrao_Setores");
    if (!sheetCargas || sheetCargas.getLastRow() <= 1) {
      return { sucesso: true, itens: [], totalExtraviados: 0, totalItensAfetados: 0, totalOmesAfetadas: 0 };
    }

    var dadosCargas = sheetCargas.getRange(2, 1, sheetCargas.getLastRow() - 1, 7).getValues();
    var cotasConfiguradas = [];
    var omesSet = {};
    var materiaisSet = {};

    dadosCargas.forEach(function(row) {
      var cOme = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(row[0]) : String(row[0] || '').trim();
      var cSub = String(row[1] || 'SEDE').trim();
      var cSet = String(row[2] || 'Geral').trim();
      var cMat = String(row[3] || '').trim();
      var cVal = parseInt(row[4], 10) || 0;
      var cData = String(row[5] || '').trim();
      var cResp = String(row[6] || '').trim();

      if (!cOme || !cMat || cVal <= 0) return;

      if (omeFiltroNorm !== "TODAS" && norm(cOme) !== norm(omeFiltroNorm)) {
        return;
      }

      omesSet[cOme] = true;
      materiaisSet[cMat.toUpperCase()] = true;
      cotasConfiguradas.push({
        ome: cOme,
        subunidade: cSub,
        setor: cSet,
        material: cMat,
        cargaPadrao: cVal,
        dataDefinicao: cData,
        responsavel: cResp
      });
    });

    if (cotasConfiguradas.length === 0) {
      return { sucesso: true, itens: [], totalExtraviados: 0, totalItensAfetados: 0, totalOmesAfetadas: 0 };
    }

    // 2. Consulta BigQuery para obter Qtd Real (ECD) dos materiais correspondentes
    var omesLista = Object.keys(omesSet);
    var inOmesSql = omesLista.map(function(o) {
      var variaveis = (typeof obterVariacoesOmeParaSql_ === 'function') ? obterVariacoesOmeParaSql_(o) : ("'" + o.replace(/'/g, "\\'") + "'");
      return variaveis;
    }).join(",");

    var inMatsSql = Object.keys(materiaisSet).map(function(m) {
      return "'" + m.replace(/'/g, "\\'") + "'";
    }).join(",");

    var sql = "SELECT " +
              "UPPER(TRIM(UNIDADE)) as ome_raw, " +
              "UPPER(TRIM(COALESCE(SUBUNIDADE, ''))) as sub_raw, " +
              "UPPER(TRIM(COALESCE(SETOR, ''))) as set_raw, " +
              "UPPER(TRIM(COALESCE(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, ''))) as loc_raw, " +
              "UPPER(TRIM(OBJETO)) as objeto_raw, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'ECD' THEN 1 ELSE 0 END) as qtd_ecd, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'SCD' THEN 1 ELSE 0 END) as qtd_scd, " +
              "SUM(CASE WHEN UPPER(TRIM(STATUS)) = 'ACAUTELADO' THEN 1 ELSE 0 END) as qtd_acautelado " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) IN (" + inOmesSql + ") " +
              "AND UPPER(TRIM(OBJETO)) IN (" + inMatsSql + ") " +
              "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) != 'BAIXADO') " +
              "GROUP BY ome_raw, sub_raw, set_raw, loc_raw, objeto_raw";

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];

    // Carrega árvores oficiais das OMEs envolvidas para normalização
    var mapaNomesPorOme = {};
    omesLista.forEach(function(o) {
      var infoArv = (typeof obterEstruturaArvoreOme_ === 'function') ? obterEstruturaArvoreOme_(o) : { mapaNomes: {} };
      mapaNomesPorOme[norm(o)] = infoArv.mapaNomes || {};
    });

    // Mapeia estoque real: ome___sub___setor___material -> { qtdEcd, qtdScd, qtdAcautelado }
    var mapaEstoqueReal = {};

    rows.forEach(function(r) {
      var oRaw = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(r.f[0].v) : String(r.f[0].v || "").trim();
      var subRaw = String(r.f[1].v || "").trim();
      var setRaw = String(r.f[2].v || "").trim();
      var locRaw = String(r.f[3].v || "").trim();
      var objRaw = String(r.f[4].v || "").trim();
      var qtdEcd = parseInt(r.f[5].v || 0);
      var qtdScd = parseInt(r.f[6].v || 0);
      var qtdAcautelado = parseInt(r.f[7].v || 0);

      var mapaNomesOme = mapaNomesPorOme[norm(oRaw)] || {};
      var noArvore = null;
      if (locRaw && mapaNomesOme[normComp_(locRaw)]) {
        noArvore = mapaNomesOme[normComp_(locRaw)];
      } else if (setRaw && mapaNomesOme[normComp_(setRaw)]) {
        noArvore = mapaNomesOme[normComp_(setRaw)];
      } else if (subRaw && mapaNomesOme[normComp_(subRaw)]) {
        noArvore = mapaNomesOme[normComp_(subRaw)];
      }

      var subRes = "SEDE";
      var setNome = "Geral";

      if (noArvore) {
        subRes = noArvore.subunidadeRes || "SEDE";
        setNome = noArvore.setorNome || "Geral";
      } else {
        if (subRaw && subRaw !== "-" && subRaw.toUpperCase() !== "GERAL" && normComp_(subRaw) !== normComp_(oRaw)) {
          subRes = (typeof resumirSubunidade === 'function') ? resumirSubunidade(subRaw) : subRaw;
        } else {
          subRes = "SEDE";
        }

        if (setRaw && setRaw !== "-" && setRaw.toUpperCase() !== "GERAL" && setRaw.toUpperCase() !== "SEDE" && normComp_(setRaw) !== normComp_(subRes)) {
          setNome = setRaw;
        } else {
          setNome = "Geral";
        }
      }

      if (!subRes || subRes === "-") subRes = "SEDE";
      if (!setNome || setNome === "-") setNome = "Geral";

      var chaveEstoque = norm(oRaw) + "___" + norm(subRes) + "___" + norm(setNome) + "___" + norm(objRaw);
      if (!mapaEstoqueReal[chaveEstoque]) {
        mapaEstoqueReal[chaveEstoque] = { qtdEcd: 0, qtdScd: 0, qtdAcautelado: 0 };
      }
      mapaEstoqueReal[chaveEstoque].qtdEcd += qtdEcd;
      mapaEstoqueReal[chaveEstoque].qtdScd += qtdScd;
      mapaEstoqueReal[chaveEstoque].qtdAcautelado += qtdAcautelado;
    });

    // 3. Cruza Cargas Padrão com o Estoque Real para identificar Extravios
    var itensExtraviados = [];
    var totalExtraviadosGeral = 0;
    var omesAfetadasSet = {};

    cotasConfiguradas.forEach(function(cota) {
      var chaveBusca = norm(cota.ome) + "___" + norm(cota.subunidade) + "___" + norm(cota.setor) + "___" + norm(cota.material);
      var estoque = mapaEstoqueReal[chaveBusca] || { qtdEcd: 0, qtdScd: 0, qtdAcautelado: 0 };

      var qtdReal = estoque.qtdEcd;
      var qtdScd = estoque.qtdScd || 0;
      var qtdAcautelado = estoque.qtdAcautelado || 0;

      var totalExistente = qtdReal + qtdScd + qtdAcautelado;
      var extraviado = (cota.cargaPadrao > totalExistente) ? (cota.cargaPadrao - totalExistente) : 0;
      var desvioReposicao = extraviado + qtdScd;

      if (desvioReposicao > 0) {
        totalExtraviadosGeral += desvioReposicao;
        omesAfetadasSet[cota.ome] = true;

        itensExtraviados.push({
          ome: cota.ome,
          subunidade: cota.subunidade,
          setor: cota.setor,
          material: cota.material,
          cargaPadrao: cota.cargaPadrao,
          qtdReal: qtdReal,
          qtdScd: qtdScd,
          qtdExtraviado: extraviado,
          desvioReposicao: desvioReposicao,
          dataDefinicao: cota.dataDefinicao,
          responsavel: cota.responsavel
        });
      }
    });

    // Ordenação: primeiro pelo maior desvio de reposição (mais crítico), depois por OME e Material
    itensExtraviados.sort(function(a, b) {
      if (b.desvioReposicao !== a.desvioReposicao) {
        return b.desvioReposicao - a.desvioReposicao;
      }
      var cmpOme = a.ome.localeCompare(b.ome);
      if (cmpOme !== 0) return cmpOme;
      return a.material.localeCompare(b.material);
    });

    // 4. Consolidações agregadas para o Painel de Reposição de Cargas do Administrador
    var mapaPorMaterial = {};
    var mapaPorOme = {};
    var totalExtraviadoGeralFisico = 0;
    var totalScdGeralFisico = 0;

    itensExtraviados.forEach(function(item) {
      totalExtraviadoGeralFisico += item.qtdExtraviado;
      totalScdGeralFisico += item.qtdScd;

      // --- Agrupamento por Material ---
      var mKey = item.material;
      if (!mapaPorMaterial[mKey]) {
        mapaPorMaterial[mKey] = {
          material: mKey,
          totalDesvio: 0,
          totalExtraviado: 0,
          totalScd: 0,
          totalCarga: 0,
          totalEcd: 0,
          nomesOmesSet: {},
          omes: []
        };
      }
      mapaPorMaterial[mKey].totalDesvio += item.desvioReposicao;
      mapaPorMaterial[mKey].totalExtraviado += item.qtdExtraviado;
      mapaPorMaterial[mKey].totalScd += item.qtdScd;
      mapaPorMaterial[mKey].totalCarga += item.cargaPadrao;
      mapaPorMaterial[mKey].totalEcd += item.qtdReal;
      mapaPorMaterial[mKey].nomesOmesSet[item.ome] = true;

      var omeEntradaMat = null;
      for (var idxO = 0; idxO < mapaPorMaterial[mKey].omes.length; idxO++) {
        if (mapaPorMaterial[mKey].omes[idxO].ome === item.ome) {
          omeEntradaMat = mapaPorMaterial[mKey].omes[idxO];
          break;
        }
      }
      if (!omeEntradaMat) {
        omeEntradaMat = {
          ome: item.ome,
          desvioReposicao: 0,
          extraviado: 0,
          qtdScd: 0,
          qtdReal: 0,
          cargaPadrao: 0,
          setores: []
        };
        mapaPorMaterial[mKey].omes.push(omeEntradaMat);
      }
      omeEntradaMat.desvioReposicao += item.desvioReposicao;
      omeEntradaMat.extraviado += item.qtdExtraviado;
      omeEntradaMat.qtdScd += item.qtdScd;
      omeEntradaMat.qtdReal += item.qtdReal;
      omeEntradaMat.cargaPadrao += item.cargaPadrao;
      omeEntradaMat.setores.push({
        subunidade: item.subunidade,
        setor: item.setor,
        cargaPadrao: item.cargaPadrao,
        qtdReal: item.qtdReal,
        qtdScd: item.qtdScd,
        extraviado: item.qtdExtraviado,
        desvioReposicao: item.desvioReposicao
      });

      // --- Agrupamento por OME ---
      var oKey = item.ome;
      if (!mapaPorOme[oKey]) {
        mapaPorOme[oKey] = {
          ome: oKey,
          totalDesvio: 0,
          totalExtraviado: 0,
          totalScd: 0,
          totalCarga: 0,
          totalEcd: 0,
          materiaisUnicosSet: {},
          materiais: []
        };
      }
      mapaPorOme[oKey].totalDesvio += item.desvioReposicao;
      mapaPorOme[oKey].totalExtraviado += item.qtdExtraviado;
      mapaPorOme[oKey].totalScd += item.qtdScd;
      mapaPorOme[oKey].totalCarga += item.cargaPadrao;
      mapaPorOme[oKey].totalEcd += item.qtdReal;
      mapaPorOme[oKey].materiaisUnicosSet[item.material] = true;

      var matEntradaOme = null;
      for (var idxM = 0; idxM < mapaPorOme[oKey].materiais.length; idxM++) {
        if (mapaPorOme[oKey].materiais[idxM].material === item.material) {
          matEntradaOme = mapaPorOme[oKey].materiais[idxM];
          break;
        }
      }
      if (!matEntradaOme) {
        matEntradaOme = {
          material: item.material,
          desvioReposicao: 0,
          extraviado: 0,
          qtdScd: 0,
          qtdReal: 0,
          cargaPadrao: 0,
          setores: []
        };
        mapaPorOme[oKey].materiais.push(matEntradaOme);
      }
      matEntradaOme.desvioReposicao += item.desvioReposicao;
      matEntradaOme.extraviado += item.qtdExtraviado;
      matEntradaOme.qtdScd += item.qtdScd;
      matEntradaOme.qtdReal += item.qtdReal;
      matEntradaOme.cargaPadrao += item.cargaPadrao;
      matEntradaOme.setores.push({
        subunidade: item.subunidade,
        setor: item.setor,
        cargaPadrao: item.cargaPadrao,
        qtdReal: item.qtdReal,
        qtdScd: item.qtdScd,
        extraviado: item.qtdExtraviado,
        desvioReposicao: item.desvioReposicao
      });
    });

    var listaPorMaterial = [];
    for (var kMat in mapaPorMaterial) {
      if (mapaPorMaterial.hasOwnProperty(kMat)) {
        var objMat = mapaPorMaterial[kMat];
        objMat.totalOmesAfetadas = Object.keys(objMat.nomesOmesSet).length;
        delete objMat.nomesOmesSet;
        objMat.omes.sort(function(a, b) { return b.desvioReposicao - a.desvioReposicao; });
        listaPorMaterial.push(objMat);
      }
    }
    listaPorMaterial.sort(function(a, b) { return b.totalDesvio - a.totalDesvio; });

    var listaPorOme = [];
    for (var kOme in mapaPorOme) {
      if (mapaPorOme.hasOwnProperty(kOme)) {
        var objOme = mapaPorOme[kOme];
        objOme.totalMateriaisAfetados = Object.keys(objOme.materiaisUnicosSet).length;
        delete objOme.materiaisUnicosSet;
        objOme.materiais.sort(function(a, b) { return b.desvioReposicao - a.desvioReposicao; });
        listaPorOme.push(objOme);
      }
    }
    listaPorOme.sort(function(a, b) { return b.totalDesvio - a.totalDesvio; });

    return {
      sucesso: true,
      itens: itensExtraviados,
      porMaterial: listaPorMaterial,
      porOme: listaPorOme,
      kpis: {
        totalReposicao: totalExtraviadosGeral,
        totalExtraviado: totalExtraviadoGeralFisico,
        totalScd: totalScdGeralFisico,
        totalOmesAfetadas: Object.keys(omesAfetadasSet).length,
        totalMateriaisAfetados: listaPorMaterial.length
      },
      totalExtraviados: totalExtraviadosGeral,
      totalItensAfetados: itensExtraviados.length,
      totalOmesAfetadas: Object.keys(omesAfetadasSet).length
    };
  } catch (err) {
    console.error("Erro em getResumoMateriaisExtraviadosGeral: " + err.message);
    return { sucesso: false, erro: err.message, itens: [], porMaterial: [], porOme: [], kpis: {}, totalExtraviados: 0, totalItensAfetados: 0, totalOmesAfetadas: 0 };
  }
}

function getPainelMacroGestaoReposicao() {
  var dados = getResumoMateriaisExtraviadosGeral("TODAS");
  if (!dados) {
    dados = { sucesso: false, erro: "Erro ao consultar dados", itens: [], porMaterial: [], porOme: [], kpis: {} };
  }

  // Integra os Materiais de Consumo em Nível Crítico
  try {
    var consumoCritico = getResumoMateriaisConsumoCriticos("TODAS");
    var itensConsumo = (consumoCritico && consumoCritico.itens) ? consumoCritico.itens : [];
    dados.consumoCritico = itensConsumo;
    dados.totalConsumoCritico = itensConsumo.length;

    // Se houver materiais de consumo críticos, agrega também nas estruturas porMaterial e porOme
    itensConsumo.forEach(function(cItem) {
      var matNome = String(cItem.material || "").trim();
      var omeNome = String(cItem.ome || "").trim();
      if (!matNome) return;

      // 1. Agrupamento por Material
      var matExistente = null;
      for (var i = 0; i < dados.porMaterial.length; i++) {
        if (dados.porMaterial[i].material.toUpperCase() === matNome.toUpperCase()) {
          matExistente = dados.porMaterial[i];
          break;
        }
      }

      if (matExistente) {
        matExistente.temConsumoCritico = true;
        if (!matExistente.consumoOmes) matExistente.consumoOmes = [];
        matExistente.consumoOmes.push({
          ome: omeNome,
          quantidadeAcumulada: cItem.quantidadeAcumulada,
          dataMarcacao: cItem.dataMarcacao,
          observacao: cItem.observacao
        });
      } else {
        dados.porMaterial.push({
          material: matNome,
          totalDesvio: 0,
          totalExtraviado: 0,
          totalScd: 0,
          totalCarga: 0,
          totalEcd: 0,
          totalOmesAfetadas: 1,
          tipoMaterial: 'CONSUMO',
          ehConsumo: true,
          temConsumoCritico: true,
          consumoOmes: [{
            ome: omeNome,
            quantidadeAcumulada: cItem.quantidadeAcumulada,
            dataMarcacao: cItem.dataMarcacao,
            observacao: cItem.observacao
          }],
          omes: []
        });
      }

      // 2. Agrupamento por OME
      var omeExistente = null;
      for (var j = 0; j < dados.porOme.length; j++) {
        if (dados.porOme[j].ome.toUpperCase() === omeNome.toUpperCase()) {
          omeExistente = dados.porOme[j];
          break;
        }
      }

      if (omeExistente) {
        omeExistente.totalConsumoCritico = (omeExistente.totalConsumoCritico || 0) + 1;
        if (!omeExistente.consumoMateriais) omeExistente.consumoMateriais = [];
        omeExistente.consumoMateriais.push({
          material: matNome,
          quantidadeAcumulada: cItem.quantidadeAcumulada,
          dataMarcacao: cItem.dataMarcacao,
          observacao: cItem.observacao
        });
      } else {
        dados.porOme.push({
          ome: omeNome,
          totalDesvio: 0,
          totalExtraviado: 0,
          totalScd: 0,
          totalCarga: 0,
          totalEcd: 0,
          totalMateriaisAfetados: 0,
          totalConsumoCritico: 1,
          consumoMateriais: [{
            material: matNome,
            quantidadeAcumulada: cItem.quantidadeAcumulada,
            dataMarcacao: cItem.dataMarcacao,
            observacao: cItem.observacao
          }],
          materiais: []
        });
      }
    });

  } catch (eCons) {
    console.warn("Aviso ao integrar materiais de consumo críticos no painel de reposição: " + eCons.message);
    dados.consumoCritico = [];
    dados.totalConsumoCritico = 0;
  }

  // Catálogo completo de materiais oficiais da base BigQuery
  try {
    dados.catalogoBigQuery = getMateriaisBigQueryUnicos();
  } catch (eBq) {
    console.warn("Aviso ao obter catalogoBigQuery no painel de reposição: " + eBq.message);
    dados.catalogoBigQuery = [];
  }

  return dados;
}

/**
 * Consulta e retorna a lista ordenada de todos os materiais únicos (OBJETO) da base corporativa BigQuery
 */
function getMateriaisBigQueryUnicos() {
  try {
    var sql = "SELECT DISTINCT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE OBJETO IS NOT NULL AND TRIM(OBJETO) != '' ORDER BY OBJETO ASC";
    var res = executarConsultaBigQuerySegura(sql);
    var lista = [];
    if (res && res.rows) {
      res.rows.forEach(function(r) {
        if (r.f && r.f[0] && r.f[0].v) {
          var nome = String(r.f[0].v).trim();
          if (nome && lista.indexOf(nome) === -1) {
            lista.push(nome);
          }
        }
      });
    }
    return lista;
  } catch (e) {
    console.error("Erro em getMateriaisBigQueryUnicos: " + e.message);
    return [];
  }
}

// =========================================================================

// FLUXO DE REMESSA E ASSINATURA DIGITAL PARA CONFIRMAÇÃO DE OME

// =========================================================================



function registrarRemessaPendente(dados) {
  try {
    var cpfInformado = String(dados.cpfAdmin || "").trim();
    if (!cpfInformado) {
      throw new Error("Informe o seu CPF para autorizar o despacho da remessa.");
    }

    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    if (!sheetLogins) throw new Error("Base de usuários não encontrada.");

    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxNome = cabecalho.indexOf("Nome");
    var idxOme = cabecalho.indexOf("OME"); // COLUNA DA OME

    var remetenteOme = "DLOG / CINT";
    for (var i = 1; i < dadosUsers.length; i++) {
      if (String(dadosUsers[i][idxCpf] || "").trim() === cpfInformado) {
        remetenteOme = String(dadosUsers[i][idxOme] || "DLOG").trim();
        break;
      }
    }

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ss.getSheetByName("RemessasPendentes");
    
    var idRemessa = "REM-" + new Date().getTime();
    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");

    sheetRemessa.appendRow([
      idRemessa,
      dataHora,
      String(dados.omeDestino || "").trim(),
      String(dados.material || "").trim(),
      parseInt(dados.quantidade) || 0,
      "AGUARDANDO_RECEBIMENTO",
      remetenteOme, // GRAVA EXATAMENTE A OME DO REMETENTE
      cpfInformado,
      "", 
      ""
    ]);

    registrarLogAuditoria("REMESSA_DESPACHADA", "OME " + remetenteOme + " despachou " + dados.quantidade + "x " + dados.material + " para " + dados.omeDestino);
    return { sucesso: true, mensagem: "Remessa despachada com sucesso pela OME " + remetenteOme + "!" };
  } catch (err) {
    throw new Error("Erro ao registrar remessa: " + err.message);
  }
}



function saoMesmaOme_(ome1, ome2) {
  if (!ome1 || !ome2) return false;
  var o1 = String(ome1).trim().toUpperCase();
  var o2 = String(ome2).trim().toUpperCase();
  if (o1 === o2) return true;

  var p1 = typeof obterOmePadronizada === "function" ? String(obterOmePadronizada(o1) || "").toUpperCase() : o1;
  var p2 = typeof obterOmePadronizada === "function" ? String(obterOmePadronizada(o2) || "").toUpperCase() : o2;
  if (p1 && p2 && p1 === p2) return true;

  var c1 = o1.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
  var c2 = o2.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
  if (!c1 || !c2) return false;

  // Evita falso positivo entre CI e CINT
  if ((c1 === "CI" && c2.indexOf("CINT") !== -1) || (c2 === "CI" && c1.indexOf("CINT") !== -1)) {
    return false;
  }

  if (c1 === c2 || c1.indexOf(c2) !== -1 || c2.indexOf(c1) !== -1) {
    return true;
  }

  var cp1 = p1.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
  var cp2 = p2.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
  if (cp1 === cp2 || cp1.indexOf(cp2) !== -1 || cp2.indexOf(cp1) !== -1) {
    if ((cp1 === "CI" && cp2.indexOf("CINT") !== -1) || (cp2 === "CI" && cp1.indexOf("CINT") !== -1)) return false;
    return true;
  }

  return false;
}

function getRemessasPendentesPorOme(omeUsuario) {
  try {
    try {
      corrigirUnidadeItensExtraviadosRemessas_();
    } catch (eCorr) {}

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ss.getSheetByName("RemessasPendentes");
    if (!sheetRemessa || sheetRemessa.getLastRow() <= 1) {
      return [];
    }

    // Se omeUsuario não foi passado, tenta obter da sessão
    if (!omeUsuario || String(omeUsuario).trim() === "") {
      try {
        var sessaoUser = typeof obterUsuarioSessao_ === "function" ? obterUsuarioSessao_() : null;
        if (sessaoUser) {
          if (String(sessaoUser.perfil || "").toLowerCase().indexOf("admin") !== -1) {
            omeUsuario = "TODAS";
          } else if (sessaoUser.ome) {
            omeUsuario = sessaoUser.ome;
          }
        }
      } catch(e) {}
    }

    var dados = sheetRemessa.getDataRange().getValues();
    var pendentes = [];
    var isTodas = String(omeUsuario || "").trim().toUpperCase() === "TODAS";

    for (var i = 1; i < dados.length; i++) {
      var idRem = String(dados[i][0] || "").trim();         // Coluna A: ID_Remessa
      var data = dados[i][1];                               // Coluna B: Data
      var destino = String(dados[i][2] || "").trim();       // Coluna C: OME_Destino
      var material = dados[i][3];                           // Coluna D: Material
      var qtd = dados[i][4];                                // Coluna E: Quantidade
      var status = String(dados[i][5] || "").trim().toUpperCase(); // Coluna F: Status
      var adminEnvio = String(dados[i][6] || "").trim();    // Coluna G: Admin_Envio
      var processoSeiCol = String(dados[i][10] || "").trim(); // Coluna K: SEI / Referência

      if (!idRem) continue;

      var statusLimpo = status.replace(/[\s_-]+/g, "_");
      var ehFinalizado = (statusLimpo === "RECEBIDO" || statusLimpo === "CONCLUIDO" || statusLimpo === "FINALIZADO" || statusLimpo === "CANCELADO" || statusLimpo === "RECUSADO" || statusLimpo === "REJEITADO");
      var ehPendente = !ehFinalizado && (
        statusLimpo === "PENDENTE" ||
        statusLimpo === "AGUARDANDO" ||
        statusLimpo === "AGUARDANDO_RECEBIMENTO" ||
        statusLimpo === "AGUARDANDO_LIBERACAO_CINT" ||
        statusLimpo === "AGUARDANDO_ACEITE" ||
        statusLimpo.indexOf("AGUARD") !== -1 ||
        statusLimpo.indexOf("PEND") !== -1 ||
        statusLimpo.indexOf("TRANSIT") !== -1 ||
        statusLimpo.indexOf("ENVIAD") !== -1 ||
        statusLimpo.indexOf("DESPACH") !== -1 ||
        !statusLimpo
      );

      if (!ehPendente) continue;

      // Extrai a OME de origem da coluna 'Admin_Envio'
      var origemEnvio = "CINT";
      if (adminEnvio) {
        var matchOme = adminEnvio.match(/^(.*?)\s*\(/);
        if (matchOme) {
          origemEnvio = matchOme[1].trim();
        } else {
          origemEnvio = adminEnvio.trim();
        }
      }

      var ehDestino = isTodas || saoMesmaOme_(destino, omeUsuario);
      var ehOrigem = isTodas || saoMesmaOme_(origemEnvio, omeUsuario);

      // Se a remessa não pertence à OME nem como remetente nem como destinatária, ignora
      if (!isTodas && !ehDestino && !ehOrigem) {
        continue;
      }

      var ehInterna = (idRem.indexOf("INTERN") !== -1) || 
                      (processoSeiCol.indexOf("INTERNAL_TREE") !== -1) || 
                      (saoMesmaOme_(destino, origemEnvio));

      var papel = "DESTINO";
      if (ehInterna) {
        papel = "INTERNA";
      } else if (!isTodas && ehOrigem && !ehDestino) {
        papel = "REMETENTE";
      } else {
        papel = "DESTINO";
      }

      var podeReceber = (papel === "DESTINO" || papel === "INTERNA");

      pendentes.push({
        id: idRem,
        data: String(data || ""),
        material: String(material || ""),
        quantidade: parseInt(qtd || 0),
        destino: destino,
        origem: origemEnvio,
        despachante: adminEnvio || "Administração",
        sei: processoSeiCol || "N/I",
        papel: papel,
        podeReceber: podeReceber
      });
    }
    return pendentes;
  } catch (err) {
    console.error("Erro crítico em getRemessasPendentesPorOme: " + err.message);
    return [];
  }
}



function assinarEConfirmarRecebimento(dadosAssinatura) {
  try {
    var cpfInformado = String(dadosAssinatura.cpf || "").trim();
    var idRemessa = String(dadosAssinatura.idRemessa || "").trim();
    var qtdEcd = parseInt(dadosAssinatura.qtdEcd) || 0;
    var qtdScd = parseInt(dadosAssinatura.qtdScd) || 0;

    if (!cpfInformado || !idRemessa) {
      throw new Error("Informe o seu CPF para realizar a assinatura digital de recebimento.");
    }

    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    if (!sheetLogins) throw new Error("Base de usuários não encontrada.");

    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxOme = cabecalho.indexOf("OME");
    var idxPerfil = cabecalho.indexOf("Perfil");
    var idxNome = cabecalho.indexOf("Nome");

    var usuarioValido = null;
    for (var i = 1; i < dadosUsers.length; i++) {
      if (String(dadosUsers[i][idxCpf] || "").trim() === cpfInformado) {
        usuarioValido = {
          nome: String(dadosUsers[i][idxNome] || "").trim(),
          ome: String(dadosUsers[i][idxOme] || "").trim(),
          perfil: String(dadosUsers[i][idxPerfil] || "").trim()
        };
        break;
      }
    }

    if (!usuarioValido) throw new Error("CPF não encontrado na base de dados do sistema.");

    var sheetRemessa = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR).getSheetByName("RemessasPendentes");
    var dadosRem = sheetRemessa.getDataRange().getValues();
    var linhaRemessa = -1;
    var remessaObj = null;

    for (var j = 1; j < dadosRem.length; j++) {
      if (String(dadosRem[j][0]).trim() === idRemessa) {
        linhaRemessa = j + 1;
        remessaObj = {
          omeDestino: String(dadosRem[j][2]).trim(),
          material: dadosRem[j][3],
          quantidade: dadosRem[j][4],
          referenciaSei: String(dadosRem[j][10] || "").trim() // Coluna K (SEI / BGE)
        };
        break;
      }
    }

    if (linhaRemessa === -1 || !remessaObj) throw new Error("Remessa não encontrada ou já processada.");

    var ehAdministrador = usuarioValido.perfil.toUpperCase() === "ADMINISTRADOR";
    var mesmaOme = (typeof obterOmePadronizada === 'function' ? obterOmePadronizada(usuarioValido.ome) : usuarioValido.ome).toUpperCase() === (typeof obterOmePadronizada === 'function' ? obterOmePadronizada(remessaObj.omeDestino) : remessaObj.omeDestino).toUpperCase();
    if (!ehAdministrador && !mesmaOme) {
      throw new Error("Acesso negado. Apenas usuários lotados na OME destino podem assinar o recebimento.");
    }

    // --- CORREÇÃO PRINCIPAL: TRANSFERÊNCIA REAL DE UNIDADE E SUBUNIDADE ---
    // Em vez de criar novos itens, buscamos os itens físicos que estão na SEDE do CINT 
    // correspondentes ao processo SEI e material da remessa, e mudamos a UNIDADE para a OME destino.
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var materialClean = limparSQL(remessaObj.material);
    var omeDestinoClean = limparSQL(typeof obterOmePadronizada === 'function' ? obterOmePadronizada(remessaObj.omeDestino) : remessaObj.omeDestino);
    var totalNecessario = parseInt(remessaObj.quantidade, 10) || 0;

    // Extrai o número SEI puro da referência gravada na coluna K
    var seiPuro = remessaObj.referenciaSei;
    if (seiPuro.indexOf("SEI:") !== -1) {
      seiPuro = seiPuro.split("SEI:")[1].split("|")[0].trim();
    } else if (seiPuro.indexOf("|") !== -1) {
      seiPuro = seiPuro.split("|")[0].trim();
    }

    // Busca no BigQuery os IDs físicos disponíveis no CINT (Sede) para este lote
    var sqlBusca = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                   "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                   "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                   "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "')) ";
                   
    if (seiPuro && seiPuro !== "N/I" && !seiPuro.includes("TRANSFERENCIA")) {
      sqlBusca += "AND UPPER(TRIM(SEI_COMPRA_RECEBIMENTO)) LIKE UPPER('%" + limparSQL(seiPuro) + "%') ";
    }
    
    sqlBusca += "LIMIT " + totalNecessario;

    var resBusca = executarConsultaBigQuerySegura(sqlBusca);
    var rows = resBusca.rows || [];

    if (rows.length > 0) {
      var idsParaTransferir = [];
      rows.forEach(function(r) {
        if (r.f[0].v) idsParaTransferir.push("'" + limparSQL(String(r.f[0].v)) + "'");
      });

      // EXECUTA O UPDATE OFICIAL: O item sai do CINT e vai para a OME destino, alocado na SEDE
      var sqlUpdate = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                      "UNIDADE = '" + omeDestinoClean + "', " +
                      "SUBUNIDADE = 'SEDE', " +
                      "SETOR = NULL, " +
                      "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL " +
                      "WHERE ITEM IN (" + idsParaTransferir.join(",") + ")";

      executarConsultaBigQuerySegura(sqlUpdate, true);
    } else {
      // Fallback de segurança caso os itens específicos não sejam encontrados por lote exato: 
      // Atualiza por quantidade genérica vinculada ao material na sede do CINT
      var sqlUpdateGen = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                         "UNIDADE = '" + omeDestinoClean + "', " +
                         "SUBUNIDADE = 'SEDE', " +
                         "SETOR = NULL, " +
                         "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL " +
                         "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                         "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                         "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "')) " +
                         "LIMIT " + totalNecessario;
      executarConsultaBigQuerySegura(sqlUpdateGen, true);
    }

    // Atualiza o status da remessa na planilha auxiliar para CONFIRMADO
    sheetRemessa.getRange(linhaRemessa, 6).setValue("CONFIRMADO");
    sheetRemessa.getRange(linhaRemessa, 9).setValue(usuarioValido.nome);
    sheetRemessa.getRange(linhaRemessa, 10).setValue(cpfInformado);

    // Sincronização estrita com a planilha #DIST:
    // A quantidade na #DIST só é alterada a partir do momento em que a OME Destino confirma o recebimento assinando a remessa
    try {
      var qtdConfAssinatura = (qtdEcd + qtdScd > 0) ? (qtdEcd + qtdScd) : (parseInt(remessaObj.quantidade, 10) || 0);
      sincronizarConfirmacaoRecebimentoDist({
        idRemessa: idRemessa,
        omeDestino: (typeof obterOmePadronizada === 'function' ? obterOmePadronizada(remessaObj.omeDestino) : remessaObj.omeDestino),
        material: remessaObj.material,
        quantidadeTotal: parseInt(remessaObj.quantidade, 10) || 0,
        quantidadeConfirmada: qtdConfAssinatura,
        referenciaSei: remessaObj.referenciaSei,
        nomeRecebedor: usuarioValido.nome,
        cpfRecebedor: cpfInformado
      });
    } catch (eDistConf) {
      console.warn("Aviso ao sincronizar confirmação de remessa com #DIST: " + eDistConf.message);
    }

    registrarLogAuditoria("ASSINATURA_DIGITAL_RECEBIMENTO", "Usuário " + usuarioValido.nome + " confirmou o recebimento da remessa " + idRemessa + " para a OME " + remessaObj.omeDestino);
    return { sucesso: true, mensagem: "Recebimento confirmado com sucesso! Os materiais foram transferidos para o estoque da sua OME (SEDE)." };
  } catch (err) {
    throw new Error(err.message);
  }
}



function recusarRemessaPendente(dadosRecusa) {

  try {

    var cpfInformado = String(dadosRecusa.cpf || "").trim();

    var idRemessa = String(dadosRecusa.idRemessa || "").trim();



    if (!cpfInformado || !idRemessa) {

      throw new Error("Informe o CPF para registrar a recusa.");

    }



    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);

    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);

    var dadosUsers = sheetLogins.getDataRange().getValues();

    var cabecalho = dadosUsers[0];

    var idxCpf = cabecalho.indexOf("CPF");

    var idxOme = cabecalho.indexOf("OME");

    var idxPerfil = cabecalho.indexOf("Perfil");

    var idxNome = cabecalho.indexOf("Nome");



    var usuarioValido = null;

    for (var i = 1; i < dadosUsers.length; i++) {

      if (String(dadosUsers[i][idxCpf] || "").trim() === cpfInformado) {

        usuarioValido = {

          nome: dadosUsers[i][idxNome],

          ome: String(dadosUsers[i][idxOme] || "").trim(),

          perfil: String(dadosUsers[i][idxPerfil] || "").trim()

        };

        break;

      }

    }



    if (!usuarioValido) throw new Error("CPF não encontrado na base de dados.");



    var sheetRemessa = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR).getSheetByName("RemessasPendentes");

    var dadosRem = sheetRemessa.getDataRange().getValues();

    var linhaRemessa = -1;

    var remessaObj = null;



    for (var j = 1; j < dadosRem.length; j++) {

      if (String(dadosRem[j][0]).trim() === idRemessa) {

        linhaRemessa = j + 1;

        remessaObj = { omeDestino: String(dadosRem[j][2]).trim() };

        break;

      }

    }



    if (linhaRemessa === -1 || !remessaObj) throw new Error("Remessa não encontrada.");



    var ehAdministrador = usuarioValido.perfil.toUpperCase() === "ADMINISTRADOR";

    var mesmaOme = usuarioValido.ome.toUpperCase() === remessaObj.omeDestino.toUpperCase();

    if (!ehAdministrador && !mesmaOme) {

      throw new Error("Acesso negado para recusar esta remessa.");

    }



    sheetRemessa.getRange(linhaRemessa, 6).setValue("RECUSADO");



    registrarLogAuditoria("RECUSA_REMESSA", "Usuário " + usuarioValido.nome + " recusou a remessa " + idRemessa);

    return { sucesso: true, mensagem: "Remessa recusada com sucesso." };

  } catch (err) {

    throw new Error(err.message);

  }

}



// =========================================================================

// RECEBIMENTO E BAIXA DE PROCESSOS NO CINT (ALMOXARIFADO)

// =========================================================================



function garantirAbaTbMateriais() {

  var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);

  var sheet = ss.getSheetByName("tb_Materiais");

  if (!sheet) {

    sheet = ss.insertSheet("tb_Materiais");

    sheet.appendRow([

      "ID_Recebimento", 

      "Numero_Processo", 

      "Data_Chegada", 

      "Material", 

      "Fornecedor", 

      "Contato", 

      "Marca", 

      "Modelo", 

      "Qtd_Recebida", 

      "Status_Condicao", 

      "Link_Foto", 

      "Responsavel"

    ]);

  }

  return sheet;

}



function confirmarRecebimentoCINT(dadosRecebimento) {
  try {
    console.log("1 - Iniciando confirmação");

    var email = "";
    try { email = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    if (!email) {
      try { email = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    }

    console.log("2 - E-mail: " + email);
    var usuario = verificarPermissaoUsuario(email);
    if (!usuario || !usuario.email) {
      throw new Error("Sessão não identificada ou e-mail não encontrado na base de Logins (" + email + ").");
    }

    console.log("3 - Usuário autorizado: " + JSON.stringify(usuario));

    // REGRAS DE PERMISSÃO: Usuário comum não tem permissão para lançar recebimento
    var perfilUp = String(usuario.perfil || "").trim().toUpperCase();
    var omeUp = String(usuario.ome || "").trim().toUpperCase();

    if (perfilUp === "USUÁRIO" || perfilUp === "USUARIO") {
      throw new Error("Acesso restrito: Usuários com perfil padrão não possuem permissão para realizar recebimento de materiais.");
    }

    // REGRAS DE INTEGRAÇÃO COM DLOG:
    // Apenas compras centrais (Administrador, Administrativo ou OME DLOG/CINT) integram com as bases da DLOG (#DIST e #PLAN).
    // O Chefe de Setor só cadastra recebimento de materiais comprados pela própria OME (compra local),
    // portanto as informações preenchidas NÃO devem ser integradas com as bases da DLOG,
    // devendo nesse caso seguir o fluxo original (material nasce na própria OME do usuário).
    var deveIntegrarDlog = (perfilUp === "ADMINISTRADOR" || perfilUp === "ADMINISTRATIVO" || omeUp === "DLOG" || omeUp === "CINT");

    var unidadeFinal = "CINT";
    if (!deveIntegrarDlog) {
      unidadeFinal = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(usuario.ome || "DLOG") : (usuario.ome || "DLOG");
    }

    // Validação de segurança no backend para Viaturas
    var infoViatura = verificarClasse2MaterialCatalogo(dadosRecebimento.material);
    var numerosSerie = Array.isArray(dadosRecebimento.numerosSerie) ? dadosRecebimento.numerosSerie : [];
    var qtdRecebidaInt = parseInt(dadosRecebimento.quantidadeRecebida, 10) || 1;

    if (infoViatura && infoViatura.ehViatura) {
      if (numerosSerie.length < qtdRecebidaInt) {
        throw new Error("O material '" + dadosRecebimento.material + "' é classificado como VIATURA ATV FIM. É obrigatório informar o número de série para todas as " + qtdRecebidaInt + " viaturas.");
      }
      for (var sv = 0; sv < qtdRecebidaInt; sv++) {
        if (!String(numerosSerie[sv] || "").trim()) {
          throw new Error("O número de série da Viatura #" + (sv + 1) + " não foi preenchido.");
        }
      }
    }

    var dadosEntrada = {
      material: dadosRecebimento.material,
      statusConservacao: dadosRecebimento.statusCondicao || "ECD",
      quantidade: dadosRecebimento.quantidadeRecebida,
      seiCompra: dadosRecebimento.numeroProcesso,
      unidade: unidadeFinal,
      subunidade: "SEDE",
      setor: "",
      localArmazenamento: "SEDE",
      linkFoto: dadosRecebimento.linkFoto || "",
      nPatrimonio: dadosRecebimento.nPatrimonio || "",
      numerosSerie: numerosSerie,
      numerosPatrimonio: (Array.isArray(dadosRecebimento.numerosPatrimonio) ? dadosRecebimento.numerosPatrimonio : []),
      observacao: dadosRecebimento.observacao || ""
    };

    // Primeiro confirma a escrita no BigQuery. Só depois grava o espelho na planilha,
    // evitando registrar uma entrada na planilha quando o INSERT falhar.
    console.log("4 - Gravando no BigQuery");
    var resultadoEstoque = registrarEntradaEstoque(dadosEntrada);
    console.log("5 - BigQuery concluído: " + JSON.stringify(resultadoEstoque));

    var sheetCINT = garantirAbaTbMateriais();
    console.log("6 - Planilha localizada");

    var idRec = "REC-" + new Date().getTime();
    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "yyyy-MM-dd HH:mm:ss");

    var modeloComSeries = String(dadosRecebimento.modelo || "").trim();
    if (numerosSerie.length > 0) {
      modeloComSeries = modeloComSeries ? (modeloComSeries + " [Séries: " + numerosSerie.join(", ") + "]") : ("Séries: " + numerosSerie.join(", "));
    }

    sheetCINT.appendRow([
      idRec,
      String(dadosRecebimento.numeroProcesso || "").trim(),
      dataHora,
      String(dadosRecebimento.material || "").trim(),
      String(dadosRecebimento.fornecedor || "").trim(),
      String(dadosRecebimento.contato || "").trim(),
      String(dadosRecebimento.marca || "").trim(),
      modeloComSeries,
      parseInt(dadosRecebimento.quantidadeRecebida, 10) || 0,
      String(dadosRecebimento.statusCondicao || "ECD").trim(),
      String(dadosRecebimento.linkFoto || "").trim(),
      usuario.email
    ]);

    console.log("7 - AppendRow executado");

    var logSeriesTxt = numerosSerie.length > 0 ? (" [Séries: " + numerosSerie.join(", ") + "]") : "";
    registrarLogAuditoria(
      "RECEBIMENTO_ALMOXARIFADO",
      "Usuário " + usuario.nome + " (" + usuario.ome + ") recebeu lote do processo " + dadosRecebimento.numeroProcesso + logSeriesTxt + (deveIntegrarDlog ? " [Compra Central DLOG]" : " [Compra Local OME]")
    );

    console.log("8 - Processo concluído");

    // 9 - Sincronização com a aba #DIST na planilha oficial da DLOG (Apenas Administrador, DLOG ou CINT)
    var infoSincDist = "";
    if (deveIntegrarDlog) {
      try {
        var numControleReceb = dadosRecebimento.numeroControle || obterNumeroControlePlan(dadosRecebimento.numeroProcesso, dadosRecebimento.material);
        console.log("9 - Nº Controle identificado para #DIST: " + numControleReceb);
        var resDist = sincronizarRecebimentoDist(
          dadosRecebimento,
          numControleReceb,
          dadosRecebimento.modoParcela,
          dadosRecebimento.linhaDistExistente,
          dadosRecebimento.qtdExistente
        );
        if (resDist && resDist.sucesso) {
          infoSincDist = " (#DIST atualizada na linha " + resDist.linha + (resDist.modo === 'SOMAR_PARCELA' ? ' [Parcela Somada, Total: ' + resDist.qtdTotal + ']' : ' [Novo Registro]') + ")";
        } else if (resDist && !resDist.sucesso) {
          infoSincDist = " [Aviso #DIST: " + resDist.erro + "]";
        }
      } catch (errDist) {
        console.error("Aviso: Falha na sincronização com #DIST no Recebimento: " + errDist.message);
        infoSincDist = " [Erro #DIST: " + errDist.message + "]";
      }
    } else {
      console.log("9 - Recebimento local da OME " + unidadeFinal + " realizado por " + usuario.nome + " (Chefe de Setor). Integração com DLOG (#DIST) não executada conforme regra de compra própria da OME.");
      infoSincDist = " (Recebimento local da OME " + unidadeFinal + " registrado)";
    }

    var idTicketDoacao = "";
    if (dadosRecebimento.isDoacao) {
      try {
        var abaDoacao = getAbaTicketsDoacao_();
        idTicketDoacao = "TICK-DOA-" + new Date().getTime();
        var statusInicialDoacao = (deveIntegrarDlog && dadosRecebimento.cpfAssinatura) ? "APROVADO" : "PENDENTE";
        var obsInicial = dadosRecebimento.cpfAssinatura ? ("Aprovado direto por CPF: " + dadosRecebimento.cpfAssinatura) : "";

        abaDoacao.appendRow([
          idTicketDoacao,                                            // 0: ID_Ticket
          dataHora,                                                  // 1: Data
          usuario.ome || dadosRecebimento.usuarioOme || unidadeFinal, // 2: OME
          usuario.nome || "Não identificado",                        // 3: SolicitanteNome
          usuario.cpf || "SEM CPF",                                  // 4: SolicitanteCpf
          usuario.email || "",                                       // 5: SolicitanteEmail
          String(dadosRecebimento.numeroProcesso || "N/D").trim(),   // 6: Processo
          String(dadosRecebimento.material || "").trim(),            // 7: Material
          parseInt(dadosRecebimento.quantidadeRecebida, 10) || 1,    // 8: Quantidade
          String(dadosRecebimento.unidadeMedida || "UND").trim(),    // 9: UnidadeMedida
          String(dadosRecebimento.statusCondicao || "ECD").trim(),   // 10: Condicao
          String(dadosRecebimento.fornecedor || "").trim(),          // 11: Fornecedor
          String(dadosRecebimento.linkFoto || "").trim(),            // 12: LinkFoto
          statusInicialDoacao,                                       // 13: Status
          "",                                                        // 14: Motivo
          obsInicial                                                 // 15: Obs
        ]);
        console.log("Ticket de doação " + idTicketDoacao + " registrado com sucesso em Tickets_Doacao.");
      } catch (errDoa) {
        console.error("Erro ao registrar em Tickets_Doacao: " + errDoa.message);
      }
    }

    return {
      sucesso: true,
      ehDoacao: !!dadosRecebimento.isDoacao,
      requerAprovacao: (dadosRecebimento.isDoacao && !dadosRecebimento.cpfAssinatura),
      idTicket: idTicketDoacao,
      mensagem: "Baixa realizada com sucesso! Dados registrados e direcionados para a unidade " + unidadeFinal + "." + infoSincDist
    };

  } catch (err) {
    console.error(err);
    throw new Error("Erro ao confirmar recebimento: " + (err && err.message ? err.message : err));
  }
}


function getProcessosAbertosPlan() {
  try {
    var usuario = null;
    try { usuario = getDadosUsuarioLogado(); } catch (e) {}
    if (usuario && usuario.perfil) {
      var pNorm = String(usuario.perfil).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Apenas Administrador tem acesso à tabela de processos de compras da DLOG
      if (pNorm.indexOf("admin") === -1 && String(usuario.ome || "").toUpperCase() !== "DLOG") {
        return [];
      }
    }

    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var sheet = obterAbaPorNomeAproximado(ss, "#PLAN");
    if (!sheet || sheet.getLastRow() <= 5) return [];

    var ultLinha = sheet.getLastRow();
    var ultCol = Math.max(37, sheet.getLastColumn());
    var dadosPlan = sheet.getRange(1, 1, ultLinha, ultCol).getValues(); 
    var processos = [];

    function normalizarChaveControle(val) {
      if (val === undefined || val === null) return "";
      return String(val).trim().toUpperCase().replace(/\s+/g, "");
    }

    function extrairChaveNumericaControle(val) {
      if (val === undefined || val === null) return "";
      var s = String(val).trim();
      var match = s.match(/^0*(\d+)\/(\d{2,4})$/);
      if (match) {
        var ano = match[2].length === 2 ? ("20" + match[2]) : match[2];
        return match[1] + "/" + ano;
      }
      return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    }

    function ehValorPreenchidoGeral(val) {
      if (val === undefined || val === null) return false;
      var str = String(val).trim();
      if (!str) return false;
      var strUpper = str.toUpperCase();
      if (str === "-" || str === "--" || str === "—" || str === "." || strUpper === "N/A" || strUpper === "NULL" || strUpper === "#N/A" || strUpper === "#REF!" || strUpper === "#VALOR!") {
        return false;
      }
      return true;
    }

    // --- LEITURA DA ABA #DGC (Divisão de Gestão de Contratos) ---
    // Cruzamento oficial:
    // - Coluna EB (índice 131): Venc Entrega (NUMÉRICO / DIAS - BASE OFICIAL DE ORDENAMENTO)
    // - Coluna EC (índice 132): Previsão De Entrega (DATA)
    var mapDgcVencPorCtrlProc = {};
    var mapDgcVencPorCtrlProcNum = {};
    var mapDgcVencPorCtrlProcEObjeto = {};
    var mapDgcVencPorControleObj = {};
    var mapDgcVencPorSei = {};
    var mapDgcVencPorLinha = {};

    var mapDgcPrevPorCtrlProc = {};
    var mapDgcPrevPorCtrlProcNum = {};
    var mapDgcPrevPorCtrlProcEObjeto = {};
    var mapDgcPrevPorControleObj = {};
    var mapDgcPrevPorSei = {};
    var mapDgcPrevPorLinha = {};

    var mapDgcTipoProcesso = {};

    try {
      var sheetDgc = obterAbaPorNomeAproximado(ss, "#DGC");
      if (!sheetDgc) sheetDgc = obterAbaPorNomeAproximado(ss, "DGC");
      if (!sheetDgc) {
        var allSheets = ss.getSheets();
        for (var s = 0; s < allSheets.length; s++) {
          if (allSheets[s].getName().trim().toUpperCase().indexOf("DGC") !== -1) {
            sheetDgc = allSheets[s];
            break;
          }
        }
      }

      if (sheetDgc && sheetDgc.getLastRow() >= 5) {
        var ultLinhaDgc = sheetDgc.getLastRow();
        var lastColDgc = sheetDgc.getLastColumn();
        var dadosDgc = sheetDgc.getRange(1, 1, ultLinhaDgc, lastColDgc).getValues();

        // Padrões fixos oficiais: EB = 131 (Venc Entrega), EC = 132 (Previsão De Entrega)
        var colVencEntregaIdx = (lastColDgc >= 132) ? 131 : -1;
        var colPrevisaoEntregaIdx = (lastColDgc >= 133) ? 132 : -1;
        var colKeyDgcIdx = (lastColDgc >= 6) ? 5 : 0;
        var colTipoDgcIdx = (lastColDgc >= 7) ? 6 : -1; // Padrão: Coluna G (índice 6)
        var colSeiDgcIdx = (lastColDgc >= 4) ? 3 : -1;
        var colObjDgcIdx = (lastColDgc >= 9) ? 8 : -1;
        var colCtrlObjDgcIdx = (lastColDgc >= 2) ? 1 : -1;
        var linhaCabecalhoDgc = -1;

        // Varre as primeiras 8 linhas de #DGC para localizar cabeçalhos dinamicamente
        for (var rD = 0; rD < Math.min(8, dadosDgc.length); rD++) {
          var hRowD = dadosDgc[rD];
          for (var cd = 0; cd < hRowD.length; cd++) {
            var hd = String(hRowD[cd] || "").trim().toUpperCase();
            if (!hd) continue;
            var hdNorm = hd.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // 1. Previsão de Entrega (Coluna EC)
            if ((hdNorm.indexOf("PREVIS") !== -1 && hdNorm.indexOf("ENTREG") !== -1) ||
                hdNorm === "PREVISAO DE ENTREGA" ||
                hdNorm === "PREVISAO ENTREGA" ||
                hdNorm === "PREVISÃO DE ENTREGA" ||
                hdNorm === "DATA PREVISTA" ||
                hdNorm.indexOf("ENTREGA PREVISTA") !== -1) {
              colPrevisaoEntregaIdx = cd;
              linhaCabecalhoDgc = Math.max(linhaCabecalhoDgc, rD);
            }
            // 2. Vencimento da Entrega (Coluna EB - Numérico / Dias - Base Oficial de Ordenamento)
            else if ((hdNorm.indexOf("VENC") !== -1 && hdNorm.indexOf("ENTREG") !== -1) || 
                     hdNorm === "VENC ENTREGA" || 
                     hdNorm === "VENC. ENTREGA" || 
                     hdNorm === "VENCIMENTO ENTREGA" || 
                     hdNorm === "VENCIMENTO DA ENTREGA" || 
                     hdNorm === "PRAZO ENTREGA" ||
                     hdNorm === "PRAZO DE ENTREGA" ||
                     hdNorm === "VENCIMENTO") {
              colVencEntregaIdx = cd;
              linhaCabecalhoDgc = Math.max(linhaCabecalhoDgc, rD);
            }

            // Controle Processo (Chave F da DGC)
            if ((hdNorm.indexOf("CONTROLE") !== -1 && hdNorm.indexOf("PROC") !== -1) || 
                hdNorm.indexOf("CONTROLE (PROC") !== -1 || 
                hdNorm.indexOf("CONTROLE PROCESSO") !== -1) {
              colKeyDgcIdx = cd;
              linhaCabecalhoDgc = Math.max(linhaCabecalhoDgc, rD);
            }

            // Tipo de Processo (Coluna G da DGC / #PLAN)
            if (hdNorm.indexOf("TIPO DE PROCESSO") !== -1 || 
                hdNorm.indexOf("TIPO PROCESSO") !== -1 || 
                (hdNorm.indexOf("TIPO") !== -1 && hdNorm.indexOf("PROC") !== -1) || 
                hdNorm === "TIPO" || 
                hdNorm.indexOf("MODALIDADE") !== -1) {
              colTipoDgcIdx = cd;
              linhaCabecalhoDgc = Math.max(linhaCabecalhoDgc, rD);
            }

            // Processo / SEI
            if (hdNorm === "SEI" || hdNorm === "PROCESSO" || hdNorm.indexOf("PROCESSO / SEI") !== -1 || hdNorm.indexOf("N PROCESSO") !== -1 || hdNorm.indexOf("NUMERO PROCESSO") !== -1) {
              colSeiDgcIdx = cd;
              linhaCabecalhoDgc = Math.max(linhaCabecalhoDgc, rD);
            }

            // Objeto
            if (hdNorm === "OBJETO" || hdNorm.indexOf("DESCRICAO") !== -1 || hdNorm.indexOf("DESCRIÇÃO") !== -1) {
              colObjDgcIdx = cd;
              linhaCabecalhoDgc = Math.max(linhaCabecalhoDgc, rD);
            }
          }
        }

        var offsetDadosDgc = (linhaCabecalhoDgc !== -1) ? (linhaCabecalhoDgc + 1) : 4;

        for (var d = offsetDadosDgc; d < dadosDgc.length; d++) {
          var rowD = dadosDgc[d];
          var numLinhaReal = 1 + d;
          var valVenc = (colVencEntregaIdx !== -1 && colVencEntregaIdx < rowD.length) ? rowD[colVencEntregaIdx] : null;
          var valPrev = (colPrevisaoEntregaIdx !== -1 && colPrevisaoEntregaIdx < rowD.length) ? rowD[colPrevisaoEntregaIdx] : null;
          var valTipoDgc = (colTipoDgcIdx !== -1 && colTipoDgcIdx < rowD.length) ? String(rowD[colTipoDgcIdx] || "").trim() : "";

          var ctrlProcDgc = (colKeyDgcIdx !== -1 && colKeyDgcIdx < rowD.length) ? String(rowD[colKeyDgcIdx] || "").trim() : "";
          var ctrlObjDgc = (colCtrlObjDgcIdx !== -1 && colCtrlObjDgcIdx < rowD.length) ? String(rowD[colCtrlObjDgcIdx] || "").trim() : "";
          var seiD = (colSeiDgcIdx !== -1 && colSeiDgcIdx < rowD.length) ? String(rowD[colSeiDgcIdx] || "").trim() : "";
          var objD = (colObjDgcIdx !== -1 && colObjDgcIdx < rowD.length) ? String(rowD[colObjDgcIdx] || "").trim() : "";

          var kNorm = normalizarChaveControle(ctrlProcDgc);
          var kNum = extrairChaveNumericaControle(ctrlProcDgc);

          var temDataVenc = ehValorPreenchidoGeral(valVenc);
          var temDataPrev = ehValorPreenchidoGeral(valPrev);

          // Armazenamento de Venc Entrega (Coluna EB - Numérico / Dias)
          if (kNorm) {
            if (!mapDgcVencPorCtrlProc[kNorm] || temDataVenc) mapDgcVencPorCtrlProc[kNorm] = valVenc;
            if (kNum && (!mapDgcVencPorCtrlProcNum[kNum] || temDataVenc)) mapDgcVencPorCtrlProcNum[kNum] = valVenc;
            if (valTipoDgc) {
              mapDgcTipoProcesso[kNorm] = valTipoDgc;
              if (kNum) mapDgcTipoProcesso[kNum] = valTipoDgc;
            }
            if (objD) {
              var kObj = kNorm + "_" + normalizarChaveControle(objD);
              if (!mapDgcVencPorCtrlProcEObjeto[kObj] || temDataVenc) mapDgcVencPorCtrlProcEObjeto[kObj] = valVenc;
            }
          }
          if (ctrlObjDgc && (!mapDgcVencPorControleObj[ctrlObjDgc] || temDataVenc)) mapDgcVencPorControleObj[ctrlObjDgc] = valVenc;
          if (seiD) {
            var seiKey = seiD.toUpperCase();
            if (!mapDgcVencPorSei[seiKey] || temDataVenc) mapDgcVencPorSei[seiKey] = valVenc;
            if (valTipoDgc) mapDgcTipoProcesso[seiKey] = valTipoDgc;
          }
          if (temDataVenc) mapDgcVencPorLinha[numLinhaReal] = valVenc;

          // Armazenamento de Previsão De Entrega (Coluna EC - Data)
          if (kNorm) {
            if (!mapDgcPrevPorCtrlProc[kNorm] || temDataPrev) mapDgcPrevPorCtrlProc[kNorm] = valPrev;
            if (kNum && (!mapDgcPrevPorCtrlProcNum[kNum] || temDataPrev)) mapDgcPrevPorCtrlProcNum[kNum] = valPrev;
            if (objD) {
              var kObjP = kNorm + "_" + normalizarChaveControle(objD);
              if (!mapDgcPrevPorCtrlProcEObjeto[kObjP] || temDataPrev) mapDgcPrevPorCtrlProcEObjeto[kObjP] = valPrev;
            }
          }
          if (ctrlObjDgc && (!mapDgcPrevPorControleObj[ctrlObjDgc] || temDataPrev)) mapDgcPrevPorControleObj[ctrlObjDgc] = valPrev;
          if (seiD) {
            var seiKeyP = seiD.toUpperCase();
            if (!mapDgcPrevPorSei[seiKeyP] || temDataPrev) mapDgcPrevPorSei[seiKeyP] = valPrev;
          }
          if (temDataPrev) mapDgcPrevPorLinha[numLinhaReal] = valPrev;
        }
      }
    } catch (errDgc) {
      console.warn("Aviso ao carregar dados de #DGC: " + errDgc.message);
    }

    function ehStatusEliminar(status) {
      if (!status) return false;
      var s = String(status)
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      if (!s) return false;

      // 1. Status de Recebido
      if (ehStatusRecebido(s)) return true;

      // 2. SEM SUCESSO
      if (s.indexOf("SEM SUCESSO") !== -1 || s === "FRACASSADO" || s === "DESERTO") return true;

      // 3. ARP PUBLICADA
      if (s.indexOf("ARP PUBLICADA") !== -1 || (s.indexOf("ARP") !== -1 && s.indexOf("PUBLICAD") !== -1)) return true;

      // 4. EM ANDAMENTO - SRP
      if (s.indexOf("EM ANDAMENTO - SRP") !== -1 || 
          s.indexOf("EM ANDAMENTO-SRP") !== -1 || 
          s.indexOf("EM ANDAMENTO – SRP") !== -1 ||
          (s.indexOf("EM ANDAMENTO") !== -1 && s.indexOf("SRP") !== -1)) {
        return true;
      }

      return false;
    }

    function ehStatusRecebido(status) {
      if (!status) return false;
      var s = String(status)
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      if (!s) return false;

      if (s.indexOf("AGUARDANDO") !== -1 || 
          s.indexOf("PENDENTE") !== -1 || 
          s.indexOf("PARCIAL") !== -1 || 
          s.indexOf("NAO RECEBID") !== -1 || 
          s.indexOf("A RECEBER") !== -1 || 
          s.indexOf("EM ANDAMENTO") !== -1) {
        return false;
      }

      if (s === "RECEBIDO" || s === "RECEBIDA" || s === "RECEBIDOS" || s === "RECEBIDAS") return true;
      if (s.indexOf("RECEBIDO") !== -1 || 
          s.indexOf("RECEBIDA") !== -1 || 
          s.indexOf("RECEBIMENTO CONCLUIDO") !== -1 || 
          s.indexOf("RECEBIMENTO REALIZADO") !== -1 || 
          s.indexOf("RECEBIMENTO TOTAL") !== -1 || 
          s.indexOf("TOTALMENTE RECEBIDO") !== -1) {
        return true;
      }

      return false;
    }

    // Identifica e elimina PREGÃO COM SRP (ou qualquer variação de SRP)
    function ehPregaoComSrp(tipoProc) {
      if (!tipoProc) return false;
      var s = String(tipoProc)
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      if (!s) return false;

      // Se explicitar NÃO SRP ou SEM SRP, não elimina
      if (s.indexOf("SEM SRP") !== -1 || s.indexOf("NAO SRP") !== -1 || s.indexOf("SEM REGISTRO") !== -1) return false;

      // 1. Contém explicitamente "SRP" (ex: "PREGÃO COM SRP", "PREGAO COM SRP", "PREGÃO - SRP", "SRP")
      if (s.indexOf("SRP") !== -1) return true;

      // 2. Contém "REGISTRO DE PRECO" ou "REGISTRO DE PRECOS"
      if (s.indexOf("REGISTRO DE PRECO") !== -1 || s.indexOf("REGISTRO DE PRECOS") !== -1) return true;

      // 3. Combinação de Pregão e SRP
      var temPregao = (s.indexOf("PREGAO") !== -1 || /\bPE\b/.test(s));
      if (temPregao && s.indexOf("SRP") !== -1) return true;

      return false;
    }

    // Formata o Vencimento da Entrega (Coluna EB): número (dias) ou traço "-"
    function formatarVencEntregaEB(val) {
      if (val === undefined || val === null) return { texto: "-", numero: null };
      
      // Número nativo (ex: 82, 102, 780, 10000)
      if (typeof val === 'number') {
        if (isNaN(val)) return { texto: "-", numero: null };
        return { texto: String(Math.round(val)), numero: val };
      }

      var s = String(val).trim();
      if (!s || s === "-" || s === "--" || s === "—" || s === "." || s.toUpperCase() === "N/A" || s.toUpperCase() === "NULL") {
        return { texto: "-", numero: null };
      }

      // String numérica (ex: "82", " 102 ")
      var sLimpo = s.replace(/\s+/g, "").replace(",", ".");
      var n = parseFloat(sLimpo);
      if (!isNaN(n)) {
        return { texto: String(Math.round(n)), numero: n };
      }

      // Se porventura for data no formato DD/MM/AAAA
      var matchBr = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (matchBr) {
        var d = parseInt(matchBr[1], 10);
        var m = parseInt(matchBr[2], 10) - 1;
        var y = parseInt(matchBr[3], 10);
        if (y < 100) y += 2000;
        var dt = new Date(y, m, d);
        if (!isNaN(dt.getTime())) {
          return { texto: s, numero: dt.getTime() };
        }
      }

      return { texto: s, numero: null };
    }

    // Formata a Previsão de Entrega (Coluna EC): data formatada DD/MM/AAAA
    function formatarDataPrevisaoEC(val) {
      if (val === undefined || val === null) return { texto: "-", timestamp: null, dataIso: "" };
      
      // 1. Objeto Date nativo
      if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]') {
        if (isNaN(val.getTime())) return { texto: "-", timestamp: null, dataIso: "" };
        var dia = ("0" + val.getDate()).slice(-2);
        var mes = ("0" + (val.getMonth() + 1)).slice(-2);
        var ano = val.getFullYear();
        var texto = dia + "/" + mes + "/" + ano;
        var dataIso = ano + "-" + mes + "-" + dia;
        return { texto: texto, timestamp: val.getTime(), dataIso: dataIso };
      }

      // 2. Número serial de data do Excel / Google Sheets (ex: 45000 a 55000)
      if (typeof val === 'number' && !isNaN(val) && val > 20000 && val < 80000) {
        var dtNum = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(dtNum.getTime())) {
          var diaN = ("0" + dtNum.getUTCDate()).slice(-2);
          var mesN = ("0" + (dtNum.getUTCMonth() + 1)).slice(-2);
          var anoN = dtNum.getUTCFullYear();
          return {
            texto: diaN + "/" + mesN + "/" + anoN,
            timestamp: dtNum.getTime(),
            dataIso: anoN + "-" + mesN + "-" + diaN
          };
        }
      }
      
      var s = String(val).trim();
      if (!s || s === "-" || s === "--" || s === "—" || s === "." || s === "0" || s.toUpperCase() === "N/A" || s.toUpperCase() === "NULL") {
        return { texto: "-", timestamp: null, dataIso: "" };
      }
      
      // 3. Tenta formato DD/MM/YYYY ou DD/MM/YY
      var matchBr = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (matchBr) {
        var d = parseInt(matchBr[1], 10);
        var m = parseInt(matchBr[2], 10) - 1;
        var y = parseInt(matchBr[3], 10);
        if (y < 100) y += 2000;
        var dt = new Date(y, m, d);
        if (!isNaN(dt.getTime())) {
          var diaStr = ("0" + d).slice(-2);
          var mesStr = ("0" + (m + 1)).slice(-2);
          return { 
            texto: diaStr + "/" + mesStr + "/" + y, 
            timestamp: dt.getTime(), 
            dataIso: y + "-" + mesStr + "-" + diaStr 
          };
        }
      }

      // 4. Tenta formato ISO YYYY-MM-DD
      var matchIso = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
      if (matchIso) {
        var yIso = parseInt(matchIso[1], 10);
        var mIso = parseInt(matchIso[2], 10) - 1;
        var dIso = parseInt(matchIso[3], 10);
        var dtIso = new Date(yIso, mIso, dIso);
        if (!isNaN(dtIso.getTime())) {
          var diaStrIso = ("0" + dIso).slice(-2);
          var mesStrIso = ("0" + (mIso + 1)).slice(-2);
          return { 
            texto: diaStrIso + "/" + mesStrIso + "/" + yIso, 
            timestamp: dtIso.getTime(), 
            dataIso: yIso + "-" + mesStrIso + "-" + diaStrIso 
          };
        }
      }

      return { texto: s, timestamp: null, dataIso: "" };
    }

    // Identificação dinâmica de colunas em #PLAN (varre primeiras 6 linhas de cabeçalho)
    var colStatusIdxPlan = 36;                                  // Coluna AK (índice 36: Status oficial do processo em #PLAN)
    var colTipoProcessoIdxPlan = (ultCol >= 7) ? 6 : -1;        // Padrão oficial: Coluna G (índice 6: TIPO DE PROCESSO)
    var colCtrlProcIdxPlan = 0;                                 // Padrão: Coluna A (índice 0: Nº CONTROLE (PROC.))
    var colVencEntregaIdxPlan = -1;                              // Coluna própria de Venc. Entrega na #PLAN se houver
    var colPrevisaoEntregaIdxPlan = -1;                          // Coluna própria de Previsão na #PLAN se houver
    var linhaCabecalhoPlan = -1;

    for (var rP = 0; rP < Math.min(6, dadosPlan.length); rP++) {
      var hRowP = dadosPlan[rP];
      for (var c = 0; c < hRowP.length; c++) {
        var hText = String(hRowP[c] || "").trim().toUpperCase();
        if (!hText) continue;
        var hNorm = hText.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (hNorm.indexOf("TIPO DE PROCESSO") !== -1 || 
            hNorm.indexOf("TIPO PROCESSO") !== -1 || 
            (hNorm.indexOf("TIPO") !== -1 && hNorm.indexOf("PROC") !== -1) || 
            hNorm === "TIPO" || 
            hNorm.indexOf("MODALIDADE") !== -1) {
          colTipoProcessoIdxPlan = c;
          linhaCabecalhoPlan = Math.max(linhaCabecalhoPlan, rP);
        }
        if (colCtrlProcIdxPlan === 0 && (
            (hNorm.indexOf("CONTROLE") !== -1 && hNorm.indexOf("PROC") !== -1) || 
            hNorm.indexOf("CONTROLE (PROC") !== -1 || 
            hNorm.indexOf("CONTROLE DO PROCESSO") !== -1 || 
            hNorm.indexOf("CONTROLE PROCESSO") !== -1)) {
          colCtrlProcIdxPlan = c;
          linhaCabecalhoPlan = Math.max(linhaCabecalhoPlan, rP);
        }
        if (colPrevisaoEntregaIdxPlan === -1 && (
            (hNorm.indexOf("PREVIS") !== -1 && hNorm.indexOf("ENTREG") !== -1) ||
            hNorm === "PREVISAO DE ENTREGA" ||
            hNorm === "PREVISAO ENTREGA")) {
          colPrevisaoEntregaIdxPlan = c;
          linhaCabecalhoPlan = Math.max(linhaCabecalhoPlan, rP);
        }
        else if (colVencEntregaIdxPlan === -1 && (
            (hNorm.indexOf("VENC") !== -1 && hNorm.indexOf("ENTREG") !== -1) ||
            hNorm === "VENC ENTREGA" ||
            hNorm === "VENC. ENTREGA" ||
            hNorm === "PRAZO ENTREGA" ||
            hNorm === "VENCIMENTO")) {
          colVencEntregaIdxPlan = c;
          linhaCabecalhoPlan = Math.max(linhaCabecalhoPlan, rP);
        }
        if (hNorm === "STATUS" || hNorm === "SITUACAO" || hNorm.indexOf("STATUS PROCESSO") !== -1) {
          colStatusIdxPlan = c;
          linhaCabecalhoPlan = Math.max(linhaCabecalhoPlan, rP);
        }
      }
    }

    var offsetDadosPlan = (linhaCabecalhoPlan !== -1) ? (linhaCabecalhoPlan + 1) : 5;

    for (var i = offsetDadosPlan; i < dadosPlan.length; i++) {
      var linha = dadosPlan[i];
      var numLinhaRealPlan = 1 + i;
      var colunaA = String(linha[colCtrlProcIdxPlan] || "").trim();               // Coluna A / Identificada: Nº CONTROLE (PROC.)
      var colunaB = String(linha[1] || "").trim();                                 // Coluna B: Nº CONTROLE (OBJ.)
      var colunaD = String(linha[3] || "").trim();                                 // Coluna D: Processo / SEI
      var colunaE = String(linha[4] || "").trim();                                 // Coluna E: Cod. Processo
      var colunaG = (linha.length > 6) ? String(linha[6] || "").trim() : "";       // Coluna G: TIPO DE PROCESSO
      var colunaI = String(linha[8] || "").trim();                                 // Coluna I: Objeto / Descrição do Material
      var colunaJ = (linha[9] !== undefined && linha[9] !== null) ? linha[9] : ""; // Coluna J: Qtd Total Planejada
      var colunaK = String(linha[10] || "").trim().toUpperCase();                  // Coluna K: Unidade de Medida
      var colunaAK = String(linha[colStatusIdxPlan] || linha[36] || "").trim();    // Coluna AK: Status oficial do processo em #PLAN

      // 1. Ignora linhas de cabeçalho
      var dUpper = colunaD.toUpperCase();
      var iUpper = colunaI.toUpperCase();
      if (dUpper === "SEI" || dUpper === "PROCESSO" || dUpper.indexOf("PROCESSO / SEI") !== -1 || iUpper === "OBJETO" || iUpper === "MATERIAL" || iUpper === "DESCRIÇÃO") {
        continue;
      }

      // 2. Filtra estritamente linhas em branco ou incompletas:
      var temProcesso = ehValorPreenchidoGeral(colunaD) || ehValorPreenchidoGeral(colunaE);
      var temObjeto = ehValorPreenchidoGeral(colunaI);

      if (!temProcesso || !temObjeto) {
        continue;
      }

      // 3. Filtra Status indesejados (Recebido, Sem Sucesso, ARP Publicada, Em Andamento - SRP)
      if (ehStatusEliminar(colunaAK)) {
        continue;
      }

      // 4. Identifica e exclui "PREGÃO COM SRP" (especialmente da Coluna G "TIPO DE PROCESSO")
      var tipoProcesso = "";
      if (colTipoProcessoIdxPlan !== -1 && colTipoProcessoIdxPlan < linha.length) {
        tipoProcesso = String(linha[colTipoProcessoIdxPlan] || "").trim();
      }
      if (!tipoProcesso && colunaG) {
        tipoProcesso = colunaG;
      }
      if (!tipoProcesso) {
        var candidataC = String(linha[2] || "").trim();
        var candidataF = String(linha[5] || "").trim();
        if (ehPregaoComSrp(candidataC)) tipoProcesso = candidataC;
        else if (ehPregaoComSrp(candidataF)) tipoProcesso = candidataF;
        else if (colunaA && mapDgcTipoProcesso[normalizarChaveControle(colunaA)]) tipoProcesso = mapDgcTipoProcesso[normalizarChaveControle(colunaA)];
        else if (colunaB && mapDgcTipoProcesso[normalizarChaveControle(colunaB)]) tipoProcesso = mapDgcTipoProcesso[normalizarChaveControle(colunaB)];
        else if (colunaD && mapDgcTipoProcesso[colunaD.toUpperCase()]) tipoProcesso = mapDgcTipoProcesso[colunaD.toUpperCase()];
      }

      // Elimina se o tipoProcesso identificado ou a Coluna G for "PREGÃO COM SRP"
      if (ehPregaoComSrp(tipoProcesso) || ehPregaoComSrp(colunaG)) {
        continue;
      }

      // Varredura de segurança em colunas de processo (0 a 7) para capturar Pregão com SRP
      var ehSrpEmOutraColuna = false;
      for (var colIdx = 0; colIdx < Math.min(8, linha.length); colIdx++) {
        if (colIdx === 8) continue; // Pula coluna I (Objeto)
        if (ehPregaoComSrp(linha[colIdx])) {
          ehSrpEmOutraColuna = true;
          break;
        }
      }
      if (ehSrpEmOutraColuna) {
        continue;
      }

      var ctrlProcPlan = colunaA;
      var kPlanNorm = normalizarChaveControle(ctrlProcPlan);
      var kPlanNum = extrairChaveNumericaControle(ctrlProcPlan);
      var objPlanNorm = normalizarChaveControle(colunaI);

      // 5. Obtenção do Vencimento de Entrega (Coluna EB da #DGC - NUMÉRICO / DIAS - BASE DO ORDENAMENTO):
      var vencRaw = null;
      if (colVencEntregaIdxPlan !== -1 && colVencEntregaIdxPlan < linha.length && ehValorPreenchidoGeral(linha[colVencEntregaIdxPlan])) {
        vencRaw = linha[colVencEntregaIdxPlan];
      }
      if (!ehValorPreenchidoGeral(vencRaw)) {
        if (kPlanNorm && objPlanNorm && ehValorPreenchidoGeral(mapDgcVencPorCtrlProcEObjeto[kPlanNorm + "_" + objPlanNorm])) {
          vencRaw = mapDgcVencPorCtrlProcEObjeto[kPlanNorm + "_" + objPlanNorm];
        } else if (kPlanNorm && ehValorPreenchidoGeral(mapDgcVencPorCtrlProc[kPlanNorm])) {
          vencRaw = mapDgcVencPorCtrlProc[kPlanNorm];
        } else if (kPlanNum && ehValorPreenchidoGeral(mapDgcVencPorCtrlProcNum[kPlanNum])) {
          vencRaw = mapDgcVencPorCtrlProcNum[kPlanNum];
        } else if (colunaB && ehValorPreenchidoGeral(mapDgcVencPorControleObj[colunaB])) {
          vencRaw = mapDgcVencPorControleObj[colunaB];
        } else if (colunaD && ehValorPreenchidoGeral(mapDgcVencPorSei[colunaD.toUpperCase()])) {
          vencRaw = mapDgcVencPorSei[colunaD.toUpperCase()];
        } else if (ehValorPreenchidoGeral(mapDgcVencPorLinha[numLinhaRealPlan])) {
          vencRaw = mapDgcVencPorLinha[numLinhaRealPlan];
        }
      }
      var vencObj = formatarVencEntregaEB(vencRaw);

      // 6. Obtenção da Previsão De Entrega (Coluna EC da #DGC - DATA):
      var prevRaw = null;
      if (colPrevisaoEntregaIdxPlan !== -1 && colPrevisaoEntregaIdxPlan < linha.length && ehValorPreenchidoGeral(linha[colPrevisaoEntregaIdxPlan])) {
        prevRaw = linha[colPrevisaoEntregaIdxPlan];
      }
      if (!ehValorPreenchidoGeral(prevRaw)) {
        if (kPlanNorm && objPlanNorm && ehValorPreenchidoGeral(mapDgcPrevPorCtrlProcEObjeto[kPlanNorm + "_" + objPlanNorm])) {
          prevRaw = mapDgcPrevPorCtrlProcEObjeto[kPlanNorm + "_" + objPlanNorm];
        } else if (kPlanNorm && ehValorPreenchidoGeral(mapDgcPrevPorCtrlProc[kPlanNorm])) {
          prevRaw = mapDgcPrevPorCtrlProc[kPlanNorm];
        } else if (kPlanNum && ehValorPreenchidoGeral(mapDgcPrevPorCtrlProcNum[kPlanNum])) {
          prevRaw = mapDgcPrevPorCtrlProcNum[kPlanNum];
        } else if (colunaB && ehValorPreenchidoGeral(mapDgcPrevPorControleObj[colunaB])) {
          prevRaw = mapDgcPrevPorControleObj[colunaB];
        } else if (colunaD && ehValorPreenchidoGeral(mapDgcPrevPorSei[colunaD.toUpperCase()])) {
          prevRaw = mapDgcPrevPorSei[colunaD.toUpperCase()];
        } else if (ehValorPreenchidoGeral(mapDgcPrevPorLinha[numLinhaRealPlan])) {
          prevRaw = mapDgcPrevPorLinha[numLinhaRealPlan];
        }
      }
      var prevObj = formatarDataPrevisaoEC(prevRaw);

      processos.push({
        a: colunaA,                         // Nº CONTROLE (PROC.)
        b: colunaB,                         // Nº CONTROLE (OBJ.)
        d: colunaD,                         // Processo / SEI
        e: colunaE,                         // Cod. Processo
        g: colunaG,                         // Coluna G: TIPO DE PROCESSO
        i: colunaI,                         // Objeto / Descrição do Material
        j: colunaJ,                         // Qtd Total Planejada
        k: colunaK,                         // Unidade de Medida
        ak: colunaAK,                       // Status
        tipo: tipoProcesso || colunaG,
        vencEntrega: vencObj.texto,         // Coluna EB da #DGC (ex: "82", "102", "10000", "-")
        vencNumero: vencObj.numero,         // BASE OFICIAL DE ORDENAMENTO: 82, 102, 10000, null
        previsaoEntrega: prevObj.texto,     // Coluna EC da #DGC (ex: "14/12/2026", "-")
        previsaoTimestamp: prevObj.timestamp,
        previsaoIso: prevObj.dataIso
      });
    }

    // 7. Ordenação estrita por Venc Entrega (Coluna EB) do MENOR para o MAIOR (ex: 82, 82, 102, 780, 10000...)
    // Itens sem número ("-") vão SEMPRE para o final da lista
    processos.sort(function(a, b) {
      var vA = a.vencNumero;
      var vB = b.vencNumero;
      if (vA !== null && vB !== null) {
        var diff = vA - vB;
        if (diff !== 0) return diff;
      }
      if (vA !== null && vB === null) return -1; // Com número sempre primeiro
      if (vA === null && vB !== null) return 1;  // Sem número ("-") sempre no final
      var pA = String(a.d || a.e || "").toLowerCase();
      var pB = String(b.d || b.e || "").toLowerCase();
      return pA.localeCompare(pB);
    });

    return processos;
  } catch (err) {
    console.error("Erro em getProcessosAbertosPlan: " + err.message);
    return [];
  }
}



// =========================================================================
// INTEGRAÇÃO COM PLANILHA OFICIAL DLOG (#PLAN e #DIST)
// =========================================================================

function obterAbaPorNomeAproximado(ss, nomeAlvo) {
  if (!ss) return null;
  var alvoLimpo = String(nomeAlvo || "").trim().toUpperCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName().trim().toUpperCase();
    if (sName === alvoLimpo) {
      return sheets[i];
    }
  }
  return ss.getSheetByName(nomeAlvo);
}

function testarConexaoAbaDist() {
  try {
    console.log("=== INICIANDO TESTE DE CONEXÃO COM #PLAN E #DIST ===");
    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    console.log("1. Planilha Compras aberta: " + ss.getName() + " (ID: " + ID_PLANILHA_COMPRAS + ")");

    var sheetPlan = obterAbaPorNomeAproximado(ss, "#PLAN");
    if (!sheetPlan) {
      throw new Error("Aba #PLAN não encontrada! Verifique o nome da aba.");
    }
    console.log("2. Aba #PLAN localizada. Linhas: " + sheetPlan.getLastRow() + ", Colunas: " + sheetPlan.getLastColumn());

    var sheetDist = obterAbaPorNomeAproximado(ss, "#DIST");
    if (!sheetDist) {
      var nomesAbas = ss.getSheets().map(function(s) { return s.getName(); });
      throw new Error("Aba #DIST não encontrada! Abas existentes na planilha: " + nomesAbas.join(", "));
    }
    console.log("3. Aba #DIST localizada com nome '" + sheetDist.getName() + "'. Linhas: " + sheetDist.getLastRow() + ", Colunas: " + sheetDist.getLastColumn());

    var estrutura = obterEstruturaAbaDist(sheetDist);
    console.log("4. Configuração oficial de Colunas para #DIST:");
    console.log("   - Linha de Cabeçalho: " + estrutura.headerRow);
    console.log("   - Coluna D (4): Nº CONTROLE (OBJ.)");
    console.log("   - Coluna J (10): Quantidade Recebida");
    console.log("   - Coluna X (24): NÃO EDITÁVEL (Fórmula/Protegida - Preservada)");
    console.log("   - Coluna Y (25): Data Início Recebimento");
    console.log("   - Coluna Z (26): Nº DA NOTA DIST.");
    console.log("   - Coluna AA (27): Nº DO BGE");
    console.log("   - Colunas AB (28) a BX (76): Colunas individuais de cada OME (Nomes na Linha 6)");
    console.log("   - Status: Nenhum (coluna desativada)");

    var msgSucesso = "SUCESSO: Conexão com #PLAN e #DIST 100% validada! Cabeçalho em #DIST na linha " + estrutura.headerRow + ", " + sheetDist.getLastRow() + " linhas existentes.";
    console.log(msgSucesso);
    return { sucesso: true, mensagem: msgSucesso, estrutura: estrutura };
  } catch (err) {
    var msgErro = "FALHA NO TESTE: " + err.message;
    console.error(msgErro);
    return { sucesso: false, erro: msgErro };
  }
}

// Algoritmo de Similaridade Textual Inteligente para cruzamento de materiais
function calcularSimilaridadeMaterial(mat1, mat2) {
  if (!mat1 || !mat2) return 0;

  function normalizar(texto) {
    return String(texto || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  var n1 = normalizar(mat1);
  var n2 = normalizar(mat2);

  if (n1 === n2) return 100;
  if (n1.indexOf(n2) !== -1 || n2.indexOf(n1) !== -1) return 90;

  var stopWords = ["de", "da", "do", "das", "dos", "em", "para", "com", "sem", "por", "un", "und", "unidade", "unidades", "tipo", "kit", "e", "a", "o"];
  var tokens1 = n1.split(" ").filter(function(w) { return w.length >= 2 && stopWords.indexOf(w) === -1; });
  var tokens2 = n2.split(" ").filter(function(w) { return w.length >= 2 && stopWords.indexOf(w) === -1; });

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  var matches = 0;
  for (var i = 0; i < tokens1.length; i++) {
    var t1 = tokens1[i];
    for (var j = 0; j < tokens2.length; j++) {
      var t2 = tokens2[j];
      if (t1 === t2 || (t1.length >= 4 && t2.indexOf(t1) !== -1) || (t2.length >= 4 && t1.indexOf(t2) !== -1)) {
        matches++;
        break;
      }
    }
  }

  var score = (matches / Math.max(tokens1.length, tokens2.length)) * 80;
  return score;
}

// Normaliza número de Processo / SEI para comparação estrita (remove pontuações, traços, barras e espaços, mantendo todos os caracteres/dígitos reais)
function normalizarSeiParaComparacao(str) {
  if (!str) return "";
  return String(str).split("|")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Normaliza Nome do Objeto / Material para comparação exata (remove acentos, símbolos e unifica em maiúsculas)
function normalizarNomeObjetoParaComparacao(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function obterNumeroControlePlan(processoSei, material) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var sheetPlan = obterAbaPorNomeAproximado(ss, "#PLAN");
    if (!sheetPlan || sheetPlan.getLastRow() <= 6) return null;

    var ultLinha = sheetPlan.getLastRow();
    // Colunas A até K (1 até 11): Col B é Nº Controle (idx 1), Col D é SEI (idx 3), Col E é Cod Processo (idx 4), Col I é Objeto (idx 8)
    var dados = sheetPlan.getRange(6, 1, ultLinha - 5, 11).getValues();

    var seiAlvoClean = normalizarSeiParaComparacao(processoSei);
    var matAlvoNorm = normalizarNomeObjetoParaComparacao(material);

    // O Processo SEI e o Material são estritamente obrigatórios para identificar o lote
    if (!seiAlvoClean || !matAlvoNorm) return null;

    var inicioIdx = 0;
    var row0D = String(dados[0][3] || "").toUpperCase();
    var row0B = String(dados[0][1] || "").toUpperCase();
    if (row0D.indexOf("SEI") !== -1 || row0D.indexOf("PROCESSO") !== -1 || row0B.indexOf("CONTROLE") !== -1) {
      inicioIdx = 1;
    }

    for (var i = inicioIdx; i < dados.length; i++) {
      var row = dados[i];
      var numControle = String(row[1] || "").trim();
      var seiColD = String(row[3] || "").trim();
      var seiColE = String(row[4] || "").trim();
      var objetoColI = String(row[8] || "").trim();

      var seiDClean = normalizarSeiParaComparacao(seiColD);
      var seiEClean = normalizarSeiParaComparacao(seiColE);
      var objNorm = normalizarNomeObjetoParaComparacao(objetoColI);

      // O SEI e o OBJETO devem ser EXATAMENTE os mesmos (sem correspondência parcial ou aproximada)
      var matchSei = (seiDClean === seiAlvoClean || seiEClean === seiAlvoClean);
      var matchObjeto = (objNorm === matAlvoNorm);

      if (matchSei && matchObjeto && numControle) {
        console.log("obterNumeroControlePlan: [Match Exato SEI + Objeto] Linha " + (6 + i) + " em #PLAN | SEI=" + processoSei + " | Objeto=" + objetoColI + " | Controle=" + numControle);
        return numControle;
      }
    }

    // Se não encontrou linha onde o SEI e o Objeto sejam exatamente iguais, retorna null (nunca infere por similaridade de material)
    return null;
  } catch (err) {
    console.error("Erro em obterNumeroControlePlan: " + err.message);
    return null;
  }
}

function obterEstruturaAbaDist(sheetDist) {
  var maxCols = sheetDist.getMaxColumns();
  if (maxCols < 76) {
    try {
      sheetDist.insertColumnsAfter(maxCols, 76 - maxCols);
    } catch (e) {
      console.warn("Não foi possível expandir colunas até 76 em #DIST: " + e.message);
    }
  }
  var numCols = Math.max(sheetDist.getLastColumn(), 76);

  // Conforme instrução expressa do usuário:
  // A linha 6 é a linha oficial de cabeçalho onde constam os nomes das OMEs (colunas AB/28 até BX/76)
  var headerRow = 6;
  var headers = sheetDist.getRange(6, 1, 1, numCols).getValues()[0];

  // Mapeamento canônico oficial definido pelo usuário:
  // Coluna D (4): Nº CONTROLE (OBJ.) / DISTRIBUIÇÃO INICIADA/REALIZADA
  // Coluna J (10): Quantidade Recebida
  // Coluna X (24): DATA INÍCIO RECEBIMENTO (preenchida na primeira inserção)
  // Coluna Y (25): DATA FINAL DE DISTRIBUIÇÃO (preenchida quando a última remessa pendente é assinada)
  // Coluna Z (26): Nº DA NOTA DIST.
  // Coluna AA (27): Nº DO BGE
  // Colunas AB (28) até BX (76): Cada coluna pertence a uma OME diferente (nomes na linha 6)
  // Sem coluna de Status
  return {
    headerRow: 6,
    headers: headers,
    colControle: 4,      // Coluna D
    colQtdRecebida: 10,  // Coluna J
    colDataInicio: 24,   // Coluna X (DATA INÍCIO RECEBIMENTO)
    colDataFinal: 25,    // Coluna Y (DATA FINAL DE DISTRIBUIÇÃO)
    colNotaDist: 26,     // Coluna Z
    colBge: 27,          // Coluna AA
    colOmeInicio: 28,    // Coluna AB
    colOmeFim: 76        // Coluna BX
  };
}

function localizarLinhaDist(sheetDist, estrutura, numeroControle, processoSei, material) {
  var linhaInicial = 6;
  var ultLinha = sheetDist.getLastRow();
  if (ultLinha < linhaInicial) return -1;

  var totalLinhasDados = ultLinha - linhaInicial + 1;
  var colControle = estrutura.colControle || 4; // Coluna D (4)
  var numCols = Math.min(sheetDist.getLastColumn(), 80);
  var dados = sheetDist.getRange(linhaInicial, 1, totalLinhasDados, numCols).getValues();

  var ctrlAlvo = String(numeroControle || "").trim().toUpperCase();
  var seiAlvoClean = normalizarSeiParaComparacao(processoSei);
  var matAlvoNorm = normalizarNomeObjetoParaComparacao(material);

  // Se não foi passado numeroControle, tenta obter de #PLAN cruzando estritamente SEI e Material
  if (!ctrlAlvo && seiAlvoClean && matAlvoNorm) {
    ctrlAlvo = String(obterNumeroControlePlan(processoSei, material) || "").trim().toUpperCase();
  }

  // Se não temos nem Controle (validado pelo SEI+Material) nem SEI, não é possível localizar com segurança
  if (!ctrlAlvo && !seiAlvoClean) {
    return -1;
  }

  // Identifica colunas em #DIST que possam conter SEI ou Objeto/Material
  var colSeiDist = -1;
  var colMatDist = -1;
  if (estrutura.headers && estrutura.headers.length > 0) {
    for (var c = 0; c < Math.min(estrutura.headers.length, 27); c++) {
      var h = String(estrutura.headers[c] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      if (colSeiDist === -1 && (h.indexOf("SEI") !== -1 || h.indexOf("PROCESSO") !== -1)) {
        colSeiDist = c;
      }
      if (colMatDist === -1 && (h.indexOf("OBJETO") !== -1 || h.indexOf("MATERIAL") !== -1 || h.indexOf("DESCRI") !== -1)) {
        colMatDist = c;
      }
    }
  }

  // Se não identificou na linha 6, inspeciona a linha 5 (onde frequentemente estão os títulos gerais das colunas)
  if (colMatDist === -1 || colSeiDist === -1) {
    try {
      var headersL5 = sheetDist.getRange(5, 1, 1, Math.min((estrutura.headers && estrutura.headers.length) || 76, 27)).getValues()[0];
      for (var c5 = 0; c5 < headersL5.length; c5++) {
        var h5 = String(headersL5[c5] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        if (colSeiDist === -1 && (h5.indexOf("SEI") !== -1 || h5.indexOf("PROCESSO") !== -1)) {
          colSeiDist = c5;
        }
        if (colMatDist === -1 && (h5.indexOf("OBJETO") !== -1 || h5.indexOf("MATERIAL") !== -1 || h5.indexOf("DESCRI") !== -1)) {
          colMatDist = c5;
        }
      }
    } catch (eH5) {}
  }

  // Padrão canônico da DLOG nas planilhas centrais: Coluna I (índice 8) armazena o Objeto/Material
  if (colMatDist === -1) {
    colMatDist = 8;
  }

  for (var i = 0; i < dados.length; i++) {
    var linhaReal = linhaInicial + i;
    // A linha 6 é exclusivamente o cabeçalho (nomes das OMEs e títulos das colunas)
    if (linhaReal === 6) {
      continue;
    }

    var row = dados[i];
    var valD = String(row[colControle - 1] || "").trim();
    var valDUpper = valD.toUpperCase();
    var valDClean = normalizarSeiParaComparacao(valD);

    var valSei = (colSeiDist !== -1) ? String(row[colSeiDist] || "").trim() : "";
    var valSeiClean = normalizarSeiParaComparacao(valSei);

    var valMat = (colMatDist !== -1) ? String(row[colMatDist] || "").trim() : "";
    var valMatNorm = normalizarNomeObjetoParaComparacao(valMat);

    // O NOME do Objeto/Material deve ser exatamente o mesmo (se a coluna existir em #DIST e estiver preenchida)
    var matchObjeto = (!valMatNorm || !matAlvoNorm || valMatNorm === matAlvoNorm);

    // 1. Match exato pelo Nº de Controle (obtido de cruzamento estrito de SEI + Objeto em #PLAN)
    if (ctrlAlvo && valDUpper === ctrlAlvo && matchObjeto) {
      console.log("localizarLinhaDist: [Match Exato por Controle + Objeto] Linha " + linhaReal + " em #DIST | Controle=" + ctrlAlvo + " | Material=" + material);
      return linhaReal;
    }

    // 2. Match exato de SEI diretamente em #DIST (Coluna D ou Coluna SEI)
    if (seiAlvoClean && (valDClean === seiAlvoClean || valSeiClean === seiAlvoClean) && matchObjeto) {
      console.log("localizarLinhaDist: [Match Exato por SEI + Objeto] Linha " + linhaReal + " em #DIST | SEI=" + processoSei + " | Material=" + material);
      return linhaReal;
    }
  }

  // Nunca retorna linha por similaridade de material se o SEI/Controle não for exatamente o mesmo
  return -1;
}

// Verifica antecipadamente se o processo/material já possui recebimento em #DIST
function verificarExistenciaRecebimentoDist(processoSei, material, numeroControle) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var sheetDist = obterAbaPorNomeAproximado(ss, "#DIST");
    if (!sheetDist) {
      return { existe: false, erro: "Aba #DIST não encontrada." };
    }

    var seiClean = normalizarSeiParaComparacao(processoSei);
    var matNorm = normalizarNomeObjetoParaComparacao(material);
    if (!seiClean || !matNorm) {
      return { existe: false, erro: "Processo SEI e Material são obrigatórios." };
    }

    var numCtrl = numeroControle || obterNumeroControlePlan(processoSei, material);
    var estrutura = obterEstruturaAbaDist(sheetDist);
    var linhaExistente = localizarLinhaDist(sheetDist, estrutura, numCtrl, processoSei, material);

    if (linhaExistente !== -1) {
      // Lê o valor atual da Coluna J (10: Quantidade Recebida)
      var valQtd = sheetDist.getRange(linhaExistente, 10).getValue();
      var qtdExistente = parseInt(valQtd, 10);
      if (isNaN(qtdExistente)) qtdExistente = 0;

      // Somente acusa duplicidade se houver quantidade previamente registrada (> 0)
      if (qtdExistente > 0) {
        return {
          existe: true,
          linha: linhaExistente,
          qtdExistente: qtdExistente,
          numeroControle: numCtrl || "",
          processo: processoSei,
          material: material
        };
      }
    }

    return {
      existe: false,
      numeroControle: numCtrl || "",
      processo: processoSei,
      material: material
    };
  } catch (err) {
    console.error("Erro em verificarExistenciaRecebimentoDist: " + err.message);
    return { existe: false, erro: err.message };
  }
}

// Utilitário para unificar nomes de OMEs em chaves canônicas para comparação precisa
function extrairChaveCanonicaOme(str) {
  if (!str) return "";
  var s = String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[º°ª]/g, " ")
    .replace(/[^A-Z0-9]/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (!s) return "";

  // 1. Grupamentos de Bombeiros Numerados (1º ao 9º GB)
  if ((s.indexOf("1") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("VITORIA") !== -1) return "1_GB";
  if ((s.indexOf("2") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("CARUARU") !== -1) return "2_GB";
  if ((s.indexOf("3") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("SERRA TALHADA") !== -1) return "3_GB";
  if ((s.indexOf("4") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("PETROLINA") !== -1) return "4_GB";
  if ((s.indexOf("5") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("SALGUEIRO") !== -1) return "5_GB";
  if ((s.indexOf("6") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("GARANHUNS") !== -1) return "6_GB";
  if ((s.indexOf("7") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("CARPINA") !== -1) return "7_GB";
  if ((s.indexOf("9") !== -1 && s.indexOf("GB") !== -1) || s.indexOf("ARCOVERDE") !== -1) return "9_GB";

  // 2. Grupamentos Especiais
  if (s === "GBAPH" || s.indexOf("GBAPH") !== -1) return "GBAPH";
  if (s === "GBMAR" || s.indexOf("GBMAR") !== -1) return "GBMAR";
  if (s === "GBI" || s.indexOf("GBI") !== -1) return "GBI";
  if (s === "GBS" || s.indexOf("GBS") !== -1) return "GBS";

  // 3. Centros de Atividades Técnicas (CAT)
  if (s.indexOf("CAT") !== -1) {
    if (s.indexOf("AG") !== -1 || s.indexOf("AGRESTE") !== -1) return "CAT_AG";
    if (s.indexOf("RMR") !== -1) return "CAT_RMR";
    if (s.indexOf("SE") !== -1 || s.indexOf("SERTAO") !== -1) return "CAT_SE";
    if (s.indexOf("ZM") !== -1 || s.indexOf("MATA") !== -1) return "CAT_ZM";
  }

  // 4. DINTER
  if (s.indexOf("DINTER") !== -1) {
    if (s.indexOf("2") !== -1 || s.indexOf("II") !== -1) return "DINTER_2";
    if (s.indexOf("1") !== -1 || s.indexOf("I") !== -1) return "DINTER_1";
  }

  // 5. CPO / CPP / CPPA
  if (s === "CPPA" || s.indexOf("CPPA") !== -1) return "CPPA";
  if (s.indexOf("CPO") !== -1 || s.indexOf("CPP") !== -1) return "CPO_CPP";

  // 6. CI vs CINT
  var sSemSede = s.replace(/\bSEDE\b/g, "").trim();
  if (sSemSede === "CINT" || s.indexOf("CINT") !== -1) return "CINT";
  if (sSemSede === "CI" || s === "CI" || s === "CI SEDE") return "CI";

  // 7. Outras OMEs e Diretorias (remove palavra SEDE e espaços)
  var limpo = s.replace(/\bSEDE\b/g, "").replace(/[^A-Z0-9]/g, "");
  return limpo;
}

// Localiza a coluna exata da OME inspecionando exclusivamente a linha 6 da coluna AB (28) até BX (76)
function mapearOmeParaColunaDist(nomeOme, headersDist) {
  var alvo = String(nomeOme || "").trim();
  if (!alvo || !headersDist || headersDist.length === 0) return -1;

  var colMin = 28; // Coluna AB (28)
  var colMax = Math.min(headersDist.length, 76); // Coluna BX (76)

  if (headersDist.length < colMin) {
    console.warn("mapearOmeParaColunaDist: headersDist possui menos de 28 colunas (" + headersDist.length + ").");
    return -1;
  }

  var chaveAlvo = extrairChaveCanonicaOme(alvo);
  var alvoUpper = alvo.toUpperCase();
  var alvoLimpo = alvo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

  // 1ª PASSAGEM: Correspondência exata da string (entre as colunas AB/28 e BX/76 da linha 6)
  for (var col = colMin; col <= colMax; col++) {
    var rawH = String(headersDist[col - 1] || "").trim();
    if (!rawH) continue;
    if (rawH.toUpperCase() === alvoUpper) {
      console.log("mapearOmeParaColunaDist: [Match Exato] OME '" + alvo + "' mapeada para Coluna " + col + " (Linha 6: '" + rawH + "')");
      return col;
    }
  }

  // 2ª PASSAGEM: Correspondência canônica (GBs 1 a 9, Sedes, CATs, DINTER, etc.)
  if (chaveAlvo) {
    for (var col2 = colMin; col2 <= colMax; col2++) {
      var rawH2 = String(headersDist[col2 - 1] || "").trim();
      if (!rawH2) continue;
      var chaveH = extrairChaveCanonicaOme(rawH2);
      if (chaveH && chaveH === chaveAlvo) {
        console.log("mapearOmeParaColunaDist: [Match Canônico] OME '" + alvo + "' (Chave: " + chaveAlvo + ") mapeada para Coluna " + col2 + " (Linha 6: '" + rawH2 + "')");
        return col2;
      }
    }
  }

  // 3ª PASSAGEM: Correspondência normalizada sem acentos e sem pontuação
  for (var col3 = colMin; col3 <= colMax; col3++) {
    var rawH3 = String(headersDist[col3 - 1] || "").trim();
    if (!rawH3) continue;
    var hLimpo = rawH3.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (hLimpo === alvoLimpo) {
      console.log("mapearOmeParaColunaDist: [Match Normalizado] OME '" + alvo + "' mapeada para Coluna " + col3 + " (Linha 6: '" + rawH3 + "')");
      return col3;
    }
  }

  // 4ª PASSAGEM: Substring segura (com proteção estrita para CI/CINT e CPO/CPPA)
  if (alvoLimpo.length >= 3) {
    for (var col4 = colMin; col4 <= colMax; col4++) {
      var rawH4 = String(headersDist[col4 - 1] || "").trim();
      if (!rawH4) continue;
      var hNorm = rawH4.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();

      if (alvoLimpo === "CI" && hNorm.indexOf("CINT") !== -1) continue;
      if (alvoLimpo === "CPO" && hNorm.indexOf("CPPA") !== -1) continue;
      if (hNorm === "CI" && alvoLimpo.indexOf("CINT") !== -1) continue;
      if (hNorm === "CPO" && alvoLimpo.indexOf("CPPA") !== -1) continue;

      if (hNorm.indexOf(alvoLimpo) !== -1 || alvoLimpo.indexOf(hNorm) !== -1) {
        console.log("mapearOmeParaColunaDist: [Match Substring] OME '" + alvo + "' mapeada para Coluna " + col4 + " (Linha 6: '" + rawH4 + "')");
        return col4;
      }
    }
  }

  console.warn("mapearOmeParaColunaDist: OME '" + alvo + "' NÃO pôde ser mapeada entre as colunas AB (" + colMin + ") e BX (" + colMax + ") na linha 6.");
  return -1;
}

function repararFormulasDoacaoPlan(sheetPlan) {
  try {
    if (!sheetPlan) return;
    var ultLinha = sheetPlan.getLastRow();
    if (ultLinha < 6) return;
    var numLinhas = ultLinha - 5;

    var mapTicketsUnd = {};
    try {
      var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
      var shTickets = ssAux.getSheetByName("Tickets_Doacao");
      if (shTickets && shTickets.getLastRow() > 1) {
        var dadosTk = shTickets.getRange(2, 7, shTickets.getLastRow() - 1, 4).getValues();
        for (var t = 0; t < dadosTk.length; t++) {
          var sSei = String(dadosTk[t][0] || "").split("|")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
          var sUnd = String(dadosTk[t][3] || "").trim().toUpperCase();
          if (sSei && sUnd) {
            mapTicketsUnd[sSei] = sUnd;
          }
        }
      }
    } catch (eTk) {}

    var rangeValores = sheetPlan.getRange(6, 4, numLinhas, 12).getValues();
    var rangeFormulas = sheetPlan.getRange(6, 9, numLinhas, 1).getFormulas();

    for (var i = 0; i < numLinhas; i++) {
      var tipo = String(rangeValores[i][3] || "").trim().toUpperCase();
      if (tipo === "DOAÇÃO" || tipo === "DOACAO") {
        var formI = rangeFormulas[i][0];
        var r = 6 + i;
        if (!formI && r > 6) {
          var formModelo = sheetPlan.getRange(r - 1, 9).getFormulaR1C1();
          if (formModelo) {
            sheetPlan.getRange(r, 9).setFormulaR1C1(formModelo);
            console.log("Fórmula da Coluna I (Objeto Resumido) restaurada na linha " + r + " de Doação.");
          }
        }

        var valK = String(rangeValores[i][7] || "").trim().toUpperCase();
        var valO = String(rangeValores[i][11] || "").trim().toUpperCase();

        if (!valK || !valO) {
          var undReparar = valK || valO;
          if (!undReparar) {
            var seiLimpo = String(rangeValores[i][0] || "").split("|")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            undReparar = (mapTicketsUnd && mapTicketsUnd[seiLimpo]) ? mapTicketsUnd[seiLimpo] : "UND";
          }
          if (!valK) {
            sheetPlan.getRange(r, 11).setValue(undReparar);
          }
          if (!valO) {
            sheetPlan.getRange(r, 15).setValue(undReparar);
          }
        }

        if (sheetPlan.getLastColumn() >= 31) {
          var valAE = sheetPlan.getRange(r, 31).getValue();
          if (valAE) {
            var strAE = String(valAE).trim();
            var mBrHora = strAE.match(/^(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/);
            if (mBrHora) {
              sheetPlan.getRange(r, 31).setNumberFormat("dd/MM/yyyy");
              sheetPlan.getRange(r, 31).setValue(mBrHora[1]);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Aviso ao verificar fórmulas de doação: " + e.message);
  }
}

function processarItemDoacaoPlan(dadosRecebimento, dataAprovacao, ssCompras) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var ss = ssCompras || SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var sheetPlan = obterAbaPorNomeAproximado(ss, ABA_PLANEJAMENTO);
    if (!sheetPlan) {
      throw new Error("Base de Planejamento de Compras não encontrada na planilha de compras (" + ID_PLANILHA_COMPRAS + ").");
    }

    var ultLinhaPlan = sheetPlan.getLastRow();
    var linhaInicial = 6;
    var totalLinhasDados = Math.max(0, ultLinhaPlan - linhaInicial + 1);

    var seiAlvo = String(dadosRecebimento.numeroProcesso || "").trim();
    var seiAlvoClean = seiAlvo.split("|")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    var seiAlvoDigits = seiAlvo.replace(/\D/g, "");
    var matAlvo = String(dadosRecebimento.material || "").trim();
    var qtdAlvo = parseInt(dadosRecebimento.quantidadeRecebida, 10) || 0;
    var undAlvo = String(dadosRecebimento.unidadeMedida || dadosRecebimento.unidade || dadosRecebimento.und || "UND").trim().toUpperCase();

    function extrairDataSimplesFormatada(val) {
      if (!val) return Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy");
      if (Object.prototype.toString.call(val) === '[object Date]') {
        return Utilities.formatDate(val, "America/Recife", "dd/MM/yyyy");
      }
      var s = String(val).trim();
      var matchBr = s.match(/^(\d{2}\/\d{2}\/\d{4})/);
      if (matchBr) return matchBr[1];
      var matchIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (matchIso) return matchIso[3] + "/" + matchIso[2] + "/" + matchIso[1];
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, "America/Recife", "dd/MM/yyyy");
      return Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy");
    }

    var dataAprovGravar = extrairDataSimplesFormatada(dataAprovacao || (dadosRecebimento && dadosRecebimento.dataAprovacao));

    var dadosPlan = totalLinhasDados > 0 ? sheetPlan.getRange(linhaInicial, 1, totalLinhasDados, 11).getValues() : [];

    // Verificação rápida de item já existente
    for (var i = 0; i < dadosPlan.length; i++) {
      var row = dadosPlan[i];
      var ctrlObjLinha = String(row[1] || "").trim();
      var seiLinha = String(row[3] || "").trim();
      var objLinha = String(row[8] || "").trim();
      var qtdLinha = parseInt(row[9], 10);
      if (isNaN(qtdLinha)) qtdLinha = 0;

      var seiLinhaClean = normalizarSeiParaComparacao(seiLinha);
      var seiAlvoCleanNorm = normalizarSeiParaComparacao(seiAlvo);
      var objLinhaNorm = normalizarNomeObjetoParaComparacao(objLinha);
      var matAlvoNorm = normalizarNomeObjetoParaComparacao(matAlvo);

      // SEI e Objeto devem ser EXATAMENTE os mesmos (sem aproximações)
      var matchSei = (seiAlvoCleanNorm && seiLinhaClean && seiAlvoCleanNorm === seiLinhaClean);
      var matchMat = (matAlvoNorm && objLinhaNorm && matAlvoNorm === objLinhaNorm);
      var matchQtd = (qtdAlvo > 0 && qtdLinha === qtdAlvo);

      if (matchSei && matchMat && matchQtd) {
        var linhaExistentePlan = linhaInicial + i;
        if (dataAprovGravar) {
          sheetPlan.getRange(linhaExistentePlan, 31).setValue(dataAprovGravar);
        }
        if (qtdAlvo > 0) {
          sheetPlan.getRange(linhaExistentePlan, 14).setValue(qtdAlvo);
        }
        if (undAlvo) {
          sheetPlan.getRange(linhaExistentePlan, 11).setValue(undAlvo);
          sheetPlan.getRange(linhaExistentePlan, 15).setValue(undAlvo);
        }
        return {
          jaExiste: true,
          linha: linhaExistentePlan,
          numControle: ctrlObjLinha || seiAlvo
        };
      }
    }

    // Localizar primeira linha vazia na Coluna D
    var targetRow = -1;
    for (var k = 0; k < dadosPlan.length; k++) {
      var valD = String(dadosPlan[k][3] || "").trim();
      var linhaAtual = linhaInicial + k;
      if (linhaAtual === 6) {
        var dUp = valD.toUpperCase();
        if (dUp === "SEI" || dUp === "PROCESSO" || dUp.indexOf("PROCESSO / SEI") !== -1) continue;
      }
      if (!valD) {
        targetRow = linhaAtual;
        break;
      }
    }

    if (targetRow === -1) {
      targetRow = Math.max(ultLinhaPlan, 5) + 1;
    }

    var maxLinhasPlan = sheetPlan.getMaxRows();
    if (targetRow > maxLinhasPlan) {
      sheetPlan.insertRowsAfter(maxLinhasPlan, targetRow - maxLinhasPlan);
    }

    // Busca rápida do código no Catálogo
    var numRefCadastro = "";
    try {
      var abaCad = ss.getSheetByName(ABA_CATALOGO_ITENS) || obterAbaPorNomeAproximado(ss, ABA_CATALOGO_ITENS);
      if (abaCad && abaCad.getLastRow() >= 6) {
        var ultLinhaCad = abaCad.getLastRow();
        var dadosCad = abaCad.getRange(6, 2, ultLinhaCad - 5, 2).getValues();
        var melhorSimCad = 0;
        var melhorRefCad = "";
        var matAlvoLower = matAlvo.toLowerCase();

        for (var c = 0; c < dadosCad.length; c++) {
          var nomeCad = String(dadosCad[c][1] || "").trim();
          if (!nomeCad) continue;
          if (nomeCad.toLowerCase() === matAlvoLower) {
            melhorRefCad = String(dadosCad[c][0] || "").trim();
            break; // Correspondência exata encerra na hora
          }
          var simCad = calcularSimilaridadeMaterial(matAlvo, nomeCad);
          if (simCad > melhorSimCad && simCad >= 75) {
            melhorSimCad = simCad;
            melhorRefCad = String(dadosCad[c][0] || "").trim();
          }
        }
        numRefCadastro = melhorRefCad;
      }
    } catch (eCad) {
      console.warn("processarItemDoacaoPlan: Aviso ao buscar código no Catálogo: " + eCad.message);
    }

    if (!numRefCadastro && dadosPlan.length > 0) {
      var matAlvoLower2 = matAlvo.toLowerCase();
      for (var p = 0; p < dadosPlan.length; p++) {
        var objP = String(dadosPlan[p][8] || "").trim();
        var refP = String(dadosPlan[p][2] || "").trim();
        if (refP && objP && (objP.toLowerCase() === matAlvoLower2 || calcularSimilaridadeMaterial(matAlvo, objP) >= 80)) {
          numRefCadastro = refP;
          break;
        }
      }
    }

    // Cópia de fórmulas da linha modelo em LOTE (1 get e 1 set em bloco de 35 colunas)
    if (targetRow > 6) {
      var linhaModelo = targetRow - 1;
      var formulasModelo = sheetPlan.getRange(linhaModelo, 1, 1, 35).getFormulasR1C1()[0];
      var formulasAlvo = new Array(35).fill("");
      var temFormula = false;
      for (var cCol = 0; cCol < 35; cCol++) {
        var colNum = cCol + 1;
        // Não sobrescreve colunas com dados específicos diretos (C, D, G, H, J, K, N, O, AE)
        if (colNum === 3 || colNum === 4 || colNum === 7 || colNum === 8 || colNum === 10 || colNum === 11 || colNum === 14 || colNum === 15 || colNum === 31) {
          continue;
        }
        if (formulasModelo[cCol]) {
          formulasAlvo[cCol] = formulasModelo[cCol];
          temFormula = true;
        }
      }
      if (temFormula) {
        sheetPlan.getRange(targetRow, 1, 1, 35).setFormulasR1C1([formulasAlvo]);
      }
    }

    // Gravação dos valores específicos
    if (numRefCadastro) sheetPlan.getRange(targetRow, 3).setValue(numRefCadastro);
    sheetPlan.getRange(targetRow, 4).setValue(seiAlvo);
    sheetPlan.getRange(targetRow, 7).setValue("DOAÇÃO");
    sheetPlan.getRange(targetRow, 8).setValue("FINALIZADO");
    sheetPlan.getRange(targetRow, 10).setValue(qtdAlvo);
    sheetPlan.getRange(targetRow, 11).setValue(undAlvo || "UND");
    sheetPlan.getRange(targetRow, 14).setValue(qtdAlvo);
    sheetPlan.getRange(targetRow, 15).setValue(undAlvo || "UND");

    if (dataAprovGravar) {
      sheetPlan.getRange(targetRow, 31).setValue(dataAprovGravar);
    }

    var numControleGerado = String(sheetPlan.getRange(targetRow, 2).getValue() || "").trim();
    if (!numControleGerado) {
      numControleGerado = seiAlvo;
    }

    console.log("processarItemDoacaoPlan [Otimizado]: doação gravada na linha " + targetRow + ". Controle: " + numControleGerado);

    return {
      jaExiste: false,
      linha: targetRow,
      numControle: numControleGerado,
      numRefCadastro: numRefCadastro
    };

  } catch (err) {
    console.error("Erro em processarItemDoacaoPlan: " + err.message);
    throw new Error("Erro ao registrar item de doação no Planejamento: " + err.message);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function sincronizarRecebimentoDist(dadosRecebimento, numeroControle, modoParcela, linhaExistente, qtdExistente, ssCompras) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var ss = ssCompras || SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var sheetDist = obterAbaPorNomeAproximado(ss, "#DIST");
    if (!sheetDist) {
      console.warn("Aba #DIST não encontrada na planilha de compras.");
      return { sucesso: false, erro: "Aba #DIST não encontrada na planilha de compras (" + ID_PLANILHA_COMPRAS + ")" };
    }

    var estrutura = obterEstruturaAbaDist(sheetDist);
    var targetRow = -1;
    var qtdNova = parseInt(dadosRecebimento.quantidadeRecebida, 10) || 0;
    var chaveGravar = String(numeroControle || dadosRecebimento.numeroProcesso || "").trim();
    var dataHoje = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy");

    var omeAlvo = String(dadosRecebimento.usuarioOme || dadosRecebimento.unidadeFinal || dadosRecebimento.omeBeneficiada || dadosRecebimento.ome || dadosRecebimento.unidade || "").trim();
    var colOme = -1;
    if (omeAlvo) {
      colOme = mapearOmeParaColunaDist(omeAlvo, estrutura.headers);
    }

    if (modoParcela === "SOMAR_PARCELA" && linhaExistente && linhaExistente > estrutura.headerRow) {
      // 1. RECEBIMENTO PARCELADO CONFIRMADO PELO USUÁRIO
      targetRow = linhaExistente;
      var qtdBase = parseInt(qtdExistente, 10);
      if (isNaN(qtdBase)) {
        qtdBase = parseInt(sheetDist.getRange(targetRow, 10).getValue(), 10) || 0;
      }
      var qtdTotal = qtdBase + qtdNova;

      // Coluna J (10): Quantidade Recebida total acumulada
      sheetDist.getRange(targetRow, 10).setValue(qtdTotal);
      // Coluna X (24): DATA INÍCIO RECEBIMENTO (preserva data inicial se já houver ou preenche se vazia)
      var dtInicioAtual = String(sheetDist.getRange(targetRow, 24).getValue() || "").trim();
      if (!dtInicioAtual) {
        sheetDist.getRange(targetRow, 24).setValue(dataHoje);
      }

      if (dadosRecebimento.notaDistribuicao) {
        sheetDist.getRange(targetRow, 26).setValue(String(dadosRecebimento.notaDistribuicao).trim());
      }
      if (dadosRecebimento.numeroBge) {
        sheetDist.getRange(targetRow, 27).setValue(String(dadosRecebimento.numeroBge).trim());
      }

      // REGRA OFICIAL CBMPE:
      // Na Inclusão / Recebimento, a quantidade NÃO deve ser lançada nas OMEs.
      // Todas as OMEs devem permanecer com os valores atuais (ou 0 se ainda não distribuídas).
      // O lançamento nas OMEs ocorrerá estritamente após a distribuição (Despacho DPL).
      console.log("Recebimento parcelado gravado com sucesso na linha " + targetRow + " de #DIST. Qtd anterior: " + qtdBase + ", Nova parcela: " + qtdNova + ", Total: " + qtdTotal + ". As OMEs permanecem inalteradas até a distribuição.");
      return { sucesso: true, linha: targetRow, controle: chaveGravar, modo: "SOMAR_PARCELA", qtdTotal: qtdTotal, omeDistribuida: "Nenhuma (OMEs aguardando distribuição)", colunaOme: -1 };

    } else {
      // 2. NOVO REGISTRO (LOTE INÉDITO)
      var linhaInicial = 6;
      var maxLinhas = sheetDist.getMaxRows();
      var ultLinha = Math.max(sheetDist.getLastRow(), linhaInicial);
      var totalLinhasBusca = ultLinha - linhaInicial + 1;
      var targetRow = -1;

      var colDValores = sheetDist.getRange(linhaInicial, 4, totalLinhasBusca, 1).getValues();
      for (var k = 0; k < colDValores.length; k++) {
        var valD = String(colDValores[k][0] || "").trim();
        var linhaAtual = linhaInicial + k;
        if (linhaAtual === 6) continue;
        if (!valD) {
          targetRow = linhaAtual;
          break;
        }
      }

      if (targetRow === -1) {
        targetRow = ultLinha + 1;
      }

      if (targetRow > maxLinhas) {
        sheetDist.insertRowsAfter(maxLinhas, targetRow - maxLinhas);
      }

      // Replicar fórmulas relativas em LOTE (1 get e 1 set para toda a linha em vez de 80 chamadas)
      if (targetRow > ultLinha) {
        var numCols = Math.min(sheetDist.getLastColumn(), 80);
        var linhaModelo = targetRow - 1;
        var formulasMod = sheetDist.getRange(linhaModelo, 1, 1, numCols).getFormulasR1C1()[0];
        var formulasNova = new Array(numCols).fill("");
        var temFormulaDist = false;
        for (var c = 0; c < numCols; c++) {
          var cNum = c + 1;
          if (cNum !== 4 && cNum !== 10 && cNum !== 24 && cNum !== 25 && cNum !== 26 && cNum !== 27 && (cNum < 28 || cNum > 76)) {
            if (formulasMod[c]) {
              formulasNova[c] = formulasMod[c];
              temFormulaDist = true;
            }
          }
        }
        if (temFormulaDist) {
          sheetDist.getRange(targetRow, 1, 1, numCols).setFormulasR1C1([formulasNova]);
        }
      }

      // Coluna D (4): Nº CONTROLE (OBJ.)
      if (chaveGravar) {
        sheetDist.getRange(targetRow, 4).setValue(chaveGravar);
      }
      // Coluna J (10): Quantidade Recebida
      sheetDist.getRange(targetRow, 10).setValue(qtdNova);
      // Coluna X (24): DATA INÍCIO RECEBIMENTO (data do momento do lançamento na primeira vez)
      sheetDist.getRange(targetRow, 24).setValue(dataHoje);
      // Coluna Y (25): DATA FINAL DE DISTRIBUIÇÃO (deve permanecer vazia até a última remessa ser assinada)
      sheetDist.getRange(targetRow, 25).clearContent();

      if (dadosRecebimento.notaDistribuicao) {
        sheetDist.getRange(targetRow, 26).setValue(String(dadosRecebimento.notaDistribuicao).trim());
      }
      if (dadosRecebimento.numeroBge) {
        sheetDist.getRange(targetRow, 27).setValue(String(dadosRecebimento.numeroBge).trim());
      }

      // REGRA OFICIAL DO CBMPE:
      // Quando um Login cadastrado como Administrador, CINT ou DLOG lançar um material na aba Inclusão,
      // devemos lançá-lo na Planilha #DIST, porém a quantidade NÃO DEVE ser lançada nas OMEs nesse momento,
      // devendo TODAS permanecer com o valor 0.
      // O lançamento nas OMEs será feito apenas após a distribuição oficial para as OMEs de destino.
      var numColsOme = 76 - 28 + 1; // 49 colunas de OME (AB até BX)
      var zerosOme = [new Array(numColsOme).fill(0)];
      sheetDist.getRange(targetRow, 28, 1, numColsOme).setValues(zerosOme);

      console.log("Novo recebimento gravado com sucesso na linha " + targetRow + " de #DIST para o processo " + dadosRecebimento.numeroProcesso + " (Controle: " + chaveGravar + ", Qtd Recebida: " + qtdNova + ", Todas 49 OMEs inicializadas com 0).");
      return { sucesso: true, linha: targetRow, controle: chaveGravar, modo: "NOVO_REGISTRO", qtdTotal: qtdNova, omeDistribuida: "Nenhuma (OMEs zeradas até distribuição)", colunaOme: -1 };
    }

  } catch (err) {
    console.error("Erro em sincronizarRecebimentoDist: " + err.message);
    return { sucesso: false, erro: err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function sincronizarDistribuicaoOmeDist(dadosTicket, numeroControle) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var sheetDist = obterAbaPorNomeAproximado(ss, "#DIST");
    if (!sheetDist) {
      console.warn("Aba #DIST não encontrada na planilha de compras.");
      return { sucesso: false, erro: "Aba #DIST não encontrada" };
    }

    var estrutura = obterEstruturaAbaDist(sheetDist);
    var targetRow = localizarLinhaDist(sheetDist, estrutura, numeroControle, dadosTicket.processoSei, dadosTicket.material);

    // Se o registro não for encontrado em #DIST, aloca na primeira célula em branco da coluna D a partir da 6ª linha
    if (targetRow === -1) {
      var linhaInicial = 6;
      var maxLinhas = sheetDist.getMaxRows();
      var ultLinha = Math.max(sheetDist.getLastRow(), linhaInicial);
      var totalLinhasBusca = ultLinha - linhaInicial + 1;

      var colDValores = sheetDist.getRange(linhaInicial, 4, totalLinhasBusca, 1).getValues();
      for (var k = 0; k < colDValores.length; k++) {
        var valD = String(colDValores[k][0] || "").trim();
        var linhaAtual = linhaInicial + k;

        if (linhaAtual === 6) {
          continue; // Linha 6 é exclusivamente o cabeçalho (nomes das OMEs e títulos das colunas)
        }

        if (!valD) {
          targetRow = linhaAtual;
          break;
        }
      }

      if (targetRow === -1) {
        targetRow = ultLinha + 1;
      }

      if (targetRow > maxLinhas) {
        sheetDist.insertRowsAfter(maxLinhas, targetRow - maxLinhas);
      }

      if (targetRow > ultLinha) {
        var numCols = Math.min(sheetDist.getLastColumn(), 80);
        var linhaModelo = targetRow - 1;
        for (var c = 1; c <= numCols; c++) {
          if (c !== 4 && c !== 10 && c !== 24 && c !== 25 && c !== 26 && c !== 27 && (c < 28 || c > 76)) {
            var f = sheetDist.getRange(linhaModelo, c).getFormulaR1C1();
            if (f) {
              sheetDist.getRange(targetRow, c).setFormulaR1C1(f);
            }
          }
        }
      }

      var chaveGravar = String(numeroControle || dadosTicket.processoSei || "").trim();
      if (chaveGravar) {
        sheetDist.getRange(targetRow, 4).setValue(chaveGravar);
      }
      var dataHoje = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy");
      // Coluna X (24): DATA INÍCIO RECEBIMENTO
      sheetDist.getRange(targetRow, 24).setValue(dataHoje);
      // Coluna Y (25): DATA FINAL DE DISTRIBUIÇÃO (permanece limpa até última remessa ser assinada)
      sheetDist.getRange(targetRow, 25).clearContent();
      var numColsOme = 76 - 28 + 1;
      sheetDist.getRange(targetRow, 28, 1, numColsOme).setValues([new Array(numColsOme).fill(0)]);
      console.log("Linha inédita alocada em #DIST na posição " + targetRow + " para distribuição do processo " + dadosTicket.processoSei + " (Controle: " + chaveGravar + ", OMEs inicializadas com 0)");
    }

    // Normaliza a lista de destinos (suporta tanto despacho único quanto lista fracionada de múltiplas OMEs)
    var listaDistribuicoes = [];
    if (dadosTicket.distribuicoes && Array.isArray(dadosTicket.distribuicoes) && dadosTicket.distribuicoes.length > 0) {
      for (var d = 0; d < dadosTicket.distribuicoes.length; d++) {
        var itemD = dadosTicket.distribuicoes[d];
        var omeD = String(itemD.ome || itemD.omeDestino || "").trim();
        var qtdD = parseInt(itemD.quantidade, 10) || 0;
        if (omeD && qtdD > 0) {
          listaDistribuicoes.push({ ome: omeD, quantidade: qtdD });
        }
      }
    } else if (dadosTicket.omeDestino) {
      var omeUnica = String(dadosTicket.omeDestino).trim();
      var qtdUnica = parseInt(dadosTicket.quantidade, 10) || 0;
      if (omeUnica && qtdUnica > 0) {
        listaDistribuicoes.push({ ome: omeUnica, quantidade: qtdUnica });
      }
    }

    // Garante que todas as colunas de OME (28 a 76) que estejam vazias/nulas na linha fiquem explicitamente com 0
    try {
      var numColsOmeTotal = 76 - 28 + 1;
      var valsLinhaOme = sheetDist.getRange(targetRow, 28, 1, numColsOmeTotal).getValues()[0];
      var houveAjusteZero = false;
      for (var z = 0; z < valsLinhaOme.length; z++) {
        if (valsLinhaOme[z] === "" || valsLinhaOme[z] === null || valsLinhaOme[z] === undefined) {
          valsLinhaOme[z] = 0;
          houveAjusteZero = true;
        }
      }
      if (houveAjusteZero) {
        sheetDist.getRange(targetRow, 28, 1, numColsOmeTotal).setValues([valsLinhaOme]);
      }
    } catch (eZ) {}

    // REGRA DE NEGÓCIO OFICIAL:
    // A quantidade na planilha #DIST para as OMEs NÃO é alterada no momento do despacho/geração do ticket.
    // Todas as colunas das OMEs (28 a 76) permanecem com 0 (ou com os valores previamente confirmados).
    // O lançamento nas OMEs em #DIST ocorre estritamente após a OME Destino assinar e confirmar o recebimento
    // da remessa pendente (função sincronizarConfirmacaoRecebimentoDist).
    if (dadosTicket.forcarAtualizacaoOmes) {
      var atualizados = [];
      for (var i = 0; i < listaDistribuicoes.length; i++) {
        var dist = listaDistribuicoes[i];
        var colOme = mapearOmeParaColunaDist(dist.ome, estrutura.headers);
        if (colOme >= 28 && colOme <= 76 && dist.quantidade > 0) {
          var valAtual = sheetDist.getRange(targetRow, colOme).getValue();
          var qtdAtualOme = parseInt(valAtual, 10) || 0;
          var novaQtd = qtdAtualOme + dist.quantidade;
          sheetDist.getRange(targetRow, colOme).setValue(novaQtd);
          atualizados.push(dist.ome + " (Col " + colOme + "): " + qtdAtualOme + " -> " + novaQtd);
        }
      }
      console.log("Atualização forçada de OMEs em #DIST: " + atualizados.join("; "));
    }

    // Coluna AA (27): Nº DO BGE (se informado)
    if (dadosTicket.numeroBge) {
      sheetDist.getRange(targetRow, 27).setValue(String(dadosTicket.numeroBge).trim());
    }

    // Coluna Z (26): Nº DA NOTA DIST. (se informado)
    var notaDist = dadosTicket.notaDistribuicao || dadosTicket.numeroNota;
    if (notaDist) {
      sheetDist.getRange(targetRow, 26).setValue(String(notaDist).trim());
    }

    // IMPORTANTE: Coluna X (24) NUNCA é editada!
    // IMPORTANTE: Não há coluna de Status!

    SpreadsheetApp.flush();
    console.log("Despacho DPL registrado em #DIST na linha " + targetRow + " (Nota: " + (notaDist || "-") + ", BGE: " + (dadosTicket.numeroBge || "-") + "). Quantidades das OMEs mantidas em 0 aguardando confirmação individual de cada OME.");
    return { sucesso: true, linha: targetRow, mensagem: "Metadados sincronizados em #DIST. Quantidades de OMEs mantidas em 0 até a assinatura de recebimento." };
  } catch (err) {
    console.error("Erro em sincronizarDistribuicaoOmeDist: " + err.message);
    return { sucesso: false, erro: err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Sincroniza a confirmação de recebimento de remessa com a planilha #DIST.
 * A quantidade na #DIST só é alterada a partir do momento em que a OME Destino 
 * confirma o recebimento assinando digitalmente a remessa pendente.
 */
function sincronizarConfirmacaoRecebimentoDist(dadosConfirmacao) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (!dadosConfirmacao) return { sucesso: false, erro: "Dados de confirmação ausentes." };

    var idRemessa = String(dadosConfirmacao.idRemessa || "").trim();
    var omeDestino = String(dadosConfirmacao.omeDestino || "").trim();
    var material = String(dadosConfirmacao.material || "").trim();
    var qtdConfirmada = parseInt(dadosConfirmacao.quantidadeConfirmada, 10) || 0;
    var refStr = String(dadosConfirmacao.referenciaSei || "").trim();

    if (!omeDestino || !material || qtdConfirmada <= 0) {
      console.log("Sincronização #DIST ignorada: parâmetros insuficientes (Qtd: " + qtdConfirmada + ", OME: " + omeDestino + ", Material: " + material + ")");
      return { sucesso: false, mensagem: "Parâmetros insuficientes" };
    }

    // Não sincroniza movimentações estritamente internas da mesma OME
    if (refStr.indexOf("INTERNAL_TREE:") === 0) {
      console.log("Sincronização #DIST ignorada: remessa interna de subunidade da mesma OME.");
      return { sucesso: true, mensagem: "Remessa interna ignorada para #DIST." };
    }

    var ss = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var sheetDist = obterAbaPorNomeAproximado(ss, "#DIST");
    if (!sheetDist) {
      console.warn("Aba #DIST não encontrada na planilha de compras.");
      return { sucesso: false, erro: "Aba #DIST não encontrada" };
    }

    var estrutura = obterEstruturaAbaDist(sheetDist);

    // Extrai dados complementares (SEI, BGE, IDs de itens) da referência da remessa
    var processoSei = "";
    var numeroBge = "";
    var matchBge = refStr.match(/BGE(?:\/Doc)?:\s*([^\s|]+)/i);
    if (matchBge) numeroBge = matchBge[1].trim();

    var itensIds = [];
    var matchIds = refStr.match(/(?:IDS_TICKET|IDS_TRANSF):(.*?)\s*\|/);
    if (matchIds) {
      try {
        itensIds = JSON.parse(matchIds[1]);
      } catch (eJson) {}
    }

    // Tenta extrair o SEI da referência limpa
    var refLimpa = refStr.replace(/^(?:IDS_TICKET|IDS_TRANSF):\[.*?\]\s*\|\s*/i, "");
    refLimpa = refLimpa.replace(/^S[eé]rie:\s*[^|]+\|\s*/i, "");
    var matchSei = refLimpa.match(/SEI:\s*([^\s|]+)/i);
    if (matchSei) {
      processoSei = matchSei[1].trim();
    } else {
      var partesRef = refLimpa.split("|");
      var candSei = partesRef[0].trim();
      if (candSei && candSei !== "N/I" && !candSei.includes("IDS_")) {
        processoSei = candSei;
      }
    }

    // Se o processo SEI não foi obtido da string, busca no BigQuery através dos itens vinculados
    if ((!processoSei || processoSei === "N/I") && itensIds && itensIds.length > 0) {
      try {
        function limparSQLConf_(t) { return String(t || '').replace(/'/g, "\\'"); }
        var sqlSei = "SELECT SEI_COMPRA_RECEBIMENTO, OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM = '" + limparSQLConf_(itensIds[0]) + "' LIMIT 1";
        var resBqSei = executarConsultaBigQuerySegura(sqlSei);
        if (resBqSei && resBqSei.rows && resBqSei.rows.length > 0 && resBqSei.rows[0].f) {
          if (resBqSei.rows[0].f[0] && resBqSei.rows[0].f[0].v) {
            processoSei = String(resBqSei.rows[0].f[0].v).trim();
          }
          if ((!material || material === "N/I") && resBqSei.rows[0].f[1] && resBqSei.rows[0].f[1].v) {
            material = String(resBqSei.rows[0].f[1].v).trim();
          }
        }
      } catch (eBq) {
        console.warn("Aviso ao buscar SEI no BigQuery para sincronização #DIST: " + eBq.message);
      }
    }

    var numeroControle = obterNumeroControlePlan(processoSei, material);
    var targetRow = localizarLinhaDist(sheetDist, estrutura, numeroControle, processoSei, material);

    if (targetRow === -1) {
      console.warn("Linha correspondente não encontrada em #DIST para confirmação da remessa " + idRemessa + " (SEI: " + processoSei + ", Mat: " + material + ", Ctrl: " + numeroControle + ").");
      return { sucesso: false, erro: "Registro não localizado em #DIST" };
    }

    // Mapeia a coluna da OME destino (colunas 28 a 76)
    var colOme = mapearOmeParaColunaDist(omeDestino, estrutura.headers);
    if (colOme < 28 || colOme > 76) {
      console.warn("Não foi possível mapear coluna válida (28-76) para a OME: " + omeDestino + " (colOme: " + colOme + ")");
      return { sucesso: false, erro: "Coluna da OME não encontrada em #DIST" };
    }

    // Normaliza células vazias da linha nas colunas de OME para 0 se necessário
    try {
      var numColsOmeTotal = 76 - 28 + 1;
      var valsLinhaOme = sheetDist.getRange(targetRow, 28, 1, numColsOmeTotal).getValues()[0];
      var houveAjusteZero = false;
      for (var z = 0; z < valsLinhaOme.length; z++) {
        if (valsLinhaOme[z] === "" || valsLinhaOme[z] === null || valsLinhaOme[z] === undefined) {
          valsLinhaOme[z] = 0;
          houveAjusteZero = true;
        }
      }
      if (houveAjusteZero) {
        sheetDist.getRange(targetRow, 28, 1, numColsOmeTotal).setValues([valsLinhaOme]);
      }
    } catch (eZ) {}

    // Lê a quantidade atual da OME e incrementa estritamente com a quantidade confirmada pela OME
    var valAtual = sheetDist.getRange(targetRow, colOme).getValue();
    var qtdAtualOme = parseInt(valAtual, 10);
    if (isNaN(qtdAtualOme)) qtdAtualOme = 0;

    var novaQtd = qtdAtualOme + qtdConfirmada;
    sheetDist.getRange(targetRow, colOme).setValue(novaQtd);

    // Garante que a Coluna X (24: DATA INÍCIO RECEBIMENTO) esteja preenchida
    var dtInicioExistente = String(sheetDist.getRange(targetRow, 24).getValue() || "").trim();
    var dataHoje = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy");
    if (!dtInicioExistente) {
      sheetDist.getRange(targetRow, 24).setValue(dataHoje);
    }

    // Se houver BGE e a coluna AA (27) estiver vazia, preenche
    if (numeroBge) {
      var bgeAtual = String(sheetDist.getRange(targetRow, 27).getValue() || "").trim();
      if (!bgeAtual) {
        sheetDist.getRange(targetRow, 27).setValue(numeroBge);
      }
    }

    // REGRA DE NEGÓCIO SOLICITADA:
    // Na coluna Y (DATA FINAL DE DISTRIBUIÇÃO) você deve colocar a data que a última remessa pendente foi assinada.
    var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ssAux.getSheetByName("RemessasPendentes");
    var temOutrasPendentes = verificarSeHaRemessasPendentesParaMaterial_(sheetRemessa, idRemessa, material, processoSei);

    if (!temOutrasPendentes) {
      sheetDist.getRange(targetRow, 25).setValue(dataHoje);
      console.log("Última remessa pendente assinada para o material '" + material + "'. Coluna Y (DATA FINAL DE DISTRIBUIÇÃO) preenchida com " + dataHoje + " na linha " + targetRow + " de #DIST.");
      registrarLogAuditoria("DIST_DATA_FINAL_CONCLUIDA", "Material '" + material + "' (Processo " + processoSei + ") teve sua última remessa pendente assinada por " + omeDestino + ". Coluna Y de #DIST preenchida com " + dataHoje + " na linha " + targetRow + ".");
    } else {
      console.log("Remessa confirmada para " + omeDestino + ", porém ainda constam outras remessas pendentes para o material '" + material + "'. Coluna Y (DATA FINAL DE DISTRIBUIÇÃO) permanece aguardando a assinatura da última remessa.");
    }

    SpreadsheetApp.flush();
    var logMsg = "Sincronização #DIST confirmada: OME " + omeDestino + " (Col " + colOme + ") atualizada de " + qtdAtualOme + " para " + novaQtd + " (+ " + qtdConfirmada + " un confirmadas) na linha " + targetRow + " [Remessa: " + idRemessa + "]. Data Final (Col Y): " + (!temOutrasPendentes ? dataHoje : "Pendente");
    console.log(logMsg);
    registrarLogAuditoria("DIST_CONFIRMACAO_RECEBIDA", logMsg);

    return { sucesso: true, linha: targetRow, colOme: colOme, novaQtd: novaQtd, dataFinalDefinida: !temOutrasPendentes };
  } catch (err) {
    console.error("Erro em sincronizarConfirmacaoRecebimentoDist: " + err.message);
    return { sucesso: false, erro: err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Verifica se ainda existem outras remessas pendentes (AGUARDANDO/PENDENTE) para o mesmo material e processo SEI.
 * Utilizada para determinar se a remessa recém-assinada foi a última remessa pendente daquele lote/processo.
 */
function verificarSeHaRemessasPendentesParaMaterial_(sheetRemessa, idRemessaAtual, material, processoSei) {
  try {
    if (!sheetRemessa || sheetRemessa.getLastRow() <= 1) return false;
    var dados = sheetRemessa.getDataRange().getValues();
    var statusPendentes = ["AGUARDANDO", "PENDENTE", "AGUARDANDO_RECEBIMENTO", "AGUARDANDO_LIBERACAO_CINT"];

    var seiAlvoClean = String(processoSei || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    var seiAlvoDigits = String(processoSei || "").replace(/\D/g, "");
    var matAlvoNorm = String(material || "").trim();

    for (var i = 1; i < dados.length; i++) {
      var row = dados[i];
      var idR = String(row[0] || "").trim();
      if (idR === idRemessaAtual) continue; // Pula a própria remessa que foi confirmada agora

      var st = String(row[5] || "").trim().toUpperCase();
      if (statusPendentes.indexOf(st) === -1) continue; // Não é pendente (já confirmada, cancelada ou recusada)

      var matR = String(row[3] || "").trim();
      var refR = String(row[10] || "").trim();

      // Checa correspondência de material
      var mesmoMaterial = false;
      if (matR && matAlvoNorm) {
        if (matR.toUpperCase() === matAlvoNorm.toUpperCase()) {
          mesmoMaterial = true;
        } else if (typeof calcularSimilaridadeMaterial === "function" && calcularSimilaridadeMaterial(matR, matAlvoNorm) > 60) {
          mesmoMaterial = true;
        }
      }

      // Checa correspondência de processo / SEI
      var mesmoProcesso = false;
      if (seiAlvoDigits && seiAlvoDigits.length >= 6) {
        var refDigits = refR.replace(/\D/g, "");
        if (refDigits.indexOf(seiAlvoDigits) !== -1 || seiAlvoDigits.indexOf(refDigits) !== -1) {
          mesmoProcesso = true;
        }
      } else if (seiAlvoClean) {
        var refClean = refR.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (refClean.indexOf(seiAlvoClean) !== -1 || seiAlvoClean.indexOf(refClean) !== -1) {
          mesmoProcesso = true;
        }
      }

      // Se for o mesmo material e pertencer ao mesmo processo (ou se não houver SEI específico para filtrar),
      // indica que ainda há outra remessa pendente
      if (mesmoMaterial && (mesmoProcesso || !processoSei)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn("Aviso em verificarSeHaRemessasPendentesParaMaterial_: " + err.message);
    return false;
  }
}





function salvarFotoNoGoogleDrive(e) {
  try {
    var ID_PASTA_DRIVE = "19XnaC8v_hVRQRwasGToMtNpyvsrCl5SW"; 
    var blob = Utilities.newBlob(Utilities.base64Decode(e.data), e.mimeType, e.name);
    var arquivo = null;

    // 1. Tenta salvar na pasta designada do CBMPE
    if (ID_PASTA_DRIVE) {
      try {
        var pasta = DriveApp.getFolderById(ID_PASTA_DRIVE);
        if (pasta) {
          arquivo = pasta.createFile(blob);
        }
      } catch (errPasta) {
        console.warn("Aviso ao acessar pasta do Drive (" + ID_PASTA_DRIVE + "): " + errPasta.message + ". Tentando salvar na raiz do Google Drive...");
      }
    }

    // 2. Se a pasta for restrita ao usuário atual, salva na raiz do Google Drive do usuário
    if (!arquivo) {
      try {
        arquivo = DriveApp.createFile(blob);
      } catch (errRoot) {
        console.warn("Aviso ao criar arquivo na raiz do Drive: " + errRoot.message);
        throw errRoot;
      }
    }

    // 3. Define compartilhamento para visualização pública institucional
    try {
      arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (errShare) {
      console.warn("Aviso ao aplicar permissão no arquivo do Drive: " + errShare.message);
    }

    return arquivo.getUrl();
  } catch (err) {
    throw new Error("Falha ao salvar arquivo no Google Drive: " + err.message);
  }
}



function getOpcoesOrgDataPorOme(ome) {

  var omeTrim = String(ome || "").trim().toUpperCase();

  

  var ORG_DATA = {

    "GCG": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Assessoria Jurídica - AJ","Assessoria de Relações Institucionais"],

    "CI": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Inteligência - DI","Seção de Análise de Inteligência - SAI","Seção de Operações de Inteligência - SOI","Seção de Contrainteligencia - SC","Núcleo de Inteligência Especializado - NEI","Divisão de Planejamento e Análise de Risco - DPAR","Seção de Análise de Risco e Estatística - SARE","Seção de Tecnologia de Dados - STD"],

    "CPO": ["Presidência","Secretaria da Comissão de Promoção de Oficiais - SCPO","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Membros"],

    "AECI": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento de Controle Interno - DPCI","1ª Seção de Controle Interno - 1ª SCI","2ª Seção de Controle Interno - 2ª SCI"],

    "CCS": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Justiça e Disciplina - NJD","Seção de Ações Preventivas - SAP","Seção de Impressa e Jornalismo - SIJ","Seção de Marketing e Relações Públicas - SMRP","Seção de Cerimonial e Eventos - SCE","Banda Música - BMus"],

    "GSG": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Assessoria de Atividades Técnicas - AAT","Assessoria de Gestão e Governança de Dados - AGGD"],

    "AjG": ["Chefia","Secretaria","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Protocolo, Publicação e Arquivo","Seção de Publicação e Arquivo - SPA","Seção de Protocolo e Postagem - SPP","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - STes","Seção de Almoxarifado - Almox","Seção de Aprovisionamento e Refeitórios - SAR","Seção de Transporte, Segurança, Serviços Gerais e Telemática - STSSGT"],

    "CPP": ["Presidência","Secretaria da Comissão de Promoção de Praças - SCPP","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Membros"],

    "DGO": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento de Operações - DPO","Seção de Doutrina e Normatização - SDN","Seção de Articulação Operacional - SAO","Divisão de Apoio Operacional - DAO","Seção de Análise Estatística - SAE","Divisão de Coordenação Operacional - DCO","Seção de Coordenação Operacional - SCO","Seção de Comunicação - SCom","Seção de Rádio-Comunicação - SRCom"],

    "DIM": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento de Operações - DPO","Seção de Planejamento e Articulação Operacional - SPO","Seção de Auditoria e Monitoramento - SAM","Seção de Estatística Operacional - SEO","Divisão de Resposta a Desastres- DRD","Seção de Articulação e com a Defesa Civil - SADC"],

    "GBI": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - Div. Op.","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","Seção de Hidrantes - SH","1ª Seção de Bombeiros de Incêndios - 1ª SBI/GBI","2ª Seção de Bombeiros de Incêndios - 2ª SBI/GBI","3ª Seção de Bombeiros de Incêndios - 3ª SBI/GBI","4ª Seção de Bombeiros de Incêndios - 4ª SBI/GBI","Seção de Bombeiros de Fernando de Noronha - SBFN/GBI","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "GBAPH": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - Div. Op.","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção de Bombeiros de Atendimento Pré-Hospitalar do GBAPH - 1ªSBAPH/GBAPH","2ª Seção de Bombeiros de Atendimento Pré-Hospitalar do GBAPH - 2ªSBAPH/GBAPH","3ª Seção de Bombeiros de Atendimento Pré-Hospitalar do GBAPH - 3ªSBAPH/GBAPH","4ª Seção de Bombeiros de Atendimento Pré-Hospitalar do GBAPH - 4ªSBAPH/GBAPH","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "GBS": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - Div. Op.","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção de Bombeiros de Salvamento do GBS - 1ª SBS/GBS","2ª Seção de Bombeiros de Salvamento do GBS - 2ª SBS/GBS","3ª Seção de Bombeiros de Salvamento do GBS - 3ª SBS/GBS","4ª Seção de Bombeiros de Salvamento do GBS - 4ª SBS/GBS","5ª Seção de Bombeiros de Salvamento do GBS - 5ª SBS/GBS","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "GBMAR": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - Div. Op.","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção de Bombeiros de Salvamento Aquático do GBMar - 1ª SBSA/GBMar","2ª Seção de Bombeiros de Salvamento Aquático do GBMar - 2ª SBSA/GBMar","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "CAT/RMR": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Serviços Técnicos","1ª Seção de Atividades Técnicas - 1ª SATec","2ª Seção de Atividades Técnicas - 2ª SATec","3ª Seção de Atividades Técnicas - 3ª SATec","4ª Seção de Atividades Técnicas - 4ª SATec","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Almoxarifado - Almox","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Material Operacional - SMO"],

    "DINTER I": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento de Operações - DPO","Seção de Planejamento e Articulação Operacional - SPAO","Seção de Auditoria e Monitoramento Operacional - SAM","Seção de Estatística Operacional - SEO","Divisão de Resposta Operacional - DRD","Seção de Articulação com a Defesa Civil - SADC"],

    "1º GB VITORIA STº ANTÃO": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DO","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção de Bombeiros do 1º GB - 1ª SB/1º GB","2ª Seção de Bombeiros do 1º GB - 2ª SB/1º GB","3ª Seção de Bombeiros do 1º GB - 3ª SB/1º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "2º GB CARUARU": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DivOP","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção de Bombeiros do 2º GB - 1ª SB/2º GB","2ª Seção de Bombeiros do 2º GB - 2ª SB/2º GB","3ª Seção de Bombeiros do 2º GB - 3ª SB/2º GB","4ª Seção de Bombeiros do 2º GB - 4ª SB/2º GB","5ª Seção de Bombeiros do 2º GB - 5ª SB/2º GB","6ª Seção de Bombeiros do 2º GB - 6ª SB/2º GB","7ª Seção de Bombeiros do 2º GB - 7ª SB/2º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "6º GB GARANHUNS": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DO","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção Bombeiros do 6º GB - 1ª SB/6º GB","2ª Seção Bombeiros do 6º GB - 2ª SB/6º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "7º GB CARPINA": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DO","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção Bombeiros 7º GB - 1ª SB/7º GB","2ª Seção Bombeiros 7º GB - 2ª SB/7º GB","3ª Seção Bombeiros 7º GB - 3ª SB/7º GB","4ª Seção Bombeiros 7º GB - 4ª SB/7º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "CAT/ZM": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Serviços Técnicos - DSTec","1ª Seção de Atividades Técnicas - 1ª SATec","2ª Seção de Atividades Técnicas - 2ª SATec","3ª Seção de Atividades Técnicas - 3ª SATec","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "CAT/AG": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Serviços Técnicos - DSTec","1ª Seção de Atividades Técnicas - 1ª SATec","2ª Seção de Atividades Técnicas - 2ª SATec","3ª Seção de Atividades Técnicas - 3ª SATec","4ª Seção de Atividades Técnicas - 4ª SATec","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "DINTER II": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento de Operações - DPO","Seção de Planejamento e Articulação Operacional - SPAO","Seção de Auditoria e Monitoramento Operacional - SAM","Seção de Estatística Operacional - SEO","Divisão de Resposta Operacional - DRD","Seção de Articulação com a Defesa Civil - SADC"],

    "3º GB SERRA TALHADA": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DO","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção Bombeiros 3º GB - 1ª SB/3º GB","2ª Seção Bombeiros 3º GB - 2ª SB/3º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "4º GB PETROLINA": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DO","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção Bombeiros 4º GB - 1ª SB/4º GB","2ª Seção Bombeiros 4º GB - 2ª SB/4º GB","3ª Seção Bombeiros 4º GB - 3ª SB/4º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "5º GB SALGUEIRO": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DO","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção Bombeiros 5º GB - 1ª SB/5º GB","2ª Seção Bombeiros 5º GB - 2ª SB/5º GB","3ª Seção Bombeiros 5º GB - 3ª SB/5º GB","4ª Seção Bombeiros 5º GB - 4ª SB/5º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "9º GB ARCOVERDE": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Operações - DO","Seção de Instrução e Coordenação Técnica - SICT","Seção de Estatística Operacional - SEO","1ª Seção Bombeiros 9º GB - 1ª SB/9º GB","2ª Seção Bombeiros 9º GB - 2ª SB/9º GB","3ª Seção Bombeiros 9º GB - 3ª SB/9º GB","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "CAT/SE": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento e Serviços Técnicos","1ª Seção de Atividades Técnicas - 1ª SATec","2ª Seção de Atividades Técnicas - 2ª SATec","3ª Seção de Atividades Técnicas - 3ª SATec","4ª Seção de Atividades Técnicas - 4ª SATec","5ª Seção de Atividades Técnicas - 4ª SATec","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Material Operacional - SMO"],

    "DIESP": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Secretaria da Comissão Interna de Atividades Técnicas - SCIATec","Divisão de Planejamento de Operações - DPO","Seção de Planejamento e Articulação Operacional - SPAO","Seção de Auditoria e Monitoramento - SAM","Seção de Estatística Operacional - SEO","Divisão de Normatização e Doutrina - DND","Divisão de Atendimento ao Público - DAP","Seçao de Isenção e Restituição - SIR","Divisão de Projetos Contra Incêndio e Pânico - DPCIP","Seção de Apoio"],

    "DAS": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Programas Sociais - DPS","Seção de Orientação e Encaminhamento - SOE","Seção de Serviços Assistênciais - SSA","Seção de Administração da Casa de Trânsito - SACT","Seção de Projetos, Parcerias e Convênios","Divisão Administrativa","Seção de Pessoal","Seção de Tesouraria","Seção de Almoxarifado","Seção de Transportes, Serviços Gerais e Telemática"],

    "DGP": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Ativos - DA","Seção de Planejamento e Desenvolvimento - SPD","Divisão de Direitos - DDIr","Seção de Legislação e Requerimento - SLR","Seção de Identificação - SI","Divisão de Movimentação e Controle de Pessoal - DMCP","Seção de Movimentação - SM","Seção de Cadastro - SCad","Seção de Controle de Pessoal - SCP","Divisão de Normatização e Programas - DNP"],

    "CPPA": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Seção de Pagamento de Pessoal - SPP","Seção de Contribuições Sociais - SCS","Seção de Controle de Funções - SCF"],

    "DJD": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Divisão de Planejamento de Justiça e Disciplina - DPJD","Divisão de Justiça e Disciplina - Div. JD","Seção de Polícia Judiciária Militar - SPJM"],

    "DVP": ["Diretoria","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Seção de Protocolo - SP","Seção de Arquivo dos Veteranos - SAV","Divisão de Transferência para Reserva e Reformas - DTRR","Divisão de Inativos - DI","Seção de Justiça e Disciplina - SJD","Seção de Saúde - SS","Seção de Armamento e Renovação de Documentos - SARD","Divisão de Direitos","Seção de Benefícios - SB","Seção de Certificações - SC"],

    "DTIC": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Projetos - DP","Seção de Sistemas","Seção de Treinamento","Divisão de Coordenação Tecnica - DCT","Seção de Redes Convergentes - SRC","Seção de Suporte - SS","Seção de Manutenção - SM","Seção de Telemática - ST"],

    "DPLAG": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento e Gestão Estratégica - DPGE","Divisão Projetos e Captação de Recursos - DPCR","Seção de Projetos e Captação de Recursos - SPCR","Divisão de Convênios e Acordo de Cooperação - DCAC","Seção de Convênios - SConv","Divisão de Tributação e Orçamento - DTO","Seção de Tributação - ST","Seção de Orçamento - SO"],

    "DLOG": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento Logístico - DPL","Seção de Planejamento - SPlan","Seção de Desenvolvimento e Normatização - SDN","Divisão de Gestão de Contratos - DGC","Seção de Controle de Contratos Administrativos - SCCA","Seção de Análise de Despesas Correntes - SADC","Divisão de Gestão de Patrimônio - DGPat","Seção de Bens Móveis e Imóveis - SBMI","Seção de Armamento e Munição - SAM","Divisão de Gestão de Transporte e Combustível - DGTC","Seção de Controle de Viaturas e Condutores - SCVC","Seção de Controle de Abastecimento de Combustíveis - SCAC","Divisão de Controle de Inquéritos Administrativos e Logísticos - DCIAL","Seção de Inquéritos Técnicos - SIT","Seção de Inquéritos Adminstrativos - SIA","Divisão de Compras e Serviços - DCS","Seção de Especificação Técnica - SET","Seção de Elaboração de Termo de Referência e Contratos - SETRC","Seção de Licitação - SL"],

    "CMAN": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Gestão de Manutenção - DGM","Seção de Manutenção de Viaturas e Embarcações - SMVE","Seção de Manutenção de Materiais - SMM","Seção de Manutenção de Armamento - SMA","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Almoxarifado - Almox","Seção de Transporte, Serviços Gerais e Telemática - STSGT"],

    "CINT": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Gestão de Suprimentos - DGS","Seção de Controle de Estoque e Armazenagem - SCEA","Seção de Recebimento de Bens - SRB","Seção de Recebimento de Serviços - SRS","Seção de Transporte e Distribuição de Bens - STDB","Seção de Segurança, Serviços Gerais e Telemática - SSSGT"],

    "CEAO": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Projetos - DP","Seção de Engenharia e Arquitetura - SEA","Seção de Obras e Serviços","Divisão Administrativa - DA","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Almoxarifado - Almox","Seção de Compras e Serviços"],

    "DF": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Planejamento e Administração Financeira e Orçamentária","Seção de Gestão de Despesa","Divisão de Prestação de Contas","Divisão de Tesouraria Geral","Divisão de Controle Orçamentário e Financeiro"],

    "DEIP": ["Diretoria","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Ensino e Pesquisa - DEP","Seção de Especialização e Educação Continuada - SEEC","Seção de Formação e Habilitação - SFH","Seção de Pesquisa e Doutrina - SPD","Divisão de Admissão, Credenciamento e Fiscalização - DACF","Seção de Recrutamento e Admissão - SRA","Seção de Cadastramento e Fiscalização - SCF"],

    "ABMG": ["Comando","Subcomando","Secretaria e Apoio do Comando - SAC","Núcleo de Assistência Social - NAS","Núcleo de Educação Física e Desportos - NEFD","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Divisão de Ensino - DE","Seção de Formação de Oficiais - SFO","Seção de Formação de Praças - SFP","Seção de Especialização - SEsp","Corpo de Alunos Oficiais","Seção de Alunos Oficiais","Corpo de Alunos Praças","Seção de Alunos Praças","Divisão Administrativa","Seção de Pessoal - SP","Seção de Tesouraria - ST","Seção de Transporte, Serviços Gerais e Telemática - STSGT","Seção de Almoxarifado - Almox","Seção de Oficinas de Treinamento"],

    "CEFD": ["Chefia","Secretaria e Apoio Administrativo - SAAdm","Núcleo de Assistência Social - NAS","Núcleo de Comunicação Social - NCS","Núcleo de Justiça e Disciplina - NJD","Seção de Treinamento Físico","Seção de Avaliação e Pesquisa"]

  };



  for (var chave in ORG_DATA) {

    var chaveUpper = chave.toUpperCase();

    if (chaveUpper === omeTrim || omeTrim.indexOf(chaveUpper) !== -1 || chaveUpper.indexOf(omeTrim) !== -1) {

      return ORG_DATA[chave];

    }

  }



  return [];

}



function salvarNovaOrdemLocais(idsOrdenados) {

  try {

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);

    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);

    if (!sheet) throw new Error("Aba não encontrada");



    var dados = sheet.getDataRange().getValues();

    var cabecalho = dados[0];

    var mapaLinhas = {};



    for (var i = 1; i < dados.length; i++) {

      var id = String(dados[i][0]).trim();

      if (id) {

        mapaLinhas[id] = dados[i];

      }

    }



    var novasLinhas = [cabecalho];

    for (var j = 0; j < idsOrdenados.length; j++) {

      var idOrd = String(idsOrdenados[j]).trim();

      if (mapaLinhas[idOrd]) {

        novasLinhas.push(mapaLinhas[idOrd]);

        delete mapaLinhas[idOrd];

      }

    }



    for (var restoId in mapaLinhas) {

      novasLinhas.push(mapaLinhas[restoId]);

    }



    sheet.clearContents();

    sheet.getRange(1, 1, novasLinhas.length, novasLinhas[0].length).setValues(novasLinhas);

    try {
      registrarLogAuditoria("REORDENACAO_LOCAIS", "Reordenou estrutura de " + idsOrdenados.length + " locais na árvore.");
    } catch(eLogOrd) {}

    return "Ordem atualizada com sucesso!";

  } catch (err) {

    throw new Error("Erro ao salvar ordem: " + err.message);

  }

}



function getListaOmesOficiais() {

  return [

    "1º GB Vitoria Stº Antão", 

    "2º GB Caruaru", 

    "3º GB Serra Talhada", 

    "4º GB Petrolina", 

    "5º GB Salgueiro", 

    "6º GB Garanhuns", 

    "7º GB Carpina", 

    "9º GB Arcoverde", 

    "ABMG", "AECI", "AjG", "CAT/AG", "CAT/RMR", "CAT/SE", "CAT/ZM", 

    "CCS", "CEAO", "CEFD", "CI", "CINT", "CMAN", "CPO", "CPPA", "CPP", 

    "DEIP", "DF", "DGO", "DIESP", "DIM", "DINTER I", "DINTER II", 

    "DJD", "DLOG", "DGP", "DPLAG", "DTIC", "DVP", "GBAPH", "GBI", 

    "GBMAR", "GBS", "GCG", "GSG"

  ];

}



// Lista o estoque disponível no CINT agrupado por Processo SEI para a visão do DPL/Admin

function getEstoqueDisponivelCintPorSei() {

  try {

    var sql = "SELECT SEI_COMPRA_RECEBIMENTO, OBJETO, COUNT(*) as qtd, STRING_AGG(ITEM, ',') as ids_str " +

              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +

              "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +

              "GROUP BY SEI_COMPRA_RECEBIMENTO, OBJETO " +

              "ORDER BY SEI_COMPRA_RECEBIMENTO DESC, OBJETO ASC";



    var queryResults = executarConsultaBigQuerySegura(sql);

    var rows = queryResults.rows || [];

    var estoqueCint = [];



    rows.forEach(function(r) {

      var sei = String(r.f[0].v || "Sem SEI").trim();

      var objeto = String(r.f[1].v || "").trim();

      var qtd = parseInt(r.f[2].v || 0);

      var ids = String(r.f[3].v || "").trim();



      if (objeto && qtd > 0) {

        estoqueCint.push({

          sei: sei,

          material: objeto,

          quantidade: qtd,

          idsString: ids

        });

      }

    });



    return estoqueCint;

  } catch (err) {

    console.error("Erro em getEstoqueDisponivelCintPorSei: " + err.message);

    return [];
  }
}

// Configuração oficial de viaturas CBMPE no backend
var CONFIG_VIATURAS_CBMPE_BACKEND = [
  { regex: /^AUTO\s+SALVAMENTO\s+PESADO\s+ESPECIAL(?:\s*\([^)]*\))?(?:\s*-\s*ABS\s+COM\s+MUNK\s+E\s+GUICHO)?/i, sigla: 'ASE', base: 'AUTO SALVAMENTO PESADO ESPECIAL', sufixo: ' - ABS COM MUNK E GUICHO' },
  { regex: /^AUTO\s+BOMBA\s+TANQUE\s+SALVAMENTO(?:\s*\([^)]*\))?\s*-\s*TIPO\s+1/i, sigla: 'ABTS', base: 'AUTO BOMBA TANQUE SALVAMENTO', sufixo: ' - TIPO 1' },
  { regex: /^AUTO\s+BOMBA\s+TANQUE\s+SALVAMENTO(?:\s*\([^)]*\))?\s*-\s*TIPO\s+2/i, sigla: 'ABTS', base: 'AUTO BOMBA TANQUE SALVAMENTO', sufixo: ' - TIPO 2' },
  { regex: /^AUTO\s+BUSCA\s+E\s+SALVAMENTO\s+LEVE(?:\s*\([^)]*\))?/i, sigla: 'ABSL', base: 'AUTO BUSCA E SALVAMENTO LEVE', sufixo: '' },
  { regex: /^AUTO\s+BUSCA\s+SALVAMENTO\s+M[EÉ]DIO(?:\s*\([^)]*\))?/i, sigla: 'ABSM', base: 'AUTO BUSCA SALVAMENTO MÉDIO', sufixo: '' },
  { regex: /^AUTO\s+BUSCA\s+E\s+SALVAMENTO\s+PARA\s+C[AÃ]ES(?:\s*\([^)]*\))?/i, sigla: 'ABSC', base: 'AUTO BUSCA E SALVAMENTO PARA CÃES', sufixo: '' },
  { regex: /^AUTO\s+BOMBA\s+TANQUE\s+FLORESTAL(?:\s*\([^)]*\))?/i, sigla: 'ABTF', base: 'AUTO BOMBA TANQUE FLORESTAL', sufixo: '' },
  { regex: /^AUTO\s+ESCADA\s+MULTIMISS[AÃ]O(?:\s*\([^)]*\))?/i, sigla: 'AEM', base: 'AUTO ESCADA MULTIMISSÃO', sufixo: '' },
  { regex: /^AUTO\s+ESCADA(?:\s*\([^)]*\))?/i, sigla: 'AE', base: 'AUTO ESCADA', sufixo: '' },
  { regex: /^AUTO\s+RESGATE(?:\s*\([^)]*\))?/i, sigla: 'AR', base: 'AUTO RESGATE', sufixo: '' },
  { regex: /^AUTO\s+TANQUE(?:\s*\([^)]*\))?/i, sigla: 'AT', base: 'AUTO TANQUE', sufixo: '' },
  { regex: /^BOTE\s+INFL[AÁ]VEL\s+DE\s+SALVAMENTO(?:\s*\([^)]*\))?/i, sigla: 'BIS', base: 'BOTE INFLÁVEL DE SALVAMENTO', sufixo: '' },
  { regex: /^MOTO\s+SALVAMENTO\s+AQU[AÁ]TICA(?:\s*\([^)]*\))?/i, sigla: 'MSA', base: 'MOTO SALVAMENTO AQUÁTICA', sufixo: '' },
  { regex: /^MOTORRESGATE(?:\s*\([^)]*\))?/i, sigla: 'MR', base: 'MOTORRESGATE', sufixo: '' }
];

function ehViaturaMaterialBackend_(nome) {
  if (!nome) return false;
  var n = String(nome).trim();
  for (var i = 0; i < CONFIG_VIATURAS_CBMPE_BACKEND.length; i++) {
    if (CONFIG_VIATURAS_CBMPE_BACKEND[i].regex.test(n)) return true;
  }
  return false;
}

function formatarDescricaoViaturaBackend_(objeto, nSerie) {
  if (!objeto) return '';
  var objTrim = String(objeto).trim();
  var serieTrim = (nSerie !== undefined && nSerie !== null && String(nSerie).trim() !== '-' && String(nSerie).trim() !== 'null') ? String(nSerie).trim() : '';

  for (var i = 0; i < CONFIG_VIATURAS_CBMPE_BACKEND.length; i++) {
    var cfg = CONFIG_VIATURAS_CBMPE_BACKEND[i];
    if (cfg.regex.test(objTrim)) {
      if (serieTrim) {
        return cfg.base + ' (' + cfg.sigla + ' - ' + serieTrim + ')' + cfg.sufixo;
      } else {
        return cfg.base + ' (' + cfg.sigla + ')' + cfg.sufixo;
      }
    }
  }
  if (serieTrim) {
    return objTrim + ' (Série: ' + serieTrim + ')';
  }
  return objTrim;
}

/**
 * Busca os itens individuais físicos livres no estoque da SEDE do CINT com número de série e patrimônio.
 * Utilizado pelo modal do Ticket DPL para permitir o apontamento de viaturas por número de série.
 */
function getItensDisponiveisCintParaDespacho(processoSei, material) {
  try {
    function limparSQL_(t) { return String(t || '').replace(/'/g, "\\'"); }
    var materialClean = limparSQL_(material);
    var seiPuro = String(processoSei || "").trim();
    if (seiPuro.indexOf("SEI:") !== -1) {
      seiPuro = seiPuro.split("SEI:")[1].split("|")[0].trim();
    } else if (seiPuro.indexOf("|") !== -1) {
      seiPuro = seiPuro.split("|")[0].trim();
    }

    // 1. Mapeia itens já comprometidos em outras remessas pendentes
    var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ssAux.getSheetByName("RemessasPendentes");
    var idsComprometidos = {};
    if (sheetRemessa && sheetRemessa.getLastRow() > 1) {
      var dadosRem = sheetRemessa.getDataRange().getValues();
      var stPend = ["AGUARDANDO", "PENDENTE", "AGUARDANDO_RECEBIMENTO", "AGUARDANDO_LIBERACAO_CINT"];
      for (var r = 1; r < dadosRem.length; r++) {
        var st = String(dadosRem[r][5] || "").trim().toUpperCase();
        if (stPend.indexOf(st) !== -1) {
          var refK = String(dadosRem[r][10] || "").trim();
          var mIds = refK.match(/(?:IDS_TRANSF|IDS_TICKET):(.*?)\s*\|/);
          if (mIds) {
            try {
              var arr = JSON.parse(mIds[1]);
              if (Array.isArray(arr)) arr.forEach(function(c) { idsComprometidos[String(c).trim()] = true; });
            } catch(e) {}
          }
        }
      }
    }

    var colSerie = obterColunaSerieInventario_();
    var selectSerie = colSerie ? (", COALESCE(`" + colSerie + "`, '')") : ", CAST('' AS STRING)";

    var condicaoObjeto = "UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "'))";
    if (ehViaturaMaterialBackend_(material)) {
      for (var v = 0; v < CONFIG_VIATURAS_CBMPE_BACKEND.length; v++) {
        if (CONFIG_VIATURAS_CBMPE_BACKEND[v].regex.test(material)) {
          condicaoObjeto = "(UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "')) OR UPPER(TRIM(OBJETO)) LIKE UPPER('%" + limparSQL_(CONFIG_VIATURAS_CBMPE_BACKEND[v].base) + "%'))";
          break;
        }
      }
    }

    var sql = "SELECT ITEM, OBJETO, COALESCE(N_PATRIMONIO, ''), COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, '') " + selectSerie + " " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
              "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
              "AND " + condicaoObjeto + " " +
              "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) IN ('ECD', 'SCD', 'DISPONIVEL')) " +
              "AND UPPER(TRIM(STATUS)) != 'EXTRAVIADO' ";

    if (seiPuro && seiPuro !== "N/I") {
      sql += "AND UPPER(TRIM(SEI_COMPRA_RECEBIMENTO)) LIKE UPPER('%" + limparSQL_(seiPuro) + "%') ";
    }
    sql += "ORDER BY ITEM ASC";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = (res && res.rows) ? res.rows : [];

    // Fallback sem filtro estrito de SEI caso não traga linhas
    if (rows.length === 0 && seiPuro && seiPuro !== "N/I") {
      var sqlFb = "SELECT ITEM, OBJETO, COALESCE(N_PATRIMONIO, ''), COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, '') " + selectSerie + " " +
                  "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                  "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                  "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                  "AND " + condicaoObjeto + " " +
                  "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) IN ('ECD', 'SCD', 'DISPONIVEL')) " +
                  "AND UPPER(TRIM(STATUS)) != 'EXTRAVIADO' " +
                  "ORDER BY ITEM ASC";
      var resFb = executarConsultaBigQuerySegura(sqlFb);
      rows = (resFb && resFb.rows) ? resFb.rows : [];
    }

    var listaItens = [];
    rows.forEach(function(r) {
      var itemCode = String(r.f[0].v || "").trim();
      if (!itemCode || idsComprometidos[itemCode]) return;

      var obj = String(r.f[1].v || "").trim();
      var pat = String(r.f[2].v || "").trim();
      var obs = String(r.f[3].v || "").trim();
      var serie = String(r.f[4].v || "").trim();

      // Fallback para extrair série da observação
      if (!serie && obs) {
        var mObs = obs.match(/(?:Nº\s*de\s*S[eé]rie|S[eé]rie)[:\s]+([^|\n,;)]+)/i);
        if (mObs) serie = mObs[1].trim();
      }

      listaItens.push({
        item: itemCode,
        objeto: obj,
        patrimonio: (pat && pat !== "-") ? pat : "",
        serie: (serie && serie !== "-") ? serie : ""
      });
    });

    return listaItens;
  } catch (err) {
    console.error("Erro em getItensDisponiveisCintParaDespacho: " + err.message);
    return [];
  }
}

// Gera o ticket corporativo de distribuição a partir do estoque do CINT
function gerarTicketDistribuicaoDpl(dadosTicket) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var cpfInformado = String(dadosTicket.cpfDespachante || "").trim().replace(/\D/g, "");
    var material = String(dadosTicket.material || "").trim();
    var processoSei = String(dadosTicket.processoSei || "").trim();
    var numeroBge = String(dadosTicket.numeroBge || "").trim();
    var notaDist = String(dadosTicket.notaDistribuicao || "").trim();

    // Extrai lista de distribuições (seja em lote fracionado ou individual)
    var listaEnvios = [];
    if (dadosTicket.distribuicoes && Array.isArray(dadosTicket.distribuicoes) && dadosTicket.distribuicoes.length > 0) {
      for (var d = 0; d < dadosTicket.distribuicoes.length; d++) {
        var it = dadosTicket.distribuicoes[d];
        var omeItem = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(it.ome || it.omeDestino || "") : String(it.ome || it.omeDestino || "").trim();
        var qtdItem = parseInt(it.quantidade, 10) || 0;
        if (omeItem && qtdItem > 0) {
          listaEnvios.push({ 
            ome: omeItem, 
            quantidade: qtdItem,
            itensIds: it.itensIds || [],
            series: it.series || [],
            patrimonios: it.patrimonios || []
          });
        }
      }
    } else {
      var omeSimples = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dadosTicket.omeDestino || "") : String(dadosTicket.omeDestino || "").trim();
      var qtdSimples = parseInt(dadosTicket.quantidade, 10) || 0;
      if (omeSimples && qtdSimples > 0) {
        listaEnvios.push({ 
          ome: omeSimples, 
          quantidade: qtdSimples,
          itensIds: dadosTicket.itensIds || [],
          series: dadosTicket.series || [],
          patrimonios: dadosTicket.patrimonios || []
        });
      }
    }

    if (!cpfInformado || !material || listaEnvios.length === 0) {
      throw new Error("Preencha todos os dados obrigatórios para gerar o ticket de distribuição.");
    }

    var qtdTotalGeral = 0;
    for (var q = 0; q < listaEnvios.length; q++) {
      qtdTotalGeral += listaEnvios[q].quantidade;
    }

    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxNome = cabecalho.indexOf("Nome");
    var idxPerfil = cabecalho.indexOf("Perfil");
    var idxOme = cabecalho.indexOf("OME");

    var despachanteValido = null;
    var remetenteOme = "CINT";

    for (var i = 1; i < dadosUsers.length; i++) {
      if (String(dadosUsers[i][idxCpf] || "").trim() === cpfInformado) {
        despachanteValido = {
          nome: String(dadosUsers[i][idxNome] || "DPL/Admin").trim(),
          perfil: String(dadosUsers[i][idxPerfil] || "").trim()
        };
        if (idxOme !== -1 && dadosUsers[i][idxOme]) {
          remetenteOme = String(dadosUsers[i][idxOme]).trim();
        }
        break;
      }
    }

    if (!despachanteValido) throw new Error("CPF do despachante não encontrado na base de dados.");

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ss.getSheetByName("RemessasPendentes");
    
    if (!sheetRemessa) {
      sheetRemessa = ss.insertSheet("RemessasPendentes");
      sheetRemessa.appendRow(["ID_Remessa", "Data", "OME_Destino", "Material", "Quantidade", "Status", "Admin_Envio", "Assinatura", "Recebedor_Nome", "Recebedor_CPF", "SEI"]);
    }

    // 1. MAPEIA TODOS OS ITENS QUE JÁ ESTÃO EM REMESSAS ABERTAS/PENDENTES
    var idsComprometidosRemessas = {};
    if (sheetRemessa.getLastRow() > 1) {
      var dadosRemessasTotais = sheetRemessa.getDataRange().getValues();
      var statusPendentes = ["AGUARDANDO", "PENDENTE", "AGUARDANDO_RECEBIMENTO", "AGUARDANDO_LIBERACAO_CINT"];
      for (var r = 1; r < dadosRemessasTotais.length; r++) {
        var stRem = String(dadosRemessasTotais[r][5] || "").trim().toUpperCase();
        if (statusPendentes.indexOf(stRem) !== -1) {
          var refColK = String(dadosRemessasTotais[r][10] || "").trim();
          var matchIds = refColK.match(/(?:IDS_TRANSF|IDS_TICKET):(.*?)\s*\|/);
          if (matchIds) {
            try {
              var parseIds = JSON.parse(matchIds[1]);
              if (Array.isArray(parseIds)) {
                parseIds.forEach(function(code) {
                  idsComprometidosRemessas[String(code).trim()] = true;
                });
              }
            } catch(e) {}
          } else if (refColK.indexOf("INTERNAL_TREE:") === 0) {
            try {
              var jsonTree = JSON.parse(refColK.replace("INTERNAL_TREE:", "").split(" | ")[0]);
              if (jsonTree.ids && Array.isArray(jsonTree.ids)) {
                jsonTree.ids.forEach(function(code) {
                  idsComprometidosRemessas[String(code).trim()] = true;
                });
              }
            } catch(e) {}
          }
        }
      }
    }

    // 2. BUSCA ITENS FÍSICOS DISPONÍVEIS NA SEDE DO CINT NO BIGQUERY
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var materialClean = limparSQL(material);
    var seiPuro = processoSei;
    if (seiPuro.indexOf("SEI:") !== -1) {
      seiPuro = seiPuro.split("SEI:")[1].split("|")[0].trim();
    } else if (seiPuro.indexOf("|") !== -1) {
      seiPuro = seiPuro.split("|")[0].trim();
    }

    var sqlBusca = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                   "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                   "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                   "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "')) " +
                   "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) IN ('ECD', 'SCD', 'DISPONIVEL')) " +
                   "AND UPPER(TRIM(STATUS)) != 'EXTRAVIADO' ";

    if (seiPuro && seiPuro !== "N/I") {
      sqlBusca += "AND UPPER(TRIM(SEI_COMPRA_RECEBIMENTO)) LIKE UPPER('%" + limparSQL(seiPuro) + "%') ";
    }
    sqlBusca += "ORDER BY ITEM ASC";

    var resBusca = executarConsultaBigQuerySegura(sqlBusca);
    var rowsBusca = (resBusca && resBusca.rows) ? resBusca.rows : [];

    var idsDisponiveis = [];
    rowsBusca.forEach(function(rw) {
      var itemCode = String(rw.f[0].v || "").trim();
      if (itemCode && !idsComprometidosRemessas[itemCode]) {
        idsDisponiveis.push(itemCode);
      }
    });

    // Fallback caso a busca com SEI traga menos itens que o total necessário
    if (idsDisponiveis.length < qtdTotalGeral) {
      var sqlBuscaFb = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                       "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                       "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                       "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "')) " +
                       "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) IN ('ECD', 'SCD', 'DISPONIVEL')) " +
                       "AND UPPER(TRIM(STATUS)) != 'EXTRAVIADO' " +
                       "ORDER BY ITEM ASC";
      var resBuscaFb = executarConsultaBigQuerySegura(sqlBuscaFb);
      var rowsBuscaFb = (resBuscaFb && resBuscaFb.rows) ? resBuscaFb.rows : [];
      idsDisponiveis = [];
      rowsBuscaFb.forEach(function(rw) {
        var itemCode = String(rw.f[0].v || "").trim();
        if (itemCode && !idsComprometidosRemessas[itemCode]) {
          idsDisponiveis.push(itemCode);
        }
      });
    }

    // Se foram especificados itensIds individuais (ex: seleção de viaturas por série), garante presença em idsDisponiveis
    var todosItensEspecificados = [];
    listaEnvios.forEach(function(env) {
      if (env.itensIds && Array.isArray(env.itensIds)) {
        todosItensEspecificados = todosItensEspecificados.concat(env.itensIds);
      }
    });
    if (todosItensEspecificados.length > 0) {
      todosItensEspecificados.forEach(function(code) {
        if (code && idsDisponiveis.indexOf(code) === -1) {
          idsDisponiveis.unshift(code);
        }
      });
    }

    if (idsDisponiveis.length < qtdTotalGeral) {
      throw new Error("Saldo insuficiente de itens livres no estoque CINT para " + material + ". Necessário: " + qtdTotalGeral + ", Disponível livre: " + idsDisponiveis.length + ".");
    }

    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");
    var textoSeiBge = processoSei;
    if (numeroBge) {
      textoSeiBge += " | BGE: " + numeroBge;
    }

    var baseTime = new Date().getTime();

    // 3. CRIA CADA TICKET COM SEUS ITENS INDIVIDUAIS ÚNICOS (SEM REPETIÇÃO)
    for (var k = 0; k < listaEnvios.length; k++) {
      var envio = listaEnvios[k];
      var idRemessa = "TICKET-CINT-" + (baseTime + k);
      var itensDesteTicket = [];

      if (envio.itensIds && Array.isArray(envio.itensIds) && envio.itensIds.length > 0) {
        itensDesteTicket = envio.itensIds;
        // Remove de idsDisponiveis para não haver duplicidade
        idsDisponiveis = idsDisponiveis.filter(function(id) {
          return itensDesteTicket.indexOf(id) === -1;
        });
      } else {
        itensDesteTicket = idsDisponiveis.splice(0, envio.quantidade);
      }

      // Marca esses itens como já comprometidos para iterações seguintes se houver
      itensDesteTicket.forEach(function(code) {
        idsComprometidosRemessas[code] = true;
      });

      var descMaterialEnvio = material;
      if (ehViaturaMaterialBackend_(material) && envio.series && envio.series.length > 0 && envio.series[0]) {
        descMaterialEnvio = formatarDescricaoViaturaBackend_(material, envio.series[0]);
      }

      var infoSerieExtra = "";
      if (envio.series && envio.series.length > 0 && envio.series[0]) {
        infoSerieExtra = " | Série: " + envio.series.join(", ");
      }
      var refCompletaTicket = "IDS_TICKET:" + JSON.stringify(itensDesteTicket) + infoSerieExtra + " | " + textoSeiBge;

      // Gravação estritamente alinhada às colunas A até K da planilha RemessasPendentes
      sheetRemessa.appendRow([
        idRemessa,               // Coluna A: ID_Remessa
        dataHora,                // Coluna B: Data
        envio.ome,               // Coluna C: OME_Destino
        descMaterialEnvio,       // Coluna D: Material
        envio.quantidade,        // Coluna E: Quantidade
        "AGUARDANDO",            // Coluna F: Status
        "CINT",                  // Coluna G: Admin_Envio / OME de Envio (Todo material de ticket sai do estoque CINT)
        cpfInformado,            // Coluna H: Assinatura
        "",                      // Coluna I: Recebedor_Nome
        "",                      // Coluna J: Recebedor_CPF
        refCompletaTicket        // Coluna K: SEI com IDs únicos vinculados
      ]);

      registrarLogAuditoria(
        "TICKET_DPL_GERADO", 
        "OME CINT (" + despachanteValido.nome + ") gerou ticket " + idRemessa + " (" + envio.quantidade + "x " + descMaterialEnvio + ") para " + envio.ome + " [Itens: " + itensDesteTicket.join(", ") + "]"
      );

      // Registra histórico de movimentação para cada item despachado no ticket
      try {
        var eventosTicket = [];
        for (var idxT = 0; idxT < itensDesteTicket.length; idxT++) {
          var serieDoItem = (envio.series && envio.series[idxT]) ? envio.series[idxT] : "";
          var patDoItem = (envio.patrimonios && envio.patrimonios[idxT]) ? envio.patrimonios[idxT] : "";
          var descItem = descMaterialEnvio;
          if (ehViaturaMaterialBackend_(material) && serieDoItem) {
            descItem = formatarDescricaoViaturaBackend_(material, serieDoItem);
          }
          eventosTicket.push({
            item: itensDesteTicket[idxT],
            objeto: descItem,
            nPatrimonio: patDoItem,
            tipoEvento: "DESPACHO_DISTRIBUICAO",
            origemUnidade: "CINT",
            origemLocal: "SEDE",
            destinoUnidade: envio.ome,
            destinoLocal: "SEDE",
            statusAnterior: "ECD",
            statusNovo: "AGUARDANDO_RECEBIMENTO",
            responsavelNome: despachanteValido.nome,
            responsavelCpf: cpfInformado,
            documentoRef: idRemessa + " (" + textoSeiBge + ")",
            observacao: "Despachado via ticket de distribuição DPL para a OME " + envio.ome + (serieDoItem ? " (Série: " + serieDoItem + ")" : "")
          });
        }
        registrarHistoricoMovimentacao(eventosTicket);
      } catch (eHDesp) {
        console.warn("Aviso ao gravar histórico de distribuição ticket: " + eHDesp.message);
      }
    }

    // Sincronização automática com a aba #DIST na DLOG cruzando estritamente SEI e Material
    var resSyncDist = { sucesso: false };
    try {
      var numControleTicket = obterNumeroControlePlan(processoSei, material);
      dadosTicket.distribuicoes = listaEnvios;
      resSyncDist = sincronizarDistribuicaoOmeDist(dadosTicket, numControleTicket);
    } catch (errDist) {
      console.error("Aviso: Falha na sincronização com #DIST no Despacho DPL: " + errDist.message);
      resSyncDist = { sucesso: false, erro: errDist.message };
    }

    return { 
      sucesso: true, 
      mensagem: "Distribuição registrada com sucesso! " + listaEnvios.length + " remessa(s) gerada(s), total de " + qtdTotalGeral + " un.",
      syncDist: resSyncDist
    };
  } catch (err) {
    throw new Error("Erro ao gerar ticket de distribuição: " + err.message);
  } finally {
    try {
      lock.releaseLock();
    } catch(eLock) {}
  }
}



// Registra o ticket informando que o material está livre para distribuição pela DPL

function registrarTicketLiberacaoDpl(dadosRecebimento) {

  try {

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);

    var sheetTickets = ss.getSheetByName("TicketsLiberacaoDpl");

    

    if (!sheetTickets) {

      sheetTickets = ss.insertSheet("TicketsLiberacaoDpl");

      sheetTickets.appendRow(["ID_Ticket", "Data_Liberacao", "Processo_SEI", "Material", "Quantidade", "Fornecedor", "Status", "Liberado_Por"]);

    }



    var idTicket = "TICK-LIB-" + new Date().getTime();

    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");

    var emailUser = "";

    try { emailUser = Session.getActiveUser().getEmail(); } catch (e) {}



    sheetTickets.appendRow([

      idTicket,

      dataHora,

      String(dadosRecebimento.numeroProcesso || "").trim(),

      String(dadosRecebimento.material || "").trim(),

      parseInt(dadosRecebimento.quantidadeRecebida) || 0,

      String(dadosRecebimento.fornecedor || "").trim(),

      "LIVRE_PARA_DISTRIBUICAO",

      emailUser

    ]);



    registrarLogAuditoria("TICKET_LIBERACAO_DPL", "Gerado aviso de liberação para DPL do processo " + dadosRecebimento.numeroProcesso + " (" + dadosRecebimento.material + ")");

    return { sucesso: true };

  } catch (err) {

    console.error("Erro ao registrar ticket de liberação DPL: " + err.message);

  }

}



// Retorna a lista de tickets liberados para a DLOG / DPL visualizarem na Visão Geral

// Retorna os lotes cadastrados na Subunidade SEDE da OME CINT agrupados por SEI e lote para a Visão Geral

function getTicketsLiberacaoDpl() {

  try {

    // Agrupa os itens do CINT que estão na SEDE por Processo SEI, Material e Timestamp/Data de cadastro

    var sql = "SELECT SEI_COMPRA_RECEBIMENTO, OBJETO, COUNT(*) as qtd " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
              "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
              "AND IFNULL(STATUS, '') != 'EXTRAVIADO' " +
              "AND SEI_COMPRA_RECEBIMENTO IS NOT NULL AND TRIM(SEI_COMPRA_RECEBIMENTO) != '' " +
              "GROUP BY SEI_COMPRA_RECEBIMENTO, OBJETO " +
              "ORDER BY SEI_COMPRA_RECEBIMENTO DESC, OBJETO ASC";

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];
    var tickets = [];

    rows.forEach(function(r) {
      var sei = String(r.f[0].v || "").trim();
      var material = String(r.f[1].v || "").trim();
      var quantidade = parseInt(r.f[2].v || 0);

      if (material && quantidade > 0) {
        tickets.push({
          id: "LOTE-" + sei + "-" + material,
          data: Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss"), // Data estimada do lote
          sei: sei,
          material: material,
          quantidade: quantidade,
          fornecedor: "Recebimento CINT",
          status: "LIVRE_PARA_DISTRIBUICAO"
        });
      }
    });

    return tickets;
  } catch (err) {
    console.error("Erro em getTicketsLiberacaoDpl: " + err.message);
    return [];
  }
}

function getTicketsLiberacaoDplFiltrados(filtroSei, filtroMaterial) {
  try {
    function limpaSQL(t) { return String(t || '').trim().replace(/'/g, "\\'"); }

    var sqlCint = "SELECT SEI_COMPRA_RECEBIMENTO, OBJETO, COUNT(*) as qtd " +
                  "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                  "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                  "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                  "AND IFNULL(STATUS, '') != 'EXTRAVIADO' " +
                  "AND SEI_COMPRA_RECEBIMENTO IS NOT NULL AND TRIM(SEI_COMPRA_RECEBIMENTO) != '' ";

    if (filtroSei && filtroSei.trim() !== "") {
      sqlCint += " AND UPPER(TRIM(SEI_COMPRA_RECEBIMENTO)) LIKE UPPER('%" + limpaSQL(filtroSei) + "%')";
    }
    if (filtroMaterial && filtroMaterial.trim() !== "") {
      sqlCint += " AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + limpaSQL(filtroMaterial) + "'))";
    }

    sqlCint += " GROUP BY SEI_COMPRA_RECEBIMENTO, OBJETO ORDER BY SEI_COMPRA_RECEBIMENTO DESC, OBJETO ASC";

    var resCint = executarConsultaBigQuerySegura(sqlCint);
    var rowsCint = resCint.rows || [];

    // Busca na planilha auxiliar de RemessasPendentes o que já foi despachado e ainda não foi confirmado/recusado
    var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ssAux.getSheetByName("RemessasPendentes");
    var dadosRemessas = (sheetRemessa && sheetRemessa.getLastRow() > 1) ? sheetRemessa.getDataRange().getValues() : [];
    
    // Mapeia o quantitativo já comprometido por (SEI + Material) com chave normalizada
    var mapaComprometido = {};
    for (var i = 1; i < dadosRemessas.length; i++) {
      var statusRem = String(dadosRemessas[i][5] || "").trim().toUpperCase();
      
      if (statusRem === "AGUARDANDO" || statusRem === "PENDENTE" || statusRem === "AGUARDANDO_RECEBIMENTO" || statusRem === "AGUARDANDO_LIBERACAO_CINT") {
        var matRem = String(dadosRemessas[i][3] || "").trim().toUpperCase();
        var qtdRem = parseInt(dadosRemessas[i][4], 10) || 0;
        var textoColunaK = String(dadosRemessas[i][10] || "").trim().toUpperCase(); 
        
        var seiExtraido = textoColunaK;
        if (textoColunaK.indexOf("SEI:") !== -1) {
          var partesSei = textoColunaK.split("SEI:")[1].split("|")[0];
          seiExtraido = partesSei.trim();
        } else if (textoColunaK.indexOf("|") !== -1) {
          seiExtraido = textoColunaK.split("|")[0].trim();
        }

        var cleanSei = seiExtraido.replace(/[^A-Z0-9]/g, '');
        var cleanMat = matRem.replace(/\s+/g, ' ');
        var chaveMap = cleanSei + "_" + cleanMat;
        mapaComprometido[chaveMap] = (mapaComprometido[chaveMap] || 0) + qtdRem;
      }
    }

    var tickets = [];

    rowsCint.forEach(function(r) {
      var sei = String(r.f[0].v || "").trim();
      var material = String(r.f[1].v || "").trim();
      var quantidadeTotalFisica = parseInt(r.f[2].v || 0);

      var cleanSeiAlvo = sei.toUpperCase().replace(/[^A-Z0-9]/g, '');
      var cleanMatAlvo = material.toUpperCase().replace(/\s+/g, ' ');
      var chaveAlvo = cleanSeiAlvo + "_" + cleanMatAlvo;

      var quantidadeComprometida = mapaComprometido[chaveAlvo] || 0;

      if (!quantidadeComprometida && cleanMatAlvo) {
        for (var k in mapaComprometido) {
          if (k.indexOf(cleanMatAlvo) !== -1 && (!cleanSeiAlvo || k.indexOf(cleanSeiAlvo) !== -1)) {
            quantidadeComprometida += mapaComprometido[k];
          }
        }
      }

      var quantidadeLivre = quantidadeTotalFisica - quantidadeComprometida;
      if (quantidadeLivre < 0) quantidadeLivre = 0; 

      if (material && quantidadeTotalFisica > 0) {
        tickets.push({
          id: "LOTE-" + sei + "-" + material,
          data: Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss"),
          sei: sei,
          material: material,
          quantidadeTotal: quantidadeTotalFisica,
          quantidadeLivre: quantidadeLivre,
          quantidadePendente: quantidadeComprometida,
          fornecedor: "Recebimento CINT",
          status: quantidadeLivre > 0 ? "LIVRE_PARA_DISTRIBUICAO" : "TOTALMENTE_EM_TRANSITO"
        });
      }
    });

    return tickets;
  } catch (err) {
    console.error("Erro em getTicketsLiberacaoDplFiltrados: " + err.message);
    return [];
  }
}







// Retorna a lista exclusiva de materiais cadastrados no estoque de uma OME

function getMateriaisDaOme(ome) {
  try {
    var omePadrao = obterOmePadronizada(ome);
    if (!omePadrao) return [];

    var inSqlOme = (typeof obterVariacoesOmeParaSql_ === 'function') 
      ? obterVariacoesOmeParaSql_(omePadrao) 
      : ("'" + omePadrao.toUpperCase().replace(/'/g, "\\'") + "'");

    // Se o usuário for de uma OME específica, filtra por ela; se vier vazio ou genérico, trata adequadamente
    var sql = "SELECT TRIM(OBJETO) as material, COUNT(*) as qtd " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
              "GROUP BY TRIM(OBJETO) " +
              "ORDER BY material ASC";

    var queryResults = executarConsultaBigQuerySegura(sql);
    var rows = queryResults.rows || [];
    var materiais = [];
    var mapaConsumo = (typeof obterMapaClassificacaoConsumo_ === 'function') ? obterMapaClassificacaoConsumo_() : {};

    rows.forEach(function(r) {
      if (r.f && r.f[0] && r.f[0].v) {
        var nomeMat = String(r.f[0].v).trim();
        // Filtra materiais de consumo para a lista lateral da árvore (mantém apenas permanentes)
        if (typeof ehMaterialConsumo_ === 'function' && ehMaterialConsumo_(nomeMat, mapaConsumo)) {
          return;
        }
        materiais.push({ 
          nome: nomeMat, 
          total: parseInt(r.f[1].v || 0) 
        });
      }
    });

    return materiais;
  } catch (err) {
    console.error("Erro em getMateriaisDaOme: " + err.message);
    return [];
  }
}



// ID da planilha oficial fornecida

var ID_PLANILHA_OFICIAL_MATERIAIS = "1VJ6dEc2K1bKt9qUTpBnqf2n6qE_bVHpgW3Ojn7_bvjY";



// IDs dos arquivos corporativos

var ID_PLANILHA_OFICIAL_MATERIAIS = "1wVvcbuSW4k5o4BmZoj7EYfazBVvyk5z6n1Pdj8qgmXo";

var ID_PLANILHA_TICKETS_PROVISORIOS = "1VJ6dEc2K1bKt9qUTpBnqf2n6qE_bVHpgW3Ojn7_bvjY";



// 1. Cadastra um material na base provisória da planilha designada

// 1. Cadastra um material na base provisória da planilha designada

function cadastrarMaterialProvisorio(dadosNovoMaterial) {

  try {

    var ss = SpreadsheetApp.openById(ID_PLANILHA_TICKETS_PROVISORIOS);

    var abaProvisoria = ss.getSheetByName("Materiais_Provisorios") || ss.getSheetByName("Materiais Provisorios");

    

    // Cria a aba se ela não existir

    if (!abaProvisoria) {

      abaProvisoria = ss.insertSheet("Materiais_Provisorios");

      abaProvisoria.appendRow(["ID_Ticket", "Data", "NomeProvisorio", "Solicitante_OME", "Status", "Classe_1", "Classe_2", "Classe_3"]);

    }

    

    var idTicket = "TICK_" + Date.now();

    var dataHora = new Date();

    var nomeProvisorio = String(dadosNovoMaterial.nomeProvisorio || "").trim().toUpperCase();

    var omeSolicitante = String(dadosNovoMaterial.ome || "").trim();

    

    var c1 = String(dadosNovoMaterial.classe1 || "").trim();

    var c2 = String(dadosNovoMaterial.classe2 || "").trim();

    var c3 = String(dadosNovoMaterial.classe3 || "").trim();

    

    if (!nomeProvisorio) {

      throw new Error("O nome do material provisório não pode estar vazio.");

    }



    // Adiciona as classes nas colunas seguintes mantendo o index de status na posição [4] intacto

    abaProvisoria.appendRow([idTicket, dataHora, nomeProvisorio, omeSolicitante, "PENDENTE", c1, c2, c3]);

    try {
      registrarLogAuditoria("MATERIAL_PROVISORIO", "Cadastrou material provisório " + nomeProvisorio + " para a OME " + omeSolicitante);
    } catch(eLogProv) {}

    return {

      sucesso: true,

      nomeCadastrado: nomeProvisorio,

      mensagem: "Material cadastrado provisoriamente com sucesso!"

    };

  } catch (err) {

    throw new Error("Erro ao cadastrar material provisório: " + err.message);

  }

}



function getTicketsMateriaisPendentes() {

  try {

    var ss = SpreadsheetApp.openById("1VJ6dEc2K1bKt9qUTpBnqf2n6qE_bVHpgW3Ojn7_bvjY");

    var abaProvisoria = ss.getSheetByName("Materiais_Provisorios") || ss.getSheetByName("Materiais Provisorios");

    

    if (!abaProvisoria) return [];

    

    var dados = abaProvisoria.getDataRange().getValues();

    if (dados.length < 2) return [];

    

    var tickets = [];

    

    for (var i = 1; i < dados.length; i++) {

      var row = dados[i];

      var status = String(row[4] || "").trim().toUpperCase();

      

      if (status === "PENDENTE") {

        var dataBruta = row[1];

        var dataTexto = "";

        

        if (Object.prototype.toString.call(dataBruta) === '[object Date]') {

          dataTexto = Utilities.formatDate(dataBruta, "America/Recife", "yyyy-MM-dd'T'HH:mm:ss");

        } else {

          dataTexto = String(dataBruta || "");

        }

        

        tickets.push({

          idTicket: String(row[0] || ""),

          data: dataTexto,

          nomeProvisorio: String(row[2] || ""),

          solicitante: String(row[3] || ""),

          classe1: String(row[5] || ""), // Recupera a Classe 1

          classe2: String(row[6] || ""), // Recupera a Classe 2

          classe3: String(row[7] || "")  // Recupera a Classe 3

        });

      }

    }

    

    return tickets;

  } catch (err) {

    console.error("Erro ao buscar tickets pendentes: " + err.message);

    return [];

  }

}



// 3. Valida, aprova ou corrige o material provisório, oficializando-o e atualizando o BigQuery

// 3. Valida, aprova ou corrige o material provisório, oficializando-o e atualizando o BigQuery

// 3. Valida, aprova ou corrige o material provisório, oficializando-o e atualizando o BigQuery

// 3. Valida, aprova ou corrige o material provisório, oficializando-o e atualizando o BigQuery

function avaliarTicketMaterialProvisorio(dadosAvaliacao) {

  try {

    var idTicket = dadosAvaliacao.idTicket;

    var nomeProvisorioAntigo = dadosAvaliacao.nomeProvisorioAntigo;

    var nomeDefinitivo = String(dadosAvaliacao.nomeDefinitivo || "").trim().toUpperCase();

    var classe1 = String(dadosAvaliacao.classe1 || "").trim();

    var classe2 = String(dadosAvaliacao.classe2 || "").trim();

    var classe3 = String(dadosAvaliacao.classe3 || "").trim();

    

    if (!nomeDefinitivo) {

      throw new Error("O nome definitivo do material deve ser informado.");

    }

    

    // 1. Atualiza o status na aba provisória para APROVADO

    var ssProvisoria = SpreadsheetApp.openById(ID_PLANILHA_TICKETS_PROVISORIOS);

    var abaProvisoria = ssProvisoria.getSheetByName("Materiais_Provisorios") || ssProvisoria.getSheetByName("Materiais Provisorios");

    if (!abaProvisoria) throw new Error("Base provisória não encontrada.");

    

    var emailAv = Session.getActiveUser().getEmail();
    var userAv = verificarPermissaoUsuario(emailAv);
    var cpfAv = (userAv && userAv.cpf) ? userAv.cpf : "DLOG";
    var dataHoraAv = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");

    var dadosProv = abaProvisoria.getDataRange().getValues();

    for (var i = 1; i < dadosProv.length; i++) {

      if (String(dadosProv[i][0]) === String(idTicket)) {

        abaProvisoria.getRange(i + 1, 5).setValue("APROVADO");
        abaProvisoria.getRange(i + 1, 9).setValue(nomeDefinitivo);
        abaProvisoria.getRange(i + 1, 11).setValue(dataHoraAv);
        abaProvisoria.getRange(i + 1, 12).setValue(cpfAv);

        break;

      }

    }

    

    // 2. Verifica se o material já existe na aba #CAD_ITENS do Catálogo

    var ssCatalogo = SpreadsheetApp.openById("1wVvcbuSW4k5o4BmZoj7EYfazBVvyk5z6n1Pdj8qgmXo");

    var abaCatalogo = ssCatalogo.getSheetByName("#CAD_ITENS");

    if (!abaCatalogo) throw new Error("Aba '#CAD_ITENS' não encontrada no arquivo do catálogo oficial.");

    

    // Varre a Coluna C a partir da linha 6 para checar duplicidade e achar a primeira linha vazia

    var maxLinhas = abaCatalogo.getMaxRows();

    var valoresColunaC = abaCatalogo.getRange(6, 3, maxLinhas - 5, 1).getValues();

    

    var materialJaExiste = false;

    var primeiraLinhaVazia = -1;

    

    for (var k = 0; k < valoresColunaC.length; k++) {

      var nomeNaPlanilha = String(valoresColunaC[k][0] || "").trim().toUpperCase();

      

      // Checa se já existe

      if (nomeNaPlanilha === nomeDefinitivo) {

        materialJaExiste = true;

        break;

      }

      

      // Registra a primeira linha vazia encontrada (caso precise inserir)

      if (nomeNaPlanilha === "" && primeiraLinhaVazia === -1) {

        primeiraLinhaVazia = 6 + k;

      }

    }

    

    // Se NÃO existir no catálogo, adiciona na primeira linha vazia encontrada dentro da tabela preexistente

    if (!materialJaExiste) {

      if (primeiraLinhaVazia === -1) {

        primeiraLinhaVazia = maxLinhas + 1; // Fallback de segurança se a planilha estiver 100% cheia

      }

      

      var rangeC = abaCatalogo.getRange(primeiraLinhaVazia, 3);

      var rangeH = abaCatalogo.getRange(primeiraLinhaVazia, 8);

      var rangeI = abaCatalogo.getRange(primeiraLinhaVazia, 9);

      var rangeJ = abaCatalogo.getRange(primeiraLinhaVazia, 10);

      

      // Limpa a validação restrita do Google Sheets apenas nessas células para evitar bloqueio

      rangeH.clearDataValidations();

      rangeI.clearDataValidations();

      rangeJ.clearDataValidations();

      

      // Insere os valores nas respectivas colunas da linha vazia

      rangeC.setValue(nomeDefinitivo); // Coluna C: Objeto Resumido

      rangeH.setValue(classe1);        // Coluna H: Classe 1

      rangeI.setValue(classe2);        // Coluna I: Classe 2

      rangeJ.setValue(classe3);        // Coluna J: Classe 3

    }

    

    // 3. Atualiza no BigQuery: padroniza substituindo o nome provisório pelo definitivo nos registros

    function limpaSQL(t) { return String(t || '').trim().replace(/'/g, "\\'"); }

    

    var sqlUpdate = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +

                    "SET OBJETO = '" + limpaSQL(nomeDefinitivo) + "' " +

                    "WHERE UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + limpaSQL(nomeProvisorioAntigo) + "'))";

    

    executarConsultaBigQuerySegura(sqlUpdate, true);

    

    var acaoMsg = materialJaExiste ? "Material já existia no catálogo. Registros padronizados no sistema" : "Novo material incluído no catálogo e sistema atualizado";

    try {
      registrarLogAuditoria("AVALIACAO_MATERIAL_PROVISORIO", "Aprovou material provisório " + nomeProvisorioAntigo + " como " + nomeDefinitivo + " (" + acaoMsg + ") por CPF " + cpfAv);
    } catch(eLogAvProv) {}

    return { sucesso: true, mensagem: acaoMsg + " com sucesso!" };

  } catch (err) {

    throw new Error("Erro ao avaliar ticket de material: " + err.message);

  }

}



function getContagemETicketsPendentes() {

  try {

    var ss = SpreadsheetApp.openById("1VJ6dEc2K1bKt9qUTpBnqf2n6qE_bVHpgW3Ojn7_bvjY");

    var abaProvisoria = ss.getSheetByName("Materiais_Provisorios");

    if (!abaProvisoria) return { total: 0, lista: [] };

    

    var dados = abaProvisoria.getDataRange().getValues();

    var tickets = [];

    

    for (var i = 1; i < dados.length; i++) {

      if (dados[i][4] === "PENDENTE") {

        tickets.push({

          idTicket: dados[i][0],

          data: dados[i][1],

          nomeProvisorio: dados[i][2],

          solicitante: dados[i][3]

        });

      }

    }

    return { total: tickets.length, lista: tickets };

  } catch (err) {

    console.error("Erro ao buscar contagem de tickets: " + err.message);

    return { total: 0, lista: [] };

  }

}



// =========================================================================
// HELPER ROBUSTO DE NORMALIZAÇÃO DE LINHAS DE IMPORTAÇÃO EXCEL
// Suporta variações de cabeçalhos, espaços extras, acentuações e typos (ex: DUBUNIDADE)
// =========================================================================
function normalizarLinhaImportacaoExcel_(linhaBruta) {
  if (!linhaBruta || typeof linhaBruta !== "object") return {};
  
  var chavesOriginais = Object.keys(linhaBruta);
  var mapa = {};
  var chavesNorm = [];
  
  for (var i = 0; i < chavesOriginais.length; i++) {
    var k = chavesOriginais[i];
    var kNorm = String(k)
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, "");
    
    if (kNorm) {
      mapa[kNorm] = linhaBruta[k];
      chavesNorm.push(kNorm);
    }
  }

  function buscar(termos, fallback, excludes) {
    excludes = excludes || [];
    // 1. Busca exata após normalização das chaves
    for (var t = 0; t < termos.length; t++) {
      var termoNorm = termos[t]
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, "");
      
      if (mapa[termoNorm] !== undefined && mapa[termoNorm] !== null) {
        var isEx = false;
        for (var x = 0; x < excludes.length; x++) {
          if (termoNorm.indexOf(excludes[x]) !== -1) { isEx = true; break; }
        }
        if (!isEx) {
          var v1 = String(mapa[termoNorm]).trim();
          if (v1 !== "") return v1;
        }
      }
    }
    // 2. Busca parcial segura (apenas se a coluna da planilha contiver o termo chave, ex: "DESCRICAODOOBJETO" contem "DESCRICAO")
    for (var t2 = 0; t2 < termos.length; t2++) {
      var tNorm = termos[t2]
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, "");
      
      for (var c = 0; c < chavesNorm.length; c++) {
        var cn = chavesNorm[c];
        var isEx2 = false;
        for (var x2 = 0; x2 < excludes.length; x2++) {
          if (cn.indexOf(excludes[x2]) !== -1) { isEx2 = true; break; }
        }
        if (isEx2) continue;

        if (cn.indexOf(tNorm) !== -1) {
          var v2 = String(mapa[cn]).trim();
          if (v2 !== "") return v2;
        }
      }
    }
    return fallback;
  }

  var rawUnidade = buscar(["UNIDADE", "OME", "UNIDADEOME", "UND"], "", ["SUB", "DUB"]);
  var rawSubunidade = buscar(["SUBUNIDADE", "DUBUNIDADE", "SUBUNID", "SUB_UNIDADE", "SUB UNIDADE", "SUB-UNIDADE", "SUB"], "");

  // Se subunidade não foi preenchida, for '-', 'SEDE', 'N/A' ou for equivalente à OME, limpa para cair na SEDE
  var subFinal = rawSubunidade;
  if (ehSubunidadeEquivalenteOme_(subFinal, rawUnidade)) {
    subFinal = "";
  }

  return {
    material: buscar(["MATERIAL", "OBJETO", "DESCRICAO", "ITEM", "NOME", "PRODUTO", "ESPECIFICACAO"], ""),
    quantidade: buscar(["QUANTIDADE", "QTD", "QTDE", "QUANT"], "1"),
    unidade: rawUnidade,
    subunidade: subFinal,
    setor: buscar(["SETOR", "DEPTO", "DEPARTAMENTO", "SECAO", "SEÇÃO"], ""),
    local: buscar(["LOCAL", "LOCALIZACAO", "LOCALIZAÇÃO", "LOCALIZACAOESPECIFICA"], ""),
    status: buscar(["STATUS", "ESTADO", "CONSERVACAO", "CONSERVAÇÃO", "SITUACAO"], "ECD"),
    patrimonio: buscar(["PATRIMONIO", "PATRIMÔNIO", "NPATRIMONIO", "N_PATRIMONIO", "PAT", "TOMBO"], ""),
    sei: buscar(["SEI", "PROCESSEI", "NSEI", "SEICOMPRA"], ""),
    efisco: buscar(["EFISCO", "CODEFISCO"], ""),
    permanente: buscar(["PERMANENTE", "BEMPERMANENTE"], ""),
    observacao: buscar(["OBSERVACAO", "OBS", "DETALHES"], "")
  };
}

function importarLoteExcelBigQuery(registros, proximoNumeroFornecido, registrarLogAuditoriaFinal, usuarioCliente) {
  try {
    // 1. Prioriza identificar o usuário diretamente pelo objeto passado pelo cliente (0ms)
    var usuario = null;
    if (usuarioCliente && usuarioCliente.nome && usuarioCliente.nome !== "Usuário") {
      usuario = usuarioCliente;
    } else if (usuarioCliente && (usuarioCliente.cpf || usuarioCliente.email)) {
      usuario = verificarPermissaoUsuario(usuarioCliente.cpf || usuarioCliente.email);
    }

    // 2. Fallback: Sessão do Google Apps Script
    if (!usuario) {
      var email = "";
      try { email = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
      if (!email) {
        try { email = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
      }
      if (email) usuario = verificarPermissaoUsuario(email);
    }

    if (!usuario) {
      usuario = { nome: "Usuário Logado", email: "", cpf: "-", ome: "DLOG", perfil: "Usuário" };
    }

    var perfilUser = String((usuario && usuario.perfil) || "").trim().toLowerCase();
    var ehChefe = perfilUser.indexOf("chefe") !== -1 || perfilUser.indexOf("comandante") !== -1;
    var ehAdmin = perfilUser.indexOf("admin") !== -1;
    var podeExcel = (usuario && usuario.permissoes && (Array.isArray(usuario.permissoes) ? usuario.permissoes.indexOf("importar_exportar_excel") !== -1 : String(usuario.permissoes).indexOf("importar_exportar_excel") !== -1));

    if (!ehAdmin && !ehChefe && !podeExcel) {
      throw new Error("Permissão negada: o seu usuário não possui a permissão de Importação de Materiais via Excel.");
    }

    if (!registros || registros.length === 0) throw new Error("Nenhum dado recebido.");

    var anoAtual = new Date().getFullYear();
    var prefixo = "CBMPE-" + anoAtual + "-";
    
    // Se o próximo número sequencial foi fornecido pelo cliente (chunking), reaproveita diretamente sem reconsultar o BigQuery
    var proximoNumero = 1;
    if (typeof proximoNumeroFornecido === 'number' && proximoNumeroFornecido > 0) {
      proximoNumero = proximoNumeroFornecido;
    } else {
      var sqlMax = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM LIKE '" + prefixo + "%' ORDER BY LENGTH(ITEM) DESC, ITEM DESC LIMIT 1";
      try {
        var resMax = executarConsultaBigQuerySegura(sqlMax);
        if (resMax.rows && resMax.rows.length > 0 && resMax.rows[0].f[0].v) {
          var partes = String(resMax.rows[0].f[0].v).split("-");
          var numExtraido = parseInt(partes[partes.length - 1], 10);
          if (!isNaN(numExtraido)) proximoNumero = numExtraido + 1;
        }
      } catch(e) {}
    }

    function escSql(txt) {
      if (txt === null || txt === undefined) return "";
      return String(txt).replace(/\\/g, "\\\\").replace(/'/g, "\\'").trim();
    }

    // Normaliza todos os registros recebidos
    var registrosNormalizados = [];
    for (var r = 0; r < registros.length; r++) {
      var normR = normalizarLinhaImportacaoExcel_(registros[r]);
      registrosNormalizados.push(normR);
    }

    // Validação de segurança no backend: Comandante de Unidade ou Usuário restrito só pode subir materiais para sua OME de cadastro
    if (!ehAdmin) {
      var omeLoginOficial = (typeof obterOmePadronizada === 'function') 
        ? obterOmePadronizada(usuario.ome) 
        : String(usuario.ome || "").trim().toUpperCase();

      for (var rChk = 0; rChk < registrosNormalizados.length; rChk++) {
        var uLinha = String(registrosNormalizados[rChk].unidade || "").trim();
        if (uLinha) {
          var uLinhaOficial = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(uLinha) : uLinha.toUpperCase();
          if (uLinhaOficial && omeLoginOficial && uLinhaOficial.toUpperCase() !== omeLoginOficial.toUpperCase()) {
            throw new Error("Upload não autorizado: Você está tentando subir materiais para uma OME diferente do seu cadastro. " +
                            "(Sua OME de Login: " + omeLoginOficial + ", OME informada na planilha: " + uLinhaOficial + "). " +
                            "O Chefe de Setor apenas tem autorização para inputar materiais da UNIDADE igual à sua OME de Login.");
          }
        }
      }
    }

    var todosItensAInserir = [];
    var todosEventosAInserir = [];
    var baseTimestamp = new Date().getTime();

    for (var j = 0; j < registrosNormalizados.length; j++) {
      var itemNorm = registrosNormalizados[j];
      
      // Se não encontrou material nem patrimônio nem subunidade, linha está vazia
      var material = itemNorm.material;
      if (!material) {
        if (itemNorm.patrimonio) {
          material = "Item Tombado " + itemNorm.patrimonio;
        } else if (itemNorm.subunidade || itemNorm.unidade) {
          material = "Item " + (itemNorm.subunidade || itemNorm.unidade);
        } else {
          continue; // Linha vazia
        }
      }

      var qtdTexto = itemNorm.quantidade || "1";
      var quantidadeMultiplicador = parseInt(qtdTexto, 10);
      if (isNaN(quantidadeMultiplicador) || quantidadeMultiplicador <= 0) quantidadeMultiplicador = 1;

      var unidadeExcel = itemNorm.unidade;
      var unidadeBruta = (unidadeExcel !== "") ? unidadeExcel : (usuario.ome || "DLOG");
      var unidade = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(unidadeBruta) : unidadeBruta;
      if (!unidade) unidade = "DLOG";

      var subunidadeBruta = (itemNorm.subunidade || "").trim();
      var subunidade = "SEDE";
      if (!ehSubunidadeEquivalenteOme_(subunidadeBruta, unidade)) {
        subunidade = subunidadeBruta;
      }

      var setor = itemNorm.setor || "";
      var local = itemNorm.local || "";
      var status = itemNorm.status || "ECD";
      var patrimonio = itemNorm.patrimonio || "";
      var sei = itemNorm.sei || "";
      var efisco = itemNorm.efisco || "";
      var permanente = itemNorm.permanente || "";
      var obs = itemNorm.observacao || "Importação Lote";

      var respNome = (usuario && usuario.nome) ? usuario.nome : ((usuario && usuario.email) ? usuario.email : "Usuário");
      var respCpf = (usuario && usuario.cpf) ? usuario.cpf : "-";
      var emailUsuario = (usuario && usuario.email && respNome.indexOf(usuario.email) === -1 && respNome !== usuario.email) ? usuario.email : "";
      var respComEmail = respNome + (emailUsuario ? " (" + emailUsuario + ")" : "");
      var tagImport = "Carregamento em lote via Planilha por " + respComEmail;
      var obsFinal = (obs && obs !== "Importação Lote") ? (obs + " | " + tagImport) : tagImport;

      // Pré-escape dos campos da linha uma única vez fora do loop multiplicador k
      var escMaterial = escSql(material);
      var escEfisco = escSql(efisco);
      var escSei = escSql(sei);
      var escPerm = permanente ? "'" + escSql(permanente) + "'" : "NULL";
      var escPat = escSql(patrimonio);
      var escUnd = escSql(unidade);
      var escSub = escSql(subunidade);
      var escSet = escSql(setor);
      var escLoc = escSql(local);
      var escStatus = escSql(status);
      var escObsFinal = escSql(obsFinal);
      var destLocal = (subunidade === "SEDE" && !setor && !local) ? "SEDE" : [subunidade, setor, local].filter(Boolean).join(" > ");
      var escDestLocal = escSql(destLocal);
      var escRespNome = escSql(respNome);
      var escRespComEmail = escSql(respComEmail);
      var escRespCpf = escSql(respCpf);
      var escSeiRef = escSql(sei || '-');
      var escTagImport = escSql(tagImport);

      for (var k = 0; k < quantidadeMultiplicador; k++) {
        var itemId = prefixo + proximoNumero;
        proximoNumero++;
        
        var valStr = "('" + itemId + "', '" + escMaterial + "', '" + escEfisco + "', '" + escSei + "', " + 
                     escPerm + ", '" + 
                     escPat + "', '" + escUnd + "', '" + escSub + "', '" + escSet + "', '" + escLoc + "', '" + escStatus + "', '', '', '', '', '', '', '" + escObsFinal + "')";
        todosItensAInserir.push(valStr);

        var idHist = "HIST-" + baseTimestamp + "-" + proximoNumero + "-" + (k + 1);
        var valHist = "('" + idHist + "', CURRENT_TIMESTAMP(), '" + itemId + "', '" + escMaterial + "', '" + escPat + "', 'CADASTRO', 'Carregamento em lote via Planilha', '" + escRespNome + "', '" + escUnd + "', '" + escDestLocal + "', '-', '" + escStatus + "', '" + escRespComEmail + "', '" + escRespCpf + "', '" + escSeiRef + "', '" + escTagImport + "')";
        todosEventosAInserir.push(valHist);
      }
    }

    if (todosItensAInserir.length === 0) {
      return { sucesso: true, inseridos: 0, proximoNumero: proximoNumero, mensagem: "Nenhum dado válido para importar neste lote." };
    }

    // Grava no BigQuery em lotes de até 2.000 itens por comando INSERT
    garantirTabelaHistoricoMovimentacao_();
    var tamanhoLote = 2000;
    var totalInseridos = 0;

    for (var m = 0; m < todosItensAInserir.length; m += tamanhoLote) {
      var chunk = todosItensAInserir.slice(m, m + tamanhoLote);
      var chunkHist = todosEventosAInserir.slice(m, m + tamanhoLote);

      var sqlInsert = "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` (ITEM, OBJETO, COD_EFISCO, SEI_COMPRA_RECEBIMENTO, BEM_PERMANENTE_PATRIMONIAVEL_SIM_NAO, N_PATRIMONIO, UNIDADE, SUBUNIDADE, SETOR, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, STATUS, SE_ACAUTELADO_POSTO_GRAD, SE_ACAUTELADO_NOME_COMPLETO, SE_ACAUTELADO_CPF, SE_ACAUTELADO_N_DOC_SEI, SE_EXTRAVIADO_OU_SCD_N_DOC_SEI, LINK_DE_FOTO_GOOGLE_DRIVE_Somente_Leitura, OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material) VALUES " + chunk.join(", ");
      
      var sqlInsertHist = "";
      if (chunkHist.length > 0) {
        sqlInsertHist = "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_HISTORICO + "` (ID_HISTORICO, DATA_HORA, ITEM, OBJETO, N_PATRIMONIO, TIPO_EVENTO, ORIGEM_UNIDADE, ORIGEM_LOCAL, DESTINO_UNIDADE, DESTINO_LOCAL, STATUS_ANTERIOR, STATUS_NOVO, RESPONSAVEL_NOME, RESPONSAVEL_CPF, DOCUMENTO_REF, OBSERVACAO) VALUES " + chunkHist.join(", ");
      }

      // Executa de forma combinada (Multi-statement script) para economizar 50% do tempo de requisição ao BigQuery
      if (sqlInsertHist) {
        try {
          var sqlCombined = sqlInsert + ";\n" + sqlInsertHist + ";";
          executarEscritaBigQuerySegura(sqlCombined);
        } catch (eCombined) {
          console.warn("Aviso: fallback para gravação individual no BigQuery: " + eCombined.message);
          executarEscritaBigQuerySegura(sqlInsert);
          try {
            executarEscritaBigQuerySegura(sqlInsertHist);
          } catch(eHist) {}
        }
      } else {
        executarEscritaBigQuerySegura(sqlInsert);
      }

      totalInseridos += chunk.length;
    }

    if (registrarLogAuditoriaFinal) {
      try {
        registrarLogAuditoria("IMPORTACAO_EXCEL", "Usuário " + usuario.nome + " importou lote via Excel. Registros inseridos: " + totalInseridos);
      } catch (eLog) {}
    }

    return {
      sucesso: true,
      inseridos: totalInseridos,
      proximoNumero: proximoNumero,
      mensagem: totalInseridos + " registros individuais foram gravados com sucesso no inventário!"
    };
  } catch (err) {
    throw new Error("Erro na importação: " + err.message);
  }
}

function registrarLogConclusaoImportacaoExcel(totalItens) {
  try {
    var email = "";
    try { email = Session.getActiveUser().getEmail(); } catch (e) {}
    var usuario = verificarPermissaoUsuario(email);
    var nome = (usuario && usuario.nome) ? usuario.nome : "Usuário";
    registrarLogAuditoria("IMPORTACAO_EXCEL", "Usuário " + nome + " concluiu importação em lote via Excel de " + totalItens + " itens.");
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

function garantirEstruturaLocaisArvoreImportacao(locaisUnicos, usuarioCliente) {
  try {
    var email = "";
    try { email = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    if (!email) {
      try { email = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    }
    var usuario = email ? verificarPermissaoUsuario(email) : null;
    if (!usuario && usuarioCliente && (usuarioCliente.email || usuarioCliente.cpf)) {
      usuario = verificarPermissaoUsuario(usuarioCliente.email || usuarioCliente.cpf);
    }
    if (!usuario && usuarioCliente && usuarioCliente.nome) {
      usuario = usuarioCliente;
    }
    if (!usuario) {
      usuario = { nome: "Usuário Logado", email: "", cpf: "-", ome: "DLOG", perfil: "Usuário" };
    }

    // Trava de segurança para Comandante de Unidade / Não-Admin
    var perfilUser = String((usuario && usuario.perfil) || "").trim().toLowerCase();
    var ehChefe = perfilUser.indexOf("chefe") !== -1 || perfilUser.indexOf("comandante") !== -1;
    var ehAdmin = perfilUser.indexOf("admin") !== -1;

    if (!ehAdmin) {
      var omeLoginOficial = (typeof obterOmePadronizada === 'function') 
        ? obterOmePadronizada(usuario.ome) 
        : String(usuario.ome || "").trim().toUpperCase();

      if (locaisUnicos && Array.isArray(locaisUnicos)) {
        for (var k = 0; k < locaisUnicos.length; k++) {
          var omeItem = String(locaisUnicos[k].ome || "").trim();
          if (omeItem) {
            var omeItemOficial = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeItem) : omeItem.toUpperCase();
            if (omeItemOficial && omeLoginOficial && omeItemOficial.toUpperCase() !== omeLoginOficial.toUpperCase()) {
              throw new Error("Upload não autorizado: Tentativa de sincronizar subunidades de uma OME diferente do seu cadastro (" + omeItemOficial + ").");
            }
          }
        }
      }
    }

    return garantirLocaisArvoreInterno_(locaisUnicos, usuario);
  } catch (err) {
    console.error("Erro ao garantir estrutura de locais da importação: " + err.message);
    return { sucesso: false, erro: err.message };
  }
}

function garantirLocaisArvoreInterno_(locaisUnicos, usuario) {
  if (!locaisUnicos || !Array.isArray(locaisUnicos) || locaisUnicos.length === 0) {
    return { sucesso: true, novosCriados: 0 };
  }

  var omeUsuario = (usuario && usuario.ome) ? usuario.ome : "DLOG";

  // Agrupa locais únicos válidos por OME padronizada
  var porOme = {};
  for (var i = 0; i < locaisUnicos.length; i++) {
    var item = locaisUnicos[i];
    if (!item) continue;

    var rawOme = String(item.ome || omeUsuario || "DLOG").trim();
    var ome = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(rawOme) : rawOme;
    if (!ome) ome = "DLOG";

    var sub = String(item.subunidade || item.SUBUNIDADE || item.DUBUNIDADE || "").trim();
    var set = String(item.setor || item.SETOR || "").trim();
    var loc = String(item.local || item.LOCAL || "").trim();

    if (!porOme[ome]) porOme[ome] = [];
    porOme[ome].push({ subunidade: sub, setor: set, local: loc });
  }

  var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
  var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
  if (!sheet) {
    sheet = ss.insertSheet(ABA_LOCAIS_ARMAZENAMENTO);
    sheet.appendRow(["ID_Local", "Unidade_OME", "Nome_Local", "ID_Pai"]);
  }

  var totalNovosCriados = 0;

  for (var omeKey in porOme) {
    var listaLocais = porOme[omeKey];
    if (listaLocais.length === 0) continue;

    // Garante que a SEDE da OME exista
    var idSede = garantirSedePadraoOme(omeKey);

    // Carrega todos os nós existentes na planilha para esta OME
    var ultLinha = sheet.getLastRow();
    var dadosSheet = ultLinha > 1 ? sheet.getRange(2, 1, ultLinha - 1, 4).getValues() : [];
    
    var nodes = [];
    for (var r = 0; r < dadosSheet.length; r++) {
      var rowOme = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dadosSheet[r][1]) : String(dadosSheet[r][1] || "").trim();
      var rId = String(dadosSheet[r][0] || "").trim();
      var rNome = String(dadosSheet[r][2] || "").trim();
      var rIdPai = String(dadosSheet[r][3] || "").trim();
      
      if (rowOme.toUpperCase() === omeKey.toUpperCase() && rId && rNome) {
        nodes.push({ id: rId, nome: rNome, idPai: rIdPai });
      }
    }

    function findRoot(nome) {
      var nNorm = String(nome || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (var n = 0; n < nodes.length; n++) {
        var itemNorm = String(nodes[n].nome || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if ((!nodes[n].idPai || nodes[n].idPai === "") && itemNorm === nNorm) {
          return nodes[n];
        }
      }
      return null;
    }

    function findChild(nome, idPai) {
      var nNorm = String(nome || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      var pTrim = String(idPai || "").trim();
      for (var n = 0; n < nodes.length; n++) {
        var itemNorm = String(nodes[n].nome || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (String(nodes[n].idPai).trim() === pTrim && itemNorm === nNorm) {
          return nodes[n];
        }
      }
      return null;
    }

    var novasLinhasOme = [];

    for (var j = 0; j < listaLocais.length; j++) {
      var locItem = listaLocais[j];
      var subNome = (locItem.subunidade || "").trim();
      var setNome = (locItem.setor || "").trim();
      var locNome = (locItem.local || "").trim();

      // 1. Subunidade (Nível 1 - Raiz)
      // Verifica se a subunidade é nula, "SEDE", "-", "N/A" ou se repete o nome da própria OME
      var idSub = "";
      if (ehSubunidadeEquivalenteOme_(subNome, omeKey)) {
        idSub = idSede;
      } else {
        var nodeSub = findRoot(subNome);
        if (nodeSub) {
          idSub = nodeSub.id;
        } else {
          // Cria nova subunidade na árvore como raiz (sem ID_Pai) APENAS se for uma subunidade real e distinta
          idSub = "loc_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000000);
          var novoNodeSub = { id: idSub, nome: subNome, idPai: "" };
          nodes.push(novoNodeSub);
          novasLinhasOme.push([idSub, omeKey, subNome, ""]);
          totalNovosCriados++;
        }
      }

      // 2. Setor (Nível 2 - Filho da Subunidade)
      var idSetor = "";
      if (setNome) {
        var idPaiSetor = idSub || idSede;
        var nodeSetor = findChild(setNome, idPaiSetor);
        if (nodeSetor) {
          idSetor = nodeSetor.id;
        } else {
          // Cria novo setor sob a subunidade
          idSetor = "loc_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000000);
          var novoNodeSetor = { id: idSetor, nome: setNome, idPai: idPaiSetor };
          nodes.push(novoNodeSetor);
          novasLinhasOme.push([idSetor, omeKey, setNome, idPaiSetor]);
          totalNovosCriados++;
        }
      }

      // 3. Local (Nível 3 - Filho do Setor ou da Subunidade)
      if (locNome) {
        var idPaiLocal = idSetor || idSub || idSede;
        var nodeLoc = findChild(locNome, idPaiLocal);
        if (!nodeLoc) {
          // Cria novo local
          var idLocal = "loc_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000000);
          var novoNodeLoc = { id: idLocal, nome: locNome, idPai: idPaiLocal };
          nodes.push(novoNodeLoc);
          novasLinhasOme.push([idLocal, omeKey, locNome, idPaiLocal]);
          totalNovosCriados++;
        }
      }
    }

    // Se houve novas linhas para esta OME, grava em bloco na planilha
    if (novasLinhasOme.length > 0) {
      var proxLinha = sheet.getLastRow() + 1;
      sheet.getRange(proxLinha, 1, novasLinhasOme.length, 4).setValues(novasLinhasOme);
      SpreadsheetApp.flush();
    }
  }

  if (totalNovosCriados > 0) {
    try {
      registrarLogAuditoria("AUTO_CRIACAO_LOCAIS", "Criou automaticamente " + totalNovosCriados + " subunidades/locais na árvore durante a importação em lote.");
    } catch(eLog) {}
  }

  return { sucesso: true, novosCriados: totalNovosCriados };
}

// Higieniza toda a árvore de armazenamento, eliminando nós inválidos onde o nome da subunidade repete a OME
function sanitizarTodasSubunidadesArvore() {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
    if (!sheet) return { sucesso: false, erro: "Aba não encontrada" };

    var ultLinha = sheet.getLastRow();
    if (ultLinha <= 1) return { sucesso: true, omesVerificadas: 0 };

    var dados = sheet.getRange(2, 1, ultLinha - 1, 4).getValues();
    var omesPresentes = {};
    for (var i = 0; i < dados.length; i++) {
      var rowOme = String(dados[i][1] || "").trim();
      if (rowOme) {
        var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(rowOme) : rowOme;
        if (omePadrao) omesPresentes[omePadrao] = true;
      }
    }

    var totalOmes = 0;
    for (var o in omesPresentes) {
      garantirSedePadraoOme(o);
      totalOmes++;
    }
    return { sucesso: true, omesVerificadas: totalOmes };
  } catch(e) {
    console.error("Erro ao sanitizar árvore de subunidades: " + e.message);
    return { sucesso: false, erro: e.message };
  }
}





function obterOmePadronizada(ome) {
  if (!ome) return "";
  var t = String(ome).trim().toUpperCase();
  if (!t) return "";

  var limpo = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  var semPont = limpo.replace(/[^A-Z0-9]/g, " ");
  var condensado = limpo.replace(/[^A-Z0-9]/g, "");

  // 1. CINT e CI
  if (condensado === "CINT" || semPont.indexOf("CINT") !== -1 || semPont.indexOf("INTELIGENCIA") !== -1) return "CINT";
  if (condensado === "CI" || semPont.indexOf("COMANDO DO INTERIOR") !== -1 || /\bCI\b/.test(semPont)) return "CI";

  // 2. Grupamentos / Batalhões (GB / BBM) e Cidades Sedes
  if (/(\b1\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("1GB") !== -1 || condensado.indexOf("1BBM") !== -1 || semPont.indexOf("VITORIA") !== -1 || semPont.indexOf("ANTAO") !== -1) return "1º GB Vitoria Stº Antão";
  if (/(\b2\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("2GB") !== -1 || condensado.indexOf("2BBM") !== -1 || semPont.indexOf("CARUARU") !== -1) return "2º GB Caruaru";
  if (/(\b3\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("3GB") !== -1 || condensado.indexOf("3BBM") !== -1 || semPont.indexOf("SERRA TALHADA") !== -1 || (semPont.indexOf("SERRA") !== -1 && semPont.indexOf("TALHADA") !== -1)) return "3º GB Serra Talhada";
  if (/(\b4\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("4GB") !== -1 || condensado.indexOf("4BBM") !== -1 || semPont.indexOf("PETROLINA") !== -1) return "4º GB Petrolina";
  if (/(\b5\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("5GB") !== -1 || condensado.indexOf("5BBM") !== -1 || semPont.indexOf("SALGUEIRO") !== -1) return "5º GB Salgueiro";
  if (/(\b6\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("6GB") !== -1 || condensado.indexOf("6BBM") !== -1 || semPont.indexOf("GARANHUNS") !== -1) return "6º GB Garanhuns";
  if (/(\b7\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("7GB") !== -1 || condensado.indexOf("7BBM") !== -1 || semPont.indexOf("CARPINA") !== -1) return "7º GB Carpina";
  if (/(\b9\s*(GB|BBM|BATALH\w*|GRUPAM\w*))/.test(semPont) || condensado.indexOf("9GB") !== -1 || condensado.indexOf("9BBM") !== -1 || semPont.indexOf("ARCOVERDE") !== -1) return "9º GB Arcoverde";

  // 3. Unidades Especializadas
  if (condensado.indexOf("GBAPH") !== -1 || condensado.indexOf("BAPH") !== -1 || semPont.indexOf("PRE HOSPITALAR") !== -1 || semPont.indexOf("PREHOSPITALAR") !== -1 || semPont.indexOf("APH") !== -1 || semPont.indexOf("RESGATE") !== -1) return "GBAPH";
  if (condensado.indexOf("GBMAR") !== -1 || condensado.indexOf("BMAR") !== -1 || semPont.indexOf("MARITIMO") !== -1 || semPont.indexOf("SALVAMAR") !== -1 || semPont.indexOf("GUARDA VIDAS") !== -1 || semPont.indexOf("PRAIAS") !== -1) return "GBMAR";
  if (condensado === "GBS" || condensado === "BS" || condensado === "BBS" || semPont.indexOf("BATALHAO DE SALVAMENTO") !== -1 || semPont.indexOf("GRUPAMENTO DE SALVAMENTO") !== -1 || /\b(GBS|BS|SALVAMENTO)\b/.test(semPont)) return "GBS";
  if (condensado === "GBI" || condensado === "BI" || condensado === "BBI" || semPont.indexOf("BATALHAO DE INCENDIO") !== -1 || semPont.indexOf("GRUPAMENTO DE INCENDIO") !== -1 || /\b(GBI|BI|INCENDIO)\b/.test(semPont)) return "GBI";

  // 4. Centros de Atividades Técnicas (CAT)
  if (semPont.indexOf("CAT") !== -1 || semPont.indexOf("ATIVIDADES TECNICAS") !== -1) {
    if (semPont.indexOf("RMR") !== -1 || semPont.indexOf("METROPOLITAN") !== -1 || semPont.indexOf("RECIFE") !== -1) return "CAT/RMR";
    if (semPont.indexOf("AGRESTE") !== -1 || /\bAG\b/.test(semPont)) return "CAT/AG";
    if (semPont.indexOf("SERTAO") !== -1 || /\bSE\b/.test(semPont)) return "CAT/SE";
    if (semPont.indexOf("MATA") !== -1 || /\bZM\b/.test(semPont)) return "CAT/ZM";
  }

  // 5. Diretorias Centrais
  if (condensado === "DLOG" || semPont.indexOf("LOGISTICA") !== -1 || /\bDLOG\b/.test(semPont)) return "DLOG";
  if (condensado === "DGP" || condensado === "DP" || semPont.indexOf("GESTAO DE PESSOAS") !== -1 || semPont.indexOf("PESSOAL") !== -1 || /\bDGP\b/.test(semPont)) return "DGP";
  if (condensado === "DEIP" || semPont.indexOf("ENSINO") !== -1 || semPont.indexOf("INSTRUCAO E PESQUISA") !== -1 || /\bDEIP\b/.test(semPont)) return "DEIP";
  if (condensado === "DIESP" || semPont.indexOf("INOVACAO") !== -1 || semPont.indexOf("ESPECIALIZACAO") !== -1 || /\bDIESP\b/.test(semPont)) return "DIESP";
  if (condensado === "DIM" || semPont.indexOf("METROPOLITANA") !== -1 || /\bDIM\b/.test(semPont)) return "DIM";
  if (condensado === "DINTER1" || condensado === "DINTERI" || semPont.indexOf("INTERIOR 1") !== -1 || semPont.indexOf("INTERIOR I") !== -1 || /\bDINTER\s*(1|I)\b/.test(semPont)) return "DINTER I";
  if (condensado === "DINTER2" || condensado === "DINTERII" || semPont.indexOf("INTERIOR 2") !== -1 || semPont.indexOf("INTERIOR II") !== -1 || /\bDINTER\s*(2|II)\b/.test(semPont)) return "DINTER II";
  if (condensado === "DF" || semPont.indexOf("FINANCAS") !== -1 || /\bDF\b/.test(semPont)) return "DF";
  if (condensado === "DGO" || semPont.indexOf("OPERACOES") !== -1 || /\bDGO\b/.test(semPont)) return "DGO";
  if (condensado === "DJD" || semPont.indexOf("JUSTICA") !== -1 || semPont.indexOf("DISCIPLINA") !== -1 || /\bDJD\b/.test(semPont)) return "DJD";
  if (condensado === "DPLAG" || semPont.indexOf("PLANEJAMENTO") !== -1 || /\bDPLAG\b/.test(semPont)) return "DPLAG";
  if (condensado === "DTIC" || semPont.indexOf("TECNOLOGIA") !== -1 || semPont.indexOf("INFORMATICA") !== -1 || /\bDTIC\b/.test(semPont)) return "DTIC";
  if (condensado === "DVP" || semPont.indexOf("VILAS") !== -1 || /\bDVP\b/.test(semPont)) return "DVP";

  // 6. Centros, Academias e Comandos
  if (condensado === "ABMG" || semPont.indexOf("ACADEMIA") !== -1 || semPont.indexOf("GUARARAPES") !== -1) return "ABMG";
  if (condensado === "AECI" || semPont.indexOf("CONTROLE INTERNO") !== -1) return "AECI";
  if (condensado === "AJG" || semPont.indexOf("AJUDANCIA") !== -1) return "AjG";
  if (condensado === "CCS" || semPont.indexOf("COMANDO E SERVICO") !== -1 || semPont.indexOf("CIA DE COMANDO") !== -1) return "CCS";
  if (condensado === "CEAO" || semPont.indexOf("APERFEICOAMENTO DE OFICIAIS") !== -1) return "CEAO";
  if (condensado === "CEFD" || semPont.indexOf("EDUCACAO FISICA") !== -1 || semPont.indexOf("DESPORTOS") !== -1) return "CEFD";
  if (condensado === "CMAN" || semPont.indexOf("MANUTENCAO") !== -1) return "CMAN";
  if (condensado === "CPO" || semPont.indexOf("ODONTOLOG") !== -1) return "CPO";
  if (condensado === "CPPA" || semPont.indexOf("PROCESSO ADMINISTRATIVO") !== -1) return "CPPA";
  if (condensado === "CPP" || semPont.indexOf("PROMOCAO DE PRACAS") !== -1) return "CPP";
  if (condensado === "GCG" || semPont.indexOf("COMANDO GERAL") !== -1 || semPont.indexOf("CMDO GERAL") !== -1) return "GCG";
  if (condensado === "GSG" || semPont.indexOf("SUBCOMANDO GERAL") !== -1 || semPont.indexOf("SUBCMDO GERAL") !== -1) return "GSG";

  var listaOficial = [
    "1º GB Vitoria Stº Antão", "2º GB Caruaru", "3º GB Serra Talhada", "4º GB Petrolina",
    "5º GB Salgueiro", "6º GB Garanhuns", "7º GB Carpina", "9º GB Arcoverde",
    "ABMG", "AECI", "AjG", "CAT/AG", "CAT/RMR", "CAT/SE", "CAT/ZM",
    "CCS", "CEAO", "CEFD", "CI", "CINT", "CMAN", "CPO", "CPPA", "CPP",
    "DEIP", "DF", "DGO", "DIESP", "DIM", "DINTER I", "DINTER II",
    "DJD", "DLOG", "DGP", "DPLAG", "DTIC", "DVP", "GBAPH", "GBI",
    "GBMAR", "GBS", "GCG", "GSG"
  ];

  for (var i = 0; i < listaOficial.length; i++) {
    if (listaOficial[i].toUpperCase() === t) return listaOficial[i];
  }

  for (var j = 0; j < listaOficial.length; j++) {
    var itemLimpo = listaOficial[j].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
    if (condensado === itemLimpo || condensado.indexOf(itemLimpo) !== -1 || itemLimpo.indexOf(condensado) !== -1) {
      return listaOficial[j];
    }
  }

  return String(ome).trim().toUpperCase();
}

/**
 * Determina com precisão se um valor de Subunidade informado
 * é nulo, vazio, "SEDE", "-", ou equivalente à própria OME raiz.
 * Preserva SEMPRE subunidades legítimas como "1ª SB/1º GB", "Pelotão Petrolina", etc.
 */
function ehSubunidadeEquivalenteOme_(subNome, omeRef) {
  if (!subNome) return true;
  var sub = String(subNome).trim();
  if (!sub || sub === '-' || sub === '--' || sub === '.' || sub.toUpperCase() === 'SEDE' || sub.toUpperCase() === 'N/A' || sub.toUpperCase() === 'NENHUMA' || sub.toUpperCase() === 'SEM SUBUNIDADE') {
    return true;
  }

  var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeRef) : String(omeRef || '').trim();
  var subNorm = sub.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
  var omeNorm = omePadrao ? String(omePadrao).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '') : '';
  var omeRefNorm = omeRef ? String(omeRef).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '') : '';

  // 1. Se forem rigorosamente iguais à OME de referência ou OME padronizada
  if (subNorm === omeNorm || subNorm === omeRefNorm) return true;

  // 2. Palavras-chave que indicam inequivocamente uma subunidade real / operacional
  // Se contiver qualquer uma dessas, NUNCA é a OME/SEDE (é sempre uma subunidade legítima)
  var regexSubunidadeReal = /\b(SB|SECAO|SECOES|PEL|PELOTAO|PELOTOES|CIA|COMPANHIA|COMPANHIAS|DIV|DIVISAO|DIVISOES|NUCLEO|NUCLEOS|CHEFIA|ALMOX|ALMOXARIFADO|POSTO|DESTACAMENTO|PAB|DEPOSITO|RESERVA|OFICINA|GARAGEM|SALA|GABINETE|COMANDO|EXPEDIENTE)\b|(\d+\s*(A|O|ª|º)?\s*(SB|SECAO|PEL|CIA))/i;
  var subSemPont = sub.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, ' ');
  if (regexSubunidadeReal.test(subSemPont)) {
    return false;
  }

  // 3. Siglas conhecidas de OME pura
  var siglasOmePuras = ['DLOG','DGP','DEIP','DIESP','DIM','DINTER1','DINTERI','DINTER2','DINTERII','DF','DGO','DJD','DPLAG','DTIC','DVP','ABMG','AECI','CINT','CI','GBAPH','GBMAR','GBS','GBI','CATRMR','CATAG','CATSE','CATZM'];
  for (var i = 1; i <= 15; i++) {
    siglasOmePuras.push(i + 'GB');
    siglasOmePuras.push(i + 'BBM');
  }
  if (siglasOmePuras.indexOf(subNorm) !== -1) {
    return true;
  }

  // 4. Se não tem marcador de subunidade e o tradutor de OME aponta exatamente para a mesma OME
  if (typeof obterOmePadronizada === 'function') {
    var padraoSub = obterOmePadronizada(sub);
    if (padraoSub && (padraoSub.toUpperCase() === omePadrao.toUpperCase() || padraoSub.toUpperCase() === String(omeRef || '').trim().toUpperCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Retorna uma lista de strings formatadas para cláusula SQL IN (...) contendo o nome oficial
 * e todas as variações/abreviações possíveis da OME registradas no BigQuery.
 */
function obterVariacoesOmeParaSql_(ome) {
  var padrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(ome) : String(ome || '').trim();
  var nomes = {};
  if (padrao) nomes[padrao.toUpperCase()] = true;
  if (ome) nomes[String(ome).trim().toUpperCase()] = true;

  var mapa = {
    '1º GB VITORIA STº ANTÃO': [
      '1º GB', '1ºGB', '1 GB', '1° GB', '1°GB', 
      '1º GB VITORIA', '1º GB VITÓRIA', 
      '1º GB VITORIA STº ANTÃO', '1º GB VITÓRIA STº ANTÃO', '1º GB VITÓRIA STO ANTÃO',
      '1º GB VITORIA DE SANTO ANTAO', '1º GB VITÓRIA DE SANTO ANTÃO',
      '1º GRUPAMENTO DE BOMBEIROS', '1º BBM', '1BBM'
    ],
    '2º GB CARUARU': ['2º GB', '2ºGB', '2 GB', '2° GB', '2°GB', '2º GB CARUARU', '2º BBM', '2BBM'],
    '3º GB SERRA TALHADA': ['3º GB', '3ºGB', '3 GB', '3° GB', '3°GB', '3º GB SERRA TALHADA', '3º BBM', '3BBM'],
    '4º GB PETROLINA': ['4º GB', '4ºGB', '4 GB', '4° GB', '4°GB', '4º GB PETROLINA', '4º BBM', '4BBM'],
    '5º GB SALGUEIRO': ['5º GB', '5ºGB', '5 GB', '5° GB', '5°GB', '5º GB SALGUEIRO', '5º BBM', '5BBM'],
    '6º GB GARANHUNS': ['6º GB', '6ºGB', '6 GB', '6° GB', '6°GB', '6º GB GARANHUNS', '6º BBM', '6BBM'],
    '7º GB CARPINA': ['7º GB', '7ºGB', '7 GB', '7° GB', '7°GB', '7º GB CARPINA', '7º BBM', '7BBM'],
    '9º GB ARCOVERDE': ['9º GB', '9ºGB', '9 GB', '9° GB', '9°GB', '9º GB ARCOVERDE', '9º BBM', '9BBM'],
    'DINTER I': ['DINTER 1', 'DINTER-1', 'DINTER-I', 'DINTER I - SEDE', 'DINTER 1 - SEDE', 'DINTER I'],
    'DINTER II': ['DINTER 2', 'DINTER-2', 'DINTER-II', 'DINTER II - SEDE', 'DINTER 2 - SEDE', 'DINTER II'],
    'CAT/RMR': ['CAT RMR', 'CAT-RMR', 'CAT/RMR'],
    'CAT/AG': ['CAT AG', 'CAT-AG', 'CAT/AG'],
    'CAT/SE': ['CAT SE', 'CAT-SE', 'CAT/SE'],
    'CAT/ZM': ['CAT ZM', 'CAT-ZM', 'CAT/ZM'],
    'CINT': ['C.I.N.T.', 'CENTRO DE INTELIGENCIA', 'CINT'],
    'CI': ['C.I.', 'COMANDO DO INTERIOR', 'CI'],
    'GBAPH': ['BAPH', 'GBA PH', 'GBAPH'],
    'GBMAR': ['BMAR', 'GB MAR', 'GBMAR'],
    'GBS': ['BS', 'BBS', 'GBS'],
    'GBI': ['BI', 'BBI', 'GBI']
  };

  var chaveMap = padrao.toUpperCase();
  if (mapa[chaveMap]) {
    mapa[chaveMap].forEach(function(v) { nomes[v.toUpperCase()] = true; });
  }

  var lista = [];
  for (var k in nomes) {
    if (k && k.trim()) {
      lista.push("'" + k.trim().replace(/'/g, "\\'") + "'");
    }
  }

  return lista.length > 0 ? lista.join(", ") : "'" + String(ome || '').trim().toUpperCase().replace(/'/g, "\\'") + "'";
}

/**
 * Corrige e unifica todos os registros legados com nomes de OME abreviados ou divergentes no BigQuery e na planilha de locais
 */
function corrigirEUniformizarOmesNoBigQuery() {
  try {
    var listaOficial = [
      "1º GB Vitoria Stº Antão", "2º GB Caruaru", "3º GB Serra Talhada", "4º GB Petrolina",
      "5º GB Salgueiro", "6º GB Garanhuns", "7º GB Carpina", "9º GB Arcoverde",
      "ABMG", "AECI", "AjG", "CAT/AG", "CAT/RMR", "CAT/SE", "CAT/ZM",
      "CCS", "CEAO", "CEFD", "CI", "CINT", "CMAN", "CPO", "CPPA", "CPP",
      "DEIP", "DF", "DGO", "DIESP", "DIM", "DINTER I", "DINTER II",
      "DJD", "DLOG", "DGP", "DPLAG", "DTIC", "DVP", "GBAPH", "GBI",
      "GBMAR", "GBS", "GCG", "GSG"
    ];

    var listaSqlIn = listaOficial.map(function(u) { return "'" + u.replace(/'/g, "\\'") + "'"; }).join(", ");

    var sql = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET UNIDADE = CASE " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%1%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%1%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%VITORIA%' OR UPPER(TRIM(UNIDADE)) LIKE '%ANTAO%' THEN '1º GB Vitoria Stº Antão' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%2%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%2%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%CARUARU%' THEN '2º GB Caruaru' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%3%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%3%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%SERRA TALHADA%' THEN '3º GB Serra Talhada' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%4%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%4%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%PETROLINA%' THEN '4º GB Petrolina' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%5%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%5%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%SALGUEIRO%' THEN '5º GB Salgueiro' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%6%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%6%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%GARANHUNS%' THEN '6º GB Garanhuns' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%7%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%7%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%CARPINA%' THEN '7º GB Carpina' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%9%GB%' OR UPPER(TRIM(UNIDADE)) LIKE '%9%BBM%' OR UPPER(TRIM(UNIDADE)) LIKE '%ARCOVERDE%' THEN '9º GB Arcoverde' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%GBAPH%' OR UPPER(TRIM(UNIDADE)) LIKE '%BAPH%' OR UPPER(TRIM(UNIDADE)) LIKE '%PRE%HOSPITALAR%' THEN 'GBAPH' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%GBMAR%' OR UPPER(TRIM(UNIDADE)) LIKE '%BMAR%' OR UPPER(TRIM(UNIDADE)) LIKE '%MARITIMO%' THEN 'GBMAR' " +
      "WHEN UPPER(TRIM(UNIDADE)) IN ('GBS', 'BS', 'BBS') OR UPPER(TRIM(UNIDADE)) LIKE '%SALVAMENTO%' THEN 'GBS' " +
      "WHEN UPPER(TRIM(UNIDADE)) IN ('GBI', 'BI', 'BBI') OR UPPER(TRIM(UNIDADE)) LIKE '%INCENDIO%' THEN 'GBI' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%CAT%RMR%' THEN 'CAT/RMR' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%CAT%AG%' THEN 'CAT/AG' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%CAT%SE%' THEN 'CAT/SE' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%CAT%ZM%' THEN 'CAT/ZM' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%DINTER%1%' OR UPPER(TRIM(UNIDADE)) LIKE '%DINTER%I%' THEN 'DINTER I' " +
      "WHEN UPPER(TRIM(UNIDADE)) LIKE '%DINTER%2%' OR UPPER(TRIM(UNIDADE)) LIKE '%DINTER%II%' THEN 'DINTER II' " +
      "WHEN UPPER(TRIM(UNIDADE)) = 'CINT' OR UPPER(TRIM(UNIDADE)) LIKE '%INTELIGENCIA%' THEN 'CINT' " +
      "WHEN UPPER(TRIM(UNIDADE)) = 'CI' OR UPPER(TRIM(UNIDADE)) = 'C.I.' OR UPPER(TRIM(UNIDADE)) LIKE '%COMANDO DO INTERIOR%' THEN 'CI' " +
      "ELSE UNIDADE END " +
      "WHERE UNIDADE IS NOT NULL AND TRIM(UNIDADE) != '' AND UNIDADE NOT IN (" + listaSqlIn + ")";

    executarConsultaBigQuerySegura(sql, true);
  } catch (e) {
    console.warn("Aviso na rotina de correção de OMEs no BigQuery: " + e.message);
  }

  // Uniformiza também a coluna B (Unidade_OME) da planilha de locais de armazenamento
  try {
    var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetLoc = ssAux.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
    if (sheetLoc && sheetLoc.getLastRow() > 1) {
      var dadosLoc = sheetLoc.getRange(2, 2, sheetLoc.getLastRow() - 1, 1).getValues();
      var alterouLoc = false;
      for (var l = 0; l < dadosLoc.length; l++) {
        var omeAntiga = String(dadosLoc[l][0] || "").trim();
        if (omeAntiga) {
          var omePad = obterOmePadronizada(omeAntiga);
          if (omePad && omePad !== omeAntiga) {
            dadosLoc[l][0] = omePad;
            alterouLoc = true;
          }
        }
      }
      if (alterouLoc) {
        sheetLoc.getRange(2, 2, dadosLoc.length, 1).setValues(dadosLoc);
      }
    }
  } catch (eLoc) {}
}



function diagnosticarEstoqueUsuario(omeInformada) {

  try {

    // Testa uma chamada simples usando a API nativa avançada do BigQuery

    var projectId = PROJECT_ID;

    var datasetId = DATASET_ID;

    var tableId = TABELA_ID;



    var table = BigQuery.Tables.get(projectId, datasetId, tableId);

    var numLinhasReais = table.numRows; // Retorna o total exato de linhas direto da propriedade da tabela



    return {

      status: "SUCESSO",

      usuarioLogado: "Permissão OK",

      omeOriginalNoLogin: omeInformada || "",

      omeTraduzidaSistema: "Linhas na Tabela (Propriedade GCP): " + numLinhasReais,

      totalItensNoBigQueryParaEstaOme: parseInt(numLinhasReais || 0),

      amostraOmesExistentesNoBanco: ["Conexão com a base de dados liberada com sucesso!"]

    };

  } catch (err) {

    return { 

      status: "ERRO_CONEXAO_BANCO", 

      usuarioLogado: "Bloqueado",

      omeOriginalNoLogin: "",

      omeTraduzidaSistema: "ERRO: O usuário comum não tem permissão no banco de dados.",

      totalItensNoBigQueryParaEstaOme: -99,

      amostraOmesExistentesNoBanco: [err.message] 

    };

  }

}

// =========================================================================
// FUNÇÃO CENTRALIZADA DE CONSULTA SEGURA AO BANCO DE DADOS
// =========================================================================
// =========================================================================
// FUNÇÃO DE EXECUÇÃO SEGURA PARA LEITURA E ESCRITA NO BANCO DE DADOS
// =========================================================================

// Compatibilidade com o Index.html: o botão "Testar Conexão do Usuário"
// chama esta função. Ela devolve exatamente o formato esperado pelo front-end.
function testeDiagnosticoRapido(omeAlvo) {
  try {
    var resultado = diagnosticarEstoqueUsuario(omeAlvo);
    if (resultado && resultado.status === "SUCESSO") {
      return {
        sucesso: true,
        omeTestada: resultado.omeOriginalNoLogin || omeAlvo || "",
        totalItens: resultado.totalItensNoBigQueryParaEstaOme || 0
      };
    }
    return {
      sucesso: false,
      erro: (resultado && resultado.amostraOmesExistentesNoBanco && resultado.amostraOmesExistentesNoBanco[0]) || "Falha ao acessar o banco de dados."
    };
  } catch (err) {
    return { sucesso: false, erro: err.message || String(err) };
  }
}

function executarConsultaBigQuerySegura(sqlQuery) {
  var maxTentativas = 3;
  for (var tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      var token = getServiceAccountAccessToken();
      var url = "https://bigquery.googleapis.com/bigquery/v2/projects/" + PROJECT_ID + "/queries";
      
      var options = {
        method: "post",
        contentType: "application/json",
        headers: { "Authorization": "Bearer " + token },
        payload: JSON.stringify({ query: sqlQuery, useLegacySql: false, maxResults: 100000 }),
        muteHttpExceptions: true
      };
      
      var response = UrlFetchApp.fetch(url, options);
      var statusCode = response.getResponseCode();
      var responseText = response.getContentText();

      if ((statusCode === 502 || statusCode === 503 || statusCode === 504) && tentativa < maxTentativas) {
        console.warn("Aviso: BigQuery retornou HTTP " + statusCode + " na tentativa " + tentativa + ". Aguardando retry...");
        Utilities.sleep(1200 * tentativa);
        continue;
      }

      var result = JSON.parse(responseText);
      if (result.error) {
        throw new Error("Erro de comunicação com o banco de dados: " + result.error.message);
      }

      var allRows = result.rows || [];
      var pageToken = result.pageToken;
      var jobId = (result.jobReference && result.jobReference.jobId) ? result.jobReference.jobId : null;
      var jobLoc = (result.jobReference && result.jobReference.location) ? result.jobReference.location : null;

      // Se houver páginas adicionais, itera para buscar todas as linhas sem corte
      while (pageToken && jobId) {
        var pageUrl = "https://bigquery.googleapis.com/bigquery/v2/projects/" + PROJECT_ID + "/queries/" + jobId + "?pageToken=" + pageToken + "&maxResults=100000" + (jobLoc ? "&location=" + encodeURIComponent(jobLoc) : "");
        var pageRes = UrlFetchApp.fetch(pageUrl, {
          method: "get",
          headers: { "Authorization": "Bearer " + token },
          muteHttpExceptions: true
        });
        if (pageRes.getResponseCode() === 200) {
          var pageData = JSON.parse(pageRes.getContentText());
          if (pageData.rows && pageData.rows.length > 0) {
            allRows = allRows.concat(pageData.rows);
          }
          pageToken = pageData.pageToken;
        } else {
          break;
        }
      }

      return {
        rows: allRows,
        schema: result.schema || {},
        jobComplete: result.jobComplete,
        jobReference: result.jobReference || null
      };
    } catch (err) {
      if (tentativa === maxTentativas) {
        throw new Error("Erro de comunicação com o banco de dados: " + err.message);
      }
      console.warn("Retentando consulta BigQuery devido ao erro (tentativa " + tentativa + "): " + err.message);
      Utilities.sleep(1200 * tentativa);
    }
  }
}

function getServiceAccountAccessToken() {
  var cache = CacheService.getScriptCache();
  var cachedToken = cache.get("BQ_SA_ACCESS_TOKEN");
  if (cachedToken) {
    return cachedToken;
  }

  var scriptProps = PropertiesService.getScriptProperties();
  var clientEmail = scriptProps.getProperty('SA_EMAIL');
  var privateKey = scriptProps.getProperty('SA_KEY');
  
  if (!clientEmail || !privateKey) {
    throw new Error("Credenciais da Service Account não configuradas nas Propriedades do Script.");
  }
  
  // Normaliza a chave privada substituindo literais "\n" por quebras reais e limpando espaços
  var formattedKey = privateKey.trim();
  if (formattedKey.indexOf("\\n") !== -1) {
    formattedKey = formattedKey.replace(/\\n/g, "\n");
  }
  
  var header = { alg: "RS256", typ: "JWT" };
  var now = Math.floor(Date.now() / 1000);
  var claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/bigquery",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  
  var stringToSign = Utilities.base64EncodeWebSafe(JSON.stringify(header)) + "." + 
                     Utilities.base64EncodeWebSafe(JSON.stringify(claimSet));
  
  var signature = Utilities.computeRsaSha256Signature(stringToSign, formattedKey);
  var signedJwt = stringToSign + "." + Utilities.base64EncodeWebSafe(signature);
  
  var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt
    },
    muteHttpExceptions: true
  });
  
  var result = JSON.parse(response.getContentText());
  if (result.error) {
    throw new Error("Falha no token da Service Account: " + result.error_description);
  }

  if (result.access_token) {
    try {
      cache.put("BQ_SA_ACCESS_TOKEN", result.access_token, 3000); // 50 minutos de cache
    } catch (eCache) {}
  }

  return result.access_token;
}

function executarEscritaBigQuerySegura(sqlQuery) {
  var maxTentativas = 3;
  for (var tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      var token = getServiceAccountAccessToken();
      var url = "https://bigquery.googleapis.com/bigquery/v2/projects/" + PROJECT_ID + "/queries";
      
      var options = {
        method: "post",
        contentType: "application/json",
        headers: { "Authorization": "Bearer " + token },
        payload: JSON.stringify({ query: sqlQuery, useLegacySql: false }),
        muteHttpExceptions: true
      };
      
      var response = UrlFetchApp.fetch(url, options);
      var statusCode = response.getResponseCode();
      var responseText = response.getContentText();

      if ((statusCode === 502 || statusCode === 503 || statusCode === 504) && tentativa < maxTentativas) {
        console.warn("Aviso: BigQuery retornou HTTP " + statusCode + " na gravação (tentativa " + tentativa + "). Aguardando retry...");
        Utilities.sleep(1200 * tentativa);
        continue;
      }

      var result = JSON.parse(responseText);
      if (result.error) {
        throw new Error("Erro de gravação no banco de dados: " + result.error.message);
      }
      return {
        rows: result.rows || [],
        schema: result.schema || {},
        jobComplete: result.jobComplete,
        jobReference: result.jobReference || null
      };
    } catch (err) {
      if (tentativa === maxTentativas) {
        throw new Error("Erro de gravação no banco de dados: " + err.message);
      }
      console.warn("Retentando gravação BigQuery devido ao erro (tentativa " + tentativa + "): " + err.message);
      Utilities.sleep(1200 * tentativa);
    }
  }
}

function getItensDisponiveisParaTransferenciaOme(omeUsuario, perfilUsuario) {
  try {
    var ehAdmin = (String(perfilUsuario || "").trim() === "Administrador");
    var omeClean = obterOmePadronizada(omeUsuario).toUpperCase();

    // Se NÃO for Administrador, exige obrigatoriamente uma OME válida
    if (!ehAdmin && (!omeClean || omeClean === "TODAS")) {
      throw new Error("OME do usuário inválida para transferência.");
    }

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    var sql = "SELECT ITEM, OBJETO, UNIDADE, SUBUNIDADE, SETOR, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, STATUS, N_PATRIMONIO, SEI_COMPRA_RECEBIMENTO, N_SERIE, OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` ";

    // Se houver OME especificada (e não for TODAS), filtra por ela; caso contrário se não for admin filtra pela ome do usuário
    if (omeClean && omeClean !== "TODAS") {
      sql += "WHERE UPPER(TRIM(UNIDADE)) = '" + limparSQL(omeClean) + "' ";
    } else if (!ehAdmin) {
      sql += "WHERE UPPER(TRIM(UNIDADE)) = '" + limparSQL(omeClean) + "' ";
    }

    sql += "ORDER BY UNIDADE ASC, OBJETO ASC, SUBUNIDADE ASC";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];
    var itens = [];

    rows.forEach(function(r) {
      var nSerieVal = (r.f[9] && r.f[9].v && String(r.f[9].v).trim() !== '-' && String(r.f[9].v).trim() !== 'null') ? String(r.f[9].v).trim() : "";
      var obsVal = (r.f[10] && r.f[10].v) ? String(r.f[10].v).trim() : "";
      if (!nSerieVal && obsVal) {
        var mSerie = obsVal.match(/(?:Nº\s*de\s*S[eé]rie|S[eé]rie)[:\s]+([^|\n,;)]+)/i);
        if (mSerie && mSerie[1]) nSerieVal = mSerie[1].trim();
      }

      itens.push({
        item: r.f[0].v || "",
        objeto: r.f[1].v || "",
        unidade: r.f[2].v || "",
        subunidade: r.f[3].v || "",
        setor: r.f[4].v || "",
        local: r.f[5].v || "",
        status: r.f[6].v || "",
        nPatrimonio: r.f[7].v || "",
        seiCompra: r.f[8].v || "",
        nSerie: nSerieVal,
        observacao: obsVal
      });
    });

    return itens;
  } catch (err) {
    throw new Error("Erro ao buscar itens para transferência: " + err.message);
  }
}

function registrarTransferenciaEntreOmes(dados) {
  try {
    var cpfInformado = String(dados.cpfRemetente || "").trim();
    var omeOrigem = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados.omeOrigem || "") : String(dados.omeOrigem || "").trim();
    var omeDestino = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados.omeDestino || "") : String(dados.omeDestino || "").trim();
    var itensIds = dados.itensIds || []; // Array de IDs de itens selecionados para envio
    var numeroBge = String(dados.numeroBge || "").trim();

    if (!cpfInformado || !omeDestino || itensIds.length === 0) {
      throw new Error("Preencha todos os obrigatorios: CPF, OME de destino e selecione ao menos um item.");
    }

    // Valida o CPF do remetente na base de usuários
    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxNome = cabecalho.indexOf("Nome");

    var remetenteValido = null;
    for (var i = 1; i < dadosUsers.length; i++) {
      if (String(dadosUsers[i][idxCpf] || "").trim() === cpfInformado) {
        remetenteValido = String(dadosUsers[i][idxNome] || "Operador OME").trim();
        break;
      }
    }

    if (!remetenteValido) throw new Error("CPF do remetente não encontrado na base de dados de logins.");

    // Grava na planilha RemessasPendentes
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ss.getSheetByName("RemessasPendentes");
    if (!sheetRemessa) {
      sheetRemessa = ss.insertSheet("RemessasPendentes");
      sheetRemessa.appendRow(["ID_Remessa", "Data", "OME_Destino", "Material", "Quantidade", "Status", "Admin_Envio", "Assinatura", "Recebedor_Nome", "Recebedor_CPF", "SEI"]);
    }

    var idRemessa = "TRANSF-" + new Date().getTime();
    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");
    
    // Como podem ser vários itens da árvore, buscamos a descrição deles para o registro do ticket
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var listaSql = itensIds.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
    
    var sqlInfo = "SELECT OBJETO, SEI_COMPRA_RECEBIMENTO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + listaSql + ")";
    var resInfo = executarConsultaBigQuerySegura(sqlInfo);
    var descMaterial = "Lote Misto (" + itensIds.length + " itens)";
    var seiRef = numeroBge ? ("BGE: " + numeroBge) : "TRANSFERENCIA INTER-OME";

    if (resInfo.rows && resInfo.rows.length > 0) {
      descMaterial = resInfo.rows[0].f[0].v || descMaterial;
      if (resInfo.rows[0].f[1].v) seiRef = "SEI: " + resInfo.rows[0].f[1].v + (numeroBge ? " | BGE: " + numeroBge : "");
    }

    // Salvamos os IDs dos itens diretamente na coluna SEI ou em formato serializado para sabermos quais atualizar no aceite
    // Vamos salvar a string com os IDs no formato: "IDS:[id1,id2,id3] | SEI..."
    var referenciaCompleta = "IDS_TRANSF:" + JSON.stringify(itensIds) + " | " + seiRef;

    sheetRemessa.appendRow([
      idRemessa,
      dataHora,
      omeDestino,
      descMaterial,
      itensIds.length,
      "AGUARDANDO",
      omeOrigem,
      cpfInformado,
      "",
      "",
      referenciaCompleta
    ]);

    var itensTxtTransf = itensIds.length <= 10 ? itensIds.join(", ") : (itensIds.slice(0, 10).join(", ") + " e mais " + (itensIds.length - 10) + " itens");
    registrarLogAuditoria(
      "TRANSFERENCIA_OME", 
      "OME " + omeOrigem + " despachou " + itensIds.length + " un(s) do material '" + descMaterial + "' para " + omeDestino + " por " + remetenteValido + ". Código(s) ITEM: [" + itensTxtTransf + "]",
      remetenteValido
    );

    // Registra histórico de movimentação para cada item transferido
    try {
      var eventosTransfOme = [];
      for (var idxO = 0; idxO < itensIds.length; idxO++) {
        eventosTransfOme.push({
          item: itensIds[idxO],
          objeto: descMaterial,
          nPatrimonio: "",
          tipoEvento: "DESPACHO_TRANSFERENCIA",
          origemUnidade: omeOrigem,
          origemLocal: "SEDE",
          destinoUnidade: omeDestino,
          destinoLocal: "SEDE",
          statusAnterior: "-",
          statusNovo: "AGUARDANDO_RECEBIMENTO",
          responsavelNome: remetenteValido,
          responsavelCpf: cpfInformado,
          documentoRef: idRemessa + (numeroBge ? " (BGE: " + numeroBge + ")" : ""),
          observacao: "Despachado para transferência entre OMEs (" + omeOrigem + " -> " + omeDestino + ")"
        });
      }
      registrarHistoricoMovimentacao(eventosTransfOme);
    } catch (eHOme) {
      console.warn("Aviso ao gravar histórico de transferência entre OMEs: " + eHOme.message);
    }

    return { sucesso: true, mensagem: "Transferência registrada com sucesso! Aguardando aceite da OME destino." };
  } catch (err) {
    throw new Error("Erro ao registrar transferência: " + err.message);
  }
}

function registrarRemessaMovimentacaoInterna(dados) {
  try {
    var cpfInformado = String(dados.cpfRemetente || "").trim();
    var omeUser = String(dados.ome || "").trim().toUpperCase();
    var itensIds = dados.itensIds || []; // IDs dos itens sendo remanejados internamente
    var subunidadeDestino = String(dados.subunidadeDestino || "").trim();
    var setorDestino = String(dados.setorDestino || "").trim();
    var localDestino = String(dados.localDestino || "").trim();
    var numeroBge = String(dados.numeroBge || "").trim();

    if (!cpfInformado || itensIds.length === 0 || !subunidadeDestino) {
      throw new Error("Preencha o CPF, selecione ao menos um item e informe a subunidade de destino.");
    }

    // Valida o CPF do remetente
    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxNome = cabecalho.indexOf("Nome");

    var remetenteValido = null;
    for (var i = 1; i < dadosUsers.length; i++) {
      if (String(dadosUsers[i][idxCpf] || "").trim() === cpfInformado) {
        remetenteValido = String(dadosUsers[i][idxNome] || "Operador Interno").trim();
        break;
      }
    }

    if (!remetenteValido) throw new Error("CPF do remetente não encontrado na base de dados.");

    // Busca informações dos itens para o registro
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var listaSql = itensIds.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
    var sqlInfo = "SELECT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + listaSql + ")";
    var resInfo = executarConsultaBigQuerySegura(sqlInfo);
    var descMaterial = "Remanejamento Interno (" + itensIds.length + " itens)";
    if (resInfo.rows && resInfo.rows.length > 0) {
      descMaterial = resInfo.rows[0].f[0].v || descMaterial;
    }

    // Grava na planilha RemessasPendentes com uma marcação especial de destino interno contendo a árvore
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ss.getSheetByName("RemessasPendentes");
    if (!sheetRemessa) {
      sheetRemessa = ss.insertSheet("RemessasPendentes");
      sheetRemessa.appendRow(["ID_Remessa", "Data", "OME_Destino", "Material", "Quantidade", "Status", "Admin_Envio", "Assinatura", "Recebedor_Nome", "Recebedor_CPF", "SEI"]);
    }

    var idRemessa = "INTERN-" + new Date().getTime();
    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");
    
    // Serializa os dados da árvore de destino e os IDs dos itens na coluna SEI/Referência
    var dadosInternosObj = {
      tipo: "MOV_INTERNA",
      subunidade: subunidadeDestino,
      setor: setorDestino || "",
      local: localDestino || "",
      ids: itensIds
    };

    var referenciaCompleta = "INTERNAL_TREE:" + JSON.stringify(dadosInternosObj) + (numeroBge ? " | BGE/Doc: " + numeroBge : "");

    sheetRemessa.appendRow([
      idRemessa,
      dataHora,
      omeUser, // A OME destino é a própria OME do usuário
      descMaterial,
      itensIds.length,
      "AGUARDANDO",
      omeUser,
      cpfInformado,
      "",
      "",
      referenciaCompleta
    ]);

    var itensTxtRemInt = itensIds.length <= 10 ? itensIds.join(", ") : (itensIds.slice(0, 10).join(", ") + " e mais " + (itensIds.length - 10) + " itens");
    registrarLogAuditoria(
      "REM_INTERNA_GERADA", 
      "OME " + omeUser + " iniciou remanejamento interno de " + itensIds.length + " un(s) do material '" + descMaterial + "' para " + subunidadeDestino + " por " + remetenteValido + ". Código(s) ITEM: [" + itensTxtRemInt + "]",
      remetenteValido
    );
    return { sucesso: true, mensagem: "Remessa de movimentação interna gerada com sucesso! Aguardando aceite do setor de destino." };
  } catch (err) {
    throw new Error("Erro ao registrar movimentação interna: " + err.message);
  }
}

function confirmarRecebimentoRemessa(idRemessa, cpfRecebedor, nomeRecebedor, dadosQuantidades) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ss.getSheetByName("RemessasPendentes");
    var dados = sheetRemessa.getDataRange().getValues();
    
    var rowIndex = -1;
    var remessaObj = null;

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0] || "").trim() === idRemessa) {
        rowIndex = i + 1;
        remessaObj = {
          id: dados[i][0],
          omeDestino: String(dados[i][2] || "").trim(),
          material: String(dados[i][3] || "").trim(),
          quantidade: parseInt(dados[i][4], 10) || 0,
          status: String(dados[i][5] || "").trim().toUpperCase(),
          omeOrigem: String(dados[i][6] || "").trim(), // Coluna G: Admin_Envio / OME de envio
          referenciaSei: String(dados[i][10] || "").trim() // Coluna K (SEI / BGE / IDs)
        };
        break;
      }
    }

    if (rowIndex === -1) throw new Error("Remessa não encontrada na base.");
    
    var statusValidos = ["AGUARDANDO", "PENDENTE", "AGUARDANDO_RECEBIMENTO", "AGUARDANDO_LIBERACAO_CINT"];
    if (statusValidos.indexOf(remessaObj.status) === -1) {
      throw new Error("Esta remessa já foi processada ou confirmada anteriormente.");
    }

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var omeDestClean = limparSQL(typeof obterOmePadronizada === 'function' ? obterOmePadronizada(remessaObj.omeDestino) : remessaObj.omeDestino);

    // Extrai a OME de origem do campo Admin_Envio / OME de envio
    var omeOrigemNome = "CINT";
    if (idRemessa.indexOf("TICKET-") === 0) {
      omeOrigemNome = "CINT";
    } else if (remessaObj.omeOrigem) {
      var matchOme = remessaObj.omeOrigem.match(/^(.*?)\s*\(/);
      var extraidoOme = matchOme ? matchOme[1].trim() : remessaObj.omeOrigem.trim();
      omeOrigemNome = (extraidoOme.toUpperCase() === "DLOG") ? "CINT" : extraidoOme;
    }
    var omeOrigemClean = limparSQL(typeof obterOmePadronizada === 'function' ? obterOmePadronizada(omeOrigemNome) : omeOrigemNome);

    var qTotal = parseInt(remessaObj.quantidade, 10) || 0;
    var qEcd = qTotal;
    var qScd = 0;
    var qExtraviado = 0;

    if (dadosQuantidades && typeof dadosQuantidades === 'object') {
      if (dadosQuantidades.qtdEcd !== undefined) qEcd = Math.max(0, parseInt(dadosQuantidades.qtdEcd, 10) || 0);
      if (dadosQuantidades.qtdScd !== undefined) qScd = Math.max(0, parseInt(dadosQuantidades.qtdScd, 10) || 0);
      if ((qEcd + qScd) > qTotal) {
        throw new Error("A soma de ECD e SCD (" + (qEcd + qScd) + ") não pode exceder o total esperado da remessa (" + qTotal + ").");
      }
      qExtraviado = Math.max(0, qTotal - (qEcd + qScd));
    }

    var eventosRecebimento = [];

    // 1. CASO SEJA MOVIMENTAÇÃO INTERNA NA MESMA OME
    if (remessaObj.referenciaSei.indexOf("INTERNAL_TREE:") === 0) {
      var jsonStr = remessaObj.referenciaSei.replace("INTERNAL_TREE:", "").split(" | ")[0];
      var dadosInternos = JSON.parse(jsonStr);
      var idsItens = dadosInternos.ids || [];

      if (idsItens.length === 0) throw new Error("Nenhum ID vinculado a esta remessa interna.");

      var subDest = limparSQL(dadosInternos.subunidade);
      var setDest = dadosInternos.setor ? "'" + limparSQL(dadosInternos.setor) + "'" : "NULL";
      var locDest = dadosInternos.local ? "'" + limparSQL(dadosInternos.local) + "'" : "NULL";
      var localFormatadoInterno = [dadosInternos.subunidade, dadosInternos.setor, dadosInternos.local].filter(Boolean).join(" > ");

      var idsEcd = idsItens.slice(0, qEcd);
      var idsScd = idsItens.slice(qEcd, qEcd + qScd);
      var idsExt = idsItens.slice(qEcd + qScd);

      if (idsEcd.length > 0) {
        var listaSqlEcd = idsEcd.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
        var sqlUpdateEcd = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                           "SUBUNIDADE = '" + subDest + "', " +
                           "SETOR = " + setDest + ", " +
                           "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = " + locDest + ", " +
                           "STATUS = 'ECD' " +
                           "WHERE ITEM IN (" + listaSqlEcd + ")";
        executarConsultaBigQuerySegura(sqlUpdateEcd, true);

        idsEcd.forEach(function(code) {
          eventosRecebimento.push({
            item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "RECEBIMENTO_REMESSA",
            origemUnidade: remessaObj.omeOrigem, origemLocal: "-", destinoUnidade: remessaObj.omeDestino,
            destinoLocal: localFormatadoInterno, statusAnterior: "-", statusNovo: "ECD",
            responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
            observacao: "Recebido em ECD na remessa interna"
          });
        });
      }

      if (idsScd.length > 0) {
        var listaSqlScd = idsScd.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
        var sqlUpdateScd = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                           "SUBUNIDADE = '" + subDest + "', " +
                           "SETOR = " + setDest + ", " +
                           "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = " + locDest + ", " +
                           "STATUS = 'SCD', " +
                           "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Recebido em SCD na remessa interna " + idRemessa + "') " +
                           "WHERE ITEM IN (" + listaSqlScd + ")";
        executarConsultaBigQuerySegura(sqlUpdateScd, true);

        idsScd.forEach(function(code) {
          eventosRecebimento.push({
            item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "RECEBIMENTO_REMESSA",
            origemUnidade: remessaObj.omeOrigem, origemLocal: "-", destinoUnidade: remessaObj.omeDestino,
            destinoLocal: localFormatadoInterno, statusAnterior: "-", statusNovo: "SCD",
            responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
            observacao: "Recebido em SCD na remessa interna"
          });
        });
      }

      if (idsExt.length > 0) {
        var listaSqlExt = idsExt.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
        var sqlUpdateExt = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                           "STATUS = 'EXTRAVIADO', " +
                           "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | EXTRAVIADO: Item não chegou ao destino (" + subDest + ") na remessa interna " + idRemessa + "') " +
                           "WHERE ITEM IN (" + listaSqlExt + ")";
        executarConsultaBigQuerySegura(sqlUpdateExt, true);

        idsExt.forEach(function(code) {
          eventosRecebimento.push({
            item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "EXTRAVIO",
            origemUnidade: remessaObj.omeOrigem, origemLocal: "-", destinoUnidade: remessaObj.omeOrigem,
            destinoLocal: "-", statusAnterior: "-", statusNovo: "EXTRAVIADO",
            responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
            observacao: "EXTRAVIADO: Item não chegou ao destino na remessa interna " + idRemessa
          });
        });
      }

    } 
    // 2. CASO SEJA TRANSFERÊNCIA ENTRE OMEs (Inter-unidades) OU TICKET COM ITENS VINCULADOS
    else if (remessaObj.referenciaSei.indexOf("IDS_TRANSF:") === 0 || remessaObj.referenciaSei.indexOf("IDS_TICKET:") === 0) {
      var idsTransfMatch = remessaObj.referenciaSei.match(/(?:IDS_TRANSF|IDS_TICKET):(.*?)\s*\|/);
      if (idsTransfMatch) {
        var idsTransf = JSON.parse(idsTransfMatch[1]);

        // Se a OME de origem não estiver preenchida na planilha, busca no BigQuery dos itens
        if (!omeOrigemClean && idsTransf.length > 0) {
          try {
            var rOrig = executarConsultaBigQuerySegura("SELECT UNIDADE FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM = '" + limparSQL(idsTransf[0]) + "' LIMIT 1");
            if (rOrig && rOrig.rows && rOrig.rows[0] && rOrig.rows[0].f && rOrig.rows[0].f[0].v) {
              omeOrigemClean = limparSQL(String(rOrig.rows[0].f[0].v).trim());
              omeOrigemNome = omeOrigemClean;
            }
          } catch (eOrig) {}
        }

        if (idRemessa.indexOf("TICKET-") === 0 || omeOrigemClean.toUpperCase() === "DLOG") {
          omeOrigemClean = "CINT";
          omeOrigemNome = "CINT";
        }

        var idsEcdT = idsTransf.slice(0, qEcd);
        var idsScdT = idsTransf.slice(qEcd, qEcd + qScd);
        var idsExtT = idsTransf.slice(qEcd + qScd);

        if (idsEcdT.length > 0) {
          var listaSqlEcdT = idsEcdT.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
          var sqlUpdateTransfEcd = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                                  "UNIDADE = '" + omeDestClean + "', SUBUNIDADE = 'SEDE', SETOR = NULL, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                                  "STATUS = 'ECD' " +
                                  "WHERE ITEM IN (" + listaSqlEcdT + ")";
          executarConsultaBigQuerySegura(sqlUpdateTransfEcd, true);

          idsEcdT.forEach(function(code) {
            eventosRecebimento.push({
              item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "RECEBIMENTO_REMESSA",
              origemUnidade: (omeOrigemClean || "CINT"), origemLocal: "SEDE", destinoUnidade: omeDestClean,
              destinoLocal: "SEDE", statusAnterior: "-", statusNovo: "ECD",
              responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
              observacao: "Recebimento confirmado em bom estado (ECD) na OME " + omeDestClean
            });
          });
        }

        if (idsScdT.length > 0) {
          var listaSqlScdT = idsScdT.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
          var sqlUpdateTransfScd = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                                  "UNIDADE = '" + omeDestClean + "', SUBUNIDADE = 'SEDE', SETOR = NULL, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                                  "STATUS = 'SCD', " +
                                  "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Recebido em SCD na remessa " + idRemessa + "') " +
                                  "WHERE ITEM IN (" + listaSqlScdT + ")";
          executarConsultaBigQuerySegura(sqlUpdateTransfScd, true);

          idsScdT.forEach(function(code) {
            eventosRecebimento.push({
              item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "RECEBIMENTO_REMESSA",
              origemUnidade: (omeOrigemClean || "CINT"), origemLocal: "SEDE", destinoUnidade: omeDestClean,
              destinoLocal: "SEDE", statusAnterior: "-", statusNovo: "SCD",
              responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
              observacao: "Recebimento confirmado sem condição de uso (SCD) na OME " + omeDestClean
            });
          });
        }

        // REGRA CRÍTICA: MATERIAL EXTRAVIADO PERMANECE NO ESTOQUE DA OME REMETENTE (CINT para tickets)
        if (idsExtT.length > 0) {
          var listaSqlExtT = idsExtT.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
          var sqlUpdateTransfExt = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                                  "UNIDADE = '" + (omeOrigemClean || "CINT") + "', " +
                                  "SUBUNIDADE = 'SEDE', " +
                                  "SETOR = NULL, " +
                                  "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                                  "STATUS = 'EXTRAVIADO', " +
                                  "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | EXTRAVIADO: Não recebido no destino (" + omeDestClean + ") na remessa " + idRemessa + ". Permanece registrado sob responsabilidade da OME remetente (" + (omeOrigemClean || "CINT") + ").') " +
                                  "WHERE ITEM IN (" + listaSqlExtT + ")";
          executarConsultaBigQuerySegura(sqlUpdateTransfExt, true);

          idsExtT.forEach(function(code) {
            eventosRecebimento.push({
              item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "EXTRAVIO",
              origemUnidade: (omeOrigemClean || "CINT"), origemLocal: "SEDE", destinoUnidade: (omeOrigemClean || "CINT"),
              destinoLocal: "SEDE", statusAnterior: "-", statusNovo: "EXTRAVIADO",
              responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
              observacao: "EXTRAVIADO: Não recebido na OME " + omeDestClean + " (remessa " + idRemessa + "). Permanece sob responsabilidade da OME remetente (" + (omeOrigemClean || "CINT") + ")."
            });
          });
        }
      }
    } 
    // 3. CASO SEJA DISTRIBUIÇÃO VINDA DO CINT/DPL (Fallback legado para remessas sem IDs serializados)
    else {
      var materialClean = limparSQL(remessaObj.material);
      var totalNecessario = qTotal;
      
      // Extrai o número SEI puro da referência
      var seiPuro = remessaObj.referenciaSei;
      if (seiPuro.indexOf("SEI:") !== -1) {
        seiPuro = seiPuro.split("SEI:")[1].split("|")[0].trim();
      } else if (seiPuro.indexOf("|") !== -1) {
        seiPuro = seiPuro.split("|")[0].trim();
      }

      // Mapeia itens já comprometidos em outras remessas abertas
      var idsOutrasRemessas = [];
      if (sheetRemessa && sheetRemessa.getLastRow() > 1) {
        var dRemTotais = sheetRemessa.getDataRange().getValues();
        var stPend = ["AGUARDANDO", "PENDENTE", "AGUARDANDO_RECEBIMENTO", "AGUARDANDO_LIBERACAO_CINT"];
        for (var rk = 1; rk < dRemTotais.length; rk++) {
          var idRRow = String(dRemTotais[rk][0] || "").trim();
          var stRRow = String(dRemTotais[rk][5] || "").trim().toUpperCase();
          if (stPend.indexOf(stRRow) !== -1 && idRRow !== idRemessa) {
            var refKRow = String(dRemTotais[rk][10] || "").trim();
            var mIds = refKRow.match(/(?:IDS_TRANSF|IDS_TICKET):(.*?)\s*\|/);
            if (mIds) {
              try {
                var arrIds = JSON.parse(mIds[1]);
                arrIds.forEach(function(code) { idsOutrasRemessas.push("'" + limparSQL(code) + "'"); });
              } catch(e) {}
            }
          }
        }
      }
      var condicaoExcluirComprometidos = (idsOutrasRemessas.length > 0) ? " AND ITEM NOT IN (" + idsOutrasRemessas.join(",") + ") " : "";

      // Procura os IDs físicos reais parados na SEDE do CINT correspondentes ao lote
      var sqlBuscaCint = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                         "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                         "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                         "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "')) " +
                         "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) IN ('ECD', 'SCD', 'DISPONIVEL')) " +
                         "AND UPPER(TRIM(STATUS)) != 'EXTRAVIADO' " +
                         condicaoExcluirComprometidos;

      if (seiPuro && seiPuro !== "N/I") {
        sqlBuscaCint += "AND UPPER(TRIM(SEI_COMPRA_RECEBIMENTO)) LIKE UPPER('%" + limparSQL(seiPuro) + "%') ";
      }
      sqlBuscaCint += "ORDER BY ITEM ASC LIMIT " + totalNecessario;

      var resBusca = executarConsultaBigQuerySegura(sqlBuscaCint);
      var rows = resBusca.rows || [];

      var idsCintParaMover = [];
      if (rows.length > 0) {
        rows.forEach(function(r) {
          if (r.f && r.f[0] && r.f[0].v) {
            idsCintParaMover.push(String(r.f[0].v));
          }
        });
      } else {
        // Fallback genérico caso o match exato do SEI traga vazio
        var sqlBuscaCintFallback = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                                   "WHERE UPPER(TRIM(UNIDADE)) = 'CINT' " +
                                   "AND UPPER(TRIM(SUBUNIDADE)) = 'SEDE' " +
                                   "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + materialClean + "')) " +
                                   "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) IN ('ECD', 'SCD', 'DISPONIVEL')) " +
                                   "AND UPPER(TRIM(STATUS)) != 'EXTRAVIADO' " +
                                   condicaoExcluirComprometidos +
                                   "ORDER BY ITEM ASC LIMIT " + totalNecessario;
        var resBuscaFb = executarConsultaBigQuerySegura(sqlBuscaCintFallback);
        if (resBuscaFb && resBuscaFb.rows) {
          resBuscaFb.rows.forEach(function(r) {
            if (r.f && r.f[0] && r.f[0].v) {
              idsCintParaMover.push(String(r.f[0].v));
            }
          });
        }
      }

      if (idsCintParaMover.length > 0) {
        var idsEcdC = idsCintParaMover.slice(0, qEcd);
        var idsScdC = idsCintParaMover.slice(qEcd, qEcd + qScd);
        var idsExtC = idsCintParaMover.slice(qEcd + qScd);

        if (idsEcdC.length > 0) {
          var listaSqlEcdC = idsEcdC.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
          var sqlUpdateCintEcd = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                                 "UNIDADE = '" + omeDestClean + "', SUBUNIDADE = 'SEDE', SETOR = NULL, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                                 "STATUS = 'ECD' " +
                                 "WHERE ITEM IN (" + listaSqlEcdC + ")";
          executarConsultaBigQuerySegura(sqlUpdateCintEcd, true);

          idsEcdC.forEach(function(code) {
            eventosRecebimento.push({
              item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "RECEBIMENTO_REMESSA",
              origemUnidade: "CINT", origemLocal: "SEDE", destinoUnidade: omeDestClean,
              destinoLocal: "SEDE", statusAnterior: "-", statusNovo: "ECD",
              responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
              observacao: "Recebimento de distribuição CINT em bom estado (ECD)"
            });
          });
        }

        if (idsScdC.length > 0) {
          var listaSqlScdC = idsScdC.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
          var sqlUpdateCintScd = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                                 "UNIDADE = '" + omeDestClean + "', SUBUNIDADE = 'SEDE', SETOR = NULL, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                                 "STATUS = 'SCD', " +
                                 "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Recebido em SCD na remessa " + idRemessa + "') " +
                                 "WHERE ITEM IN (" + listaSqlScdC + ")";
          executarConsultaBigQuerySegura(sqlUpdateCintScd, true);

          idsScdC.forEach(function(code) {
            eventosRecebimento.push({
              item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "RECEBIMENTO_REMESSA",
              origemUnidade: "CINT", origemLocal: "SEDE", destinoUnidade: omeDestClean,
              destinoLocal: "SEDE", statusAnterior: "-", statusNovo: "SCD",
              responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
              observacao: "Recebimento de distribuição CINT sem condição de uso (SCD)"
            });
          });
        }

        // REGRA CRÍTICA: MATERIAL EXTRAVIADO DA DISTRIBUIÇÃO RETORNA/PERMANECE NO ESTOQUE CINT
        if (idsExtC.length > 0) {
          var listaSqlExtC = idsExtC.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
          var sqlUpdateCintExt = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                                 "UNIDADE = 'CINT', " +
                                 "SUBUNIDADE = 'SEDE', " +
                                 "SETOR = NULL, " +
                                 "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                                 "STATUS = 'EXTRAVIADO', " +
                                 "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | EXTRAVIADO: Não recebido no destino (" + omeDestClean + ") na remessa " + idRemessa + ". Permanece registrado no estoque de origem (CINT).') " +
                                 "WHERE ITEM IN (" + listaSqlExtC + ")";
          executarConsultaBigQuerySegura(sqlUpdateCintExt, true);

          idsExtC.forEach(function(code) {
            eventosRecebimento.push({
              item: code, objeto: remessaObj.material, nPatrimonio: "", tipoEvento: "EXTRAVIO",
              origemUnidade: "CINT", origemLocal: "SEDE", destinoUnidade: "CINT",
              destinoLocal: "SEDE", statusAnterior: "-", statusNovo: "EXTRAVIADO",
              responsavelNome: nomeRecebedor, responsavelCpf: cpfRecebedor, documentoRef: idRemessa,
              observacao: "EXTRAVIADO: Não recebido no destino (" + omeDestClean + "). Permanece no estoque CINT."
            });
          });
        }
      }
    }

    // Registra lote de histórico de movimentação para todos os itens processados na remessa
    if (eventosRecebimento.length > 0) {
      try {
        registrarHistoricoMovimentacao(eventosRecebimento);
      } catch (eHRec) {
        console.warn("Aviso ao registrar histórico de recebimento de remessa: " + eHRec.message);
      }
    }

    // Atualiza o status da remessa na planilha auxiliar para CONFIRMADO (ou com extravio)
    var statusGravacao = qExtraviado > 0 ? "CONFIRMADO (EXTRAVIO)" : "CONFIRMADO";
    sheetRemessa.getRange(rowIndex, 6).setValue(statusGravacao);
    sheetRemessa.getRange(rowIndex, 9).setValue(nomeRecebedor);
    sheetRemessa.getRange(rowIndex, 10).setValue(cpfRecebedor);

    // Sincronização estrita com a planilha #DIST:
    // A quantidade na #DIST só é alterada a partir do momento em que a OME Destino confirma o recebimento assinando a remessa
    try {
      var qtdConfirmadaDist = (qEcd + qScd > 0) ? (qEcd + qScd) : qTotal;
      sincronizarConfirmacaoRecebimentoDist({
        idRemessa: idRemessa,
        omeDestino: remessaObj.omeDestino,
        omeOrigem: remessaObj.omeOrigem,
        material: remessaObj.material,
        quantidadeTotal: qTotal,
        quantidadeConfirmada: qtdConfirmadaDist,
        referenciaSei: remessaObj.referenciaSei,
        nomeRecebedor: nomeRecebedor,
        cpfRecebedor: cpfRecebedor
      });
    } catch (eDistConf) {
      console.warn("Aviso ao sincronizar confirmação de remessa com #DIST: " + eDistConf.message);
    }

    var itensRec = eventosRecebimento.map(function(ev) { return ev.item; });
    var itensTxtRec = itensRec.length <= 10 ? itensRec.join(", ") : (itensRec.slice(0, 10).join(", ") + " e mais " + (itensRec.length - 10) + " itens");
    registrarLogAuditoria(
      "REMESSA_CONFIRMADA", 
      "Remessa " + idRemessa + " (" + remessaObj.material + ") confirmada por " + nomeRecebedor + " (ECD: " + qEcd + ", SCD: " + qScd + ", EXTRAVIADO: " + qExtraviado + "). Código(s) ITEM: [" + (itensTxtRec || "Conforme carga") + "]",
      nomeRecebedor
    );

    var msgRetorno = qExtraviado > 0
      ? "Recebimento confirmado! " + (qEcd + qScd) + " item(ns) transferido(s) para sua OME (" + qEcd + " ECD, " + qScd + " SCD) e " + qExtraviado + " item(ns) registrado(s) como EXTRAVIADO na OME remetente (" + omeOrigemNome + ")."
      : "Recebimento confirmado com sucesso! Todos os " + qTotal + " itens foram transferidos para o estoque da sua OME (" + qEcd + " ECD, " + qScd + " SCD).";

    return msgRetorno;
  } catch (err) {
    throw new Error("Erro ao confirmar recebimento: " + err.message);
  }
}

function corrigirUnidadeItensExtraviadosRemessas_() {
  try {
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    // 1. REGRA CRÍTICA: Material extraviado de distribuição sai de CINT e nunca deve constar em DLOG.
    // Corrige diretamente qualquer registro extraviado que tenha ficado atribuído a DLOG.
    try {
      var sqlFixDlog = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                       "UNIDADE = 'CINT', " +
                       "SUBUNIDADE = 'SEDE', SETOR = NULL, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                       "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Ajuste: Vinculado ao estoque CINT conforme regra de extravio de distribuição.') " +
                       "WHERE STATUS = 'EXTRAVIADO' AND UPPER(TRIM(UNIDADE)) = 'DLOG'";
      executarConsultaBigQuerySegura(sqlFixDlog, true);
    } catch (eDlog) {
      console.warn("Aviso ao corrigir itens extraviados DLOG: " + eDlog.message);
    }

    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetRemessa = ss.getSheetByName("RemessasPendentes");
    if (!sheetRemessa || sheetRemessa.getLastRow() <= 1) return;

    var dados = sheetRemessa.getDataRange().getValues();

    // Mapeia remessas por ID garantindo que tickets apontem sempre para CINT
    var mapRemessas = {};
    for (var i = 1; i < dados.length; i++) {
      var idR = String(dados[i][0] || "").trim();
      var dest = String(dados[i][2] || "").trim();
      var adminEnv = String(dados[i][6] || "").trim();
      var orig = "CINT";
      if (idR.indexOf("TICKET-") === 0) {
        orig = "CINT";
      } else if (adminEnv) {
        var m = adminEnv.match(/^(.*?)\s*\(/);
        var extraido = m ? m[1].trim() : adminEnv.trim();
        orig = (extraido.toUpperCase() === "DLOG") ? "CINT" : extraido;
      }
      mapRemessas[idR] = { id: idR, destino: dest, origem: orig };
    }

    // Busca itens no BigQuery que estão como EXTRAVIADO com referência a remessas
    var sqlBusca = "SELECT ITEM, UNIDADE, OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material " +
                   "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                   "WHERE STATUS = 'EXTRAVIADO' " +
                   "AND (OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material LIKE '%na transferência TRANSF-%' " +
                   "     OR OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material LIKE '%na remessa %' " +
                   "     OR OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material LIKE '%EXTRAVIADO%')";
    
    var res = executarConsultaBigQuerySegura(sqlBusca);
    var rows = res.rows || [];
    if (rows.length === 0) return;

    // Para cada item extraviado cujo UNIDADE seja o Destino (ou DLOG), move de volta para a Origem (CINT para tickets)
    for (var j = 0; j < rows.length; j++) {
      var itemCode = rows[j].f[0].v || "";
      var unidadeAtual = String(rows[j].f[1].v || "").trim();
      var obs = String(rows[j].f[2].v || "").trim();

      // Procura ID da remessa na observação
      var mId = obs.match(/(TRANSF-\d+|TICKET-[A-Za-z0-9_-]+|INTERN-\d+)/);
      if (mId && mapRemessas[mId[1]]) {
        var infoRem = mapRemessas[mId[1]];
        var omeDestinoNorm = infoRem.destino.toUpperCase();
        var omeOrigemNorm = infoRem.origem.toUpperCase();

        if (unidadeAtual.toUpperCase() === omeDestinoNorm || (infoRem.origem.toUpperCase() === "CINT" && unidadeAtual.toUpperCase() === "DLOG")) {
          var sqlFix = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                       "UNIDADE = '" + limparSQL(typeof obterOmePadronizada === 'function' ? obterOmePadronizada(infoRem.origem) : infoRem.origem) + "', " +
                       "SUBUNIDADE = 'SEDE', SETOR = NULL, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                       "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Ajuste: Vinculado à OME de origem (" + limparSQL(infoRem.origem) + ") conforme regra de extravio.') " +
                       "WHERE ITEM = '" + limparSQL(itemCode) + "'";
          executarConsultaBigQuerySegura(sqlFix, true);
          console.log("corrigirUnidadeItensExtraviadosRemessas_: Item " + itemCode + " corrigido de " + unidadeAtual + " para " + infoRem.origem);
        }
      }
    }
  } catch (e) {
    console.warn("Aviso ao corrigir itens extraviados: " + e.message);
  }
}

function getItensIdsPorLocalEOGenerico(dados) {
  try {
    var unidade = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados.unidade || "").toUpperCase() : String(dados.unidade || "").trim().toUpperCase();
    var material = String(dados.material || "").trim();
    var localOrigem = String(dados.localOrigem || "").trim();
    var quantidade = parseInt(dados.quantidade, 10) || 0;

    if (!unidade || !material || quantidade <= 0) {
      throw new Error("Parâmetros inválidos para buscar IDs dos itens.");
    }

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    // O localOrigem na árvore costuma vir formatado como "Subunidade > Setor > Local" ou similar.
    // Vamos quebrar para filtrar com precisão ou buscar pelo texto correspondente.
    var partesLoc = localOrigem.split(">").map(function(p) { return p.trim(); });
    var subunidadeOrigem = partesLoc[0] || "";
    var setorOrigem = partesLoc[1] || "";
    var localEspecificoOrigem = partesLoc[2] || "";

    var sql = "SELECT ITEM FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) = '" + limparSQL(unidade) + "' " +
              "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + limparSQL(material) + "'))";

    if (subunidadeOrigem) {
      sql += " AND UPPER(TRIM(SUBUNIDADE)) = UPPER(TRIM('" + limparSQL(subunidadeOrigem) + "'))";
    }
    if (setorOrigem && setorOrigem !== "SEDE") {
      sql += " AND UPPER(TRIM(SETOR)) = UPPER(TRIM('" + limparSQL(setorOrigem) + "'))";
    }
    if (localEspecificoOrigem) {
      sql += " AND UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = UPPER(TRIM('" + limparSQL(localEspecificoOrigem) + "'))";
    }

    sql += " LIMIT " + quantidade;

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];
    var ids = [];

    rows.forEach(function(r) {
      if (r.f[0].v) {
        ids.push(String(r.f[0].v));
      }
    });

    return ids;
  } catch (err) {
    throw new Error("Erro ao buscar IDs dos itens por local: " + err.message);
  }
}

function getItensFisicosDoLocalArvore(dados) {
  try {
    var unidade = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados.unidade || "").toUpperCase() : String(dados.unidade || "").trim().toUpperCase();
    var material = String(dados.material || "").trim();
    var localOrigem = String(dados.localOrigem || "").trim();
    var idLocalOrigem = dados.idLocalOrigem ? String(dados.idLocalOrigem).trim() : "";
    var idsConhecidos = Array.isArray(dados.idsConhecidos) ? dados.idsConhecidos : [];

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    // ESTRATÉGIA 1: Se já temos a lista de IDs conhecidos vinda da árvore do frontend (cacheMateriaisAtrelados)
    if (idsConhecidos.length > 0) {
      var idsFiltrados = idsConhecidos.filter(function(id) { return !!id; });
      if (idsFiltrados.length > 0) {
        var idsSql = idsFiltrados.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
        var sqlIds = "SELECT ITEM, STATUS FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                     "WHERE ITEM IN (" + idsSql + ") " +
                     "ORDER BY ITEM ASC";
        var resIds = executarConsultaBigQuerySegura(sqlIds);
        var rowsIds = resIds.rows || [];
        var listaIds = [];
        rowsIds.forEach(function(r) {
          listaIds.push({
            item: r.f[0].v || "",
            status: r.f[1].v || ""
          });
        });
        if (listaIds.length > 0) {
          return listaIds;
        }
      }
    }

    // ESTRATÉGIA 2: Resolver a hierarquia pelo idLocalOrigem se disponível
    var subunidadeOrigem = "";
    var setorOrigem = "";
    var localEspecificoOrigem = "";

    if (idLocalOrigem && unidade) {
      try {
        var hierarquia = resolverCaminhoCompletoLocal(idLocalOrigem, unidade);
        if (hierarquia) {
          subunidadeOrigem = hierarquia.subunidade || "";
          setorOrigem = hierarquia.setor || "";
          localEspecificoOrigem = hierarquia.local || "";
        }
      } catch (eH) {
        console.warn("Aviso ao resolver hierarquia por idLocalOrigem: " + eH.message);
      }
    }

    // ESTRATÉGIA 3: Se não resolveu pela árvore por ID, usa a string localOrigem
    if (!subunidadeOrigem && localOrigem) {
      if (localOrigem.indexOf(">") !== -1) {
        var partesLoc = localOrigem.split(">").map(function(p) { return p.trim(); });
        subunidadeOrigem = partesLoc[0] || "";
        setorOrigem = partesLoc[1] || "";
        localEspecificoOrigem = partesLoc[2] || "";
      } else {
        // Se veio apenas um nome simples (ex: "ABT"), consulta onde SUBUNIDADE = localOrigem OU SETOR = localOrigem OU LOCAL = localOrigem
        var sqlSimples = "SELECT ITEM, STATUS FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                         "WHERE UPPER(TRIM(UNIDADE)) = '" + limparSQL(unidade) + "' " +
                         "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + limparSQL(material) + "')) " +
                         "AND (UPPER(TRIM(SUBUNIDADE)) = UPPER(TRIM('" + limparSQL(localOrigem) + "')) " +
                         "     OR UPPER(TRIM(SETOR)) = UPPER(TRIM('" + limparSQL(localOrigem) + "')) " +
                         "     OR UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = UPPER(TRIM('" + limparSQL(localOrigem) + "')))";
        var resSimples = executarConsultaBigQuerySegura(sqlSimples);
        var rowsSimples = resSimples.rows || [];
        var listaSimples = [];
        rowsSimples.forEach(function(r) {
          listaSimples.push({
            item: r.f[0].v || "",
            status: r.f[1].v || ""
          });
        });
        if (listaSimples.length > 0) {
          return listaSimples;
        }
      }
    }

    // ESTRATÉGIA 4: Consulta padrão composta
    var sql = "SELECT ITEM, STATUS FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE UPPER(TRIM(UNIDADE)) = '" + limparSQL(unidade) + "' " +
              "AND UPPER(TRIM(OBJETO)) = UPPER(TRIM('" + limparSQL(material) + "'))";

    if (subunidadeOrigem) {
      sql += " AND UPPER(TRIM(SUBUNIDADE)) = UPPER(TRIM('" + limparSQL(subunidadeOrigem) + "'))";
    }
    if (setorOrigem && setorOrigem !== "SEDE") {
      sql += " AND UPPER(TRIM(SETOR)) = UPPER(TRIM('" + limparSQL(setorOrigem) + "'))";
    }
    if (localEspecificoOrigem) {
      sql += " AND UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = UPPER(TRIM('" + limparSQL(localEspecificoOrigem) + "'))";
    }

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];
    var lista = [];

    rows.forEach(function(r) {
      lista.push({
        item: r.f[0].v || "",
        status: r.f[1].v || ""
      });
    });

    return lista;
  } catch (err) {
    throw new Error("Erro ao buscar itens físicos do local: " + err.message);
  }
}

// Função auxiliar para subir os pais (idPai) e descobrir a hierarquia exata (Subunidade > Setor > Local)
function resolverCaminhoCompletoLocal(idLocalDestino, unidadeOme) {
  try {
    // Busca todos os locais da OME na aba/planilha de árvore de locais
    var locais = getArvoreLocais(unidadeOme); 
    var mapaLocais = {};
    (locais || []).forEach(function(l) { mapaLocais[String(l.id)] = l; });

    var atual = mapaLocais[String(idLocalDestino)];
    if (!atual) return { subunidade: "SEDE", setor: "", local: "" };

    var caminho = [];
    var ref = atual;
    
    // Sobe a árvore guardando os nomes do mais fundo até a raiz
    while (ref) {
      caminho.unshift(ref.nome);
      if (!ref.idPai || ref.idPai === "") break;
      ref = mapaLocais[String(ref.idPai)];
    }

    // O primeiro elemento do array 'caminho' é obrigatoriamente a Subunidade (Raiz)
    var subunidadeRaiz = caminho.length > 0 ? caminho[0] : "SEDE";
    var setorFilho = caminho.length > 1 ? caminho[1] : "";
    var localNeto = caminho.length > 2 ? caminho.slice(2).join(" > ") : "";

    return {
      subunidade: subunidadeRaiz,
      setor: setorFilho,
      local: localNeto
    };
  } catch (err) {
    console.error("Erro ao resolver hierarquia do local: " + err.message);
    return { subunidade: "SEDE", setor: "", local: "" };
  }
}

function transferirItensDiretoPorIds(dados) {
  try {
    var caminhoTexto = String(dados.caminhoTexto || "").trim();
    var itensIds = dados.itensIds || [];
    var idDestino = dados.idDestino ? String(dados.idDestino).trim() : "";
    var unidade = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(dados.unidade || "").toUpperCase() : String(dados.unidade || "").trim().toUpperCase();

    if (itensIds.length === 0) return "Nenhum item selecionado.";
    if (!caminhoTexto && !idDestino) throw new Error("Caminho de destino não informado.");

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    var novaSubunidade = "SEDE";
    var novoSetor = "";
    var novoLocal = "";

    // 1. Tenta resolver via hierarquia cadastrada na árvore
    if (idDestino && unidade) {
      try {
        var hierarquia = resolverCaminhoCompletoLocal(idDestino, unidade);
        if (hierarquia && hierarquia.subunidade) {
          novaSubunidade = hierarquia.subunidade;
          novoSetor = hierarquia.setor || "";
          novoLocal = hierarquia.local || "";
        }
      } catch (eH) {
        console.warn("Aviso ao resolver hierarquia de destino: " + eH.message);
      }
    }

    // 2. Se não resolveu pela árvore, interpreta o caminho textual formatado por ">"
    if (novaSubunidade === "SEDE" && !novoSetor && caminhoTexto) {
      var partes = caminhoTexto.split(">").map(function(p) { return p.trim(); });
      novaSubunidade = partes[0] ? partes[0] : "SEDE";
      novoSetor = partes[1] ? partes[1] : "";
      novoLocal = partes.length > 2 ? partes.slice(2).join(" > ") : "";
    }

    var idsSqlString = itensIds.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");

    // ATUALIZAÇÃO NO BIGQUERY (Zera campos vazios como NULL)
    var sqlUpdate = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                    "SET SUBUNIDADE = '" + limparSQL(novaSubunidade) + "', " +
                    "    SETOR = " + (novoSetor ? "'" + limparSQL(novoSetor) + "'" : "NULL") + ", " +
                    "    LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = " + (novoLocal ? "'" + limparSQL(novoLocal) + "'" : "NULL") + " " +
                    "WHERE ITEM IN (" + idsSqlString + ")";

    executarConsultaBigQuerySegura(sqlUpdate, true);

    // Registra histórico de remanejamento interno de local
    try {
      var emailUserDir = "";
      try { emailUserDir = Session.getActiveUser().getEmail(); } catch(eU) {}
      var userLogadoDir = emailUserDir ? verificarPermissaoUsuario(emailUserDir) : null;
      var respNomeDir = (userLogadoDir && userLogadoDir.nome) || "Operador OME";
      var respCpfDir = (userLogadoDir && userLogadoDir.cpf) || "-";
      var novoLocalFormatado = [novaSubunidade, novoSetor, novoLocal].filter(Boolean).join(" > ");

      var eventosTransfDir = [];
      for (var idxDir = 0; idxDir < itensIds.length; idxDir++) {
        eventosTransfDir.push({
          item: itensIds[idxDir],
          objeto: "",
          nPatrimonio: "",
          tipoEvento: "TRANSFERENCIA_INTERNA",
          origemUnidade: unidade,
          origemLocal: "-",
          destinoUnidade: unidade,
          destinoLocal: novoLocalFormatado || caminhoTexto,
          statusAnterior: "-",
          statusNovo: "-",
          responsavelNome: respNomeDir,
          responsavelCpf: respCpfDir,
          documentoRef: caminhoTexto,
          observacao: "Remanejamento interno de local para " + caminhoTexto
        });
      }
      registrarHistoricoMovimentacao(eventosTransfDir);
    } catch (eHDir) {
      console.warn("Aviso ao gravar histórico de remanejamento interno: " + eHDir.message);
    }

    try {
      var descMatsDir = [];
      if (dados.material) {
        descMatsDir.push(dados.material);
      } else {
        try {
          var idsSqlQDir = itensIds.slice(0, 10).map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
          var resMDir = executarConsultaBigQuerySegura("SELECT DISTINCT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + idsSqlQDir + ")");
          if (resMDir.rows) {
            resMDir.rows.forEach(function(r) { if (r.f && r.f[0] && r.f[0].v) descMatsDir.push(r.f[0].v); });
          }
        } catch(eMDir) {}
      }
      var descMatTxtDir = descMatsDir.length > 0 ? " do material '" + descMatsDir.join(", ") + "'" : "";
      var itensTxtDir = itensIds.length <= 10 ? itensIds.join(", ") : (itensIds.slice(0, 10).join(", ") + " e mais " + (itensIds.length - 10) + " itens");
      registrarLogAuditoria(
        "MOVIMENTACAO_LOCAL_ARVORE",
        "Moveu " + itensIds.length + " item(ns)" + descMatTxtDir + " para " + (novoLocalFormatado || caminhoTexto) + ". Código(s) ITEM: [" + itensTxtDir + "]",
        userLogadoDir
      );
    } catch(eLogMv) {}

    return "Itens transferidos com sucesso para " + caminhoTexto + "!";
  } catch (err) {
    throw new Error("Erro ao atualizar localização dos itens: " + err.message);
  }
}

// Busca Posto/Grad (Col B), Matrícula (Col E) e Nome (Col F) da tabela Peculio, cruzando com Logins e BigQuery para obter CPF
function getListaMilitarPeculio() {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ss.getSheetByName("Peculio");
    if (!sheet || sheet.getLastRow() <= 1) return [];

    var mapaCpfPorNome = {};
    var mapaCpfPorMatricula = {};

    // 1. Mapeia CPFs da base de Logins (Planilha de Usuários)
    try {
      var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
      var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
      if (sheetLogins && sheetLogins.getLastRow() > 1) {
        var dadosLogins = sheetLogins.getDataRange().getValues();
        var cabLog = dadosLogins[0] || [];
        var idxCpfL = cabLog.indexOf("CPF"); if (idxCpfL === -1) idxCpfL = 1;
        var idxNomeL = cabLog.indexOf("Nome"); if (idxNomeL === -1) idxNomeL = 2;
        for (var u = 1; u < dadosLogins.length; u++) {
          var cpfL = String(dadosLogins[u][idxCpfL] || "").trim().replace(/\D/g, '');
          var nomeL = String(dadosLogins[u][idxNomeL] || "").trim().toUpperCase();
          if (cpfL.length === 10) cpfL = "0" + cpfL;
          if (cpfL.length === 11 && nomeL) {
            mapaCpfPorNome[nomeL] = cpfL;
          }
        }
      }
    } catch(eLog) {
      console.warn("Aviso ao mapear CPFs de logins: " + eLog.message);
    }

    // 2. Mapeia CPFs históricos gravados no BigQuery (tb_Estoque e tb_Log)
    try {
      var sqlCpf = "SELECT DISTINCT UPPER(TRIM(SE_ACAUTELADO_NOME_COMPLETO)) as NOME, REGEXP_REPLACE(SE_ACAUTELADO_CPF, r'\\D', '') as CPF " +
                   "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                   "WHERE SE_ACAUTELADO_NOME_COMPLETO IS NOT NULL AND SE_ACAUTELADO_CPF IS NOT NULL AND LENGTH(REGEXP_REPLACE(SE_ACAUTELADO_CPF, r'\\D', '')) >= 10 " +
                   "UNION DISTINCT " +
                   "SELECT DISTINCT UPPER(TRIM(NOME)) as NOME, REGEXP_REPLACE(CPF, r'\\D', '') as CPF " +
                   "FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_Log` " +
                   "WHERE NOME IS NOT NULL AND CPF IS NOT NULL AND LENGTH(REGEXP_REPLACE(CPF, r'\\D', '')) >= 10";
      var resCpf = executarConsultaBigQuerySegura(sqlCpf);
      if (resCpf && resCpf.rows) {
        resCpf.rows.forEach(function(r) {
          var f = r.f || [];
          var n = String((f[0] && f[0].v) || "").trim().toUpperCase();
          var c = String((f[1] && f[1].v) || "").trim().replace(/\D/g, '');
          if (c.length === 10) c = "0" + c;
          if (n && c.length === 11 && !mapaCpfPorNome[n]) {
            mapaCpfPorNome[n] = c;
          }
        });
      }
    } catch(eBq) {
      console.warn("Aviso ao mapear CPFs do BigQuery: " + eBq.message);
    }

    var dados = sheet.getDataRange().getValues();
    var cabPeculio = dados[0] || [];
    var idxCpfPec = -1;
    for (var c = 0; c < cabPeculio.length; c++) {
      var headerCol = String(cabPeculio[c] || "").trim().toUpperCase();
      if (headerCol.includes("CPF") || headerCol.includes("CIC")) {
        idxCpfPec = c;
        break;
      }
    }

    var militares = [];

    // Coluna B = Índice 1 (Posto/Grad)
    // Coluna E = Índice 4 (Matrícula)
    // Coluna F = Índice 5 (Nome)
    for (var i = 1; i < dados.length; i++) {
      var postoGrad = String(dados[i][1] || "").trim();
      var matricula = String(dados[i][4] || "").trim();
      var matLimpa = matricula.replace(/\D/g, '');
      var nomeCompleto = String(dados[i][5] || "").trim();
      var nomeUp = nomeCompleto.toUpperCase();

      // Procura CPF: 1º por matrícula, 2º por nome, 3º na coluna identificada de CPF no Pecúlio, 4º varredura na linha
      var cpfDetectado = (matLimpa && mapaCpfPorMatricula[matLimpa]) || mapaCpfPorNome[nomeUp] || "";
      if (!cpfDetectado && idxCpfPec !== -1) {
        var cPec = String(dados[i][idxCpfPec] || "").trim().replace(/\D/g, '');
        if (cPec.length === 10) cPec = "0" + cPec;
        if (cPec.length === 11) cpfDetectado = cPec;
      }

      if (!cpfDetectado) {
        for (var col = 0; col < dados[i].length; col++) {
          if (col === 4) continue; // Pula coluna de matrícula
          var celula = String(dados[i][col] || "").trim().replace(/\D/g, '');
          if (celula.length === 10) celula = "0" + celula;
          if (celula.length === 11) {
            cpfDetectado = celula;
            break;
          }
        }
      }

      if (nomeCompleto) {
        var identUnica = matricula ? matricula : "S/M";
        var descricaoFormatada = (postoGrad ? postoGrad + " " : "") + nomeCompleto + " (Mat: " + identUnica + (cpfDetectado ? " | CPF: " + cpfDetectado : "") + ")";
        
        militares.push({
          nome: nomeCompleto,
          posto: postoGrad || "MILITAR",
          matricula: matricula,
          cpf: cpfDetectado,
          identificacaoCompleta: descricaoFormatada
        });
      }
    }

    // 3. Carrega Civis cadastrados na aba 'Civis' da planilha auxiliar
    try {
      var sheetCivis = ss.getSheetByName("Civis");
      if (sheetCivis && sheetCivis.getLastRow() > 1) {
        var dadosCivis = sheetCivis.getRange(2, 1, sheetCivis.getLastRow() - 1, 5).getValues();
        for (var cIdx = 0; cIdx < dadosCivis.length; cIdx++) {
          var nomeCiv = String(dadosCivis[cIdx][1] || "").trim().toUpperCase();
          var cpfCiv = String(dadosCivis[cIdx][2] || "").trim().replace(/\D/g, "");
          var telCiv = String(dadosCivis[cIdx][3] || "").trim();
          var emailCiv = String(dadosCivis[cIdx][4] || "").trim();
          if (cpfCiv.length === 10) cpfCiv = "0" + cpfCiv;
          if (nomeCiv) {
            var cpfFormatCiv = cpfCiv ? cpfCiv.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";
            var descCiv = "[CIVIL] " + nomeCiv + (cpfFormatCiv ? " (CPF: " + cpfFormatCiv : "") + (telCiv ? " | Tel: " + telCiv : "") + (cpfFormatCiv ? ")" : "");
            militares.push({
              nome: nomeCiv,
              posto: "CIVIL",
              matricula: "",
              cpf: cpfCiv,
              telefone: telCiv,
              email: emailCiv,
              identificacaoCompleta: descCiv
            });
          }
        }
      }
    } catch (eCiv) {
      console.warn("Aviso ao carregar civis no acautelamento: " + eCiv.message);
    }

    militares.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
    return militares;
  } catch (err) {
    console.error("Erro em getListaMilitarPeculio: " + err.message);
    return [];
  }
}

// Cadastra uma pessoa civil para acautelamento na aba 'Civis' da planilha auxiliar
function cadastrarPessoaCivil(dados) {
  try {
    if (!dados) throw new Error("Dados não fornecidos.");
    var nome = String(dados.nome || "").trim().toUpperCase();
    var cpf = String(dados.cpf || "").trim().replace(/\D/g, "");
    var telefone = String(dados.telefone || "").trim();
    var email = String(dados.email || "").trim().toLowerCase();

    if (!nome) throw new Error("O Nome Completo do civil é obrigatório.");
    if (!cpf || cpf.length !== 11) throw new Error("CPF inválido. Informe os 11 dígitos do CPF.");

    var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheet = ssAux.getSheetByName("Civis");
    if (!sheet) {
      sheet = ssAux.insertSheet("Civis");
      sheet.appendRow(["Data_Hora", "Nome", "CPF", "Telefone", "Email", "Cadastrado_Por"]);
      sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#e9ecef");
    }

    // Verifica se já existe cadastrado com o mesmo CPF
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var dadosExistentes = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      for (var r = 0; r < dadosExistentes.length; r++) {
        var cpfLinha = String(dadosExistentes[r][2] || "").trim().replace(/\D/g, "");
        if (cpfLinha === cpf) {
          sheet.getRange(r + 2, 2).setValue(nome);
          sheet.getRange(r + 2, 4).setValue(telefone);
          sheet.getRange(r + 2, 5).setValue(email);
          return {
            sucesso: true,
            mensagem: "Cadastro do civil atualizado com sucesso!",
            civil: {
              nome: nome,
              posto: "CIVIL",
              matricula: "",
              cpf: cpf,
              telefone: telefone,
              email: email,
              identificacaoCompleta: "[CIVIL] " + nome + " (CPF: " + cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") + (telefone ? " | Tel: " + telefone : "") + ")"
            }
          };
        }
      }
    }

    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail(); } catch (e) {}
    var agora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");

    sheet.appendRow([agora, nome, "'" + cpf, "'" + telefone, email, emailSessao || "Operador"]);

    try {
      registrarLogAuditoria("CADASTRO_CIVIL", "Cadastrou civil " + nome + " (CPF: " + cpf + ")");
    } catch(eLogCiv) {}

    return {
      sucesso: true,
      mensagem: "Pessoa civil cadastrada com sucesso!",
      civil: {
        nome: nome,
        posto: "CIVIL",
        matricula: "",
        cpf: cpf,
        telefone: telefone,
        email: email,
        identificacaoCompleta: "[CIVIL] " + nome + " (CPF: " + cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") + (telefone ? " | Tel: " + telefone : "") + ")"
      }
    };
  } catch (err) {
    console.error("Erro em cadastrarPessoaCivil: " + err.message);
    return { sucesso: false, erro: err.message };
  }
}

function buscarCpfMilitar(nome, matricula) {
  try {
    var nomeUp = String(nome || "").trim().toUpperCase();
    var matClean = String(matricula || "").trim().replace(/\D/g, '');

    // 1. Busca na planilha de Logins
    try {
      var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
      var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
      if (sheetLogins && sheetLogins.getLastRow() > 1) {
        var dadosLogins = sheetLogins.getDataRange().getValues();
        var cab = dadosLogins[0] || [];
        var idxCpf = cab.indexOf("CPF"); if (idxCpf === -1) idxCpf = 1;
        var idxNome = cab.indexOf("Nome"); if (idxNome === -1) idxNome = 2;
        for (var i = 1; i < dadosLogins.length; i++) {
          var n = String(dadosLogins[i][idxNome] || "").trim().toUpperCase();
          var c = String(dadosLogins[i][idxCpf] || "").trim().replace(/\D/g, '');
          if (c.length === 10) c = "0" + c;
          if (c.length === 11 && (n === nomeUp || n.includes(nomeUp) || nomeUp.includes(n))) {
            return c;
          }
        }
      }
    } catch (eLog) {}

    // 2. Busca no BigQuery
    if (nomeUp) {
      try {
        var sql = "SELECT REGEXP_REPLACE(SE_ACAUTELADO_CPF, r'\\D', '') as CPF FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                  "WHERE UPPER(TRIM(SE_ACAUTELADO_NOME_COMPLETO)) = '" + nomeUp.replace(/'/g, "\\'") + "' AND SE_ACAUTELADO_CPF IS NOT NULL " +
                  "LIMIT 1";
        var res = executarConsultaBigQuerySegura(sql);
        if (res.rows && res.rows.length > 0 && res.rows[0].f && res.rows[0].f[0].v) {
          var cpfBq = String(res.rows[0].f[0].v).replace(/\D/g, '');
          if (cpfBq.length === 10) cpfBq = "0" + cpfBq;
          if (cpfBq.length === 11) return cpfBq;
        }

        var sqlLog = "SELECT REGEXP_REPLACE(CPF, r'\\D', '') as CPF FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_Log` " +
                     "WHERE UPPER(TRIM(NOME)) = '" + nomeUp.replace(/'/g, "\\'") + "' AND CPF IS NOT NULL " +
                     "LIMIT 1";
        var resLog = executarConsultaBigQuerySegura(sqlLog);
        if (resLog.rows && resLog.rows.length > 0 && resLog.rows[0].f && resLog.rows[0].f[0].v) {
          var cpfLog = String(resLog.rows[0].f[0].v).replace(/\D/g, '');
          if (cpfLog.length === 10) cpfLog = "0" + cpfLog;
          if (cpfLog.length === 11) return cpfLog;
        }
      } catch (eBq) {}
    }

    // 3. Busca na aba Pecúlio
    try {
      var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
      var sheetPeculio = ssAux.getSheetByName("Peculio");
      if (sheetPeculio && sheetPeculio.getLastRow() > 1) {
        var dadosPec = sheetPeculio.getDataRange().getValues();
        for (var p = 1; p < dadosPec.length; p++) {
          var nPec = String(dadosPec[p][5] || "").trim().toUpperCase();
          var mPec = String(dadosPec[p][4] || "").trim().replace(/\D/g, '');
          var match = (nomeUp && nPec === nomeUp) || (matClean && mPec === matClean);
          if (match) {
            for (var c = 0; c < dadosPec[p].length; c++) {
              if (c === 4) continue;
              var cP = String(dadosPec[p][c] || "").trim().replace(/\D/g, '');
              if (cP.length === 10) cP = "0" + cP;
              if (cP.length === 11) return cP;
            }
          }
        }
      }
    } catch (ePec) {}

    return "";
  } catch (err) {
    console.error("Erro em buscarCpfMilitar: " + err.message);
    return "";
  }
}

function getItensDisponiveisParaCautela(omeUsuario, perfilUsuario, omeFiltroAdmin) {
  try {
    var perfilClean = String(perfilUsuario || "").trim().toUpperCase();
    var omeCleanUser = String(omeUsuario || "").trim().toUpperCase();
    
    // Verifica rigorosamente se é Administrador ou DLOG
    var ehAdmin = (perfilClean === "ADMINISTRADOR" || omeCleanUser === "DLOG");

    var sql = "SELECT ITEM, OBJETO, UNIDADE, SUBUNIDADE, SETOR, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, N_PATRIMONIO, STATUS " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE (STATUS IS NULL OR UPPER(TRIM(STATUS)) != 'EXTRAVIADO') ";

    if (ehAdmin) {
      // Se for Administrador, só filtra por OME se ele escolher uma específica no filtro da tela. 
      // Caso contrário, traz tudo da corporação!
      if (omeFiltroAdmin && omeFiltroAdmin !== "TODAS" && omeFiltroAdmin.trim() !== "") {
        var omeFiltroClean = obterOmePadronizada(omeFiltroAdmin).toUpperCase();
        sql += "AND UPPER(TRIM(UNIDADE)) = '" + omeFiltroClean.replace(/'/g, "\\'") + "' ";
      }
    } else {
      // Usuário comum: Restringe estritamente à sua própria OME
      var minhaOmeClean = obterOmePadronizada(omeUsuario).toUpperCase();
      if (minhaOmeClean) {
        sql += "AND UPPER(TRIM(UNIDADE)) = '" + minhaOmeClean.replace(/'/g, "\\'") + "' ";
      }
    }
    
    sql += "ORDER BY OBJETO ASC LIMIT 1000";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];
    var lista = [];

    rows.forEach(function(r) {
      var subunidadeBruta = r.f[3].v || "SEDE";
      var set = r.f[4].v ? " > " + r.f[4].v : "";
      var loc = r.f[5].v ? " > " + r.f[5].v : "";
      var localizacaoArvore = subunidadeBruta + set + loc;

      lista.push({
        item: r.f[0].v || "",
        objeto: r.f[1].v || "",
        unidade: r.f[2].v || "",
        subunidade: subunidadeBruta,
        localizacao: localizacaoArvore,
        patrimonio: r.f[6].v || "-",
        status: r.f[7].v || "ECD"
      });
    });

    return lista;
  } catch (err) {
    throw new Error("Erro ao listar itens para cautela: " + err.message);
  }
}

function registrarAcautelamentoItens(dados) {
  try {
    var cpfResponsavel = String(dados.cpfResponsavel || "").trim().replace(/\D/g, "");
    var nomeMilitar = String(dados.nomeMilitar || "").trim();
    var postoMilitar = String(dados.postoMilitar || "").trim();
    var matriculaMilitar = String(dados.matriculaMilitar || "").trim();
    var cpfMilitarRecebedor = String(dados.cpfMilitar || "").trim().replace(/\D/g, "");
    var docSei = String(dados.docSei || "").trim();
    var dataPrevista = String(dados.dataPrevistaDevolucao || "").trim();
    if (dataPrevista) {
      var mIso = dataPrevista.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (mIso) {
        dataPrevista = mIso[3] + "/" + mIso[2] + "/" + mIso[1];
      }
    }
    var formaConfirmacao = String(dados.formaConfirmacao || (dados.pin ? "PIN" : "SEI")).trim().toUpperCase();
    var itensIds = dados.itensIds || [];

    if (!nomeMilitar || itensIds.length === 0) {
      throw new Error("Selecione o militar/civil recebedor e ao menos um item da lista para acautelamento.");
    }

    if (formaConfirmacao === "SEI" && !docSei) {
      throw new Error("O Template ou Processo SEI é obrigatório como justificativa documental.");
    }

    var responsavelValido = null;
    try {
      var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
      var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
      var dadosUsers = sheetLogins.getDataRange().getValues();
      var cabecalho = dadosUsers[0] || [];
      var idxCpf = cabecalho.indexOf("CPF");
      var idxNome = cabecalho.indexOf("Nome");

      for (var i = 1; i < dadosUsers.length; i++) {
        var cUser = String(dadosUsers[i][idxCpf] || "").trim().replace(/\D/g, "");
        if (cUser && cUser === cpfResponsavel) {
          responsavelValido = String(dadosUsers[i][idxNome] || "Operador").trim();
          break;
        }
      }
    } catch (eUser) {}

    // Fallback para o militar da sessão ativa se não encontrou o CPF
    if (!responsavelValido) {
      var emailSessao = "";
      try { emailSessao = Session.getActiveUser().getEmail(); } catch (e) {}
      var userSess = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;
      if (userSess && userSess.nome) {
        responsavelValido = userSess.nome;
        if (!cpfResponsavel && userSess.cpf) {
          cpfResponsavel = String(userSess.cpf).replace(/\D/g, "");
        }
      } else {
        responsavelValido = "Chefe / Operador de Estoque";
      }
    }

    // Grava o CPF do recebedor (civil ou militar) no campo SE_ACAUTELADO_CPF
    var identificacaoMilitarRegistro = cpfMilitarRecebedor || (matriculaMilitar ? "Mat: " + matriculaMilitar : "S/CPF");

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var listaSql = itensIds.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");

    // Busca informações atuais dos itens para resolver a SUBUNIDADE pai na árvore e compor histórico
    var normComp_ = function(t) {
      return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    };

    var cacheArvoresOme = {};
    function obterArvoreCached(ome) {
      var omePad = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(ome) : String(ome || "").trim();
      if (!cacheArvoresOme[omePad]) {
        cacheArvoresOme[omePad] = (typeof obterEstruturaArvoreOme_ === 'function') 
          ? obterEstruturaArvoreOme_(omePad) 
          : { mapaNomes: {} };
      }
      return cacheArvoresOme[omePad];
    }

    var itensInfoMap = {};
    var gruposPorSubPai = {};

    try {
      var sqlBuscaOrigem = "SELECT ITEM, OBJETO, N_PATRIMONIO, UNIDADE, SUBUNIDADE, SETOR, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario " +
                           "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                           "WHERE ITEM IN (" + listaSql + ")";
      var resBusca = executarConsultaBigQuerySegura(sqlBuscaOrigem);
      var rowsOrigem = resBusca.rows || [];

      rowsOrigem.forEach(function(r) {
        if (!r || !r.f) return;
        var itemCode = String((r.f[0] && r.f[0].v) || "").trim();
        var objNome = String((r.f[1] && r.f[1].v) || "").trim();
        var patr = String((r.f[2] && r.f[2].v) || "").trim();
        var unid = String((r.f[3] && r.f[3].v) || "").trim();
        var subRaw = String((r.f[4] && r.f[4].v) || "").trim();
        var setRaw = String((r.f[5] && r.f[5].v) || "").trim();
        var locRaw = String((r.f[6] && r.f[6].v) || "").trim();

        var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(unid) : unid;
        var infoArvore = obterArvoreCached(omePadrao);
        var mapaNomes = infoArvore.mapaNomes || {};

        var subPai = "SEDE";
        var noArvore = null;
        if (locRaw && mapaNomes[normComp_(locRaw)]) {
          noArvore = mapaNomes[normComp_(locRaw)];
        } else if (setRaw && mapaNomes[normComp_(setRaw)]) {
          noArvore = mapaNomes[normComp_(setRaw)];
        } else if (subRaw && mapaNomes[normComp_(subRaw)]) {
          noArvore = mapaNomes[normComp_(subRaw)];
        }

        if (noArvore) {
          subPai = noArvore.subunidadeNome || noArvore.subunidadeRes || "SEDE";
        } else {
          if (subRaw && subRaw !== "-" && subRaw.toUpperCase() !== "GERAL" && normComp_(subRaw) !== normComp_(omePadrao)) {
            subPai = (typeof resumirSubunidade === 'function') ? resumirSubunidade(subRaw) : subRaw;
          } else {
            subPai = "SEDE";
          }
        }
        if (!subPai || subPai === "-") subPai = "SEDE";

        if (!gruposPorSubPai[subPai]) {
          gruposPorSubPai[subPai] = [];
        }
        gruposPorSubPai[subPai].push(itemCode);

        var localOrigemFormatado = [subRaw || "SEDE", setRaw, locRaw].filter(Boolean).join(" > ");
        itensInfoMap[itemCode] = {
          objeto: objNome,
          patrimonio: patr,
          unidade: unid,
          origemLocal: localOrigemFormatado,
          subPai: subPai
        };
      });
    } catch (eBusca) {
      console.warn("Aviso ao buscar localização atual dos itens para transferência à Subunidade pai: " + eBusca.message);
    }

    var agoraData = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");
    var obsData = "Acautelado em " + agoraData + (dataPrevista ? " [Prev. Devolução: " + dataPrevista + "]" : "") + (formaConfirmacao === "SEI" ? " (Via Template SEI: " + docSei + ")" : " (Via PIN)");

    // Executa UPDATE transferindo para a SUBUNIDADE pai na árvore e limpando SETOR / LOCAL
    var subPaisKeys = Object.keys(gruposPorSubPai);
    if (subPaisKeys.length > 0) {
      subPaisKeys.forEach(function(sp) {
        var idsGrupo = gruposPorSubPai[sp];
        if (!idsGrupo || idsGrupo.length === 0) return;
        var listaSqlGrupo = idsGrupo.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
        var obsDataCompleta = obsData + " [Transferido para Subunidade " + sp + "]";

        var sqlUpdate = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                        "STATUS = 'ACAUTELADO', " +
                        "SUBUNIDADE = '" + limparSQL(sp) + "', " +
                        "SETOR = NULL, " +
                        "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                        "SE_ACAUTELADO_POSTO_GRAD = '" + limparSQL(postoMilitar) + "', " +
                        "SE_ACAUTELADO_NOME_COMPLETO = '" + limparSQL(nomeMilitar) + "', " +
                        "SE_ACAUTELADO_CPF = '" + limparSQL(identificacaoMilitarRegistro) + "', " +
                        "SE_ACAUTELADO_N_DOC_SEI = '" + limparSQL(docSei) + "', " +
                        "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | " + limparSQL(obsDataCompleta) + "') " +
                        "WHERE ITEM IN (" + listaSqlGrupo + ")";

        executarConsultaBigQuerySegura(sqlUpdate, true);
      });
    } else {
      // Fallback caso a busca inicial de itens não tenha retornado registros
      var sqlUpdateFallback = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                              "STATUS = 'ACAUTELADO', " +
                              "SUBUNIDADE = COALESCE(NULLIF(TRIM(SUBUNIDADE), ''), 'SEDE'), " +
                              "SETOR = NULL, " +
                              "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario = NULL, " +
                              "SE_ACAUTELADO_POSTO_GRAD = '" + limparSQL(postoMilitar) + "', " +
                              "SE_ACAUTELADO_NOME_COMPLETO = '" + limparSQL(nomeMilitar) + "', " +
                              "SE_ACAUTELADO_CPF = '" + limparSQL(identificacaoMilitarRegistro) + "', " +
                              "SE_ACAUTELADO_N_DOC_SEI = '" + limparSQL(docSei) + "', " +
                              "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | " + limparSQL(obsData) + "') " +
                              "WHERE ITEM IN (" + listaSql + ")";
      executarConsultaBigQuerySegura(sqlUpdateFallback, true);
    }

    // Registra histórico de movimentação (CAUTELA) com origem real e destino na Subunidade pai
    try {
      var eventosCautela = [];
      for (var idxC = 0; idxC < itensIds.length; idxC++) {
        var idItem = itensIds[idxC];
        var info = itensInfoMap[idItem] || {};
        var subDestino = info.subPai || "SEDE";
        eventosCautela.push({
          item: idItem,
          objeto: info.objeto || "",
          nPatrimonio: info.patrimonio || "",
          tipoEvento: "CAUTELA",
          origemUnidade: info.unidade || "-",
          origemLocal: info.origemLocal || "Estoque OME",
          destinoUnidade: info.unidade || "-",
          destinoLocal: "Subunidade " + subDestino + " (Acautelado: " + (postoMilitar ? postoMilitar + " " : "") + nomeMilitar + ")",
          statusAnterior: "ECD",
          statusNovo: "ACAUTELADO",
          responsavelNome: responsavelValido,
          responsavelCpf: cpfResponsavel,
          documentoRef: docSei || "-",
          observacao: "Acautelado para " + (postoMilitar ? postoMilitar + " " : "") + nomeMilitar + " (" + identificacaoMilitarRegistro + ") [Transferido para Subunidade " + subDestino + "]" + (dataPrevista ? " [Previsão de Devolução: " + dataPrevista + "]" : "") + (formaConfirmacao === "SEI" ? " [Confirmação via SEI]" : " [Assinado via PIN]")
        });
      }
      registrarHistoricoMovimentacao(eventosCautela);
    } catch (eHCaut) {
      console.warn("Aviso ao gravar histórico de acautelamento: " + eHCaut.message);
    }

    var descMatsCaut = [];
    for (var kId in itensInfoMap) {
      if (itensInfoMap[kId] && itensInfoMap[kId].objeto && descMatsCaut.indexOf(itensInfoMap[kId].objeto) === -1) {
        descMatsCaut.push(itensInfoMap[kId].objeto);
      }
    }
    var descMatTxtCaut = descMatsCaut.length > 0 ? " (" + descMatsCaut.join(", ") + ")" : "";
    var itensTxtCaut = itensIds.length <= 10 ? itensIds.join(", ") : (itensIds.slice(0, 10).join(", ") + " e mais " + (itensIds.length - 10) + " itens");
    registrarLogAuditoria(
      "NOVO_ACAUTELAMENTO", 
      "Acautelou " + itensIds.length + " item(ns)" + descMatTxtCaut + " para " + (postoMilitar ? postoMilitar + " " : "") + nomeMilitar + " (CPF/ID: " + identificacaoMilitarRegistro + "). Código(s) ITEM: [" + itensTxtCaut + "]" + (dataPrevista ? " [Prev. Devolução: " + dataPrevista + "]" : "") + (formaConfirmacao === "SEI" ? " via Template SEI: " + docSei : " via PIN"),
      responsavelValido
    );
    return { sucesso: true, mensagem: "Acautelamento concluído com sucesso para " + (postoMilitar ? postoMilitar + " " : "") + nomeMilitar + "!" };
  } catch (err) {
    throw new Error("Erro ao registrar acautelamento: " + err.message);
  }
}

// Busca os materiais acautelados. Para Usuário, filtra pelo CPF/Nome. Para Chefe de Setor e Administrador, exibe materiais com nome e CPF do militar acautelado.
function getMinhasCautelasUsuario(cpfInformado, perfilInformado, omeInformada) {
  try {
    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail(); } catch(e) {}
    var userSessao = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;

    var perfilReal = String(perfilInformado || (userSessao ? userSessao.perfil : "") || "Usuário").trim().toUpperCase();
    var omeReal = String(omeInformada || (userSessao ? userSessao.ome : "") || "").trim().toUpperCase();
    var cpfAlvo = String(cpfInformado || (userSessao ? userSessao.cpf : "") || "").trim().replace(/\D/g, '');
    var nomeAlvo = userSessao ? String(userSessao.nome || "").trim().toUpperCase() : "";

    var ehAdmin = perfilReal === "ADMINISTRADOR" || perfilReal.indexOf("ADMIN") !== -1 || omeReal === "DLOG" || (userSessao && String(userSessao.ome).toUpperCase() === "DLOG");
    var temPermissaoCautela = false;
    if (userSessao && userSessao.permissoes) {
      if (Array.isArray(userSessao.permissoes)) {
        temPermissaoCautela = userSessao.permissoes.indexOf("acautelamento") !== -1;
      } else if (typeof userSessao.permissoes === "string") {
        temPermissaoCautela = userSessao.permissoes.indexOf("acautelamento") !== -1;
      }
    }
    var ehChefe = perfilReal === "CHEFE DE SETOR" || perfilReal.indexOf("CHEFE") !== -1 || perfilReal.indexOf("COMANDANTE") !== -1 || temPermissaoCautela;

    garantirTabelaHistoricoMovimentacao_();
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    var sql = "SELECT t.ITEM, t.OBJETO, t.UNIDADE, t.SUBUNIDADE, t.SETOR, t.LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, " +
              "t.N_PATRIMONIO, t.STATUS, t.SE_ACAUTELADO_POSTO_GRAD, t.SE_ACAUTELADO_NOME_COMPLETO, " +
              "t.SE_ACAUTELADO_CPF, t.SE_ACAUTELADO_N_DOC_SEI, t.OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, " +
              "h.DATA_CAUTELA " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` t " +
              "LEFT JOIN (" +
              "  SELECT UPPER(TRIM(ITEM)) as ITEM_KEY, FORMAT_TIMESTAMP('%d/%m/%Y %H:%M', MAX(DATA_HORA), 'America/Recife') as DATA_CAUTELA " +
              "  FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_HISTORICO + "` " +
              "  WHERE TIPO_EVENTO = 'CAUTELA' " +
              "  GROUP BY ITEM_KEY" +
              ") h ON UPPER(TRIM(t.ITEM)) = h.ITEM_KEY " +
              "WHERE UPPER(TRIM(t.STATUS)) = 'ACAUTELADO' ";

    if (ehAdmin) {
      // Administrador: lista todos os materiais acautelados da corporação (sem filtrar por OME DLOG de lotação)
      var omeFiltro = String(omeInformada || "").trim().toUpperCase();
      if (omeFiltro && omeFiltro !== "TODAS" && omeFiltro !== "SEM OME" && omeFiltro !== "DLOG") {
        sql += "AND UPPER(TRIM(t.UNIDADE)) = '" + limparSQL(omeFiltro) + "' ";
      }
    } else if (ehChefe) {
      // Chefe de Setor: lista todos os materiais acautelados vinculados à sua OME
      var omeChefe = String(omeInformada || (userSessao ? userSessao.ome : "") || "").trim().toUpperCase();
      if (omeChefe && omeChefe !== "SEM OME" && omeChefe !== "TODAS") {
        sql += "AND UPPER(TRIM(t.UNIDADE)) = '" + limparSQL(omeChefe) + "' ";
      }
    } else {
      // Usuário militar comum: restringe exclusivamente aos seus próprios materiais acautelados
      if (!cpfAlvo && !nomeAlvo) {
        return [];
      }
      var condicoes = [];
      if (cpfAlvo) {
        condicoes.push("REGEXP_REPLACE(COALESCE(t.SE_ACAUTELADO_CPF, ''), r'\\D', '') = '" + limparSQL(cpfAlvo) + "'");
        condicoes.push("t.SE_ACAUTELADO_CPF LIKE '%" + limparSQL(cpfAlvo) + "%'");
      }
      if (nomeAlvo) {
        condicoes.push("UPPER(TRIM(t.SE_ACAUTELADO_NOME_COMPLETO)) = '" + limparSQL(nomeAlvo) + "'");
      }
      sql += "AND (" + condicoes.join(" OR ") + ") ";
    }

    sql += "ORDER BY t.OBJETO ASC LIMIT 3000";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];
    var lista = [];

    rows.forEach(function(r) {
      var sub = r.f[3].v || "SEDE";
      var set = r.f[4].v ? " > " + r.f[4].v : "";
      var loc = r.f[5].v ? " > " + r.f[5].v : "";
      var localizacaoCompleta = (r.f[2].v || "") + " > " + sub + set + loc;

      var dataCautela = r.f[13] ? (r.f[13].v || "") : "";
      var obs = r.f[12] ? (r.f[12].v || "") : "";
      if (!dataCautela) {
        var mData = obs.match(/\b(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)\b/);
        if (mData) dataCautela = mData[1];
      }

      var dataPrevista = "";
      if (obs) {
        var mPrev = obs.match(/Prev\.?\s*Devolu[çc][aã]o:\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (mPrev) dataPrevista = mPrev[1];
      }

      lista.push({
        item: r.f[0].v || "",
        objeto: r.f[1].v || "",
        unidade: r.f[2].v || "",
        subunidade: sub,
        setor: r.f[4].v || "",
        local: r.f[5].v || "",
        localizacao: localizacaoCompleta,
        patrimonio: r.f[6].v || "-",
        status: r.f[7].v || "ACAUTELADO",
        postoMilitar: r.f[8].v || "",
        nomeMilitar: r.f[9].v || "",
        cpfMilitar: r.f[10].v || "",
        docSei: r.f[11].v || "-",
        observacao: r.f[12].v || "",
        dataCautela: dataCautela || "-",
        dataPrevista: dataPrevista || "-"
      });
    });

    return lista;
  } catch (err) {
    console.error("Erro em getMinhasCautelasUsuario: " + err.message);
    throw new Error("Erro ao buscar materiais acautelados: " + err.message);
  }
}

function getItensAcauteladosAtuais(omeUsuario, perfilUsuario, omeFiltroAdmin) {
  try {
    garantirTabelaHistoricoMovimentacao_();
    var perfilClean = String(perfilUsuario || "").trim().toUpperCase();
    var omeCleanUser = String(omeUsuario || "").trim().toUpperCase();
    
    var ehAdmin = (perfilClean === "ADMINISTRADOR" || omeCleanUser === "DLOG");

    // 1. Busca os itens acautelados no BigQuery com LEFT JOIN na tabela de histórico para obter a data da cautela
    var sql = "SELECT t.ITEM, t.OBJETO, t.UNIDADE, t.SUBUNIDADE, t.N_PATRIMONIO, " +
              "t.SE_ACAUTELADO_POSTO_GRAD, t.SE_ACAUTELADO_NOME_COMPLETO, t.SE_ACAUTELADO_CPF, t.SE_ACAUTELADO_N_DOC_SEI, " +
              "h.DATA_CAUTELA, t.OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` t " +
              "LEFT JOIN (" +
              "  SELECT UPPER(TRIM(ITEM)) as ITEM_KEY, FORMAT_TIMESTAMP('%d/%m/%Y %H:%M', MAX(DATA_HORA), 'America/Recife') as DATA_CAUTELA " +
              "  FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_HISTORICO + "` " +
              "  WHERE TIPO_EVENTO = 'CAUTELA' " +
              "  GROUP BY ITEM_KEY" +
              ") h ON UPPER(TRIM(t.ITEM)) = h.ITEM_KEY " +
              "WHERE UPPER(TRIM(t.STATUS)) = 'ACAUTELADO' ";

    if (ehAdmin) {
      if (omeFiltroAdmin && omeFiltroAdmin !== "TODAS" && omeFiltroAdmin.trim() !== "") {
        var omeFiltroClean = obterOmePadronizada(omeFiltroAdmin).toUpperCase();
        sql += "AND UPPER(TRIM(t.UNIDADE)) = '" + omeFiltroClean.replace(/'/g, "\\'") + "' ";
      }
    } else {
      var minhaOmeClean = obterOmePadronizada(omeUsuario).toUpperCase();
      if (minhaOmeClean) {
        sql += "AND UPPER(TRIM(t.UNIDADE)) = '" + minhaOmeClean.replace(/'/g, "\\'") + "' ";
      }
    }
    
    sql += "ORDER BY t.OBJETO ASC LIMIT 1000";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];

    // 2. Abre a aba Peculio da planilha auxiliar para cruzar a Matrícula (Coluna E) pelo Nome (Coluna F)
    var ssAux = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetPeculio = ssAux.getSheetByName("Peculio");
    var dadosPeculio = (sheetPeculio && sheetPeculio.getLastRow() > 1) ? sheetPeculio.getDataRange().getValues() : [];
    
    // Cria um mapa de Nome -> Matricula
    var mapaMatricula = {};
    for (var p = 1; p < dadosPeculio.length; p++) {
      var nomePec = String(dadosPeculio[p][5] || "").trim().toUpperCase(); // Coluna F (Nome)
      var matPec = String(dadosPeculio[p][4] || "").trim();               // Coluna E (Matrícula)
      if (nomePec && matPec) {
        mapaMatricula[nomePec] = matPec;
      }
    }

    var lista = [];

    rows.forEach(function(r) {
      var nomeMilitarBanco = String(r.f[6].v || "").trim();
      var nomeUp = nomeMilitarBanco.toUpperCase();
      
      // Procura a matrícula correspondente no mapa do Pecúlio
      var matriculaEncontrada = mapaMatricula[nomeUp] || "";
      var cpfOuInfoBanco = String(r.f[7].v || "").trim();

      // Monta o texto final da Matrícula/CPF
      var documentoFinal = "";
      if (matriculaEncontrada) {
        documentoFinal = "Mat: " + matriculaEncontrada;
        if (cpfOuInfoBanco && cpfOuInfoBanco.indexOf(matriculaEncontrada) === -1) {
          documentoFinal += " | CPF/Info: " + cpfOuInfoBanco;
        }
      } else {
        documentoFinal = cpfOuInfoBanco || "Não informada";
      }

      var dataCautela = r.f[9] ? (r.f[9].v || "") : "";
      var obs = r.f[10] ? (r.f[10].v || "") : "";
      if (!dataCautela) {
        var mData = obs.match(/\b(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)\b/);
        if (mData) dataCautela = mData[1];
      }

      var dataPrevista = "";
      if (obs) {
        var mPrev = obs.match(/Prev\.?\s*Devolu[çc][aã]o:\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (mPrev) dataPrevista = mPrev[1];
      }

      lista.push({
        item: r.f[0].v || "",
        objeto: r.f[1].v || "",
        unidade: r.f[2].v || "",
        subunidade: r.f[3].v || "SEDE",
        patrimonio: r.f[4].v || "-",
        postoGradMilitar: r.f[5].v || "",
        nomeMilitar: nomeMilitarBanco,
        matriculaCpfMilitar: documentoFinal,
        docSeiCautela: r.f[8].v || "-",
        dataCautela: dataCautela || "-",
        dataPrevista: dataPrevista || "-"
      });
    });

    return lista;
  } catch (err) {
    throw new Error("Erro ao listar itens acautelados: " + err.message);
  }
}

// Processa a devolução/baixa do acautelamento (Retirada da Cautela)
function processarBaixaAcautelamento(dados) {
  try {
    var cpfOperador = String(dados.cpfOperador || "").trim();
    var novoStatus = String(dados.novoStatus || "ECD").trim().toUpperCase(); // ECD ou SCD
    var observacaoDevolucao = String(dados.observacao || "").trim();
    var docSeiBaixa = String(dados.docSeiBaixa || "").trim();
    var itensIds = dados.itensIds || [];

    if (!cpfOperador || itensIds.length === 0) {
      throw new Error("Informe o seu CPF como operador responsável e selecione ao menos um item para devolução.");
    }

    if (novoStatus === "SCD" && !observacaoDevolucao) {
      throw new Error("Para itens devolvidos como SCD (Inservível), é obrigatório preencher a observação detalhando o motivo/avaria.");
    }

    // Valida o operador na base de logins
    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxNome = cabecalho.indexOf("Nome");

    var operadorValido = null;
    for (var i = 1; i < dadosUsers.length; i++) {
      if (String(dadosUsers[i][idxCpf] || "").trim() === cpfOperador) {
        operadorValido = String(dadosUsers[i][idxNome] || "Operador").trim();
        break;
      }
    }

    if (!operadorValido) {
      throw new Error("CPF do operador não encontrado na base de dados de logins.");
    }

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var listaSql = itensIds.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");

    // Monta a string de observação incorporando o histórico de baixa se houver
    var obsFinalQuery = observacaoDevolucao ? "Devolvido de cautela por " + operadorValido + ". Obs: " + observacaoDevolucao : "Devolvido de cautela por " + operadorValido;

    // UPDATE no BigQuery: Retorna o status para ECD/SCD, limpa os campos de cautelado e atualiza a observação e doc SEI se houver
    var sqlUpdate = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                    "STATUS = '" + novoStatus + "', " +
                    "SE_ACAUTELADO_POSTO_GRAD = NULL, " +
                    "SE_ACAUTELADO_NOME_COMPLETO = NULL, " +
                    "SE_ACAUTELADO_CPF = NULL, " +
                    "SE_ACAUTELADO_N_DOC_SEI = " + (docSeiBaixa ? "'" + limparSQL(docSeiBaixa) + "'" : "SE_ACAUTELADO_N_DOC_SEI") + ", " +
                    "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | " + limparSQL(obsFinalQuery) + "') " +
                    "WHERE ITEM IN (" + listaSql + ")";

    executarConsultaBigQuerySegura(sqlUpdate, true);

    // Registra histórico de movimentação (DESCAUTELA)
    try {
      var eventosDescautela = [];
      for (var idxD = 0; idxD < itensIds.length; idxD++) {
        eventosDescautela.push({
          item: itensIds[idxD],
          objeto: "",
          nPatrimonio: "",
          tipoEvento: "DESCAUTELA",
          origemUnidade: "-",
          origemLocal: "Devolvido de Cautela",
          destinoUnidade: "-",
          destinoLocal: "Retornado ao Estoque",
          statusAnterior: "ACAUTELADO",
          statusNovo: novoStatus,
          responsavelNome: operadorValido,
          responsavelCpf: cpfOperador,
          documentoRef: docSeiBaixa || "-",
          observacao: obsFinalQuery
        });
      }
      registrarHistoricoMovimentacao(eventosDescautela);
    } catch (eHDesc) {
      console.warn("Aviso ao gravar histórico de descautela: " + eHDesc.message);
    }

    var descMatsBaixa = [];
    try {
      var idsSqlBaixa = itensIds.slice(0, 10).map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
      var resMBaixa = executarConsultaBigQuerySegura("SELECT DISTINCT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + idsSqlBaixa + ")");
      if (resMBaixa.rows) {
        resMBaixa.rows.forEach(function(r) { if (r.f && r.f[0] && r.f[0].v) descMatsBaixa.push(r.f[0].v); });
      }
    } catch(eMBaixa) {}
    var descMatTxtBaixa = descMatsBaixa.length > 0 ? " (" + descMatsBaixa.join(", ") + ")" : "";
    var itensTxtBaixa = itensIds.length <= 10 ? itensIds.join(", ") : (itensIds.slice(0, 10).join(", ") + " e mais " + (itensIds.length - 10) + " itens");
    registrarLogAuditoria(
      "BAIXA_ACAUTELAMENTO", 
      "Baixa de cautela de " + itensIds.length + " item(ns)" + descMatTxtBaixa + " realizada por " + operadorValido + " com status " + novoStatus + ". Código(s) ITEM: [" + itensTxtBaixa + "]",
      operadorValido
    );
    return { sucesso: true, mensagem: "Devolução registrada com sucesso! Os materiais retornaram ao estoque com status " + novoStatus + "." };
  } catch (err) {
    throw new Error("Erro ao registrar baixa de acautelamento: " + err.message);
  }
}

// Padroniza e resume o nome de Subunidades (Relação canônica De: Para:)
// Ex: "1ª Seção de Bombeiros do 1º GB - 1ª SB/1º GB" -> "1ª SB"
//     "1ª Seção de Bombeiros do 2º GB - 1ª SB/2º GB" -> "1ª SB"
//     "2ª Seção de Bombeiros do 2º GB - 2ª SB/2º GB" -> "2ª SB"
function resumirSubunidade(sub) {
  if (!sub) return "-";
  var s = String(sub).trim();
  
  // 1. Padrão canônico de Seção de Bombeiros com número (ex: 1ª SB, 1ª SBS, 1ª SATec)
  var mSb = s.match(/(\d+)[ªaºo]?\s*(SB|SBI|SBS|SBSA|SATec)\b/i);
  if (mSb) {
    var tipo = mSb[2].toUpperCase();
    if (tipo === "SBI") tipo = "SB";
    return mSb[1] + "ª " + tipo;
  }

  // 2. Extenso (ex: "1ª Seção de Bombeiros", "1ª Seção Bombeiros")
  var mSecao = s.match(/(\d+)[ªaºo]?\s*Se[çc][ãa]o\s+(?:de\s+)?Bombeiros/i);
  if (mSecao) {
    return mSecao[1] + "ª SB";
  }

  // 3. Sufixos após hífen/travessão
  if (s.indexOf(" - ") !== -1) {
    var partesHifen = s.split(" - ");
    s = partesHifen[partesHifen.length - 1].trim();
  }
  if (s.indexOf(" – ") !== -1) {
    var partesTravessao = s.split(" – ");
    s = partesTravessao[partesTravessao.length - 1].trim();
  }
  if (s.indexOf("/") !== -1) {
    s = s.split("/")[0].trim();
  }

  var mSbFinal = s.match(/(\d+)[ªaºo]?\s*(SB|SBI|SBS|SBSA|SATec)\b/i);
  if (mSbFinal) {
    var tipoFinal = mSbFinal[2].toUpperCase();
    if (tipoFinal === "SBI") tipoFinal = "SB";
    return mSbFinal[1] + "ª " + tipoFinal;
  }

  // 4. Se for nome de OME raiz sem indicador de subunidade, normaliza para SEDE
  if (/^\d+[º°ªa]?\s*(GB|BBM|BPM|BPG)\b/i.test(s) && !/SB|SEÇÃO|PELOTÃO|COMPANHIA|POSTO/i.test(s)) {
    return "SEDE";
  }
  if (s.toUpperCase() === "GERAL" || s.toUpperCase() === "SEDE") return "SEDE";

  return s || "-";
}

// Obtém a estrutura hierárquica oficial da Árvore de Locais da OME (Subunidades, Setores e Locais)
function obterEstruturaArvoreOme_(omePadrao) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
    var sheetArvore = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
    if (!sheetArvore || sheetArvore.getLastRow() <= 1) {
      return {
        estrutura: [
          { id: "SEDE_AUTO", nome: "SEDE", subRes: "SEDE", setores: [] }
        ],
        mapaNomes: {
          "SEDE": { subunidadeNome: "SEDE", subunidadeRes: "SEDE", setorNome: "", localNome: "" }
        }
      };
    }

    var omePadraoFormatado = omePadrao ? (typeof obterOmePadronizada === 'function' ? obterOmePadronizada(omePadrao) : omePadrao) : "";
    var idSedeOficial = omePadraoFormatado ? garantirSedePadraoOme(omePadraoFormatado) : "";
    var dados = sheetArvore.getRange(2, 1, sheetArvore.getLastRow() - 1, 4).getValues();

    var mapaNos = {};
    var nosDaOme = [];
    var mapaGhostIds = {};

    var normComp_ = function(t) {
      return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    };

    // 1ª passada: ghost IDs (nós raiz que repetem o nome da OME)
    dados.forEach(function(linha) {
      var omeLinha = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(linha[1]) : String(linha[1] || "").trim();
      var idLocal = String(linha[0] || "").trim();
      var nomeLocal = String(linha[2] || "").trim();
      var idPai = String(linha[3] || "").trim();

      if (idLocal && nomeLocal && omeLinha.toUpperCase() === omePadraoFormatado.toUpperCase()) {
        if (!idPai && nomeLocal.toUpperCase() !== "SEDE" && ehSubunidadeEquivalenteOme_(nomeLocal, omeLinha)) {
          mapaGhostIds[idLocal] = true;
        }
      }
    });

    // 2ª passada: nós válidos
    dados.forEach(function(linha) {
      var omeLinha = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(linha[1]) : String(linha[1] || "").trim();
      var idLocal = String(linha[0] || "").trim();
      var nomeLocal = String(linha[2] || "").trim();
      var idPai = String(linha[3] || "").trim();

      if (idLocal && nomeLocal && omeLinha.toUpperCase() === omePadraoFormatado.toUpperCase()) {
        if (mapaGhostIds[idLocal]) return;
        var idPaiEfetivo = idPai;
        if (idPai && mapaGhostIds[idPai]) {
          idPaiEfetivo = idSedeOficial || "";
        }
        var noObj = {
          id: idLocal,
          nome: nomeLocal,
          idPai: idPaiEfetivo
        };
        mapaNos[idLocal] = noObj;
        nosDaOme.push(noObj);
      }
    });

    // Garante nó SEDE
    var temSede = nosDaOme.some(function(n) { return n.nome.toUpperCase() === "SEDE"; });
    if (!temSede) {
      var noSede = { id: idSedeOficial || "SEDE_AUTO", nome: "SEDE", idPai: "" };
      mapaNos[noSede.id] = noSede;
      nosDaOme.unshift(noSede);
    }

    // Identifica raízes (Subunidades)
    var raizes = nosDaOme.filter(function(n) {
      return !n.idPai || !mapaNos[n.idPai];
    });

    // Ordena raízes colocando SEDE em primeiro, depois as demais por ordem alfabética
    raizes.sort(function(a, b) {
      if (a.nome.toUpperCase() === "SEDE") return -1;
      if (b.nome.toUpperCase() === "SEDE") return 1;
      return a.nome.localeCompare(b.nome);
    });

    var estrutura = [];
    var mapaNomes = {};

    raizes.forEach(function(raiz) {
      var subRes = resumirSubunidade(raiz.nome);
      if (!subRes || subRes === "-" || normComp_(subRes) === normComp_(omePadraoFormatado)) {
        subRes = "SEDE";
      }

      // Registra raiz no mapaNomes
      mapaNomes[normComp_(raiz.nome)] = { subunidadeNome: raiz.nome, subunidadeRes: subRes, setorNome: "", localNome: "" };
      mapaNomes[normComp_(subRes)] = { subunidadeNome: raiz.nome, subunidadeRes: subRes, setorNome: "", localNome: "" };

      // Filhos de nível 2 (Setores)
      var filhosSetores = nosDaOme.filter(function(n) { return n.idPai === raiz.id; });
      var setoresEstrutura = [];

      filhosSetores.forEach(function(set) {
        var netosLocais = nosDaOme.filter(function(n) { return n.idPai === set.id; });
        var locaisEstrutura = [];

        // Registra setor no mapaNomes
        mapaNomes[normComp_(set.nome)] = { subunidadeNome: raiz.nome, subunidadeRes: subRes, setorNome: set.nome, localNome: set.nome };
        mapaNomes[normComp_(subRes + " " + set.nome)] = { subunidadeNome: raiz.nome, subunidadeRes: subRes, setorNome: set.nome, localNome: set.nome };

        netosLocais.forEach(function(loc) {
          locaisEstrutura.push({
            id: loc.id,
            nome: loc.nome
          });
          // Registra local no mapaNomes
          mapaNomes[normComp_(loc.nome)] = { subunidadeNome: raiz.nome, subunidadeRes: subRes, setorNome: set.nome, localNome: loc.nome };
          mapaNomes[normComp_(set.nome + " " + loc.nome)] = { subunidadeNome: raiz.nome, subunidadeRes: subRes, setorNome: set.nome, localNome: loc.nome };
        });

        setoresEstrutura.push({
          id: set.id,
          nome: set.nome,
          locais: locaisEstrutura
        });
      });

      estrutura.push({
        id: raiz.id,
        nome: raiz.nome,
        subRes: subRes,
        setores: setoresEstrutura
      });
    });

    return {
      estrutura: estrutura,
      mapaNomes: mapaNomes
    };
  } catch (err) {
    console.error("Erro em obterEstruturaArvoreOme_: " + err.message);
    return {
      estrutura: [
        { id: "SEDE_AUTO", nome: "SEDE", subRes: "SEDE", setores: [] }
      ],
      mapaNomes: {}
    };
  }
}

// 1. Busca os itens da OME consultando a estrutura da Árvore de Locais para montagem do Checklist
function getItensParaChecklist(omeUsuario, perfilUsuario, omeFiltroAdmin, subunidadeUsuario, setorUsuario, localUsuario, identificadorUsuario) {
  try {
    var perfilClean = String(perfilUsuario || "").trim().toUpperCase();
    var omeCleanUser = String(omeUsuario || "").trim().toUpperCase();
    var ehAdmin = (perfilClean === "ADMINISTRADOR" || omeCleanUser === "DLOG" || perfilClean === "DLOG");
    var ehChefe = perfilClean.indexOf("CHEFE") !== -1 || perfilClean.indexOf("COMANDANTE") !== -1;
    var ehUsuario = !ehAdmin && !ehChefe;

    // Busca dados do usuário autenticado na sessão como autoridade máxima de segurança
    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    if (!emailSessao) {
      try { emailSessao = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    }
    var dadosUser = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;
    if (!dadosUser && identificadorUsuario) {
      try { dadosUser = verificarPermissaoUsuario(identificadorUsuario); } catch (e) {}
    }
    if (!dadosUser) {
      try { dadosUser = getDadosUsuarioLogado(identificadorUsuario); } catch (e) {}
    }
    if (dadosUser) {
      var perfilReal = String(dadosUser.perfil || "").trim();
      var perfilRealUp = perfilReal.toUpperCase();
      if (perfilRealUp) {
        ehAdmin = (perfilRealUp === "ADMINISTRADOR" || String(dadosUser.ome || "").toUpperCase() === "DLOG");
        ehChefe = perfilRealUp.indexOf("CHEFE") !== -1 || perfilRealUp.indexOf("COMANDANTE") !== -1;
        ehUsuario = !ehAdmin && !ehChefe;
      }
      if (ehUsuario) {
        if (dadosUser.ome) omeUsuario = dadosUser.ome;
      }
    }

    var temPermissaoTodaOme = false;
    if (ehAdmin || ehChefe) {
      temPermissaoTodaOme = true;
    } else if (perfilClean.indexOf("CHEFE") !== -1 || perfilClean.indexOf("COMANDANTE") !== -1) {
      temPermissaoTodaOme = true;
    } else if (dadosUser && dadosUser.permissoes) {
      if (Array.isArray(dadosUser.permissoes)) {
        temPermissaoTodaOme = dadosUser.permissoes.some(function(p) { return String(p).trim().toLowerCase() === "checklist_toda_ome"; });
      } else if (typeof dadosUser.permissoes === "string") {
        temPermissaoTodaOme = dadosUser.permissoes.toLowerCase().indexOf("checklist_toda_ome") !== -1;
      }
    }

    // Se o usuário possui a permissão checklist_toda_ome, recebe a EXATA mesma condição do Comandante de Unidade
    if (temPermissaoTodaOme) {
      ehChefe = true;
      ehUsuario = false;
      var ehUsuarioRestritoSub = false;
    } else {
      var ehUsuarioRestritoSub = ehUsuario;
    }

    // PERFIL USUÁRIO RESTRITO: Vincula obrigatoriamente à subunidade de cadastro
    if (ehUsuarioRestritoSub) {
      if (dadosUser && dadosUser.subunidade && !subunidadeUsuario) {
        subunidadeUsuario = dadosUser.subunidade;
      }
    }

    // ADMINISTRADOR: Se não selecionou OME específica no filtro, não carrega checklists por padrão
    var omeFiltroClean = String(omeFiltroAdmin || "").trim();
    if (ehAdmin && (!omeFiltroClean || omeFiltroClean.toUpperCase() === "TODAS" || omeFiltroClean.toUpperCase() === "TODAS AS OMES")) {
      return { itens: [], estruturaArvore: [] };
    }

    var omeTarget = ehAdmin ? omeFiltroClean : (omeUsuario || "DLOG");
    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeTarget) : String(omeTarget).trim();

    // 1. Obtém a estrutura hierárquica oficial da Árvore de Locais da OME
    var infoArvore = obterEstruturaArvoreOme_(omePadrao);
    var estruturaArvore = infoArvore.estrutura || [];
    var mapaNomesArvore = infoArvore.mapaNomes || {};

    var normComp_ = function(t) {
      return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    };

    var subUsuarioRes = ehUsuarioRestritoSub ? resumirSubunidade(subunidadeUsuario || "SEDE") : "";
    if (ehUsuarioRestritoSub && (!subUsuarioRes || subUsuarioRes === "-")) subUsuarioRes = "SEDE";

    // PERFIL USUÁRIO RESTRITO: Acesso restrito ESTRITAMENTE à OME e SUBUNIDADE de cadastro do militar!
    // Os nós da árvore sem ID_Pai são as Subunidades. O militar restrito só visualiza a sua Subunidade!
    if (ehUsuarioRestritoSub) {
      estruturaArvore = estruturaArvore.filter(function(sub) {
        var sRes = resumirSubunidade(sub.subRes || sub.nome);
        return normComp_(sRes) === normComp_(subUsuarioRes) || normComp_(sub.nome) === normComp_(subunidadeUsuario);
      });

      if (estruturaArvore.length === 0) {
        estruturaArvore = [{
          id: "SUB_USUARIO",
          nome: subunidadeUsuario || subUsuarioRes,
          subRes: subUsuarioRes,
          setores: []
        }];
      }
    }

    // 2. Consulta BigQuery para obter materiais da OME
    var sql = "SELECT ITEM, OBJETO, UNIDADE, SUBUNIDADE, SETOR, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, N_PATRIMONIO, STATUS, OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE (STATUS IS NULL OR (UPPER(TRIM(STATUS)) != 'EXTRAVIADO' AND UPPER(TRIM(STATUS)) != 'ACAUTELADO')) ";

    var inOme = (typeof obterVariacoesOmeParaSql_ === 'function') ? obterVariacoesOmeParaSql_(omePadrao) : ("'" + omePadrao.replace(/'/g, "\\'") + "'");
    sql += "AND (UPPER(TRIM(UNIDADE)) IN (" + inOme + ") ";
    var siglaOme = (typeof resumirOme === 'function') ? resumirOme(omePadrao) : "";
    if (siglaOme && siglaOme !== "-") {
      sql += "OR UPPER(TRIM(UNIDADE)) = '" + siglaOme.toUpperCase().replace(/'/g, "\\'") + "' ";
      sql += "OR UPPER(UNIDADE) LIKE '" + siglaOme.toUpperCase().replace(/'/g, "\\'") + " %' ";
    }
    sql += ") ";

    // Filtros de Subunidade, Setor e Local se informados
    // Para Usuário comum restrito, o filtro de subunidade é SEMPRE obrigatório e estrito na sua Subunidade de cadastro!
    var subunidadeClean = ehUsuarioRestritoSub ? subUsuarioRes : String(subunidadeUsuario || "").trim();
    if (subunidadeClean && subunidadeClean.toUpperCase() !== "GERAL" && subunidadeClean.toUpperCase() !== "TODAS" && subunidadeClean.toUpperCase() !== "TODAS AS SUBUNIDADES") {
      var subSqlEsc = subunidadeClean.toUpperCase().replace(/'/g, "\\'");
      if (subunidadeClean.toUpperCase() === "SEDE") {
        sql += "AND (SUBUNIDADE IS NULL OR TRIM(SUBUNIDADE) = '' OR TRIM(SUBUNIDADE) = '-' OR UPPER(TRIM(SUBUNIDADE)) = 'GERAL' OR UPPER(TRIM(SUBUNIDADE)) = 'SEDE' OR UPPER(TRIM(SUBUNIDADE)) = UPPER(TRIM(UNIDADE))) ";
      } else {
        var mSb = subunidadeClean.match(/(\d+)[ªaºo]?\s*(SB|SBI|SBS|SBSA|SATec)/i);
        if (mSb) {
          var numSb = mSb[1];
          var tipSb = mSb[2].toUpperCase();
          if (tipSb === "SBI") tipSb = "SB";
          sql += "AND (UPPER(TRIM(SUBUNIDADE)) = '" + subSqlEsc + "' " +
                 "OR UPPER(SUBUNIDADE) LIKE '%" + numSb + "%" + tipSb + "%' " +
                 "OR UPPER(SUBUNIDADE) LIKE '%" + numSb + "%SEÇÃO%BOMBEIRO%' " +
                 "OR UPPER(SUBUNIDADE) LIKE '%" + subSqlEsc + "%') ";
        } else {
          sql += "AND (UPPER(TRIM(SUBUNIDADE)) = '" + subSqlEsc + "' OR UPPER(SUBUNIDADE) LIKE '%" + subSqlEsc + "%') ";
        }
      }
    }

    var setorClean = String(setorUsuario || "").trim();
    if (setorClean && setorClean.toUpperCase() !== "TODOS" && setorClean.toUpperCase() !== "TODOS OS SETORES" && setorClean.toUpperCase() !== "GERAL") {
      var setSqlEsc = setorClean.toUpperCase().replace(/'/g, "\\'");
      sql += "AND (UPPER(TRIM(SETOR)) = '" + setSqlEsc + "' OR UPPER(SETOR) LIKE '%" + setSqlEsc + "%') ";
    }

    var localClean = String(localUsuario || "").trim();
    if (localClean && localClean.toUpperCase() !== "TODOS" && localClean.toUpperCase() !== "TODOS OS LOCAIS" && localClean.toUpperCase() !== "GERAL") {
      var locSqlEsc = localClean.toUpperCase().replace(/'/g, "\\'");
      sql += "AND (UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = '" + locSqlEsc + "' OR UPPER(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario) LIKE '%" + locSqlEsc + "%') ";
    }

    sql += "ORDER BY UNIDADE ASC, SUBUNIDADE ASC, SETOR ASC, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario ASC";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];
    var lista = [];

    var normComp_ = function(t) {
      return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
    };

    rows.forEach(function(r) {
      if (!r || !r.f) return;
      var unidadeMat = String((r.f[2] && r.f[2].v) || "").trim();
      var sub = String((r.f[3] && r.f[3].v) || "").trim();
      var set = String((r.f[4] && r.f[4].v) || "").trim();
      var loc = String((r.f[5] && r.f[5].v) || "").trim();

      // Cruzamento rigoroso com a hierarquia da Árvore de Locais
      var noArvoreEncontrado = null;
      if (loc && mapaNomesArvore[normComp_(loc)]) {
        noArvoreEncontrado = mapaNomesArvore[normComp_(loc)];
      } else if (set && mapaNomesArvore[normComp_(set)]) {
        noArvoreEncontrado = mapaNomesArvore[normComp_(set)];
      } else if (sub && mapaNomesArvore[normComp_(sub)]) {
        noArvoreEncontrado = mapaNomesArvore[normComp_(sub)];
      }

      var subNorm = "SEDE";
      var setNorm = "";
      var locNorm = loc;

      if (noArvoreEncontrado) {
        subNorm = noArvoreEncontrado.subunidadeRes || "SEDE";
        setNorm = noArvoreEncontrado.setorNome || "";
        locNorm = noArvoreEncontrado.localNome || loc || setNorm;
      } else {
        // Fallback para itens não vinculados formalmente na árvore
        if (sub && sub !== "-" && sub.toUpperCase() !== "GERAL" && normComp_(sub) !== normComp_(unidadeMat)) {
          subNorm = (typeof resumirSubunidade === 'function') ? resumirSubunidade(sub) : sub;
        } else {
          subNorm = "SEDE";
        }

        var temSetorEspecifico = Boolean(set && set !== "-" && set.toUpperCase() !== "GERAL" && set.toUpperCase() !== "SEDE" && normComp_(set) !== normComp_(unidadeMat) && normComp_(set) !== normComp_(subNorm));
        setNorm = temSetorEspecifico ? set : "";
      }

      // PERFIL USUÁRIO RESTRITO: Validação rigorosa em nível de item.
      // Descarta terminantemente qualquer material cuja Subunidade não seja exatamente a de cadastro do militar!
      if (ehUsuarioRestritoSub && normComp_(subNorm) !== normComp_(subUsuarioRes)) {
        return;
      }

      var temSetor = Boolean(setNorm && setNorm !== "Geral" && setNorm.toUpperCase() !== "SEDE" && setNorm.toUpperCase() !== subNorm.toUpperCase());
      var chaveLocalizacao = temSetor ? (subNorm + " > " + setNorm) : subNorm;
      var chaveLocalizacaoSetor = temSetor ? setNorm : subNorm;

      var chaveCompleta = chaveLocalizacao;
      var locLimpo = (locNorm || loc || "").trim();
      if (locLimpo && locLimpo.toUpperCase() !== "PRINCIPAL" && locLimpo.toUpperCase() !== "SEDE" && locLimpo.toUpperCase() !== "GERAL" && normComp_(locLimpo) !== normComp_(setNorm) && normComp_(locLimpo) !== normComp_(subNorm)) {
        chaveCompleta += " > " + locLimpo;
      }

      lista.push({
        item: String((r.f[0] && r.f[0].v) || ""),
        objeto: String((r.f[1] && r.f[1].v) || ""),
        unidade: unidadeMat || omePadrao,
        subunidade: subNorm,
        setor: setNorm,
        localizavel: locNorm || loc,
        localEspecifico: locNorm || loc,
        chaveLocalizacao: chaveLocalizacao,
        chaveCompleta: chaveCompleta,
        chaveLocalizacaoSetor: chaveLocalizacaoSetor,
        patrimonio: String((r.f[6] && r.f[6].v) || "-"),
        status: String((r.f[7] && r.f[7].v) || "ECD"),
        observacao: String((r.f[8] && r.f[8].v) || "")
      });
    });

    return {
      itens: lista,
      estruturaArvore: estruturaArvore
    };
  } catch (err) {
    throw new Error("Erro ao carregar itens para checklist: " + err.message);
  }
}

function limparSQL(t) { 
  return String(t || '').replace(/'/g, "\\'"); 
}

// =========================================================================
// ROTA PÚBLICA / QR CODE: CONSULTA PÚBLICA DE CHECKLIST (SOMENTE LEITURA)
// =========================================================================
function getDadosChecklistPublico(omeParam, subParam, setorParam) {
  try {
    var omeClean = String(omeParam || "").trim();
    var subClean = String(subParam || "").trim();
    var setorClean = String(setorParam || "").trim();

    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeClean) : omeClean;

    var sql = "SELECT ITEM, OBJETO, UNIDADE, SUBUNIDADE, SETOR, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, N_PATRIMONIO, STATUS, OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
              "WHERE 1=1 ";

    // Filtro de OME
    if (omePadrao && omePadrao.toUpperCase() !== "TODAS" && omePadrao.toUpperCase() !== "TODAS AS OMES") {
      var inOme = (typeof obterVariacoesOmeParaSql_ === 'function') ? obterVariacoesOmeParaSql_(omePadrao) : ("'" + omePadrao.replace(/'/g, "\\'") + "'");
      sql += "AND (UPPER(TRIM(UNIDADE)) IN (" + inOme + ") ";
      var siglaOme = (typeof resumirOme === 'function') ? resumirOme(omePadrao) : "";
      if (siglaOme && siglaOme !== "-") {
        sql += "OR UPPER(TRIM(UNIDADE)) = '" + siglaOme.toUpperCase().replace(/'/g, "\\'") + "' ";
        sql += "OR UPPER(UNIDADE) LIKE '" + siglaOme.toUpperCase().replace(/'/g, "\\'") + " %' ";
      }
      sql += ") ";
    }

    // Filtro de Subunidade
    if (subClean && subClean.toUpperCase() !== "GERAL" && subClean.toUpperCase() !== "TODAS" && subClean.toUpperCase() !== "TODAS AS SUBUNIDADES") {
      var subSqlEsc = subClean.toUpperCase().replace(/'/g, "\\'");
      if (subClean.toUpperCase() === "SEDE") {
        sql += "AND (SUBUNIDADE IS NULL OR TRIM(SUBUNIDADE) = '' OR TRIM(SUBUNIDADE) = '-' OR UPPER(TRIM(SUBUNIDADE)) = 'GERAL' OR UPPER(TRIM(SUBUNIDADE)) = 'SEDE' OR UPPER(TRIM(SUBUNIDADE)) = UPPER(TRIM(UNIDADE))) ";
      } else {
        var mSb = subClean.match(/(\d+)[ªaºo]?\s*(SB|SBI|SBS|SBSA|SATec)/i);
        if (mSb) {
          var numSb = mSb[1];
          var tipSb = mSb[2].toUpperCase();
          if (tipSb === "SBI") tipSb = "SB";
          sql += "AND (UPPER(TRIM(SUBUNIDADE)) = '" + subSqlEsc + "' " +
                 "OR UPPER(SUBUNIDADE) LIKE '%" + numSb + "%" + tipSb + "%' " +
                 "OR UPPER(SUBUNIDADE) LIKE '%" + numSb + "%SEÇÃO%BOMBEIRO%' " +
                 "OR UPPER(SUBUNIDADE) LIKE '%" + subSqlEsc + "%') ";
        } else {
          sql += "AND (UPPER(TRIM(SUBUNIDADE)) = '" + subSqlEsc + "' OR UPPER(SUBUNIDADE) LIKE '%" + subSqlEsc + "%') ";
        }
      }
    }

    // Filtro de Setor / Divisão
    if (setorClean && setorClean.toUpperCase() !== "TODOS" && setorClean.toUpperCase() !== "TODOS OS SETORES" && setorClean.toUpperCase() !== "GERAL") {
      var setSqlEsc = setorClean.toUpperCase().replace(/'/g, "\\'");
      sql += "AND (UPPER(TRIM(SETOR)) = '" + setSqlEsc + "' OR UPPER(SETOR) LIKE '%" + setSqlEsc + "%' OR UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = '" + setSqlEsc + "' OR UPPER(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario) LIKE '%" + setSqlEsc + "%') ";
    }

    sql += "ORDER BY SUBUNIDADE ASC, SETOR ASC, LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario ASC, ITEM ASC";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];
    var itens = [];
    var contEcd = 0;
    var contAcautelado = 0;
    var contScd = 0;

    rows.forEach(function(r) {
      if (!r || !r.f) return;
      var itemCod = String((r.f[0] && r.f[0].v) || "");
      var obj = String((r.f[1] && r.f[1].v) || "");
      var unid = String((r.f[2] && r.f[2].v) || "");
      var sub = String((r.f[3] && r.f[3].v) || "");
      var set = String((r.f[4] && r.f[4].v) || "");
      var loc = String((r.f[5] && r.f[5].v) || "");
      var patr = String((r.f[6] && r.f[6].v) || "-");
      var st = String((r.f[7] && r.f[7].v) || "ECD").trim().toUpperCase();
      var obs = String((r.f[8] && r.f[8].v) || "");

      if (st === "ECD" || st === "DISPONÍVEL" || st === "DISPONIVEL") {
        st = "ECD";
        contEcd++;
      } else if (st === "ACAUTELADO") {
        contAcautelado++;
      } else if (st === "SCD" || st === "INSERVÍVEL" || st === "INSERVIVEL") {
        st = "SCD";
        contScd++;
      }

      itens.push({
        item: itemCod,
        objeto: obj,
        unidade: unid,
        subunidade: sub,
        setor: set,
        localizacao: loc || set || sub,
        localEspecifico: loc,
        patrimonio: patr,
        status: st,
        observacao: obs
      });
    });

    return {
      ome: omeClean || "CBMPE",
      subunidade: subClean || "SEDE",
      setor: setorClean || "Geral",
      totalItens: itens.length,
      contEcd: contEcd,
      contAcautelado: contAcautelado,
      contScd: contScd,
      itens: itens
    };
  } catch (err) {
    console.error("Erro em getDadosChecklistPublico: " + err.message);
    return {
      ome: omeParam || "",
      subunidade: subParam || "",
      setor: setorParam || "",
      totalItens: 0,
      contEcd: 0,
      contAcautelado: 0,
      contScd: 0,
      itens: [],
      erro: err.message
    };
  }
}

function enviarChecklistInconsistencias(dados) {
  if (!dados) {
    throw new Error("Nenhum dado foi recebido pelo servidor.");
  }

  var cpfMilitar = String(dados.cpfMilitar || "").trim();
  var inconsistencias = dados.inconsistencias || []; 

  if (!cpfMilitar) {
    throw new Error("Informe o seu CPF para assinar e registrar o checklist.");
  }

  var omeMilitar = "DLOG";
  var subunidadeMilitar = "GERAL";
  
  try {
    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    if (sheetLogins && sheetLogins.getLastRow() > 1) {
      var dadosUsers = sheetLogins.getRange(2, 1, sheetLogins.getLastRow() - 1, 6).getValues();
      for (var u = 0; u < dadosUsers.length; u++) {
        var rowCpf = String(dadosUsers[u][1] || "").trim(); // Coluna B: CPF
        if (rowCpf === cpfMilitar) {
          var omeLida = String(dadosUsers[u][3] || "").trim();     // Coluna D: OME
          var subLida = String(dadosUsers[u][5] || "").trim();     // Coluna F: Subunidade
          
          if (omeLida) {
            omeMilitar = obterOmePadronizada(omeLida);
          }
          if (subLida) {
            subunidadeMilitar = subLida;
          }
          break;
        }
      }
    }
  } catch (e) {
    console.error("Erro ao buscar dados do militar pelo CPF: " + e.message);
  }

  // Captura a data atual já ajustada para a string no formato ISO com o fuso correto de Recife (-03:00)
  var agora = new Date();
  // Formata o timestamp exato em string para o padrão SQL com o offset de Pernambuco (-03:00)
  var dataIsoLocal = Utilities.formatDate(agora, "America/Recife", "yyyy-MM-dd'T'HH:mm:ss") + "-03:00";

  var idLogOuTicket = "CHK-" + new Date().getTime();
  var dataFormatadaBr = Utilities.formatDate(agora, "America/Recife", "HH:mm:ss dd/MM/yyyy");

  var cpfClean = limparSQL(cpfMilitar);
  var omeClean = limparSQL(omeMilitar);
  var subunidadeClean = limparSQL(subunidadeMilitar);
  var dataClean = limparSQL(dataIsoLocal);
  var idClean = limparSQL(idLogOuTicket);

  var divisoesInspecionadas = dados.divisoesInspecionadas || [];
  var sqlInserts = [];

  if (divisoesInspecionadas && divisoesInspecionadas.length > 0) {
    divisoesInspecionadas.forEach(function(div, dIdx) {
      var nomeDiv = String(div.nome || "Divisão").trim();
      var subDiv = String(div.subunidade || subunidadeClean).trim();
      var omeDiv = String(div.ome || omeClean).trim();
      var totalItensDiv = parseInt(div.totalItens || 0);

      // Filtra as avarias que pertencem a esta divisão inspecionada
      var avariasDiv = inconsistencias.filter(function(inc) {
        var bateSub = !inc.subunidade || !subDiv || (inc.subunidade.toUpperCase() === subDiv.toUpperCase());
        return bateSub && (
          (inc.divisaoNome && inc.divisaoNome === nomeDiv) ||
          (inc.localizacao && inc.localizacao.indexOf(nomeDiv) !== -1)
        );
      });

      if (avariasDiv.length === 0) {
        // Divisão vistoriada sem nenhuma avaria (100% conforme)
        sqlInserts.push(
          "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
          "(ID_TICKET_OU_LOG, DATA_HORA, CPF_INSPETOR, OME, SUBUNIDADE, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, STATUS_TICKET) " +
          "VALUES ('" + idClean + "-D" + (dIdx + 1) + "', CAST('" + dataClean + "' AS TIMESTAMP), '" + cpfClean + "', '" + limparSQL(omeDiv) + "', '" + limparSQL(subDiv) + "', '', '', 'VISTORIA CONCLUÍDA - " + limparSQL(nomeDiv) + "', 'Divisão vistoriada sem alterações (" + totalItensDiv + " itens conformes)', 'CONFORME_DIARIO')"
        );
      } else {
        // Divisão vistoriada com avarias
        sqlInserts.push(
          "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
          "(ID_TICKET_OU_LOG, DATA_HORA, CPF_INSPETOR, OME, SUBUNIDADE, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, STATUS_TICKET) " +
          "VALUES ('" + idClean + "-D" + (dIdx + 1) + "-SUM', CAST('" + dataClean + "' AS TIMESTAMP), '" + cpfClean + "', '" + limparSQL(omeDiv) + "', '" + limparSQL(subDiv) + "', '', '', 'VISTORIA COM APONTAMENTOS - " + limparSQL(nomeDiv) + "', '" + avariasDiv.length + " avaria(s) em " + totalItensDiv + " itens inspecionados', 'REGISTRO_VISTORIA')"
        );

        avariasDiv.forEach(function(inc, aIdx) {
          sqlInserts.push(
            "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
            "(ID_TICKET_OU_LOG, DATA_HORA, CPF_INSPETOR, OME, SUBUNIDADE, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, STATUS_TICKET) " +
            "VALUES ('" + idClean + "-D" + (dIdx + 1) + "-" + (aIdx + 1) + "', CAST('" + dataClean + "' AS TIMESTAMP), '" + cpfClean + "', '" + limparSQL(inc.unidade || omeDiv) + "', '" + limparSQL(inc.subunidade || subDiv) + "', '" + limparSQL(inc.itemId) + "', '" + limparSQL(inc.objeto) + "', '" + limparSQL(inc.localizacao) + "', '" + limparSQL(inc.avaria) + "', 'AGUARDANDO_CHEFE')"
          );
        });
      }
    });
  } else {
    // Modo de compatibilidade legado se divisoesInspecionadas não for enviado
    if (inconsistencias.length === 0) {
      sqlInserts.push(
        "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
        "(ID_TICKET_OU_LOG, DATA_HORA, CPF_INSPETOR, OME, SUBUNIDADE, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, STATUS_TICKET) " +
        "VALUES ('" + idClean + "', CAST('" + dataClean + "' AS TIMESTAMP), '" + cpfClean + "', '" + omeClean + "', '" + subunidadeClean + "', '', '', 'INSPEÇÃO GERAL DA UNIDADE - SEM ALTERAÇÕES', '', 'CONFORME_DIARIO')"
      );
    } else {
      sqlInserts.push(
        "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
        "(ID_TICKET_OU_LOG, DATA_HORA, CPF_INSPETOR, OME, SUBUNIDADE, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, STATUS_TICKET) " +
        "VALUES ('" + idClean + "', CAST('" + dataClean + "' AS TIMESTAMP), '" + cpfClean + "', '" + omeClean + "', '" + subunidadeClean + "', '', '', 'INSPEÇÃO REALIZADA COM APONTAMENTOS', '', 'REGISTRO_VISTORIA')"
      );

      inconsistencias.forEach(function(inc, index) {
        sqlInserts.push(
          "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
          "(ID_TICKET_OU_LOG, DATA_HORA, CPF_INSPETOR, OME, SUBUNIDADE, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, STATUS_TICKET) " +
          "VALUES ('" + idClean + "-" + (index + 1) + "', CAST('" + dataClean + "' AS TIMESTAMP), '" + cpfClean + "', '" + omeClean + "', '" + limparSQL(subunidadeClean) + "', '" + limparSQL(inc.itemId) + "', '" + limparSQL(inc.objeto) + "', '" + limparSQL(inc.localizacao) + "', '" + limparSQL(inc.avaria) + "', 'AGUARDANDO_CHEFE')"
        );
      });
    }
  }

  sqlInserts.forEach(function(sql) {
    executarConsultaBigQuerySegura(sql, true);
  });

  var tipoLancamento = inconsistencias.length === 0 ? "Inspeção" : "Inspeção e Registro de Avarias";
  var msgRetorno = inconsistencias.length === 0 
    ? "Inspeção realizada com sucesso em " + dataFormatadaBr + " (Status: Vistoria Concluída sem alterações)." 
    : "Inspeção realizada com Registro de Avarias (" + inconsistencias.length + " itens) enviado para validação do Chefe de Setor!";

  var itensChecklistTxt = "";
  if (inconsistencias.length > 0) {
    var paresInc = inconsistencias.slice(0, 10).map(function(inc) {
      return (inc.itemId ? inc.itemId + " " : "") + (inc.objeto ? "(" + inc.objeto + ")" : "");
    }).filter(Boolean);
    itensChecklistTxt = ". Avarias apontadas: [" + paresInc.join("; ") + (inconsistencias.length > 10 ? "; e mais " + (inconsistencias.length - 10) + " itens" : "") + "]";
  }
  registrarLogAuditoria(
    "CHECKLIST_ENVIO", 
    "Militar CPF " + cpfMilitar + " realizou lançamento de " + tipoLancamento + " para a OME " + omeClean + " / Subunidade " + subunidadeClean + itensChecklistTxt
  );
  return { sucesso: true, mensagem: msgRetorno };
}

// 3. Validação pelo Chefe do Setor: Assina, insere o template SEI e altera o status do material para SCD
function validarTicketChecklistChefe(dados) {
  try {
    var cpfChefe = String(dados.cpfChefe || "").trim();
    var templateSei = String(dados.templateSei || "").trim();
    var itensParaBaixa = dados.itensParaBaixa || [];

    if (!cpfChefe || !templateSei || itensParaBaixa.length === 0) {
      throw new Error("Informe seu CPF, o número do Template SEI e selecione ao menos um item.");
    }

    // Valida o chefe na base de logins
    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxNome = cabecalho.indexOf("Nome");

    var chefeValido = null;
    var perfilChefe = "";
    var idxPerfil = cabecalho.indexOf("Perfil");
    var idxPerms = cabecalho.indexOf("Permissoes");
    var permissoesChefe = "";

    for (var i = 1; i < dadosUsers.length; i++) {
      var rowCpf = String(dadosUsers[i][idxCpf] || "").trim();
      var rowCpfLimpo = rowCpf.replace(/\D/g, "");
      if (rowCpf === cpfChefe || (rowCpfLimpo && rowCpfLimpo === cpfChefeLimpo)) {
        chefeValido = String(dadosUsers[i][idxNome] || "Comandante de Unidade").trim();
        perfilChefe = idxPerfil !== -1 ? String(dadosUsers[i][idxPerfil] || "").trim() : "";
        permissoesChefe = idxPerms !== -1 ? String(dadosUsers[i][idxPerms] || "").trim() : "";
        break;
      }
    }

    if (!chefeValido) {
      throw new Error("CPF não encontrado na base de dados de usuários.");
    }

    var perfilChefeNorm = perfilChefe.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var ehAdminChefe = perfilChefeNorm.indexOf("admin") !== -1;
    var ehComandanteChefe = perfilChefeNorm.indexOf("comandante") !== -1 || perfilChefeNorm.indexOf("chefe") !== -1;
    var temPermissaoValidar = permissoesChefe.indexOf("validar_checklist") !== -1;

    if (!ehAdminChefe && !ehComandanteChefe && !temPermissaoValidar) {
      throw new Error("Acesso negado: apenas Administradores, Comandantes de Unidade ou militares com permissão específica podem validar baixas de checklist.");
    }

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }
    var listaSql = itensParaBaixa.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");

    // 1. Atualiza o status do material no inventário principal para SCD
    var obsTexto = "Baixado para SCD via Checklist validado por " + chefeValido + " (SEI: " + templateSei + ")";
    var sqlUpdateInventario = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` SET " +
                              "STATUS = 'SCD', " +
                              "SE_EXTRAVIADO_OU_SCD_N_DOC_SEI = '" + limparSQL(templateSei) + "', " +
                              "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | " + limparSQL(obsTexto) + "') " +
                              "WHERE ITEM IN (" + listaSql + ")";

    executarConsultaBigQuerySegura(sqlUpdateInventario, true);

    // 2. Atualiza o status do ticket na tabela tb_CheckList para CONCLUIDO_SCD
    var sqlUpdateChecklist = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` SET " +
                             "STATUS_TICKET = 'CONCLUIDO_SCD' " +
                             "WHERE ITEM_ID IN (" + listaSql + ") AND UPPER(TRIM(STATUS_TICKET)) = 'AGUARDANDO_CHEFE'";

    executarConsultaBigQuerySegura(sqlUpdateChecklist, true);

    var descMatsValCheck = [];
    try {
      var resMVal = executarConsultaBigQuerySegura("SELECT DISTINCT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + listaSql + ")");
      if (resMVal.rows) {
        resMVal.rows.forEach(function(r) { if (r.f && r.f[0] && r.f[0].v) descMatsValCheck.push(r.f[0].v); });
      }
    } catch(eMVal) {}
    var descMatTxtVal = descMatsValCheck.length > 0 ? " (" + descMatsValCheck.join(", ") + ")" : "";
    var itensTxtVal = itensParaBaixa.length <= 10 ? itensParaBaixa.join(", ") : (itensParaBaixa.slice(0, 10).join(", ") + " e mais " + (itensParaBaixa.length - 10) + " itens");
    registrarLogAuditoria(
      "CHECKLIST_VALIDADO_CHEFE", 
      "Chefe " + chefeValido + " validou baixa SCD para " + itensParaBaixa.length + " item(ns)" + descMatTxtVal + " com SEI " + templateSei + ". Código(s) ITEM: [" + itensTxtVal + "]",
      chefeValido
    );
    return { sucesso: true, mensagem: "Validação concluída! Os itens selecionados foram alterados para SCD." };
  } catch (err) {
    throw new Error("Erro ao validar checklist: " + err.message);
  }
}

// 3.1 Invalidação pelo Chefe do Setor / Validador: Nega a baixa de avaria com justificativa obrigatória e altera status do ticket para INVALIDADO
function invalidarTicketChecklistChefe(dados) {
  try {
    var cpfChefe = String(dados.cpfChefe || "").trim();
    var justificativa = String(dados.justificativa || "").trim();
    var itensParaInvalidar = dados.itensParaInvalidar || [];
    var idsTickets = dados.idsTickets || [];

    if (!cpfChefe || !justificativa || (itensParaInvalidar.length === 0 && idsTickets.length === 0)) {
      throw new Error("Informe seu CPF, a justificativa da invalidação e selecione ao menos um apontamento.");
    }

    if (justificativa.length < 5) {
      throw new Error("A justificativa deve conter no mínimo 5 caracteres informando o motivo da invalidação.");
    }

    var cpfChefeLimpo = cpfChefe.replace(/\D/g, "");

    // Valida o chefe na base de logins
    var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
    var dadosUsers = sheetLogins.getDataRange().getValues();
    var cabecalho = dadosUsers[0];
    var idxCpf = cabecalho.indexOf("CPF");
    var idxNome = cabecalho.indexOf("Nome");
    var idxPerfil = cabecalho.indexOf("Perfil");
    var idxPerms = cabecalho.indexOf("Permissoes");

    var chefeValido = null;
    var perfilChefe = "";
    var permissoesChefe = "";

    for (var i = 1; i < dadosUsers.length; i++) {
      var rowCpf = String(dadosUsers[i][idxCpf] || "").trim();
      var rowCpfLimpo = rowCpf.replace(/\D/g, "");
      if (rowCpf === cpfChefe || (rowCpfLimpo && rowCpfLimpo === cpfChefeLimpo)) {
        chefeValido = String(dadosUsers[i][idxNome] || "Comandante de Unidade").trim();
        perfilChefe = idxPerfil !== -1 ? String(dadosUsers[i][idxPerfil] || "").trim() : "";
        permissoesChefe = idxPerms !== -1 ? String(dadosUsers[i][idxPerms] || "").trim() : "";
        break;
      }
    }

    if (!chefeValido) {
      throw new Error("CPF não encontrado na base de dados de usuários.");
    }

    var perfilChefeNorm = perfilChefe.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var ehAdminChefe = perfilChefeNorm.indexOf("admin") !== -1;
    var ehComandanteChefe = perfilChefeNorm.indexOf("comandante") !== -1 || perfilChefeNorm.indexOf("chefe") !== -1;
    var temPermissaoValidar = permissoesChefe.indexOf("validar_checklist") !== -1;

    if (!ehAdminChefe && !ehComandanteChefe && !temPermissaoValidar) {
      throw new Error("Acesso negado: apenas Administradores, Comandantes de Unidade ou militares com permissão específica podem invalidar apontamentos de checklist.");
    }

    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    var condicoesWhere = [];
    if (itensParaInvalidar.length > 0) {
      var listaItensSql = itensParaInvalidar.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
      condicoesWhere.push("ITEM_ID IN (" + listaItensSql + ")");
    }
    if (idsTickets.length > 0) {
      var listaTicketsSql = idsTickets.map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
      condicoesWhere.push("ID_TICKET_OU_LOG IN (" + listaTicketsSql + ")");
      idsTickets.forEach(function(tk) {
        condicoesWhere.push("ID_TICKET_OU_LOG LIKE '" + limparSQL(tk) + "%'");
      });
    }

    var clausulaWhereItens = "(" + condicoesWhere.join(" OR ") + ")";

    var agora = new Date();
    var dataFormatadaBr = Utilities.formatDate(agora, "America/Recife", "dd/MM/yyyy HH:mm");

    var textoHistorico = " [APONTAMENTO INVALIDADO por " + chefeValido + " em " + dataFormatadaBr + ". Motivo: " + justificativa + "]";

    // 1. Atualiza o status do ticket na tabela tb_CheckList para INVALIDADO e registra a justificativa em AVARIA_RELATADA
    var sqlUpdateChecklist = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` SET " +
                             "STATUS_TICKET = 'INVALIDADO', " +
                             "AVARIA_RELATADA = CONCAT(COALESCE(AVARIA_RELATADA, ''), ' | " + limparSQL(textoHistorico) + "') " +
                             "WHERE " + clausulaWhereItens + " AND UPPER(TRIM(STATUS_TICKET)) = 'AGUARDANDO_CHEFE'";

    executarConsultaBigQuerySegura(sqlUpdateChecklist, true);

    var qtdItensAfetados = itensParaInvalidar.length || idsTickets.length;
    var descMatsInv = [];
    if (itensParaInvalidar.length > 0) {
      try {
        var lSqlInv = itensParaInvalidar.slice(0, 10).map(function(id) { return "'" + limparSQL(id) + "'"; }).join(",");
        var resMInv = executarConsultaBigQuerySegura("SELECT DISTINCT OBJETO FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` WHERE ITEM IN (" + lSqlInv + ")");
        if (resMInv.rows) {
          resMInv.rows.forEach(function(r) { if (r.f && r.f[0] && r.f[0].v) descMatsInv.push(r.f[0].v); });
        }
      } catch(eMInv) {}
    }
    var descMatTxtInv = descMatsInv.length > 0 ? " (" + descMatsInv.join(", ") + ")" : "";
    var itensTxtInv = itensParaInvalidar.length > 0 ? (". Código(s) ITEM: [" + (itensParaInvalidar.length <= 10 ? itensParaInvalidar.join(", ") : (itensParaInvalidar.slice(0, 10).join(", ") + " e mais " + (itensParaInvalidar.length - 10) + " itens")) + "]") : "";
    registrarLogAuditoria(
      "CHECKLIST_APONTAMENTO_INVALIDADO", 
      "Chefe " + chefeValido + " (CPF " + cpfChefe + ") invalidou o apontamento de avaria de " + qtdItensAfetados + " item(ns)" + descMatTxtInv + itensTxtInv + ". Motivo: " + justificativa,
      chefeValido
    );

    return { 
      sucesso: true, 
      mensagem: "Apontamento invalidado com sucesso! A baixa de avaria foi negada e a justificativa foi registrada no histórico." 
    };
  } catch (err) {
    throw new Error("Erro ao invalidar apontamento: " + err.message);
  }
}

// Lista os tickets de checklist pendentes de validação filtrados pelo perfil:
// - Usuário: apenas pendências criadas por ele (por CPF_INSPETOR)
// - Chefe de Setor: todas as pendências da sua OME
// - Administrador: todas as pendências da base (com filtro opcional por OME)
function getTicketsChecklistPendentes(omeUsuario, perfilUsuario, cpfUsuario) {
  try {
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\'"); }

    var perfil = String(perfilUsuario || "").trim();
    var ome = String(omeUsuario || "").trim().toUpperCase();
    var cpfLimpo = String(cpfUsuario || "").replace(/\D/g, "");

    // Busca usuário cadastrado na base de logins para validação segura de perfil e OME
    var usuarioSessao = null;
    if (cpfLimpo) {
      usuarioSessao = verificarPermissaoUsuario(cpfLimpo);
    }
    if (!usuarioSessao) {
      try { usuarioSessao = getDadosUsuarioLogado(); } catch (e) {}
    }

    if (usuarioSessao && usuarioSessao.cpf && !cpfLimpo) {
      cpfLimpo = String(usuarioSessao.cpf).replace(/\D/g, "");
    }

    // Perfil normalizado para determinar as regras de visibilidade
    var perfilEfetivo = perfil;
    if (usuarioSessao && usuarioSessao.perfil) {
      perfilEfetivo = usuarioSessao.perfil;
    }
    var perfilNorm = String(perfilEfetivo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    var ehAdmin = perfilNorm.indexOf("admin") !== -1;
    var ehChefe = perfilNorm.indexOf("chefe") !== -1 || perfilNorm.indexOf("comandante") !== -1;
    var temPermValidar = false;
    var temPermTodaOme = false;
    if (usuarioSessao && usuarioSessao.permissoes) {
      if (Array.isArray(usuarioSessao.permissoes)) {
        temPermValidar = usuarioSessao.permissoes.indexOf("validar_checklist") !== -1;
        temPermTodaOme = usuarioSessao.permissoes.indexOf("checklist_toda_ome") !== -1;
      } else if (typeof usuarioSessao.permissoes === "string") {
        temPermValidar = usuarioSessao.permissoes.indexOf("validar_checklist") !== -1;
        temPermTodaOme = usuarioSessao.permissoes.indexOf("checklist_toda_ome") !== -1;
      }
    }
    var podeValidarOme = ehChefe || temPermValidar || temPermTodaOme;

    var condicoes = ["UPPER(TRIM(STATUS_TICKET)) = 'AGUARDANDO_CHEFE'"];

    if (!ehAdmin && !podeValidarOme) {
      // 1. Perfil Usuário sem permissão de validação: enxerga APENAS as pendências criadas por ele (filtro estrito por CPF do inspetor)
      if (cpfLimpo) {
        condicoes.push("(REGEXP_REPLACE(COALESCE(CPF_INSPETOR, ''), r'\\D', '') = '" + limparSQL(cpfLimpo) + "' OR CPF_INSPETOR LIKE '%" + limparSQL(cpfLimpo) + "%')");
      } else {
        // Bloqueio de segurança se não houver CPF identificado
        condicoes.push("1 = 0");
      }
    } else if (podeValidarOme && !ehAdmin) {
      // 2. Comandante de Unidade ou Usuário autorizado: enxerga TODAS as pendências pertencentes à sua OME
      var omeChefe = "";
      if (usuarioSessao && usuarioSessao.ome && usuarioSessao.ome !== "TODAS") {
        omeChefe = String(usuarioSessao.ome).trim().toUpperCase();
      } else if (ome && ome !== "TODAS") {
        omeChefe = ome;
      }
      if (omeChefe) {
        condicoes.push("UPPER(TRIM(OME)) = '" + limparSQL(omeChefe) + "'");
      } else {
        condicoes.push("1 = 0");
      }
    } else if (ehAdmin) {
      // 3. Perfil Administrador: enxerga TODAS as pendências da base (ou filtra por OME se especificado)
      if (ome && ome !== "TODAS") {
        condicoes.push("UPPER(TRIM(OME)) = '" + limparSQL(ome) + "'");
      }
      // Se 'TODAS' ou não informado, não adiciona restrição de OME, retornando toda a base
    }

    var sqlWhere = "WHERE " + condicoes.join(" AND ");

    // Como o campo já armazena a hora local de Recife, usamos FORMAT_DATETIME
    var sql = "SELECT ID_TICKET_OU_LOG, FORMAT_DATETIME('%H:%M:%S %d/%m/%Y', DATA_HORA) as DATA_FORMATADA, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, CPF_INSPETOR, STATUS_TICKET, OME, SUBUNIDADE " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
              sqlWhere + " " +
              "ORDER BY DATA_HORA DESC LIMIT 500";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];

    // Mapa auxiliar para obter o nome do militar a partir do CPF
    var mapaNomes = {};
    try {
      var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
      var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
      if (sheetLogins && sheetLogins.getLastRow() > 1) {
        var dadosUsers = sheetLogins.getDataRange().getValues();
        for (var u = 1; u < dadosUsers.length; u++) {
          var cLimpo = String(dadosUsers[u][1] || "").replace(/\D/g, "");
          var nCompleto = String(dadosUsers[u][2] || "").trim();
          if (cLimpo && nCompleto) {
            mapaNomes[cLimpo] = nCompleto;
          }
        }
      }
    } catch (eMapa) {
      console.warn("Não foi possível carregar mapa de nomes de usuários: " + eMapa.message);
    }

    var ticketsMap = {};

    rows.forEach(function(r) {
      var idCompleto = String(r.f[0].v || "");
      var idTicket = idCompleto.includes("-") ? idCompleto.substring(0, idCompleto.lastIndexOf("-")) : idCompleto;
      var dataHora = String(r.f[1].v || "");
      var itemId = String(r.f[2].v || "");
      var material = String(r.f[3].v || "");
      var local = String(r.f[4].v || "");
      var avaria = String(r.f[5].v || "");
      var cpfInsp = String(r.f[6].v || "");
      var statusTicket = String(r.f[7] ? (r.f[7].v || "") : "AGUARDANDO_CHEFE");
      var omeTicket = String(r.f[8] ? (r.f[8].v || "") : "");
      var subTicket = String(r.f[9] ? (r.f[9].v || "") : "");

      var cpfInspLimpo = cpfInsp.replace(/\D/g, "");
      var nomeInsp = mapaNomes[cpfInspLimpo] || "";

      if (!ticketsMap[idTicket]) {
        ticketsMap[idTicket] = {
          idTicket: idTicket,
          data: dataHora,
          cpfInspecao: cpfInsp,
          nomeInspetor: nomeInsp,
          ome: omeTicket,
          subunidade: subTicket,
          status: statusTicket,
          itens: []
        };
      }

      ticketsMap[idTicket].itens.push({
        itemId: itemId,
        material: material,
        local: local,
        avaria: avaria,
        cpfInspecao: cpfInsp,
        nomeInspetor: nomeInsp,
        ome: omeTicket,
        subunidade: subTicket,
        status: statusTicket,
        idTicket: idTicket,
        data: dataHora
      });
    });

    var listaTickets = [];
    for (var t in ticketsMap) {
      listaTickets.push(ticketsMap[t]);
    }

    return listaTickets;
  } catch (err) {
    console.error("Erro em getTicketsChecklistPendentes (BigQuery): " + err.message);
    return [];
  }
}

// 4. Consulta Geral da base tb_CheckList no BigQuery com filtros por OME, Subunidade, Data e CPF
function consultarBaseChecklistBigQuery(filtros) {
  try {
    filtros = filtros || {};
    
    // Identificação do perfil do usuário:
    var usuarioSessao = null;
    var cpfUsuarioSessao = String(filtros.cpfUsuario || "").trim();
    if (cpfUsuarioSessao) {
      usuarioSessao = verificarPermissaoUsuario(cpfUsuarioSessao);
      if (!usuarioSessao) {
        usuarioSessao = verificarPermissaoUsuario(cpfUsuarioSessao.replace(/\D/g, ""));
      }
    }
    
    if (!usuarioSessao) {
      try {
        usuarioSessao = getDadosUsuarioLogado();
      } catch (e) {}
    }

    var perfil = "";
    var omeUsuario = "";
    if (usuarioSessao && usuarioSessao.perfil && usuarioSessao.perfil !== "Usuário") {
      perfil = String(usuarioSessao.perfil).trim();
      omeUsuario = String(usuarioSessao.ome || "").trim();
    } else {
      // Fallback para perfil e OME enviados pelo cliente logado
      perfil = String(filtros.perfilUsuario || (usuarioSessao ? usuarioSessao.perfil : "") || "Usuário").trim();
      omeUsuario = String(filtros.omeUsuario || (usuarioSessao ? usuarioSessao.ome : "") || "").trim();
    }

    var perfilLower = perfil.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var ehPerfilUsuario = perfilLower.indexOf("usuario") !== -1 || perfilLower.indexOf("usu") !== -1;
    var ehAdmin = perfilLower.indexOf("admin") !== -1 || (omeUsuario.toUpperCase() === "DLOG" && !ehPerfilUsuario);
    var ehChefe = perfilLower.indexOf("chefe") !== -1 || perfilLower.indexOf("comandante") !== -1;
    var temPermChecklist = false;
    var temPermTodaOme = false;
    if (usuarioSessao && usuarioSessao.permissoes) {
      if (Array.isArray(usuarioSessao.permissoes)) {
        temPermChecklist = usuarioSessao.permissoes.indexOf("validar_checklist") !== -1;
        temPermTodaOme = usuarioSessao.permissoes.indexOf("checklist_toda_ome") !== -1;
      } else if (typeof usuarioSessao.permissoes === "string") {
        temPermChecklist = usuarioSessao.permissoes.indexOf("validar_checklist") !== -1;
        temPermTodaOme = usuarioSessao.permissoes.indexOf("checklist_toda_ome") !== -1;
      }
    }

    if (!ehAdmin && !ehChefe && !temPermChecklist && !temPermTodaOme) {
      throw new Error("Acesso negado: você não possui permissão para consultar ou validar a base de checklists.");
    }

    var omeFiltro = "";
    if (ehAdmin) {
      omeFiltro = String(filtros.ome || "").trim();
    } else {
      // Comandante de Unidade ou militar com permissão autorizada: estritamente restrito aos materiais da sua OME
      omeFiltro = omeUsuario || String(filtros.ome || "").trim();
    }

    var condicoes = [];

    if (omeFiltro && omeFiltro !== "TODAS") {
      var omePadrao = typeof obterOmePadronizada === "function" ? obterOmePadronizada(omeFiltro) : omeFiltro;
      condicoes.push("UPPER(TRIM(OME)) = '" + limparSQL(omePadrao.toUpperCase()) + "'");
    }

    var subFiltro = String(filtros.subunidade || "").trim();
    if (subFiltro && subFiltro !== "TODAS") {
      condicoes.push("UPPER(TRIM(SUBUNIDADE)) = '" + limparSQL(subFiltro.toUpperCase()) + "'");
    }

    var cpfFiltro = String(filtros.cpf || "").replace(/\D/g, "");
    if (cpfFiltro) {
      condicoes.push("(REGEXP_REPLACE(COALESCE(CPF_INSPETOR, ''), r'\\D', '') LIKE '%" + limparSQL(cpfFiltro) + "%')");
    }

    var dtInicio = String(filtros.dataInicio || "").trim();
    if (dtInicio) {
      condicoes.push("DATE(DATA_HORA, 'America/Recife') >= '" + limparSQL(dtInicio) + "'");
    }

    var dtFim = String(filtros.dataFim || "").trim();
    if (dtFim) {
      condicoes.push("DATE(DATA_HORA, 'America/Recife') <= '" + limparSQL(dtFim) + "'");
    }

    var classFiltro = String(filtros.classificacao || "").trim().toUpperCase();
    if (classFiltro === "INSPECAO") {
      condicoes.push("(UPPER(STATUS_TICKET) IN ('CONFORME_DIARIO', 'REGISTRO_VISTORIA') OR ITEM_ID IS NULL OR TRIM(ITEM_ID) = '')");
    } else if (classFiltro === "AVARIA") {
      condicoes.push("(UPPER(STATUS_TICKET) NOT IN ('CONFORME_DIARIO', 'REGISTRO_VISTORIA') AND ITEM_ID IS NOT NULL AND TRIM(ITEM_ID) != '')");
    }

    var whereSql = condicoes.length > 0 ? "WHERE " + condicoes.join(" AND ") : "";

    var sql = "SELECT ID_TICKET_OU_LOG, " +
              "FORMAT_DATETIME('%d/%m/%Y %H:%M:%S', DATA_HORA) as DATA_FORMATADA, " +
              "CPF_INSPETOR, OME, SUBUNIDADE, ITEM_ID, MATERIAL, LOCALIZACAO, AVARIA_RELATADA, STATUS_TICKET " +
              "FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_CheckList` " +
              whereSql + " " +
              "ORDER BY DATA_HORA DESC LIMIT 500";

    var res = executarConsultaBigQuerySegura(sql);
    var rows = res.rows || [];

    // Mapeamento de nomes de militares por CPF a partir da base de logins
    var mapaNomes = {};
    try {
      var ssUser = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
      var sheetLogins = ssUser.getSheetByName(ABA_USUARIOS);
      if (sheetLogins && sheetLogins.getLastRow() > 1) {
        var dadosUsers = sheetLogins.getDataRange().getValues();
        for (var u = 1; u < dadosUsers.length; u++) {
          var cLimpo = String(dadosUsers[u][1] || "").replace(/\D/g, "");
          var nCompleto = String(dadosUsers[u][2] || "").trim();
          if (cLimpo && nCompleto) {
            mapaNomes[cLimpo] = nCompleto;
          }
        }
      }
    } catch(eNomes) {}

    var listaFormatada = rows.map(function(r) {
      var f = r.f || [];
      var cpfRaw = f[2] ? String(f[2].v || "") : "";
      var cpfDig = cpfRaw.replace(/\D/g, "");
      var nomeMilitar = mapaNomes[cpfDig] || "";

      var itemId = f[5] ? String(f[5].v || "") : "";
      var material = f[6] ? String(f[6].v || "") : "";
      var localizacao = f[7] ? String(f[7].v || "") : "";
      var avaria = f[8] ? String(f[8].v || "") : "";
      var status = f[9] ? String(f[9].v || "") : "";

      var stUpper = status.toUpperCase().trim();
      var locUpper = localizacao.toUpperCase().trim();
      var ehInspecao = (stUpper === 'CONFORME_DIARIO' || 
                        stUpper === 'REGISTRO_VISTORIA' || 
                        locUpper.indexOf('VISTORIA CONCLUÍDA') === 0 || 
                        locUpper.indexOf('INSPEÇÃO GERAL') === 0 || 
                        (!itemId && stUpper.indexOf('CHEFE') === -1 && stUpper.indexOf('SCD') === -1));

      var classificacao = ehInspecao ? "Inspeção" : "Registro de Avarias";

      return {
        id: f[0] ? String(f[0].v || "") : "",
        data: f[1] ? String(f[1].v || "") : "",
        cpf: cpfRaw,
        nomeMilitar: nomeMilitar,
        ome: f[3] ? String(f[3].v || "") : "",
        subunidade: f[4] ? String(f[4].v || "") : "",
        itemId: itemId,
        material: material,
        localizacao: localizacao,
        avaria: avaria,
        status: status,
        classificacao: classificacao
      };
    });

    return { sucesso: true, dados: listaFormatada, total: listaFormatada.length };
  } catch (err) {
    console.error("Erro em consultarBaseChecklistBigQuery: " + err.message);
    throw new Error("Erro ao consultar histórico de checklists: " + err.message);
  }
}

function diagnosticarSubunidadeLogins(cpfDigitado) {
  try {
    var cpfAlvo = String(cpfDigitado || "").trim();
    
    var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheet = ss.getSheetByName(ABA_USUARIOS);
    if (!sheet) return { sucesso: false, mensagem: "Aba 'Logins' não encontrada." };

    var dados = sheet.getDataRange().getValues();
    var cabecalho = dados[0];
    
    var relatorioLinhas = [];
    var usuarioEncontrado = null;

    for (var i = 1; i < dados.length; i++) {
      var rowEmail = String(dados[i][0] || "").trim();
      var rowCpf = String(dados[i][1] || "").trim();
      var rowNome = String(dados[i][2] || "").trim();
      var rowOme = String(dados[i][3] || "").trim();
      var rowPerfil = String(dados[i][4] || "").trim();
      var rowSubunidade = String(dados[i][5] || "").trim(); // Coluna F: Subunidade

      relatorioLinhas.push({
        linha: i + 1,
        email: rowEmail,
        cpf: rowCpf,
        nome: rowNome,
        subunidadeLida: rowSubunidade || "[VAZIO NA PLANILHA]"
      });

      // Cruza rigorosamente pelo CPF informado
      if (rowCpf && rowCpf === cpfAlvo) {
        usuarioEncontrado = {
          linha: i + 1,
          cpf: rowCpf,
          nome: rowNome,
          subunidade: rowSubunidade || "[VAZIO NA PLANILHA]"
        };
      }
    }

    return {
      sucesso: true,
      cpfPesquisado: cpfAlvo,
      usuarioEncontrado: usuarioEncontrado,
      totalLinhasLidas: dados.length - 1,
      amostraLinhas: relatorioLinhas
    };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}



function debugTestarResolucaoArvore(idLocalDestino, unidadeOme) {
  try {
    Logger.log("=== INÍCIO DO DEBUG DA ÁRVORE ===");
    Logger.log("ID de Destino recebido: " + idLocalDestino);
    Logger.log("OME recebida: " + unidadeOme);

    var locais = getArvoreLocais(unidadeOme);
    Logger.log("Total de locais encontrados na árvore da OME: " + (locais ? locais.length : 0));

    var mapaLocais = {};
    (locais || []).forEach(function(l) { 
      mapaLocais[String(l.id)] = l; 
      Logger.log("Local ID: " + l.id + " | Nome: " + l.nome + " | ID_Pai: " + l.idPai);
    });

    var atual = mapaLocais[String(idLocalDestino)];
    if (!atual) {
      Logger.log("ALERTA: O ID de destino não foi encontrado no mapa de locais!");
      return "ID não encontrado";
    }

    var caminhoArr = [];
    var ref = atual;
    
    while (ref) {
      caminhoArr.unshift(ref.nome);
      if (!ref.idPai || ref.idPai === "") break;
      ref = mapaLocais[String(ref.idPai)];
    }

    Logger.log("Caminho resolvido (Raiz -> Filho): " + JSON.stringify(caminhoArr));
    Logger.log("Subunidade resultante: " + (caminhoArr[0] || "N/D"));
    Logger.log("Setor resultante: " + (caminhoArr[1] || "N/D"));
    Logger.log("=== FIM DO DEBUG ===");

    return caminhoArr;
  } catch (err) {
    Logger.log("ERRO NO DEBUG: " + err.message);
    throw err;
  }
}

// Solicitar novo acesso
function solicitarAcessoUsuario(dados) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheet = ss.getSheetByName("CadastrosPendentes") || ss.insertSheet("CadastrosPendentes");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["ID_Solicitacao", "Data", "Nome", "Email", "CPF", "OME", "Subunidade", "Perfil", "PIN", "Status"]);
    }

    var idReq = "REQ-" + Date.now();
    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "yyyy-MM-dd HH:mm:ss");

    sheet.appendRow([
      idReq, dataHora,
      String(dados.nome || "").trim().toUpperCase(),
      String(dados.email || "").trim().toLowerCase(),
      String(dados.cpf || "").trim(),
      obterOmePadronizada(dados.ome || ""),
      String(dados.subunidade || "GERAL").trim().toUpperCase(),
      String(dados.perfil || "Usuário").trim(),
      String(dados.pin || "").trim(),
      "PENDENTE"
    ]);

    registrarLogAuditoria("SOLICITACAO_ACESSO", "Solicitação enviada por e-mail: " + dados.email);
    return { sucesso: true, mensagem: "Solicitação enviada com sucesso! Aguarde a validação do Administrador." };
  } catch (err) {
    throw new Error("Erro ao solicitar acesso: " + err.message);
  }
}



// Aprovar ou Recusar pelo Admin
// Aprovar ou Recusar pelo Admin
function avaliarCadastroPendentes(idSolicitacao, acao) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheetPend = ss.getSheetByName("CadastrosPendentes");
    if (!sheetPend) throw new Error("Aba pendentes não encontrada.");
    
    var dados = sheetPend.getDataRange().getValues();
    
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(idSolicitacao)) {
        var row = dados[i];
        
        // Atualiza o status na aba de Pendentes (Coluna J / índice 10)
        sheetPend.getRange(i + 1, 10).setValue(acao.toUpperCase());

        if (acao.toUpperCase() === "APROVADO") {
          var sheetLogins = ss.getSheetByName(ABA_USUARIOS); // Aba "Logins"
          if (!sheetLogins) throw new Error("Aba de Logins não encontrada.");
          
          var perfilAprovado = padronizarPerfilUsuario_(row[7]);
          var emailAprovado = String(row[3] || "").trim();
          var cpfAprovado = String(row[4] || "").trim();
          var cpfAprovadoLimpo = cpfAprovado.replace(/\D/g, "");
          var nomeAprovado = String(row[2] || "").trim();
          var omeAprovado = String(row[5] || "").trim().toUpperCase();
          var subAprovada = String(row[6] || "GERAL").trim().toUpperCase();
          var pinAprovado = String(row[8] || "").trim();

          var loginsData = sheetLogins.getDataRange().getValues();
          var linhaExistente = -1;

          for (var lg = 1; lg < loginsData.length; lg++) {
            var lgEmail = String(loginsData[lg][0] || "").trim().toLowerCase();
            var lgCpf = String(loginsData[lg][1] || "").trim().replace(/\D/g, "");
            if ((emailAprovado && lgEmail === emailAprovado.toLowerCase()) || (cpfAprovadoLimpo && lgCpf === cpfAprovadoLimpo)) {
              linhaExistente = lg + 1;
              // Atualiza linha existente para evitar criação de duplicatas inconsistentes
              sheetLogins.getRange(linhaExistente, 1).setValue(emailAprovado);
              sheetLogins.getRange(linhaExistente, 2).setValue(cpfAprovado);
              sheetLogins.getRange(linhaExistente, 3).setValue(nomeAprovado);
              sheetLogins.getRange(linhaExistente, 4).setValue(omeAprovado);
              sheetLogins.getRange(linhaExistente, 5).setValue(perfilAprovado);
              sheetLogins.getRange(linhaExistente, 6).setValue(subAprovada);
              if (pinAprovado) sheetLogins.getRange(linhaExistente, 7).setValue(pinAprovado);
              sheetLogins.getRange(linhaExistente, 8).setValue("ATIVO");
            }
          }

          if (linhaExistente === -1) {
            sheetLogins.appendRow([
              emailAprovado,
              cpfAprovado,
              nomeAprovado,
              omeAprovado,
              perfilAprovado,
              subAprovada,
              pinAprovado,
              "ATIVO"
            ]);
          }
          
          // Invalida cache de sessão
          try {
            var cache = CacheService.getScriptCache();
            var emClean = emailAprovado.toLowerCase();
            if (emClean) cache.remove("USR_PERM_" + emClean.replace(/[^a-z0-9]/gi, "_").substring(0, 45));
            if (cpfAprovado) cache.remove("USR_PERM_" + cpfAprovado.replace(/[^a-z0-9]/gi, "_").substring(0, 45));
            if (cpfAprovadoLimpo) cache.remove("USR_PERM_" + cpfAprovadoLimpo.replace(/[^a-z0-9]/gi, "_").substring(0, 45));
          } catch(eC) {}

          // Registra a auditoria corretamente usando os índices
          registrarLogAuditoria("APROVACAO_ACESSO", "Aprovado acesso para " + row[2] + " (" + row[4] + ")");
        } else if (acao.toUpperCase() === "RECUSADO" || acao.toUpperCase() === "REJEITADO") {
          try {
            registrarLogAuditoria("RECUSA_ACESSO", "Recusada solicitação de acesso para " + row[2] + " (" + row[4] + ")");
          } catch(eLogRec) {}
        }
        return "Solicitação " + acao.toUpperCase() + " com sucesso!";
      }
    }
    throw new Error("Solicitação não encontrada.");
  } catch(err) {
    throw new Error("Erro ao processar aprovação: " + err.message);
  }
}

// Validar PIN de transação na hora da assinatura
function validarPinTransacao(cpfOrEmail, pinInformado) {
  var usuario = verificarPermissaoUsuario(cpfOrEmail);
  if (!usuario) throw new Error("Usuário não identificado.");
  
  // Lê PIN armazenado na base de Logins (coluna G / índice corresp.)
  var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
  var sheet = ss.getSheetByName(ABA_USUARIOS);
  var dados = sheet.getDataRange().getValues();
  
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][1]) === String(usuario.cpf) || String(dados[i][0]).toLowerCase() === String(usuario.email).toLowerCase()) {
      var pinCadastrado = String(dados[i][6] || "").trim(); // Coluna G com o PIN
      if (pinCadastrado === String(pinInformado).trim()) {
        return { valido: true };
      }
    }
  }
  return { valido: false, mensagem: "PIN de transação incorreto." };
}

// Busca todos os usuários da base para o painel do Admin, consolidando duplicatas pela linha mais recente
// Busca usuários da base para o painel de Gerenciamento de Usuários
function getTodosUsuarios(filtroOmeSolicitante, perfilSolicitante) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheet = ss.getSheetByName(ABA_USUARIOS); // Aba "Logins"
    if (!sheet) return [];
    
    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha <= 1) return [];

    var maxCols = Math.max(sheet.getLastColumn(), 9);
    var dados = sheet.getRange(1, 1, ultimaLinha, maxCols).getValues();

    var cabecalho = dados[0];
    var idxEmail = -1, idxCpf = -1, idxNome = -1, idxOme = -1, idxPerfil = -1, idxSub = -1, idxStatus = -1, idxPermissoes = -1;
    for (var c = 0; c < cabecalho.length; c++) {
      var h = String(cabecalho[c] || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (h === "email") idxEmail = c;
      else if (h === "cpf") idxCpf = c;
      else if (h === "nome") idxNome = c;
      else if (h === "ome" || h === "unidade") idxOme = c;
      else if (h === "perfil") idxPerfil = c;
      else if (h === "subunidade") idxSub = c;
      else if (h === "status") idxStatus = c;
      else if (h === "permissoes" || h === "permissao") idxPermissoes = c;
    }
    if (idxEmail === -1) idxEmail = 0;
    if (idxCpf === -1) idxCpf = 1;
    if (idxNome === -1) idxNome = 2;
    if (idxOme === -1) idxOme = 3;
    if (idxPerfil === -1) idxPerfil = 4;
    if (idxSub === -1) idxSub = 5;
    if (idxStatus === -1) idxStatus = 7;
    if (idxPermissoes === -1 && maxCols >= 9) idxPermissoes = 8;
    
    // Identifica o perfil do solicitante caso não tenha sido explicitado
    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    if (!emailSessao) {
      try { emailSessao = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    }
    var userLogado = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;
    var pSolicitante = padronizarPerfilUsuario_(perfilSolicitante || (userLogado ? userLogado.perfil : ""));
    var omeSolicitante = String(filtroOmeSolicitante || (userLogado ? userLogado.ome : "")).trim().toUpperCase();
    var ehAdmin = (pSolicitante === "Administrador" || omeSolicitante === "DLOG");
    var ehComandante = (pSolicitante === "Comandante de Unidade");

    var mapaUsuarios = {};
    
    // Itera pelas linhas da planilha; consolida duplicidades de CPF ou Email mantendo a linha mais recente
    for (var i = 1; i < dados.length; i++) {
      var row = dados[i];
      if (!row[idxEmail] && !row[idxCpf] && !row[idxNome]) continue; // Pula linhas totalmente vazias
      
      var email = String(row[idxEmail] || "").trim();
      var cpf = String(row[idxCpf] || "").trim();
      var cpfLimpo = cpf.replace(/\D/g, "");
      var chave = cpfLimpo || email.toLowerCase();
      if (!chave) chave = "linha_" + (i + 1);

      var omeUserLinha = String(row[idxOme] || "").trim();
      var omeUserPadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeUserLinha) : omeUserLinha.toUpperCase();
      var omeSolPadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeSolicitante) : omeSolicitante.toUpperCase();

      // Se for Comandante de Unidade (e não Administrador geral), visualiza APENAS militares da sua própria OME
      if (ehComandante && !ehAdmin) {
        if (omeSolPadrao && omeUserPadrao && omeUserPadrao !== omeSolPadrao) {
          continue;
        }
      }

      var perfilUserLinha = padronizarPerfilUsuario_(row[idxPerfil]);
      var rowPerm = (idxPermissoes !== -1 && idxPermissoes < row.length) ? row[idxPermissoes] : "";

      mapaUsuarios[chave] = {
        linhaOriginal: i + 1,
        email: email,
        cpf: cpf,
        nome: String(row[idxNome] || "").trim(),
        ome: omeUserLinha,
        perfil: perfilUserLinha,
        subunidade: String(row[idxSub] || "").trim(),
        status: String(row[idxStatus] || "ATIVO").trim(),
        permissoes: padronizarPermissoesUsuario_(rowPerm, perfilUserLinha)
      };
    }
    
    var usuarios = [];
    for (var k in mapaUsuarios) {
      if (mapaUsuarios.hasOwnProperty(k)) {
        usuarios.push(mapaUsuarios[k]);
      }
    }
    return usuarios;
  } catch (err) {
    throw new Error("Erro ao buscar usuários: " + err.message);
  }
}

// Atualiza o OME, Perfil, Status, Subunidade e Permissões do usuário, sincronizando TODAS as linhas do militar
function atualizarUsuario(linha, novaOme, novoPerfil, novoStatus, novaSubunidade, novasPermissoes, omeSolicitante, perfilSolicitante) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheet = ss.getSheetByName(ABA_USUARIOS);
    if (!sheet) throw new Error("Aba 'Logins' não encontrada.");

    var emailSessao = "";
    try { emailSessao = Session.getActiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    if (!emailSessao) {
      try { emailSessao = Session.getEffectiveUser().getEmail().trim().toLowerCase(); } catch (e) {}
    }
    var userLogado = emailSessao ? verificarPermissaoUsuario(emailSessao) : null;
    var pSol = padronizarPerfilUsuario_(perfilSolicitante || (userLogado ? userLogado.perfil : ""));
    var omeSol = String(omeSolicitante || (userLogado ? userLogado.ome : "")).trim().toUpperCase();
    var ehAdmin = (pSol === "Administrador" || omeSol === "DLOG");

    var perfilPadronizado = padronizarPerfilUsuario_(novoPerfil);
    
    // Trava de segurança: Comandante de Unidade não pode promover ninguém a Administrador
    if (!ehAdmin && perfilPadronizado === "Administrador") {
      throw new Error("Comandantes de Unidade não possuem permissão para conceder perfil de Administrador.");
    }

    var omePadronizada = String(novaOme || "").trim().toUpperCase();
    var subunidadePadronizada = String(novaSubunidade || "GERAL").toUpperCase().trim();
    var statusPadronizado = String(novoStatus || "ATIVO").trim().toUpperCase();

    // Normaliza permissões para armazenamento em string unificada
    var permissoesStr = "";
    if (perfilPadronizado === "Administrador" || perfilPadronizado === "Comandante de Unidade") {
      permissoesStr = LISTA_CHAVES_PERMISSOES.join(",");
    } else if (Array.isArray(novasPermissoes)) {
      permissoesStr = novasPermissoes.join(",");
    } else if (novasPermissoes) {
      permissoesStr = String(novasPermissoes).trim();
    }

    var ultimaLinha = sheet.getLastRow();
    if (ultimaLinha <= 1) throw new Error("Planilha de usuários está vazia.");

    var maxCols = Math.max(sheet.getLastColumn(), 9);
    var todosDados = sheet.getRange(1, 1, ultimaLinha, maxCols).getValues();
    var cabecalho = todosDados[0];
    var idxEmail = -1, idxCpf = -1, idxOme = -1, idxPerfil = -1, idxSub = -1, idxStatus = -1, idxPermissoes = -1;
    for (var c = 0; c < cabecalho.length; c++) {
      var h = String(cabecalho[c] || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (h === "email") idxEmail = c;
      else if (h === "cpf") idxCpf = c;
      else if (h === "ome" || h === "unidade") idxOme = c;
      else if (h === "perfil") idxPerfil = c;
      else if (h === "subunidade") idxSub = c;
      else if (h === "status") idxStatus = c;
      else if (h === "permissoes" || h === "permissao") idxPermissoes = c;
    }
    if (idxEmail === -1) idxEmail = 0;
    if (idxCpf === -1) idxCpf = 1;
    if (idxOme === -1) idxOme = 3;
    if (idxPerfil === -1) idxPerfil = 4;
    if (idxSub === -1) idxSub = 5;
    if (idxStatus === -1) idxStatus = 7;
    
    // Se o cabeçalho Permissoes não existir, cria na Coluna 9 imediatamente
    if (idxPermissoes === -1) {
      sheet.getRange(1, 9).setValue("Permissoes");
      idxPermissoes = 8;
    }

    // Obtém dados da linha alvo fornecida
    var userEmail = "";
    var userCpf = "";
    var userCpfLimpo = "";

    if (linha >= 2 && linha <= ultimaLinha) {
      userEmail = String(todosDados[linha - 1][idxEmail] || "").trim().toLowerCase();
      userCpf = String(todosDados[linha - 1][idxCpf] || "").trim();
      userCpfLimpo = userCpf.replace(/\D/g, "");

      var omeLinhaAtual = String(todosDados[linha - 1][idxOme] || "").trim().toUpperCase();
      var omeLinhaPadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeLinhaAtual) : omeLinhaAtual;
      var omeSolPadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeSol) : omeSol;

      if (!ehAdmin && omeLinhaPadrao && omeSolPadrao && omeLinhaPadrao !== omeSolPadrao) {
        throw new Error("Você só pode gerenciar e atualizar usuários pertencentes à sua própria OME (" + omeSolPadrao + ").");
      }

      // Se for Comandante, garante que a OME do militar continue na OME do Comandante
      if (!ehAdmin) {
        omePadronizada = omeLinhaAtual || omeSol;
      }

      // Atualiza imediatamente a linha principal
      sheet.getRange(linha, idxOme + 1).setValue(omePadronizada);
      sheet.getRange(linha, idxPerfil + 1).setValue(perfilPadronizado);
      sheet.getRange(linha, idxSub + 1).setValue(subunidadePadronizada);
      sheet.getRange(linha, idxStatus + 1).setValue(statusPadronizado);
      sheet.getRange(linha, idxPermissoes + 1).setValue(permissoesStr);
    }

    var emailsParaLimparCache = [];
    var cpfsParaLimparCache = [];
    if (userEmail) emailsParaLimparCache.push(userEmail);
    if (userCpf) cpfsParaLimparCache.push(userCpf);
    if (userCpfLimpo) cpfsParaLimparCache.push(userCpfLimpo);

    // Varre toda a base para sincronizar quaisquer outras linhas duplicadas do mesmo militar
    for (var r = 1; r < todosDados.length; r++) {
      var rNum = r + 1;
      if (rNum === linha) continue;

      var rEmail = String(todosDados[r][idxEmail] || "").trim().toLowerCase();
      var rCpf = String(todosDados[r][idxCpf] || "").trim();
      var rCpfLimpo = rCpf.replace(/\D/g, "");

      var ehMesmoUsuario = (userEmail && rEmail && rEmail === userEmail) ||
                           (userCpfLimpo && rCpfLimpo && rCpfLimpo === userCpfLimpo);

      if (ehMesmoUsuario) {
        sheet.getRange(rNum, idxOme + 1).setValue(omePadronizada);
        sheet.getRange(rNum, idxPerfil + 1).setValue(perfilPadronizado);
        sheet.getRange(rNum, idxSub + 1).setValue(subunidadePadronizada);
        sheet.getRange(rNum, idxStatus + 1).setValue(statusPadronizado);
        sheet.getRange(rNum, idxPermissoes + 1).setValue(permissoesStr);

        if (rEmail && emailsParaLimparCache.indexOf(rEmail) === -1) emailsParaLimparCache.push(rEmail);
        if (rCpf && cpfsParaLimparCache.indexOf(rCpf) === -1) cpfsParaLimparCache.push(rCpf);
        if (rCpfLimpo && cpfsParaLimparCache.indexOf(rCpfLimpo) === -1) cpfsParaLimparCache.push(rCpfLimpo);
      }
    }

    // Invalida completamente o cache de sessão para todas as variações de chave
    try {
      var cache = CacheService.getScriptCache();
      emailsParaLimparCache.forEach(function(em) {
        if (em) cache.remove("USR_PERM_" + em.replace(/[^a-z0-9]/gi, "_").substring(0, 45));
      });
      cpfsParaLimparCache.forEach(function(c) {
        if (c) cache.remove("USR_PERM_" + c.replace(/[^a-z0-9]/gi, "_").substring(0, 45));
      });
      try {
        var actEm = Session.getActiveUser().getEmail().trim().toLowerCase();
        if (actEm) cache.remove("USR_PERM_" + actEm.replace(/[^a-z0-9]/gi, "_").substring(0, 45));
      } catch(eAct) {}
      try {
        var effEm = Session.getEffectiveUser().getEmail().trim().toLowerCase();
        if (effEm) cache.remove("USR_PERM_" + effEm.replace(/[^a-z0-9]/gi, "_").substring(0, 45));
      } catch(eEff) {}
    } catch (eCache) {}

    try {
      registrarLogAuditoria("GESTAO_USUARIO", "Atualizou cadastro do usuário " + (userNome || userEmail || userCpf) + ": OME=" + omePadronizada + ", Perfil=" + perfilPadronizado + ", Subunidade=" + subunidadePadronizada + ", Status=" + statusPadronizado);
    } catch(eLogUsr) {}

    return "Usuário atualizado com sucesso!";
  } catch (err) {
    throw new Error("Erro ao atualizar usuário: " + err.message);
  }
}

function getTicketsAcessoPendentes(filtroOmeSolicitante, perfilSolicitante) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_USUARIOS);
    var sheet = ss.getSheetByName("CadastrosPendentes");
    if (!sheet || sheet.getLastRow() <= 1) return [];

    var dados = sheet.getDataRange().getValues();
    var tickets = [];

    var pSol = padronizarPerfilUsuario_(perfilSolicitante);
    var omeSol = String(filtroOmeSolicitante || "").trim().toUpperCase();
    var ehAdmin = (pSol === "Administrador" || omeSol === "DLOG");
    var ehComandante = (pSol === "Comandante de Unidade");

    // [0] ID | [1] Data | [2] Nome | [3] Email | [4] CPF | [5] OME | [6] Subunidade | [7] Perfil | [8] PIN | [9] Status
    for (var i = 1; i < dados.length; i++) {
      var linha = dados[i];
      var status = String(linha[9] || "").trim().toUpperCase();
      
      if (status === "PENDENTE") {
        var omeTicket = String(linha[5] || "").trim();
        var omeTicketPadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeTicket) : omeTicket.toUpperCase();
        var omeSolPadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeSol) : omeSol;

        if (ehComandante && !ehAdmin) {
          if (omeSolPadrao && omeTicketPadrao && omeTicketPadrao !== omeSolPadrao) {
            continue;
          }
        }

        var dataBruta = linha[1]; 
        var dataTexto = "";
        
        if (Object.prototype.toString.call(dataBruta) === '[object Date]') {
          dataTexto = Utilities.formatDate(dataBruta, "America/Recife", "dd/MM/yyyy HH:mm");
        } else {
          dataTexto = String(dataBruta || "").substring(0, 16);
        }

        tickets.push({
          idTicket: String(linha[0] || ""),
          data: dataTexto,
          nome: String(linha[2] || ""),      
          email: String(linha[3] || ""),     
          cpf: String(linha[4] || ""),       
          ome: omeTicket,       
          subunidade: String(linha[6] || ""),
          perfil: padronizarPerfilUsuario_(linha[7] || "Usuário"),
          pin: String(linha[8] || "")
        });
      }
    }
    
    return tickets;
  } catch (err) {
    console.error("Erro em getTicketsAcessoPendentes: " + err.message);
    return [];
  }
}

// =========================================================================
// GESTÃO DE TICKETS DE DOAÇÃO
// =========================================================================


function parseLinhaTicketDoacao_(r) {
  if (!r || !r[0]) return null;
  var idTicket = String(r[0] || "").trim();
  if (!idTicket) return null;

  var dataBruta = r[1];
  var dataTexto = "";
  if (Object.prototype.toString.call(dataBruta) === '[object Date]') {
    dataTexto = Utilities.formatDate(dataBruta, "America/Recife", "dd/MM/yyyy HH:mm:ss");
  } else {
    dataTexto = String(dataBruta || "").substring(0, 19);
  }

  // Detecta se a linha está no formato da planilha (Layout A):
  // Col 0: ID_Ticket (TICK-DOA-...)
  // Col 1: Data
  // Col 2: OME ("1º GB Vitoria Stº Antão")
  // Col 3: SolicitanteNome ("Alex Alves da Silva")
  // Col 4: SolicitanteCpf ("31451497415")
  // Col 5: SolicitanteEmail ("dcsdlog@gmail.com")
  // Col 6: Processo SEI ("3900000160.000150/2026-88")
  // Col 7: Material (Descrição do Material)
  // Col 8: Quantidade (2)
  // Col 9: UnidadeMedida ("UND")
  // Col 10: Condição ("ECD")
  // Col 11: Fornecedor / Doador
  // Col 12: LinkFoto
  // Col 13: Status ("PENDENTE" / "APROVADO" / "REJEITADO")
  // Col 14: Motivo
  // Col 15: Obs
  var r4Str = String(r[4] || "").replace(/\D/g, "");
  var r6Str = String(r[6] || "");
  var r8Num = parseFloat(r[8]);
  var r9Str = String(r[9] || "").trim().toUpperCase();
  var r10Str = String(r[10] || "").trim().toUpperCase();

  var ehLayoutA = (r4Str.length === 11 || (r6Str.indexOf("/") !== -1 && !isNaN(r8Num)) || r9Str === "UND" || r10Str === "ECD");

  var item = {
    id: idTicket,
    data: dataTexto,
    ome: "",
    solicitanteNome: "",
    solicitanteCpf: "",
    solicitanteEmail: "",
    processo: "",
    material: "",
    quantidade: 1,
    unidadeMedida: "UND",
    condicao: "ECD",
    fornecedor: "",
    linkFoto: "",
    status: "PENDENTE",
    motivo: "",
    obs: "",
    ehLayoutA: ehLayoutA
  };

  if (ehLayoutA) {
    item.ome = String(r[2] || "").trim();
    item.solicitanteNome = String(r[3] || "").trim();
    item.solicitanteCpf = String(r[4] || "").trim();
    item.solicitanteEmail = String(r[5] || "").trim();
    item.processo = String(r[6] || "N/D").trim();
    item.material = String(r[7] || "").trim();
    item.quantidade = parseFloat(r[8]) || 1;
    item.unidadeMedida = String(r[9] || "UND").trim();
    item.condicao = String(r[10] || "ECD").trim();
    item.fornecedor = String(r[11] || "").trim();
    item.linkFoto = String(r[12] || "").trim();
    item.status = String(r[13] || r[12] || "PENDENTE").trim().toUpperCase();
    item.motivo = String(r[14] || "").trim();
    item.obs = String(r[15] || "").trim();
  } else {
    // Layout B (fallback legado)
    item.processo = String(r[2] || "N/D").trim();
    item.material = String(r[3] || "").trim();
    item.quantidade = parseFloat(r[4]) || 1;
    item.unidadeMedida = String(r[5] || "UND").trim();
    item.fornecedor = String(r[6] || "").trim();
    item.condicao = String(r[7] || "ECD").trim();
    item.ome = String(r[8] || "").trim();
    item.solicitanteNome = String(r[9] || "").trim();
    item.solicitanteCpf = String(r[10] || "").trim();
    item.linkFoto = String(r[11] || "").trim();
    item.status = String(r[12] || "PENDENTE").trim().toUpperCase();
    item.motivo = String(r[13] || "").trim();
    item.obs = String(r[14] || "").trim();
  }

  return item;
}

function getAbaTicketsDoacao_() {
  var ss = SpreadsheetApp.openById(ID_PLANILHA_TICKETS_PROVISORIOS);
  var aba = ss.getSheetByName("Tickets_Doacao") || ss.getSheetByName("Tickets Doacao");
  if (!aba) {
    aba = ss.insertSheet("Tickets_Doacao");
    aba.appendRow([
      "ID_Ticket",        // 0
      "Data",             // 1
      "OME",              // 2
      "SolicitanteNome",  // 3
      "SolicitanteCpf",   // 4
      "SolicitanteEmail", // 5
      "Processo",         // 6
      "Material",         // 7
      "Quantidade",       // 8
      "UnidadeMedida",    // 9
      "Condicao",         // 10
      "Fornecedor",       // 11
      "LinkFoto",         // 12
      "Status",           // 13
      "Motivo",           // 14
      "Obs"               // 15
    ]);
  }
  return aba;
}

function sincronizarTicketsAprovadosPendentesDePlanDist_() {
  try {
    var aba = getAbaTicketsDoacao_();
    if (!aba || aba.getLastRow() <= 1) return;
    var dados = aba.getDataRange().getValues();

    // Verificação rápida prévia em memória: existe algum ticket aprovado sem integração?
    var pendentesSync = [];
    for (var i = 1; i < dados.length; i++) {
      var item = parseLinhaTicketDoacao_(dados[i]);
      if (!item) continue;
      var statusNorm = String(item.status || "").trim().toUpperCase();
      if (statusNorm === "APROVADO") {
        var obs = String(item.obs || "");
        if (obs.indexOf("Plan:") === -1) {
          pendentesSync.push({ item: item, rowIdx: i + 1, obs: obs });
        }
      }
    }

    if (pendentesSync.length === 0) return; // Retorno instantâneo (zero overhead se nada pendente!)

    var ssCompras = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);
    var houveAlteracao = false;

    for (var p = 0; p < pendentesSync.length; p++) {
      var pItem = pendentesSync[p].item;
      var linhaSheet = pendentesSync[p].rowIdx;
      var obs = pendentesSync[p].obs;
      var dataHoraAprov = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");

      var dadosRecebimento = {
        numeroProcesso: pItem.processo || "N/D",
        material: pItem.material,
        quantidadeRecebida: parseFloat(pItem.quantidade) || 1,
        unidadeMedida: pItem.unidadeMedida || "UND",
        usuarioOme: String(pItem.ome || "").trim(),
        unidadeFinal: String(pItem.ome || "").trim(),
        dataAprovacao: dataHoraAprov
      };

      var infoSincPlan = "";
      var resPlan = null;
      try {
        resPlan = processarItemDoacaoPlan(dadosRecebimento, dataHoraAprov, ssCompras);
        if (resPlan && resPlan.jaExiste) {
          infoSincPlan = "Existente (linha " + resPlan.linha + ", controle: " + resPlan.numControle + ")";
        } else if (resPlan) {
          infoSincPlan = "Inserido (linha " + resPlan.linha + ", controle: " + resPlan.numControle + ")";
        }
        if (resPlan && resPlan.numControle) {
          dadosRecebimento.numeroControle = resPlan.numControle;
        }
      } catch (errP) {
        console.error("Erro ao sincronizar Plan no ticket aprovado " + pItem.id + ": " + errP.message);
        infoSincPlan = "Erro: " + errP.message;
      }

      var infoSincDist = "";
      try {
        var numControleReceb = dadosRecebimento.numeroControle || (resPlan ? resPlan.numControle : null) || obterNumeroControlePlan(dadosRecebimento.numeroProcesso, dadosRecebimento.material);
        var resDist = sincronizarRecebimentoDist(
          dadosRecebimento,
          numControleReceb,
          null,
          null,
          null,
          ssCompras
        );
        if (resDist && resDist.sucesso) {
          infoSincDist = "Sucesso (linha " + resDist.linha + (resDist.colunaOme && resDist.colunaOme > 0 ? ", OME " + resDist.omeDistribuida + " col " + resDist.colunaOme : "") + ")";
        } else {
          infoSincDist = "Aviso: " + (resDist ? resDist.erro : "Falha na sincronização");
        }
      } catch (errD) {
        console.error("Erro ao sincronizar Dist no ticket aprovado " + pItem.id + ": " + errD.message);
        infoSincDist = "Erro: " + errD.message;
      }

      var colObs = pItem.ehLayoutA ? 16 : 15;
      var novaObs = (obs ? obs + " | " : "") + "Plan: " + infoSincPlan + " | Dist: " + infoSincDist;
      aba.getRange(linhaSheet, colObs).setValue(novaObs);
      houveAlteracao = true;

      registrarLogAuditoria(
        "AUTO_SYNC_DOACAO_PLAN_DIST",
        "Auto-sincronizado Ticket Aprovado " + pItem.id + " para #PLAN (" + infoSincPlan + ") e #DIST (" + infoSincDist + "). Material: " + pItem.material + ", OME: " + pItem.ome
      );
    }

    if (houveAlteracao) {
      SpreadsheetApp.flush();
    }
  } catch (e) {
    console.error("Erro na auto-sincronização de tickets aprovados: " + e.message);
  }
}

function getTicketsDoacaoPendentes(omeFiltro, exibirHistorico) {
  try {
    // Sincroniza retroativamente doações aprovadas pendentes de integração
    try {
      sincronizarTicketsAprovadosPendentesDePlanDist_();
    } catch (eSync) {
      console.warn("Aviso ao rodar auto-sync de doações aprovadas: " + eSync.message);
    }

    var aba = getAbaTicketsDoacao_();
    if (!aba || aba.getLastRow() <= 1) return [];

    var dados = aba.getDataRange().getValues();
    var tickets = [];
    var omeFiltroNorm = String(omeFiltro || "").trim().toUpperCase();

    for (var i = 1; i < dados.length; i++) {
      var itemD = parseLinhaTicketDoacao_(dados[i]);
      if (!itemD) continue;

      if (!exibirHistorico && itemD.status !== "PENDENTE") {
        continue;
      }

      var omeTicketNorm = itemD.ome.toUpperCase();
      if (omeFiltroNorm && omeFiltroNorm !== "TODAS" && omeTicketNorm !== omeFiltroNorm) {
        continue;
      }

      tickets.push(itemD);
    }

    return tickets;
  } catch (err) {
    console.error("Erro em getTicketsDoacaoPendentes: " + err.message);
    return [];
  }
}

function aprovarTicketDoacao(idTicket, cpfAprovador, pin) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    var cpfLimpo = String(cpfAprovador || "").replace(/\D/g, "");
    if (!cpfLimpo) {
      throw new Error("CPF do aprovador não informado.");
    }

    if (pin) {
      var resPin = validarPinTransacao(cpfLimpo, pin);
      if (!resPin.valido) {
        throw new Error(resPin.mensagem || "PIN de segurança inválido.");
      }
    }

    var usuarioSessao = verificarPermissaoUsuario(cpfLimpo);
    var nomeAprovador = (usuarioSessao && usuarioSessao.nome) ? usuarioSessao.nome : "";

    var aba = getAbaTicketsDoacao_();
    var dados = aba.getDataRange().getValues();
    var linhaEncontrada = -1;
    var ticketDados = null;

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(idTicket).trim()) {
        linhaEncontrada = i + 1;
        ticketDados = dados[i];
        break;
      }
    }

    if (linhaEncontrada === -1) {
      throw new Error("Ticket " + idTicket + " não encontrado.");
    }

    var item = parseLinhaTicketDoacao_(ticketDados);
    if (!item) {
      throw new Error("Não foi possível ler as informações do ticket " + idTicket + ".");
    }

    var colStatus = (item && item.ehLayoutA) ? 14 : 13;
    var colObs = (item && item.ehLayoutA) ? 16 : 15;

    var dataHoraAprov = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");

    var dadosRecebimento = {
      numeroProcesso: item.processo || "N/D",
      material: item.material,
      quantidadeRecebida: parseFloat(item.quantidade) || 1,
      unidadeMedida: item.unidadeMedida || "UND",
      usuarioOme: String(item.ome || "").trim(),
      unidadeFinal: String(item.ome || "").trim(),
      dataAprovacao: dataHoraAprov
    };

    // Abre a planilha de compras UMA ÚNICA VEZ para reutilização nas integrações
    var ssCompras = SpreadsheetApp.openById(ID_PLANILHA_COMPRAS);

    // 1. Processa e inclui o item na base de planejamento (#PLAN)
    var infoSincPlan = "";
    var resPlan = null;
    try {
      resPlan = processarItemDoacaoPlan(dadosRecebimento, dataHoraAprov, ssCompras);
      if (resPlan && resPlan.jaExiste) {
        infoSincPlan = "Existente (linha " + resPlan.linha + ", controle: " + resPlan.numControle + ")";
      } else if (resPlan) {
        infoSincPlan = "Inserido (linha " + resPlan.linha + ", controle: " + resPlan.numControle + ")";
      }
      if (resPlan && resPlan.numControle) {
        dadosRecebimento.numeroControle = resPlan.numControle;
      }
    } catch (errPlan) {
      console.error("Erro na integração com Planejamento: " + errPlan.message);
      infoSincPlan = "Erro: " + errPlan.message;
    }

    // 2. Sincroniza na base de distribuição (#DIST)
    var infoSincDist = "";
    try {
      var numControleReceb = dadosRecebimento.numeroControle || (resPlan ? resPlan.numControle : null) || obterNumeroControlePlan(dadosRecebimento.numeroProcesso, dadosRecebimento.material);
      var resDist = sincronizarRecebimentoDist(
        dadosRecebimento,
        numControleReceb,
        null,
        null,
        null,
        ssCompras
      );
      if (resDist && resDist.sucesso) {
        infoSincDist = "Sucesso (linha " + resDist.linha + (resDist.colunaOme && resDist.colunaOme > 0 ? ", OME " + resDist.omeDistribuida + " col " + resDist.colunaOme : "") + ")";
      } else {
        infoSincDist = "Aviso: " + (resDist ? resDist.erro : "Falha na sincronização");
      }
    } catch (errDist) {
      console.error("Erro na integração com Distribuição: " + errDist.message);
      infoSincDist = "Erro: " + errDist.message;
    }

    aba.getRange(linhaEncontrada, colStatus).setValue("APROVADO");
    var textoObs = "Aprovado via PIN por CPF: " + cpfLimpo + (nomeAprovador ? " (" + nomeAprovador + ")" : "") + " | Plan: " + infoSincPlan + " | Dist: " + infoSincDist;
    aba.getRange(linhaEncontrada, colObs).setValue(textoObs);

    SpreadsheetApp.flush();

    registrarLogAuditoria(
      "APROVACAO_DOACAO",
      "Ticket " + idTicket + " aprovado e assinado digitalmente (PIN) por " + (nomeAprovador || "Militar") + " (CPF " + cpfLimpo + "). Material: " + (item ? item.material : "") + " | Destino: " + (item ? item.ome : "") + " | Plan: " + infoSincPlan + " | Dist: " + infoSincDist
    );

    return { 
      sucesso: true, 
      mensagem: "Doação aprovada e assinada com sucesso! Material integrado ao Planejamento (" + infoSincPlan + ") e à Distribuição (" + infoSincDist + ")." 
    };
  } catch (err) {
    console.error("Erro em aprovarTicketDoacao: " + err.message);
    throw new Error(err.message || err);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function rejeitarTicketDoacao(idTicket, cpfRejeitador, motivo) {
  try {
    var aba = getAbaTicketsDoacao_();
    var dados = aba.getDataRange().getValues();
    var linhaEncontrada = -1;
    var ticketDados = null;

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(idTicket).trim()) {
        linhaEncontrada = i + 1;
        ticketDados = dados[i];
        break;
      }
    }

    if (linhaEncontrada === -1) {
      throw new Error("Ticket " + idTicket + " não encontrado.");
    }

    var item = parseLinhaTicketDoacao_(ticketDados);
    var colStatus = (item && item.ehLayoutA) ? 14 : 13;
    var colMotivo = colStatus + 1;
    var colObs = colStatus + 2;

    aba.getRange(linhaEncontrada, colStatus).setValue("REJEITADO");
    aba.getRange(linhaEncontrada, colMotivo).setValue(String(motivo || ""));
    aba.getRange(linhaEncontrada, colObs).setValue("Recusado por CPF: " + (cpfRejeitador || ""));

    registrarLogAuditoria(
      "RECUSA_DOACAO",
      "Ticket " + idTicket + " recusado por CPF " + cpfRejeitador + ". Motivo: " + motivo
    );

    return { sucesso: true, mensagem: "Ticket de doação recusado com sucesso." };
  } catch (err) {
    console.error("Erro em rejeitarTicketDoacao: " + err.message);
    throw new Error(err.message || err);
  }
}

function excluirTicketDoacao(idTicket) {
  try {
    var aba = getAbaTicketsDoacao_();
    var dados = aba.getDataRange().getValues();
    var linhaEncontrada = -1;

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(idTicket).trim()) {
        linhaEncontrada = i + 1;
        break;
      }
    }

    if (linhaEncontrada === -1) {
      throw new Error("Ticket " + idTicket + " não encontrado.");
    }

    aba.deleteRow(linhaEncontrada);

    try {
      registrarLogAuditoria("EXCLUSAO_TICKET_DOACAO", "Excluiu ticket de doação " + idTicket);
    } catch(eLogExc) {}

    return { sucesso: true, mensagem: "Ticket excluído com sucesso." };
  } catch (err) {
    console.error("Erro em excluirTicketDoacao: " + err.message);
    throw new Error(err.message || err);
  }
}

// =========================================================================
// REJEIÇÃO DE TICKET DE MATERIAL PROVISÓRIO (DLOG)
// =========================================================================
function rejeitarTicketMaterialProvisorio(idTicket, motivo) {
  try {
    var ss = SpreadsheetApp.openById(ID_PLANILHA_TICKETS_PROVISORIOS);
    var aba = ss.getSheetByName("Materiais_Provisorios") || ss.getSheetByName("Materiais Provisorios");
    if (!aba) throw new Error("Aba 'Materiais_Provisorios' não encontrada.");

    var dados = aba.getDataRange().getValues();
    var linhaEncontrada = -1;
    var nomeSugerido = "";

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === String(idTicket).trim()) {
        linhaEncontrada = i + 1;
        nomeSugerido = String(dados[i][2] || "");
        break;
      }
    }

    if (linhaEncontrada === -1) {
      throw new Error("Ticket " + idTicket + " não encontrado.");
    }

    var email = Session.getActiveUser().getEmail();
    var usuarioValido = verificarPermissaoUsuario(email);
    var cpfUsuario = (usuarioValido && usuarioValido.cpf) ? usuarioValido.cpf : "DLOG";
    var dataHora = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");

    aba.getRange(linhaEncontrada, 5).setValue("REJEITADO");
    aba.getRange(linhaEncontrada, 10).setValue(String(motivo || ""));
    aba.getRange(linhaEncontrada, 11).setValue(dataHora);
    aba.getRange(linhaEncontrada, 12).setValue(cpfUsuario);

    registrarLogAuditoria(
      "RECUSA_MATERIAL_PROVISORIO",
      "Ticket " + idTicket + " (" + nomeSugerido + ") recusado por CPF " + cpfUsuario + ". Motivo: " + motivo
    );

    return { sucesso: true, mensagem: "Sugestão de material recusada com sucesso." };
  } catch (err) {
    console.error("Erro em rejeitarTicketMaterialProvisorio: " + err.message);
    throw new Error(err.message || err);
  }
}

// =========================================================================
// MAPA DE TODAS AS SUBUNIDADES POR OME (EXCEL E HIERARQUIA)
// =========================================================================
function getMapaTodasSubunidadesPorOme() {
  try {
    var mapa = {};
    var omes = [
      "1º GB Vitoria Stº Antão", 
      "2º GB Caruaru", 
      "3º GB Serra Talhada", 
      "4º GB Petrolina", 
      "5º GB Salgueiro", 
      "6º GB Garanhuns", 
      "7º GB Carpina", 
      "9º GB Arcoverde", 
      "ABMG", "AECI", "AjG", "CAT/AG", "CAT/RMR", "CAT/SE", "CAT/ZM", 
      "CCS", "CEAO", "CEFD", "CI", "CINT", "CMAN", "CPO", "CPPA", "CPP", 
      "DEIP", "DF", "DGO", "DIESP", "DIM", "DINTER I", "DINTER II", 
      "DJD", "DLOG", "DGP", "DPLAG", "DTIC", "DVP", "GBAPH", "GBI", 
      "GBMAR", "GBS", "GCG", "GSG"
    ];

    omes.forEach(function(ome) {
      mapa[ome] = ["SEDE"];
      var subOrgs = getOpcoesOrgDataPorOme(ome);
      if (subOrgs && Array.isArray(subOrgs)) {
        subOrgs.forEach(function(sub) {
          if (mapa[ome].indexOf(sub) === -1) {
            mapa[ome].push(sub);
          }
        });
      }
    });

    try {
      var ss = SpreadsheetApp.openById(ID_PLANILHA_AUXILIAR);
      var sheetLocais = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
      if (sheetLocais && sheetLocais.getLastRow() > 1) {
        var dados = sheetLocais.getDataRange().getValues();
        for (var i = 1; i < dados.length; i++) {
          var omePadrao = (typeof obterOmePadronizada === "function") ? obterOmePadronizada(dados[i][1]) : String(dados[i][1] || "").trim();
          var nomeLocal = String(dados[i][2] || "").trim();
          var idPai = String(dados[i][3] || "").trim();
          if (omePadrao && nomeLocal) {
            if (!mapa[omePadrao]) mapa[omePadrao] = ["SEDE"];
            if ((!idPai || idPai === omePadrao) && mapa[omePadrao].indexOf(nomeLocal) === -1) {
              mapa[omePadrao].push(nomeLocal);
            }
          }
        }
      }
    } catch (eLoc) {
      console.warn("Erro ao ler locais para mapa: " + eLoc.message);
    }

    return mapa;
  } catch (err) {
    console.error("Erro em getMapaTodasSubunidadesPorOme: " + err.message);
    return {};
  }
}

// =========================================================================
// CONSULTA DE LOGS DE AUDITORIA DO BIGQUERY COM PAGINAÇÃO E FILTROS
// =========================================================================
function getLogsAuditoriaBigQuery(filtros) {
  try {
    garantirTabelaLog_();
    filtros = filtros || {};
    var limite = parseInt(filtros.limite, 10) || 100;
    var offset = parseInt(filtros.offset, 10) || 0;
    
    function limpaSQL(t) { return String(t || "").trim().replace(/'/g, "\\'"); }

    var whereClauses = [];
    if (filtros.cpf && filtros.cpf.trim() !== "") {
      whereClauses.push("UPPER(TRIM(CPF)) LIKE '%" + limpaSQL(filtros.cpf.toUpperCase()) + "%'");
    }
    if (filtros.nome && filtros.nome.trim() !== "") {
      whereClauses.push("UPPER(TRIM(NOME)) LIKE '%" + limpaSQL(filtros.nome.toUpperCase()) + "%'");
    }
    if (filtros.acao && filtros.acao.trim() !== "") {
      whereClauses.push("UPPER(TRIM(ACAO)) = '" + limpaSQL(filtros.acao.toUpperCase()) + "'");
    }
    if (filtros.buscaGeral && filtros.buscaGeral.trim() !== "") {
      var bg = limpaSQL(filtros.buscaGeral.toUpperCase());
      whereClauses.push("(UPPER(TRIM(CPF)) LIKE '%" + bg + "%' OR UPPER(TRIM(NOME)) LIKE '%" + bg + "%' OR UPPER(TRIM(ACAO)) LIKE '%" + bg + "%' OR UPPER(TRIM(DETALHES)) LIKE '%" + bg + "%')");
    }

    var whereStr = whereClauses.length > 0 ? " WHERE " + whereClauses.join(" AND ") : "";

    // 1. Contagem total
    var sqlCount = "SELECT COUNT(1) FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_Log`" + whereStr;
    var resCount = executarConsultaBigQuerySegura(sqlCount);
    var total = 0;
    if (resCount && resCount.rows && resCount.rows.length > 0 && resCount.rows[0].f && resCount.rows[0].f[0].v) {
      total = parseInt(resCount.rows[0].f[0].v, 10) || 0;
    }

    // 2. Busca paginada
    var sqlLogs = "SELECT FORMAT_TIMESTAMP('%d/%m/%Y %H:%M:%S', DATA_HORA, 'America/Recife'), CPF, NOME, ACAO, DETALHES " +
                  "FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_Log`" + whereStr + " " +
                  "ORDER BY DATA_HORA DESC LIMIT " + limite + " OFFSET " + offset;
    var resLogs = executarConsultaBigQuerySegura(sqlLogs);
    var rows = (resLogs && resLogs.rows) ? resLogs.rows : [];

    var logs = rows.map(function(r) {
      return {
        data: (r.f && r.f[0] && r.f[0].v) ? r.f[0].v : "",
        cpf: (r.f && r.f[1] && r.f[1].v) ? r.f[1].v : "",
        nome: (r.f && r.f[2] && r.f[2].v) ? r.f[2].v : "",
        acao: (r.f && r.f[3] && r.f[3].v) ? r.f[3].v : "",
        detalhes: (r.f && r.f[4] && r.f[4].v) ? r.f[4].v : ""
      };
    });

    // 3. Ações distintas para o select
    var sqlAcoes = "SELECT DISTINCT ACAO FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_Log` WHERE ACAO IS NOT NULL ORDER BY ACAO ASC";
    var resAcoes = executarConsultaBigQuerySegura(sqlAcoes);
    var rowsAcoes = (resAcoes && resAcoes.rows) ? resAcoes.rows : [];
    var acoes = rowsAcoes.map(function(a) { 
      return (a.f && a.f[0] && a.f[0].v) ? String(a.f[0].v).trim() : ""; 
    }).filter(Boolean);

    return {
      sucesso: true,
      total: total,
      logs: logs,
      acoes: acoes
    };
  } catch (err) {
    var msgErr = (err && err.message) ? err.message : String(err);
    console.error("Erro em getLogsAuditoriaBigQuery: " + msgErr);
    if (msgErr.indexOf("Not found") !== -1 || msgErr.indexOf("not found") !== -1 || msgErr.indexOf("tb_Log") !== -1) {
      return {
        sucesso: true,
        total: 0,
        logs: [],
        acoes: []
      };
    }
    return {
      sucesso: false,
      mensagem: "Erro ao consultar logs de auditoria: " + msgErr,
      total: 0,
      logs: [],
      acoes: []
    };
  }
}


// =========================================================================
// GESTÃO DE AVISOS DE TICKETS PARA O CHEFE DE SETOR
// =========================================================================
function getAvisosTicketsChefeSetor(omeChefe) {
  try {
    var omeFiltro = String(omeChefe || "").trim().toUpperCase();
    var omeFiltroPadrao = (typeof obterOmePadronizada === "function") ? obterOmePadronizada(omeFiltro) : omeFiltro;
    var avisos = [];

    // 1. Avisos de Doação
    try {
      var abaDoacao = getAbaTicketsDoacao_();
      if (abaDoacao && abaDoacao.getLastRow() > 1) {
        var dadosDoacao = abaDoacao.getDataRange().getValues();
        for (var i = 1; i < dadosDoacao.length; i++) {
          var itemD = parseLinhaTicketDoacao_(dadosDoacao[i]);
          if (!itemD) continue;

          if (itemD.status !== "APROVADO" && itemD.status !== "REJEITADO") continue;

          var omeTicket = itemD.ome.toUpperCase();
          var omeTicketPadrao = (typeof obterOmePadronizada === "function") ? obterOmePadronizada(omeTicket) : omeTicket;
          if (omeFiltro && omeFiltro !== "TODAS" && omeTicketPadrao && omeTicketPadrao !== omeFiltroPadrao && omeTicket !== omeFiltro) {
            continue;
          }

          var avaliador = "DLOG";
          var m = itemD.obs.match(/CPF:\s*([^\s|]+)/i);
          if (m && m[1]) avaliador = m[1];

          avisos.push({
            idTicket: itemD.id,
            tipo: "DOACAO",
            aprovado: (itemD.status === "APROVADO"),
            material: itemD.material,
            quantidade: itemD.quantidade,
            unidade: itemD.unidadeMedida,
            processo: itemD.processo,
            dataAvaliacao: itemD.data,
            avaliador: avaliador,
            motivoRejeicao: itemD.motivo
          });
        }
      }
    } catch (eDoacao) {
      console.warn("Aviso doação erro: " + eDoacao.message);
    }

    // 2. Avisos de Cadastro de Material Provisório
    try {
      var ssProv = SpreadsheetApp.openById(ID_PLANILHA_TICKETS_PROVISORIOS);
      var abaProv = ssProv.getSheetByName("Materiais_Provisorios") || ssProv.getSheetByName("Materiais Provisorios");
      if (abaProv && abaProv.getLastRow() > 1) {
        var dadosProv = abaProv.getDataRange().getValues();
        for (var j = 1; j < dadosProv.length; j++) {
          var rProv = dadosProv[j];
          var idT = String(rProv[0] || "").trim();
          if (!idT) continue;

          var st = String(rProv[4] || "").trim().toUpperCase();
          if (st !== "APROVADO" && st !== "REJEITADO") continue;

          var omeSol = String(rProv[3] || "").trim().toUpperCase();
          var omeSolPadrao = (typeof obterOmePadronizada === "function") ? obterOmePadronizada(omeSol) : omeSol;
          if (omeFiltro && omeFiltro !== "TODAS" && omeSolPadrao && omeSolPadrao !== omeFiltroPadrao && omeSol !== omeFiltro) {
            continue;
          }

          var dtBruta = rProv[1];
          var dtTexto = "";
          if (Object.prototype.toString.call(dtBruta) === "[object Date]") {
            dtTexto = Utilities.formatDate(dtBruta, "America/Recife", "dd/MM/yyyy HH:mm");
          } else {
            dtTexto = String(dtBruta || "").substring(0, 16);
          }

          var nomeSugerido = String(rProv[2] || "").trim();
          var nomeDefinitivo = String(rProv[8] || nomeSugerido).trim();
          var classesArr = [];
          if (rProv[5]) classesArr.push(String(rProv[5]));
          if (rProv[6]) classesArr.push(String(rProv[6]));
          if (rProv[7]) classesArr.push(String(rProv[7]));

          var tipoResolucao = "ACEITO_SUGERIDO";
          if (st === "REJEITADO") {
            tipoResolucao = "REJEITADO";
          } else if (nomeDefinitivo.toUpperCase() !== nomeSugerido.toUpperCase()) {
            tipoResolucao = "ALTERADO";
          }

          avisos.push({
            idTicket: idT,
            tipo: "CADASTRO_MATERIAL",
            status: st,
            tipoResolucao: tipoResolucao,
            nomeSugerido: nomeSugerido,
            nomeDefinitivo: nomeDefinitivo,
            classes: classesArr.join(" / "),
            motivoRejeicao: String(rProv[9] || ""),
            dataAvaliacao: String(rProv[10] || dtTexto),
            avaliador: String(rProv[11] || "DLOG")
          });
        }
      }
    } catch (eProv) {
      console.warn("Aviso provisório erro: " + eProv.message);
    }

    return { sucesso: true, avisos: avisos };
  } catch (err) {
    console.error("Erro em getAvisosTicketsChefeSetor: " + err.message);
    return { sucesso: false, erro: err.message, avisos: [] };
  }
}

// =========================================================================
// HISTÓRICO DE MOVIMENTAÇÃO DE MATERIAIS (BIGQUERY & AUDITORIA DE ITENS)
// =========================================================================

var TABELA_HISTORICO = "tb_Historico_Movimentacao";
var tabelaHistoricoGarantida_ = false;

function garantirTabelaHistoricoMovimentacao_() {
  if (tabelaHistoricoGarantida_) return;
  var cache = CacheService.getScriptCache();
  if (cache.get("BQ_TABELA_HISTORICO_OK")) {
    tabelaHistoricoGarantida_ = true;
    return;
  }
  try {
    var sqlCreate = "CREATE TABLE IF NOT EXISTS `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_HISTORICO + "` (" +
      "ID_HISTORICO STRING, " +
      "DATA_HORA TIMESTAMP, " +
      "ITEM STRING, " +
      "OBJETO STRING, " +
      "N_PATRIMONIO STRING, " +
      "TIPO_EVENTO STRING, " +
      "ORIGEM_UNIDADE STRING, " +
      "ORIGEM_LOCAL STRING, " +
      "DESTINO_UNIDADE STRING, " +
      "DESTINO_LOCAL STRING, " +
      "STATUS_ANTERIOR STRING, " +
      "STATUS_NOVO STRING, " +
      "RESPONSAVEL_NOME STRING, " +
      "RESPONSAVEL_CPF STRING, " +
      "DOCUMENTO_REF STRING, " +
      "OBSERVACAO STRING" +
    ")";
    executarConsultaBigQuerySegura(sqlCreate, true);
    tabelaHistoricoGarantida_ = true;
    try { cache.put("BQ_TABELA_HISTORICO_OK", "1", 21600); } catch(eC) {} // 6 horas
  } catch (err) {
    console.warn("Aviso ao garantir tabela tb_Historico_Movimentacao: " + (err.message || String(err)));
  }
}

function registrarHistoricoMovimentacao(eventos) {
  if (!eventos || !Array.isArray(eventos) || eventos.length === 0) return;
  
  try {
    garantirTabelaHistoricoMovimentacao_();

    function limpaStr(val) {
      if (val === null || val === undefined) return "NULL";
      var s = String(val).trim();
      if (!s) return "NULL";
      return "'" + s.replace(/'/g, "\\'") + "'";
    }

    var chunkSize = 100;
    for (var i = 0; i < eventos.length; i += chunkSize) {
      var chunk = eventos.slice(i, i + chunkSize);
      var valuesSql = [];

      for (var k = 0; k < chunk.length; k++) {
        var ev = chunk[k];
        var idHist = "HIST-" + new Date().getTime() + "-" + Math.floor(Math.random() * 90000 + 10000);
        var sqlDataHora = "CURRENT_TIMESTAMP()";
        if (ev.dataHora && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(ev.dataHora)) {
          sqlDataHora = "PARSE_TIMESTAMP('%d/%m/%Y %H:%M:%S', '" + ev.dataHora + "', 'America/Recife')";
        }
        
        var linha = "(" +
          limpaStr(idHist) + ", " +
          sqlDataHora + ", " +
          limpaStr(ev.item) + ", " +
          limpaStr(ev.objeto) + ", " +
          limpaStr(ev.nPatrimonio) + ", " +
          limpaStr(ev.tipoEvento) + ", " +
          limpaStr(ev.origemUnidade) + ", " +
          limpaStr(ev.origemLocal) + ", " +
          limpaStr(ev.destinoUnidade) + ", " +
          limpaStr(ev.destinoLocal) + ", " +
          limpaStr(ev.statusAnterior) + ", " +
          limpaStr(ev.statusNovo) + ", " +
          limpaStr(ev.responsavelNome) + ", " +
          limpaStr(ev.responsavelCpf) + ", " +
          limpaStr(ev.documentoRef) + ", " +
          limpaStr(ev.observacao) +
        ")";
        valuesSql.push(linha);
      }

      if (valuesSql.length > 0) {
        var sqlInsert = "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_HISTORICO + "` " +
          "(ID_HISTORICO, DATA_HORA, ITEM, OBJETO, N_PATRIMONIO, TIPO_EVENTO, ORIGEM_UNIDADE, ORIGEM_LOCAL, DESTINO_UNIDADE, DESTINO_LOCAL, STATUS_ANTERIOR, STATUS_NOVO, RESPONSAVEL_NOME, RESPONSAVEL_CPF, DOCUMENTO_REF, OBSERVACAO) " +
          "VALUES " + valuesSql.join(", ");
        executarConsultaBigQuerySegura(sqlInsert, true);
      }
    }
  } catch (errHist) {
    console.error("Erro ao registrar histórico de movimentação: " + (errHist.message || String(errHist)));
  }
}

function getHistoricoMovimentacaoItem(codigoOuPatrimonio) {
  try {
    var termo = String(codigoOuPatrimonio || "").trim();
    if (!termo) {
      return { sucesso: false, erro: "Código do item ou patrimônio não informado." };
    }

    function limpa(t) { return String(t || '').trim().replace(/'/g, "\\'"); }
    var termoSql = limpa(termo);

    var colSerie = obterColunaSerieInventario_();
    var selectSerieSql = colSerie ? (", `" + colSerie + "` ") : ", CAST(NULL AS STRING) ";
    var condSerieTermo = colSerie ? ("   OR UPPER(TRIM(`" + colSerie + "`)) = UPPER('" + termoSql + "') ") : "";

    // 1. Busca dados atuais do material no inventário
    var sqlItem = "SELECT ITEM, OBJETO, COD_EFISCO, SEI_COMPRA_RECEBIMENTO, " +
                  "BEM_PERMANENTE_PATRIMONIAVEL_SIM_NAO, N_PATRIMONIO, UNIDADE, SUBUNIDADE, SETOR, " +
                  "LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, STATUS, " +
                  "SE_ACAUTELADO_POSTO_GRAD, SE_ACAUTELADO_NOME_COMPLETO, SE_ACAUTELADO_CPF, SE_ACAUTELADO_N_DOC_SEI, " +
                  "OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material" + selectSerieSql +
                  "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                  "WHERE UPPER(TRIM(ITEM)) = UPPER('" + termoSql + "') " +
                  "   OR UPPER(TRIM(N_PATRIMONIO)) = UPPER('" + termoSql + "') " +
                  condSerieTermo +
                  "LIMIT 1";

    var resItem = executarConsultaBigQuerySegura(sqlItem);
    var itemAtual = null;
    var codItemOficial = termo;

    if (resItem.rows && resItem.rows.length > 0) {
      var f = resItem.rows[0].f;
      codItemOficial = String(f[0].v || termo).trim();
      var nSerieHist = (f[16] && f[16].v) ? String(f[16].v) : "";
      var obsHist = f[15].v || "";
      if (!nSerieHist && obsHist) {
        var mSH = obsHist.match(/S[eé]rie:\s*([^|;\n\r]+)/i);
        if (mSH && mSH[1]) nSerieHist = mSH[1].trim();
      }
      itemAtual = {
        item: f[0].v || "",
        objeto: f[1].v || "",
        codEfisco: f[2].v || "",
        seiCompra: f[3].v || "",
        bemPermanente: f[4].v || "",
        nPatrimonio: f[5].v || "",
        unidade: f[6].v || "",
        subunidade: f[7].v || "",
        setor: f[8].v || "",
        local: f[9].v || "",
        status: f[10].v || "",
        postoAcautelado: f[11].v || "",
        nomeAcautelado: f[12].v || "",
        cpfAcautelado: f[13].v || "",
        docSeiAcautelado: f[14].v || "",
        observacao: obsHist,
        nSerie: nSerieHist
      };
    }

    // 2. Busca histórico registrado na tb_Historico_Movimentacao
    garantirTabelaHistoricoMovimentacao_();
    var sqlHist = "SELECT ID_HISTORICO, FORMAT_TIMESTAMP('%d/%m/%Y %H:%M:%S', DATA_HORA, 'America/Recife') as DATA_FORMATADA, " +
                  "ITEM, OBJETO, N_PATRIMONIO, TIPO_EVENTO, ORIGEM_UNIDADE, ORIGEM_LOCAL, " +
                  "DESTINO_UNIDADE, DESTINO_LOCAL, STATUS_ANTERIOR, STATUS_NOVO, " +
                  "RESPONSAVEL_NOME, RESPONSAVEL_CPF, DOCUMENTO_REF, OBSERVACAO " +
                  "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_HISTORICO + "` " +
                  "WHERE UPPER(TRIM(ITEM)) = UPPER('" + limpa(codItemOficial) + "') " +
                  (itemAtual && itemAtual.nPatrimonio ? " OR UPPER(TRIM(N_PATRIMONIO)) = UPPER('" + limpa(itemAtual.nPatrimonio) + "') " : "") +
                  "ORDER BY DATA_HORA DESC LIMIT 100";

    var resHist = executarConsultaBigQuerySegura(sqlHist);
    var listaEventos = [];

    if (resHist.rows && resHist.rows.length > 0) {
      resHist.rows.forEach(function(r) {
        var h = r.f;
        var rNome = String(h[12].v || "").trim();
        var rCpf = String(h[13].v || "").trim();
        var rObs = String(h[15].v || "").trim();

        // Higienização contra e-mails cruzados de sessão salvos no passado
        if (rNome && rNome.indexOf("(") !== -1 && rNome.indexOf("@") !== -1) {
          var mEm = rNome.match(/\(([^)]+@.*?)\)/);
          if (mEm && mEm[1]) {
            var emExtraido = mEm[1].trim().toLowerCase();
            // Verifica o cadastro do usuário pelo CPF
            if (rCpf && rCpf !== "-") {
              var uConf = verificarPermissaoUsuario(rCpf);
              if (uConf && uConf.email) {
                if (uConf.email.toLowerCase() !== emExtraido) {
                  rNome = (uConf.nome || rNome.replace(/\s*\([^)]+@.*?\)/g, "").trim()) + " (" + uConf.email + ")";
                }
              } else {
                rNome = rNome.replace(/\s*\([^)]+@.*?\)/g, "").trim();
              }
            } else {
              rNome = rNome.replace(/\s*\([^)]+@.*?\)/g, "").trim();
            }
          }
        }
        if (rObs && rObs.indexOf("(") !== -1 && rObs.indexOf("@") !== -1) {
          var mEmObs = rObs.match(/\(([^)]+@.*?)\)/);
          if (mEmObs && mEmObs[1]) {
            var emExtraidoObs = mEmObs[1].trim().toLowerCase();
            if (rCpf && rCpf !== "-") {
              var uConfObs = verificarPermissaoUsuario(rCpf);
              if (uConfObs && uConfObs.email) {
                if (uConfObs.email.toLowerCase() !== emExtraidoObs) {
                  rObs = rObs.replace(mEmObs[0], "(" + uConfObs.email + ")");
                }
              } else {
                rObs = rObs.replace(mEmObs[0], "");
              }
            }
          }
        }

        listaEventos.push({
          idHistorico: h[0].v || "",
          dataHora: h[1].v || "",
          item: h[2].v || "",
          objeto: h[3].v || "",
          nPatrimonio: h[4].v || "",
          tipoEvento: h[5].v || "",
          origemUnidade: h[6].v || "",
          origemLocal: h[7].v || "",
          destinoUnidade: h[8].v || "",
          destinoLocal: h[9].v || "",
          statusAnterior: h[10].v || "",
          statusNovo: h[11].v || "",
          responsavelNome: rNome,
          responsavelCpf: rCpf,
          documentoRef: h[14].v || "",
          observacao: rObs
        });
      });
    }

    // Se o item existe no inventário mas ainda não tinha eventos gravados (ex: importação via planilha ou legado)
    if (listaEventos.length === 0 && itemAtual) {
      var usuarioSessao = null;
      try {
        var emailSessao = Session.getActiveUser().getEmail();
        if (emailSessao) usuarioSessao = verificarPermissaoUsuario(emailSessao);
      } catch(e) {}

      var nomeImportador = "";
      var cpfImportador = "-";

      // 1. Tenta extrair de itemAtual.observacao se contiver o nome
      if (itemAtual.observacao) {
        var mObs = itemAtual.observacao.match(/por\s+([^|;\n\r\(\)]+)/i);
        if (mObs && mObs[1]) {
          nomeImportador = mObs[1].trim().replace(/\s*\([^)]*@.*?\)/g, "").trim();
        }
      }

      var dataHoraImportacao = "";

      // 2. Se não achou na observação, consulta o tb_Log para o usuário e data/hora do último lote de importação
      if (!nomeImportador) {
        try {
          var sqlLog = "SELECT FORMAT_TIMESTAMP('%d/%m/%Y %H:%M:%S', DATA_HORA, 'America/Recife') as DATA_FORMATADA, NOME, CPF FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_Log` WHERE ACAO = 'IMPORTACAO_EXCEL' ORDER BY DATA_HORA DESC LIMIT 1";
          var resLog = executarConsultaBigQuerySegura(sqlLog);
          if (resLog.rows && resLog.rows.length > 0) {
            dataHoraImportacao = String(resLog.rows[0].f[0].v || "").trim();
            nomeImportador = String(resLog.rows[0].f[1].v || "").trim().replace(/\s*\([^)]*@.*?\)/g, "").trim();
            cpfImportador = String(resLog.rows[0].f[2].v || "-").trim();
          }
        } catch(eLog) {}
      }

      // Se ainda não tiver a data do log de importação, busca do último log registrado
      if (!dataHoraImportacao) {
        try {
          var sqlDataLog = "SELECT FORMAT_TIMESTAMP('%d/%m/%Y %H:%M:%S', DATA_HORA, 'America/Recife') FROM `" + PROJECT_ID + "." + DATASET_ID + ".tb_Log` WHERE ACAO = 'IMPORTACAO_EXCEL' ORDER BY DATA_HORA DESC LIMIT 1";
          var resDataLog = executarConsultaBigQuerySegura(sqlDataLog);
          if (resDataLog.rows && resDataLog.rows.length > 0 && resDataLog.rows[0].f[0].v) {
            dataHoraImportacao = String(resDataLog.rows[0].f[0].v).trim();
          }
        } catch(eDLog) {}
      }

      if (!dataHoraImportacao) {
        dataHoraImportacao = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm:ss");
      }

      // 3. Monta o responsável de forma estrita, consultando o cadastro real do importador
      var respFinal = "";
      if (nomeImportador && nomeImportador !== "Usuário Logado") {
        var usuarioImportadorReal = null;
        if (cpfImportador && cpfImportador !== "-") {
          usuarioImportadorReal = verificarPermissaoUsuario(cpfImportador);
        }
        if (!usuarioImportadorReal) {
          usuarioImportadorReal = verificarPermissaoUsuario(nomeImportador);
        }

        if (usuarioImportadorReal) {
          nomeImportador = usuarioImportadorReal.nome || nomeImportador;
          cpfImportador = usuarioImportadorReal.cpf || cpfImportador;
          if (usuarioImportadorReal.email && usuarioImportadorReal.email !== nomeImportador) {
            respFinal = nomeImportador + " (" + usuarioImportadorReal.email + ")";
          } else {
            respFinal = nomeImportador;
          }
        } else {
          // Importador conhecido, mas sem registro em Logins: usa apenas o nome limpo, JAMAIS injetando email da sessão
          respFinal = nomeImportador;
        }
      } else {
        // Fallback: Apenas se não houver NENHUM registro de importador anterior, usa o usuário logado
        if (usuarioSessao) {
          nomeImportador = usuarioSessao.nome || "Usuário Logado";
          cpfImportador = usuarioSessao.cpf || "-";
          if (usuarioSessao.email && usuarioSessao.email !== nomeImportador) {
            respFinal = nomeImportador + " (" + usuarioSessao.email + ")";
          } else {
            respFinal = nomeImportador;
          }
        } else {
          nomeImportador = "Usuário Logado";
          respFinal = nomeImportador;
        }
      }

      var eventoBaseline = {
        idHistorico: "BASELINE",
        dataHora: dataHoraImportacao,
        item: itemAtual.item,
        objeto: itemAtual.objeto,
        nPatrimonio: itemAtual.nPatrimonio,
        tipoEvento: "CADASTRO",
        origemUnidade: "Carregamento em lote via Planilha",
        origemLocal: nomeImportador,
        destinoUnidade: itemAtual.unidade,
        destinoLocal: [itemAtual.subunidade, itemAtual.setor, itemAtual.local].filter(Boolean).join(" > "),
        statusAnterior: "-",
        statusNovo: itemAtual.status || "ECD",
        responsavelNome: respFinal,
        responsavelCpf: cpfImportador,
        documentoRef: itemAtual.seiCompra || "-",
        observacao: "Carregamento em lote via Planilha por " + respFinal
      };

      listaEventos.push(eventoBaseline);

      // Persiste automaticamente no banco de histórico para que fique gravado definitivamente
      try {
        registrarHistoricoMovimentacao([eventoBaseline]);
      } catch(eAutoPersist) {}
    }

    if (!itemAtual && listaEventos.length === 0) {
      return { sucesso: false, erro: "Material com identificador '" + termo + "' não foi encontrado no inventário nem no histórico." };
    }

    return {
      sucesso: true,
      item: itemAtual,
      historico: listaEventos
    };

  } catch (err) {
    console.error("Erro em getHistoricoMovimentacaoItem: " + err.message);
    return { sucesso: false, erro: err.message };
  }
}

