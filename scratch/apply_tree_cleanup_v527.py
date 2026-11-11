import os

def update_codigo_gs():
    path = "Codigo.gs"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update sincronizarViaturasInventarioNaArvore_ setorExistente.id = idVtr
    target_setor = """      if (setorExistente) {
        setorExistente.nome = nomeSetorAlvo;
        setorExistente.idPai = idPaiAlvo;
      } else {"""
    repl_setor = """      if (setorExistente) {
        setorExistente.id = idVtr;
        setorExistente.nome = nomeSetorAlvo;
        setorExistente.idPai = idPaiAlvo;
        setorExistente.isViatura = true;
      } else {"""
    if target_setor in content:
        content = content.replace(target_setor, repl_setor)
        print("Updated setorExistente in Codigo.gs")
    else:
        print("Warning: target_setor not found in Codigo.gs")

    # 2. Update invalidarCacheArmazenamentoOme_ and carregarDadosArmazenamentoCompleto cache keys
    target_cache_inv = 'var sufixos = ["", "_V3", "_V4", "_V5", "_V6", "_V7", "_V8", "_V9", "_V10", "_V11", "_V12", "_V13"];'
    repl_cache_inv = 'var sufixos = ["", "_V3", "_V4", "_V5", "_V6", "_V7", "_V8", "_V9", "_V10", "_V11", "_V12", "_V13", "_V14", "_V15", "_V16"];'
    if target_cache_inv in content:
        content = content.replace(target_cache_inv, repl_cache_inv)
        print("Updated sufixos cache in Codigo.gs")

    target_chave_base = 'var chaveBase = "CACHE_ARM_COMPLETO_V13_" + omePadrao.toUpperCase().replace(/[^A-Z0-9]/g, "_");'
    repl_chave_base = 'var chaveBase = "CACHE_ARM_COMPLETO_V16_" + omePadrao.toUpperCase().replace(/[^A-Z0-9]/g, "_");'
    if target_chave_base in content:
        content = content.replace(target_chave_base, repl_chave_base)
        print("Updated chaveBase in Codigo.gs")

    # 3. Update in-memory deduplication in obterLocaisArvoreGeral_
    target_dedup_mem = """        if (idLoc && nomeLoc) {
          lista.push({
            id: idLoc,
            ome: (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeLoc) : omeLoc,
            nome: nomeLoc,
            idPai: idPaiLoc
          });
          mapaIdsExistentes[idLoc] = true;
        }"""
    repl_dedup_mem = """        if (idLoc && nomeLoc) {
          if (!mapaIdsExistentes[idLoc]) {
            lista.push({
              id: idLoc,
              ome: (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omeLoc) : omeLoc,
              nome: nomeLoc,
              idPai: idPaiLoc
            });
            mapaIdsExistentes[idLoc] = true;
          }
        }"""
    if target_dedup_mem in content:
        content = content.replace(target_dedup_mem, repl_dedup_mem)
        print("Updated in-memory dedup in obterLocaisArvoreGeral_")
    else:
        print("Warning: target_dedup_mem not found in Codigo.gs")

    # 4. Insert limparReplicasTbArvore_, limparReplicasPlanilhaArvore_ and update garantirConsistenciaArvoreLocais_
    target_consistencia = """function garantirConsistenciaArvoreLocais_(omePadrao) {
  try {
    var ome = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omePadrao) : String(omePadrao || "").trim();
    if (!ome) return;

    // 1. Corrige Unidade_OME e ID_Pai da viatura AR - 1164 na tb_Arvore no BigQuery"""

    repl_consistencia = """function limparReplicasTbArvore_() {
  try {
    garantirTabelaArvore_();
    var sqlDedup = "CREATE OR REPLACE TABLE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` AS " +
                   "SELECT ID_Local, Unidade_OME, Nome_Local, ID_Pai, Ordem " +
                   "FROM (" +
                   "  SELECT ID_Local, Unidade_OME, Nome_Local, ID_Pai, Ordem, " +
                   "         ROW_NUMBER() OVER(" +
                   "           PARTITION BY ID_Local " +
                   "           ORDER BY " +
                   "             CASE WHEN Ordem IS NOT NULL THEN 0 ELSE 1 END, " +
                   "             Ordem ASC" +
                   "         ) as rn " +
                   "  FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                   "  WHERE ID_Local IS NOT NULL AND TRIM(ID_Local) != ''" +
                   ") WHERE rn = 1";
    executarEscritaBigQuerySegura(sqlDedup);
    console.log("Limpeza de replicas em tb_Arvore executada com sucesso no BigQuery.");
  } catch(e) {
    console.warn("Aviso ao limpar replicas de tb_Arvore: " + e.message);
  }
}

function limparReplicasPlanilhaArvore_() {
  try {
    var ss = abrirPlanilhaSegura_(ID_PLANILHA_AUXILIAR);
    if (!ss) return;
    var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
    if (!sheet || sheet.getLastRow() <= 1) return;
    var dados = sheet.getDataRange().getValues();
    var cabecalho = dados[0];
    var mapaVistos = {};
    var linhasUnicas = [cabecalho];
    for (var i = 1; i < dados.length; i++) {
      var id = String(dados[i][0] || "").trim();
      var ome = String(dados[i][1] || "").trim().toUpperCase();
      var nome = String(dados[i][2] || "").trim().toUpperCase();
      var idPai = String(dados[i][3] || "").trim();
      var chave = id + "|" + ome + "|" + nome + "|" + idPai;
      if (!id || mapaVistos[chave] || (id && mapaVistos[id])) continue;
      mapaVistos[chave] = true;
      mapaVistos[id] = true;
      linhasUnicas.push(dados[i]);
    }
    if (linhasUnicas.length < dados.length) {
      sheet.clearContents();
      sheet.getRange(1, 1, linhasUnicas.length, linhasUnicas[0].length).setValues(linhasUnicas);
      SpreadsheetApp.flush();
      console.log("Planilha de arvore desduplicada: " + (dados.length - linhasUnicas.length) + " replicas removidas.");
    }
  } catch(eSh) {
    console.warn("Aviso ao limpar replicas da planilha: " + eSh.message);
  }
}

function executarLimpezaReplicasArvore() {
  limparReplicasTbArvore_();
  limparReplicasPlanilhaArvore_();
  return "Limpeza e desduplicacao de locais concluida com sucesso!";
}

function garantirConsistenciaArvoreLocais_(omePadrao) {
  try {
    var ome = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(omePadrao) : String(omePadrao || "").trim();
    if (!ome) return;

    // Desduplica tb_Arvore e planilha se ainda nao foi executado nesta versao
    var flagDedup = "FLAG_DEDUP_TB_ARVORE_V527";
    var jaDedup = PropertiesService.getScriptProperties().getProperty(flagDedup);
    if (!jaDedup) {
      limparReplicasTbArvore_();
      limparReplicasPlanilhaArvore_();
      PropertiesService.getScriptProperties().setProperty(flagDedup, "true");
    }

    // 1. Corrige Unidade_OME e ID_Pai da viatura AR - 1164 na tb_Arvore no BigQuery"""

    if target_consistencia in content:
        content = content.replace(target_consistencia, repl_consistencia)
        print("Updated garantirConsistenciaArvoreLocais_ in Codigo.gs")
    else:
        print("Warning: target_consistencia not found in Codigo.gs")

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Codigo.gs written successfully.")

