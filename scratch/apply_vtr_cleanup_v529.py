import os

def run():
    with open("Codigo.gs", "r", encoding="utf-8") as f:
        code = f.read()

    s = code.find("function limparReplicasTbArvore_() {")
    e = code.find("function executarLimpezaReplicasArvore() {")

    if s == -1 or e == -1:
        print(f"Error: tags not found s={s}, e={e}")
        return

    new_cleanup = '''function limparReplicasTbArvore_() {
  try {
    garantirTabelaArvore_();
    
    // 1. Reponta filhos que apontavam para IDs legados loc_ para o ID canônico vtr_
    try {
      var sqlRepontarFilhos = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` filho " +
                              "SET ID_Pai = ( " +
                              "  SELECT vtr.ID_Local " +
                              "  FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` vtr " +
                              "  JOIN `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` loc_antigo " +
                              "    ON UPPER(TRIM(vtr.Unidade_OME)) = UPPER(TRIM(loc_antigo.Unidade_OME)) " +
                              "   AND UPPER(TRIM(vtr.Nome_Local)) = UPPER(TRIM(loc_antigo.Nome_Local)) " +
                              "  WHERE vtr.ID_Local LIKE 'vtr_%' " +
                              "    AND loc_antigo.ID_Local = filho.ID_Pai " +
                              "  LIMIT 1 " +
                              ") " +
                              "WHERE EXISTS ( " +
                              "  SELECT 1 " +
                              "  FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` loc_antigo " +
                              "  JOIN `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` vtr " +
                              "    ON UPPER(TRIM(vtr.Unidade_OME)) = UPPER(TRIM(loc_antigo.Unidade_OME)) " +
                              "   AND UPPER(TRIM(vtr.Nome_Local)) = UPPER(TRIM(loc_antigo.Nome_Local)) " +
                              "  WHERE loc_antigo.ID_Local = filho.ID_Pai " +
                              "    AND loc_antigo.ID_Local LIKE 'loc_%' " +
                              "    AND vtr.ID_Local LIKE 'vtr_%' " +
                              ")";
      executarEscritaBigQuerySegura(sqlRepontarFilhos);
    } catch(eRep) {
      console.warn("Aviso ao repontar filhos de viaturas legadas: " + eRep.message);
    }

    // 2. Remove os registros legados loc_ de viaturas que já possuem o registro canônico vtr_
    try {
      var sqlDelLegados = "DELETE FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                          "WHERE ID_Local LIKE 'loc_%' " +
                          "  AND EXISTS ( " +
                          "    SELECT 1 FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` vtr " +
                          "    WHERE vtr.ID_Local LIKE 'vtr_%' " +
                          "      AND UPPER(TRIM(vtr.Unidade_OME)) = UPPER(TRIM(`" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "`.Unidade_OME)) " +
                          "      AND UPPER(TRIM(vtr.Nome_Local)) = UPPER(TRIM(`" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "`.Nome_Local)) " +
                          "  )";
      executarEscritaBigQuerySegura(sqlDelLegados);
    } catch(eDel) {
      console.warn("Aviso ao deletar registros legados de viaturas: " + eDel.message);
    }

    // 3. Desduplica a tabela inteira por ID_Local garantindo ordenação
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
    console.log("Limpeza de replicas e exclusao de viaturas legadas em tb_Arvore executada com sucesso no BigQuery.");
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
    
    // Identifica quais viaturas possuem registro vtr_
    var mapaVtrExistentes = {};
    for (var i = 1; i < dados.length; i++) {
      var id = String(dados[i][0] || "").trim();
      var ome = String(dados[i][1] || "").trim().toUpperCase();
      var nome = String(dados[i][2] || "").trim().toUpperCase();
      if (id.indexOf("vtr_") === 0) {
        mapaVtrExistentes[ome + "|" + nome] = id;
      }
    }

    // Se houver filhos apontando para loc_ cujo vtr_ existe, reponta
    var mapaLocParaVtr = {};
    for (var i = 1; i < dados.length; i++) {
      var id = String(dados[i][0] || "").trim();
      var ome = String(dados[i][1] || "").trim().toUpperCase();
      var nome = String(dados[i][2] || "").trim().toUpperCase();
      if (id.indexOf("loc_") === 0 && mapaVtrExistentes[ome + "|" + nome]) {
        mapaLocParaVtr[id] = mapaVtrExistentes[ome + "|" + nome];
      }
    }

    var mapaVistos = {};
    var linhasUnicas = [cabecalho];
    for (var i = 1; i < dados.length; i++) {
      var id = String(dados[i][0] || "").trim();
      var ome = String(dados[i][1] || "").trim().toUpperCase();
      var nome = String(dados[i][2] || "").trim().toUpperCase();
      var idPai = String(dados[i][3] || "").trim();

      // Descarta registro legado loc_ se ja existe vtr_
      if (id.indexOf("loc_") === 0 && mapaVtrExistentes[ome + "|" + nome]) {
        continue;
      }

      // Reponta pai se apontava para o loc_ que foi substituido por vtr_
      if (mapaLocParaVtr[idPai]) {
        dados[i][3] = mapaLocParaVtr[idPai];
        idPai = mapaLocParaVtr[idPai];
      }

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
      console.log("Planilha de arvore desduplicada: " + (dados.length - linhasUnicas.length) + " registros removidos.");
    }
  } catch(eSh) {
    console.warn("Aviso ao limpar replicas da planilha: " + eSh.message);
  }
}

'''
    code = code[:s] + new_cleanup + code[e:]

    # Update flagDedup in garantirConsistenciaArvoreLocais_
    code = code.replace("FLAG_DEDUP_TB_ARVORE_V527", "FLAG_DEDUP_TB_ARVORE_V529")

    # Bump cache in Codigo.gs
    code = code.replace("CACHE_ARM_COMPLETO_V16_", "CACHE_ARM_COMPLETO_V17_")
    code = code.replace('"_V16"', '"_V16", "_V17"')

    with open("Codigo.gs", "w", encoding="utf-8") as f:
        f.write(code)
    print("Codigo.gs updated successfully.")

    with open("index.html", "r", encoding="utf-8") as f:
        idx = f.read()
    idx = idx.replace("_v=528", "_v=529")
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(idx)
    print("index.html updated to v529.")

run()