def update_app_html():
    path = "App.html"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # In obterTotalItensSubarvore, make sure parent matching works by id and by name
    target_subtotal = """          function obterTotalItensSubarvore(noId) {
            let total = (cacheMateriaisAtrelados[noId] || []).reduce((acc, m) => {
              if (filtrosAtivos.length > 0 && !filtrosAtivos.includes(m.nome.toUpperCase())) return acc;
              return acc + (parseInt(m.qtd) || 0);
            }, 0);
            const filhosDoNo = locais.filter(l => String(l.idPai) === String(noId));
            filhosDoNo.forEach(fn => { total += obterTotalItensSubarvore(fn.id); });
            return total;
          }"""

    repl_subtotal = """          function obterTotalItensSubarvore(noId) {
            let total = (cacheMateriaisAtrelados[noId] || []).reduce((acc, m) => {
              if (filtrosAtivos.length > 0 && !filtrosAtivos.includes(m.nome.toUpperCase())) return acc;
              return acc + (parseInt(m.qtd) || 0);
            }, 0);
            const pNode = locais.find(p => String(p.id) === String(noId));
            const pNomeUpper = pNode ? String(pNode.nome || '').trim().toUpperCase() : '';
            const pNomeSemEsp = pNomeUpper.replace(/\\s+/g, '');
            const filhosDoNo = locais.filter(l => {
              const pId = String(l.idPai || '').trim();
              if (pId === String(noId)) return true;
              if (pNomeUpper && (pId.toUpperCase() === pNomeUpper || pId.replace(/\\s+/g, '').toUpperCase() === pNomeSemEsp)) return true;
              return false;
            });
            filhosDoNo.forEach(fn => { total += obterTotalItensSubarvore(fn.id); });
            return total;
          }"""

    if target_subtotal in content:
        content = content.replace(target_subtotal, repl_subtotal)
        print("Updated obterTotalItensSubarvore in App.html")
    else:
        print("Warning: target_subtotal not found in App.html")

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("App.html written successfully.")

def update_index_html():
    path = "index.html"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    content = content.replace("_v=526", "_v=527")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("index.html updated to v527.")

if __name__ == "__main__":
    update_codigo_gs()
    update_app_html()
    update_index_html()
