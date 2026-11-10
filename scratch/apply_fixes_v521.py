# -*- coding: utf-8 -*-
import sys

with open('Codigo.gs', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update garantirSetoresViaturasNaArvore_
old_func_garantir = """function garantirSetoresViaturasNaArvore_(omePadrao, idSedeOficial, sheet, locais) {
  return sincronizarViaturasInventarioNaArvore_(omePadrao, idSedeOficial, locais);
}"""

new_func_garantir = """function garantirSetoresViaturasNaArvore_(omePadrao, idSedeOficial, sheet, locais, dadosLocaisOpcional) {
  return sincronizarViaturasInventarioNaArvore_(omePadrao, idSedeOficial, locais, dadosLocaisOpcional);
}"""

if old_func_garantir in code:
    code = code.replace(old_func_garantir, new_func_garantir, 1)
    print("1. Updated garantirSetoresViaturasNaArvore_")
else:
    print("1. FAILED: old_func_garantir not found")

# 2. Update sincronizarViaturasInventarioNaArvore_ signature and body
old_sinc_start = """function sincronizarViaturasInventarioNaArvore_(omePadrao, idSedeOficial, locais, dadosLocaisOpcional) {
  if (!omePadrao || !idSedeOficial || !locais) return;

  try {
    garantirTabelaArvore_();"""

new_sinc_start = """function sincronizarViaturasInventarioNaArvore_(omePadrao, idSedeOficial, locais, dadosLocaisOpcional) {
  if (!omePadrao || !idSedeOficial || !locais) return;

  try {
    garantirTabelaArvore_();

    var dadosLocaisRef = (dadosLocaisOpcional && Array.isArray(dadosLocaisOpcional))
      ? dadosLocaisOpcional
      : ((typeof obterLocaisArvoreGeral_ === 'function') ? (obterLocaisArvoreGeral_(omePadrao) || []) : []);"""

if old_sinc_start in code:
    code = code.replace(old_sinc_start, new_sinc_start, 1)
    print("2. Added dadosLocaisRef to sincronizarViaturasInventarioNaArvore_")
else:
    print("2. FAILED: old_sinc_start not found")

# 3. Update the loop inside sincronizarViaturasInventarioNaArvore_
old_loop_block = """    // 3. Montagem instantânea em memória dos nós de viatura a partir do inventário oficial
    viaturasInventario.forEach(function(vtr) {
      var subRef = vtr.subRef;
      var nomeSetorAlvo = vtr.nomeSetor;
      var numNorm = vtr.numNorm;

      // Determina a Subunidade Pai (SEDE inicialmente, ou Subunidade específica cadastrada no BigQuery)
      var idPaiAlvo = idSedeOficial;
      var ehSubSede = !subRef || subRef.toUpperCase() === 'SEDE' || (typeof ehSubunidadeEquivalenteOme_ === 'function' && ehSubunidadeEquivalenteOme_(subRef, omePadrao));
      
      if (!ehSubSede) {
        var noSub = locais.find(function(l) {
          if (l.idPai && String(l.idPai).trim() !== '') return false;
          var nUpper = String(l.nome || '').toUpperCase().trim();
          var sUpper = subRef.toUpperCase().trim();
          return nUpper === sUpper || nUpper.indexOf(sUpper) !== -1 || sUpper.indexOf(nUpper) !== -1;
        });
        if (noSub) {
          idPaiAlvo = noSub.id;
        } else {
          // Cria a subunidade em memória se ainda não existir
          var idNovaSub = 'sub_' + omePadrao.replace(/[^A-Z0-9]/gi, '_') + '_' + subRef.replace(/[^A-Z0-9]/gi, '_');
          locais.push({ id: idNovaSub, ome: omePadrao, nome: subRef, idPai: '' });
          idPaiAlvo = idNovaSub;
        }
      }

      // Procura se o setor desta viatura já existe na lista locais
      var setorExistente = locais.find(function(l) {
        var nU = String(l.nome || '').trim().toUpperCase();
        if (nU === nomeSetorAlvo.toUpperCase()) return true;
        if (numNorm) {
          var mNum = nU.match(/\\b(\\d+)\\b/);
          if (mNum && mNum[1].replace(/^0+/, '') === numNorm) {
            if (/^(?:ABTS|ABTF|ABSL|ABSM|ABSC|ABT|AR|AT|ASE|AE|AEM|BIS|MSA|MR|UR|UTI|ATM|VTR)/i.test(nU)) {
              return true;
            }
          }
        }
        return false;
      });

      if (setorExistente) {
        setorExistente.nome = nomeSetorAlvo;
        if (idPaiAlvo && String(setorExistente.idPai) !== String(idPaiAlvo)) {
          setorExistente.idPai = idPaiAlvo;
        }
      } else {
        var idVtr = 'vtr_' + omePadrao.replace(/[^A-Z0-9]/gi, '_') + '_' + nomeSetorAlvo.replace(/[^A-Z0-9]/gi, '_');
        locais.push({
          id: idVtr,
          ome: omePadrao,
          nome: nomeSetorAlvo,
          idPai: idPaiAlvo,
          isViatura: true
        });
      }
    });"""

new_loop_block = """    // 3. Montagem instantânea em memória dos nós de viatura a partir do inventário oficial
    viaturasInventario.forEach(function(vtr) {
      var subRef = vtr.subRef;
      var nomeSetorAlvo = vtr.nomeSetor;
      var numNorm = vtr.numNorm;

      // 3.1 Verifica se o usuário já definiu explicitamente uma Subunidade/Pai para esta viatura na tb_Arvore ou Planilha
      var explicitPaiId = "";
      var matchDado = null;
      if (dadosLocaisRef && dadosLocaisRef.length > 0) {
        matchDado = dadosLocaisRef.find(function(d) {
          var nD = String(d.nome || "").trim().toUpperCase();
          if (nD === nomeSetorAlvo.toUpperCase()) return true;
          if (nD.replace(/\\s+/g, "") === nomeSetorAlvo.replace(/\\s+/g, "").toUpperCase()) return true;
          if (numNorm) {
            var mNum = nD.match(/\\b(\\d+)\\b/);
            if (mNum && mNum[1].replace(/^0+/, "") === numNorm) {
              if (/^(?:ABTS|ABTF|ABSL|ABSM|ABSC|ABT|AR|AT|ASE|AE|AEM|BIS|MSA|MR|UR|UTI|ATM|VTR)/i.test(nD)) {
                return true;
              }
            }
          }
          var idD = String(d.id || "").trim();
          if (idD && (idD === ('vtr_' + omePadrao.replace(/[^A-Z0-9]/gi, '_') + '_' + nomeSetorAlvo.replace(/[^A-Z0-9]/gi, '_')) ||
                      idD === ('loc_vtr_' + omePadrao.replace(/[^A-Z0-9]/gi, '_') + '_' + nomeSetorAlvo.replace(/[^A-Z0-9]/gi, '_')))) {
            return true;
          }
          return false;
        });

        if (matchDado && matchDado.idPai && String(matchDado.idPai).trim() !== "") {
          var idPaiCandidate = String(matchDado.idPai).trim();
          var noPaiAchado = locais.find(function(l) { return String(l.id) === idPaiCandidate; });
          if (!noPaiAchado && dadosLocaisRef) {
            var paiEmDados = dadosLocaisRef.find(function(d) { return String(d.id) === idPaiCandidate; });
            if (paiEmDados) {
              locais.push({
                id: paiEmDados.id,
                ome: omePadrao,
                nome: paiEmDados.nome,
                idPai: ""
              });
              noPaiAchado = true;
            }
          }
          if (noPaiAchado) {
            explicitPaiId = idPaiCandidate;
          }
        }
      }

      // 3.2 Determina a Subunidade Pai (Prioridade: hierarquia explícita salva na árvore > cadastro no BigQuery > SEDE)
      var idPaiAlvo = idSedeOficial;
      if (explicitPaiId) {
        idPaiAlvo = explicitPaiId;
      } else {
        var ehSubSede = !subRef || subRef.toUpperCase() === 'SEDE' || (typeof ehSubunidadeEquivalenteOme_ === 'function' && ehSubunidadeEquivalenteOme_(subRef, omePadrao));
        if (!ehSubSede) {
          var noSub = locais.find(function(l) {
            if (l.idPai && String(l.idPai).trim() !== '') return false;
            var nUpper = String(l.nome || '').toUpperCase().trim();
            var sUpper = subRef.toUpperCase().trim();
            return nUpper === sUpper || nUpper.indexOf(sUpper) !== -1 || sUpper.indexOf(nUpper) !== -1;
          });
          if (noSub) {
            idPaiAlvo = noSub.id;
          } else {
            // Cria a subunidade em memória se ainda não existir
            var idNovaSub = 'sub_' + omePadrao.replace(/[^A-Z0-9]/gi, '_') + '_' + subRef.replace(/[^A-Z0-9]/gi, '_');
            locais.push({ id: idNovaSub, ome: omePadrao, nome: subRef, idPai: '' });
            idPaiAlvo = idNovaSub;
          }
        }
      }

      var idVtr = (matchDado && matchDado.id) ? String(matchDado.id).trim() : ('vtr_' + omePadrao.replace(/[^A-Z0-9]/gi, '_') + '_' + nomeSetorAlvo.replace(/[^A-Z0-9]/gi, '_'));

      // Se houver compartimentos filhos (ex: Porta 01, Porta 02) apontando para ID anterior, preserva vinculação ao idVtr
      if (matchDado && matchDado.id && String(matchDado.id) !== idVtr) {
        locais.forEach(function(l) {
          if (String(l.idPai) === String(matchDado.id)) {
            l.idPai = idVtr;
          }
        });
      }

      // Procura se o setor desta viatura já existe na lista locais
      var setorExistente = locais.find(function(l) {
        var nU = String(l.nome || '').trim().toUpperCase();
        if (nU === nomeSetorAlvo.toUpperCase()) return true;
        if (String(l.id) === idVtr) return true;
        if (numNorm) {
          var mNum = nU.match(/\\b(\\d+)\\b/);
          if (mNum && mNum[1].replace(/^0+/, '') === numNorm) {
            if (/^(?:ABTS|ABTF|ABSL|ABSM|ABSC|ABT|AR|AT|ASE|AE|AEM|BIS|MSA|MR|UR|UTI|ATM|VTR)/i.test(nU)) {
              return true;
            }
          }
        }
        return false;
      });

      if (setorExistente) {
        setorExistente.nome = nomeSetorAlvo;
        setorExistente.idPai = idPaiAlvo;
      } else {
        locais.push({
          id: idVtr,
          ome: omePadrao,
          nome: nomeSetorAlvo,
          idPai: idPaiAlvo,
          isViatura: true
        });
      }
    });"""

if old_loop_block in code:
    code = code.replace(old_loop_block, new_loop_block, 1)
    print("3. Updated loop in sincronizarViaturasInventarioNaArvore_")
else:
    print("3. FAILED: old_loop_block not found")

# 4. Pass dadosLocais into sincronizarViaturasInventarioNaArvore_ in getArvoreLocais
old_get_arvore = """    // 3ª passada: monta viaturas na árvore estritamente a partir do BigQuery (tb_Inventario)
    try {
      sincronizarViaturasInventarioNaArvore_(omePadrao, idSedeOficial, locais);
    } catch(eVtrArvore) {"""

new_get_arvore = """    // 3ª passada: monta viaturas na árvore estritamente a partir do BigQuery (tb_Inventario)
    try {
      sincronizarViaturasInventarioNaArvore_(omePadrao, idSedeOficial, locais, dadosLocais);
    } catch(eVtrArvore) {"""

if old_get_arvore in code:
    code = code.replace(old_get_arvore, new_get_arvore, 1)
    print("4. Passed dadosLocais to sincronizarViaturasInventarioNaArvore_ in getArvoreLocais")
else:
    print("4. FAILED: old_get_arvore not found")

# 5. Fix migrarConteudoViatura BigQuery executions and SQL syntax
old_migrar_sql1 = """            if ((numDestLimpo && serIt === numDestLimpo) || (siglaDest && siglaIt === siglaDest && serIt === numDestLimpo)) {
              var sqlUpVtrDest = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                                 "SET SUBUNIDADE = '" + limparSQL(subunidadeAlvo) + "' " +
                                 "WHERE ITEM = '" + limparSQL(itId) + "'";
              executarConsultaBigQuerySegura(sqlUpVtrDest, true);
              break;
            }"""

new_migrar_sql1 = """            if ((numDestLimpo && serIt === numDestLimpo) || (siglaDest && siglaIt === siglaDest && serIt === numDestLimpo)) {
              var sqlUpVtrDest = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                                 "SET SUBUNIDADE = '" + limparSQL(subunidadeAlvo) + "' " +
                                 "WHERE ITEM = '" + limparSQL(itId) + "'";
              executarEscritaBigQuerySegura(sqlUpVtrDest);
              break;
            }"""

if old_migrar_sql1 in code:
    code = code.replace(old_migrar_sql1, new_migrar_sql1, 1)
    print("5.1 Updated sqlUpVtrDest execution")
else:
    print("5.1 FAILED: old_migrar_sql1 not found")

old_migrar_sql2 = """          var sqlUpPaiDest = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                             "SET ID_Pai = '" + limparSQL(idPaiOrigem) + "' " +
                             "WHERE UPPER(TRIM(Unidade_OME)) IN (" + inSqlOme + ") " +
                             "  AND (ID_Local = '" + limparSQL(idDestino) + "' OR Nome_Local = '" + limparSQL(nomeDestino) + "')";
          executarConsultaBigQuerySegura(sqlUpPaiDest, true);"""

new_migrar_sql2 = """          var sqlUpPaiDest = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                             "SET ID_Pai = '" + limparSQL(idPaiOrigem) + "' " +
                             "WHERE UPPER(TRIM(Unidade_OME)) IN (" + inSqlOme + ") " +
                             "  AND (ID_Local = '" + limparSQL(idDestino) + "' OR Nome_Local = '" + limparSQL(nomeDestino) + "')";
          executarEscritaBigQuerySegura(sqlUpPaiDest);"""

if old_migrar_sql2 in code:
    code = code.replace(old_migrar_sql2, new_migrar_sql2, 1)
    print("5.2 Updated sqlUpPaiDest execution")
else:
    print("5.2 FAILED: old_migrar_sql2 not found")

old_migrar_sql3 = """          // Atualiza o ID_Pai para idDestino na base BigQuery
          var sqlUpdateArvore = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                                "SET ID_Pai = '" + limparSQL(idDestino) + "' " +
                                "WHERE UPPER(TRIM(Unidade_OME)) IN (" + inSqlOme + ") " +
                                "  AND (ID_Pai = '" + limparSQL(idOrigem) + "' OR ID_Pai = '" + limparSQL(nomeOrigem) + "')";
          executarConsultaBigQuerySegura(sqlUpdateArvore, true);"""

new_migrar_sql3 = """          // Atualiza o ID_Pai para idDestino na base BigQuery
          var sqlUpdateArvore = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                                "SET ID_Pai = '" + limparSQL(idDestino) + "' " +
                                "WHERE UPPER(TRIM(Unidade_OME)) IN (" + inSqlOme + ") " +
                                "  AND (ID_Pai = '" + limparSQL(idOrigem) + "' OR ID_Pai = '" + limparSQL(nomeOrigem) + "')";
          executarEscritaBigQuerySegura(sqlUpdateArvore);"""

if old_migrar_sql3 in code:
    code = code.replace(old_migrar_sql3, new_migrar_sql3, 1)
    print("5.3 Updated sqlUpdateArvore execution")
else:
    print("5.3 FAILED: old_migrar_sql3 not found")

old_migrar_sql4 = """        var sqlUpdateItens = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                             "SET SETOR = '" + limparSQL(nomeDestino) + "', " +
                             "    SUBUNIDADE = '" + limparSQL(subunidadeAlvo) + "' " +
                             "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                             "  AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) NOT IN ('BAIXADO', 'EXCLUIDO')) " +
                             "  AND (UPPER(TRIM(SETOR)) = UPPER(TRIM('" + limparSQL(nomeOrigem) + "')) " +
                             "       OR REPLACE(UPPER(TRIM(SETOR)), ' ', '') = UPPER(TRIM('" + limparSQL(nomeOrigemSemEsp) + "')))";
        executarConsultaBigQuerySegura(sqlUpdateItens, true);"""

new_migrar_sql4 = """        var sqlUpdateItens = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                             "SET SETOR = '" + limparSQL(nomeDestino) + "', " +
                             "    SUBUNIDADE = '" + limparSQL(subunidadeAlvo) + "' " +
                             "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                             "  AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) NOT IN ('BAIXADO', 'EXCLUIDO')) " +
                             "  AND (UPPER(TRIM(SETOR)) = UPPER(TRIM('" + limparSQL(nomeOrigem) + "')) " +
                             "       OR REPLACE(UPPER(TRIM(SETOR)), ' ', '') = UPPER(TRIM('" + limparSQL(nomeOrigemSemEsp) + "')))";
        executarEscritaBigQuerySegura(sqlUpdateItens);"""

if old_migrar_sql4 in code:
    code = code.replace(old_migrar_sql4, new_migrar_sql4, 1)
    print("5.4 Updated sqlUpdateItens execution")
else:
    print("5.4 FAILED: old_migrar_sql4 not found")

old_migrar_sql5 = """      var sqlUpVtrOrig = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                         "SET STATUS = 'SCD', " +
                         "    OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Substituída por " + limparSQL(nomeDestino) + " e enviada para manutenção em " + dataHoraHoje + " (" + limparSQL(motivo) + ")') " +
                         "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                         "  AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) NOT IN ('BAIXADO', 'EXCLUIDO')) " +
                         "  AND (REPLACE(UPPER(TRIM(COALESCE(N_SERIE, ''))), ' ', '') = '" + limparSQL(numOrigLimpo) + "' " +
                         "       OR (UPPER(OBJETO) LIKE '%" + limparSQL(numOrigLimpo) + "%' AND (identificarSeObjetoEhViatura_(OBJETO) = TRUE OR ehViaturaMaterialBackend_(OBJETO) = TRUE)))";
      try {
        executarConsultaBigQuerySegura(sqlUpVtrOrig, true);
      } catch(eUpOrig) {}"""

new_migrar_sql5 = """      var sqlUpVtrOrig = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                         "SET STATUS = 'SCD', " +
                         "    OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Substituída por " + limparSQL(nomeDestino) + " e enviada para manutenção em " + dataHoraHoje + " (" + limparSQL(motivo) + ")') " +
                         "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                         "  AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) NOT IN ('BAIXADO', 'EXCLUIDO')) " +
                         "  AND (REPLACE(UPPER(TRIM(COALESCE(N_SERIE, ''))), ' ', '') = '" + limparSQL(numOrigLimpo) + "' " +
                         "       OR (UPPER(OBJETO) LIKE '%" + limparSQL(numOrigLimpo) + "%' AND REGEXP_CONTAINS(UPPER(OBJETO), r'\\\\b(AR|ABT|ABTS|AT|ASE|BIS|MSA|MR|UR|VIATURA|AUTO)\\\\b')))";
      try {
        executarEscritaBigQuerySegura(sqlUpVtrOrig);
      } catch(eUpOrig) {}"""

if old_migrar_sql5 in code:
    code = code.replace(old_migrar_sql5, new_migrar_sql5, 1)
    print("5.5 Updated sqlUpVtrOrig execution and SQL regex")
else:
    print("5.5 FAILED: old_migrar_sql5 not found")

# 6. Fix atualizarPaiLocalArvore BigQuery execution and SQL syntax
old_atualizar_bloco = """    if (ehVtr) {
      // 6.1 Atualiza a Viatura em si no inventário
      var whereVtr = "UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") AND (";
      whereVtr += "UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "' ";
      whereVtr += "OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s+/g, "").toUpperCase()) + "' ";
      whereVtr += "OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s*-\\s*/g, " ").toUpperCase()) + "' ";
      if (nOrdemOuSerie) {
        whereVtr += "OR REPLACE(UPPER(TRIM(COALESCE(N_SERIE, ''))), ' ', '') = '" + limparSql(nOrdemOuSerie) + "' ";
        whereVtr += "OR (UPPER(OBJETO) LIKE '%" + limparSql(nOrdemOuSerie) + "%' AND (identificarSeObjetoEhViatura_(OBJETO) = TRUE OR ehViaturaMaterialBackend_(OBJETO) = TRUE)) ";
      }
      whereVtr += ")";

      try {
        var sqlUpVtr = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                       "SET SUBUNIDADE = '" + limparSql(novaSubunidade) + "', " +
                       "    SETOR = '" + limparSql(nomeLocalAlvo) + "' " +
                       "WHERE " + whereVtr;
        executarConsultaBigQuerySegura(sqlUpVtr, true);
      } catch(eBqVtr) {
        console.warn("Aviso ao atualizar viatura no inventário: " + eBqVtr.message);
      }

      // 6.2 Atualiza todos os materiais atribuídos a esta viatura
      try {
        var sqlUpMats = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                        "SET SUBUNIDADE = '" + limparSql(novaSubunidade) + "' " +
                        "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                        "  AND (UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "' " +
                        "       OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s+/g, "").toUpperCase()) + "' " +
                        "       OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s*-\\s*/g, " ").toUpperCase()) + "') " +
                        (nOrdemOuSerie ? ("AND (N_SERIE IS NULL OR REPLACE(UPPER(TRIM(N_SERIE)), ' ', '') != '" + limparSql(nOrdemOuSerie) + "')") : "");
        executarConsultaBigQuerySegura(sqlUpMats, true);
      } catch(eBqMats) {
        console.warn("Aviso ao atualizar materiais da viatura: " + eBqMats.message);
      }
    } else {
      // 6.3 Setor físico normal (Almoxarifado, Sala, etc.)
      try {
        var sqlUpGeral = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                         "SET SUBUNIDADE = '" + limparSql(novaSubunidade) + "' " +
                         "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                         "  AND (UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "' " +
                         "       OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s+/g, "").toUpperCase()) + "' " +
                         "       OR UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "')";
        executarConsultaBigQuerySegura(sqlUpGeral, true);
      } catch(eBqGeral) {
        console.warn("Aviso ao atualizar setor geral: " + eBqGeral.message);
      }
    }"""

new_atualizar_bloco = """    if (ehVtr) {
      // 6.1 Atualiza a Viatura em si no inventário
      var whereVtr = "UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") AND (";
      whereVtr += "UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "' ";
      whereVtr += "OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s+/g, "").toUpperCase()) + "' ";
      whereVtr += "OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s*-\\s*/g, " ").toUpperCase()) + "' ";
      if (nOrdemOuSerie) {
        whereVtr += "OR REPLACE(UPPER(TRIM(COALESCE(N_SERIE, ''))), ' ', '') = '" + limparSql(nOrdemOuSerie) + "' ";
        whereVtr += "OR REPLACE(UPPER(TRIM(COALESCE(N_SERIE, ''))), ' ', '') LIKE '%" + limparSql(nOrdemOuSerie) + "%' ";
        whereVtr += "OR (UPPER(OBJETO) LIKE '%" + limparSql(nOrdemOuSerie) + "%' AND REGEXP_CONTAINS(UPPER(OBJETO), r'\\\\b(AR|ABT|ABTS|AT|ASE|BIS|MSA|MR|UR|VIATURA|AUTO)\\\\b')) ";
      }
      whereVtr += ")";

      try {
        var sqlUpVtr = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                       "SET SUBUNIDADE = '" + limparSql(novaSubunidade) + "', " +
                       "    SETOR = '" + limparSql(nomeLocalAlvo) + "' " +
                       "WHERE " + whereVtr;
        executarEscritaBigQuerySegura(sqlUpVtr);
      } catch(eBqVtr) {
        console.warn("Aviso ao atualizar viatura no inventário: " + eBqVtr.message);
      }

      // 6.2 Atualiza todos os materiais atribuídos a esta viatura
      try {
        var sqlUpMats = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                        "SET SUBUNIDADE = '" + limparSql(novaSubunidade) + "' " +
                        "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                        "  AND (UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "' " +
                        "       OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s+/g, "").toUpperCase()) + "' " +
                        "       OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s*-\\s*/g, " ").toUpperCase()) + "') " +
                        (nOrdemOuSerie ? ("AND (N_SERIE IS NULL OR REPLACE(UPPER(TRIM(N_SERIE)), ' ', '') != '" + limparSql(nOrdemOuSerie) + "')") : "");
        executarEscritaBigQuerySegura(sqlUpMats);
      } catch(eBqMats) {
        console.warn("Aviso ao atualizar materiais da viatura: " + eBqMats.message);
      }
    } else {
      // 6.3 Setor físico normal (Almoxarifado, Sala, etc.)
      try {
        var sqlUpGeral = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                         "SET SUBUNIDADE = '" + limparSql(novaSubunidade) + "' " +
                         "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                         "  AND (UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "' " +
                         "       OR UPPER(TRIM(SETOR)) = '" + limparSql(nomeLocalAlvo.replace(/\\s+/g, "").toUpperCase()) + "' " +
                         "       OR UPPER(TRIM(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario)) = '" + limparSql(nomeLocalAlvo.toUpperCase()) + "')";
        executarEscritaBigQuerySegura(sqlUpGeral);
      } catch(eBqGeral) {
        console.warn("Aviso ao atualizar setor geral: " + eBqGeral.message);
      }
    }"""

if old_atualizar_bloco in code:
    code = code.replace(old_atualizar_bloco, new_atualizar_bloco, 1)
    print("6. Updated atualizarPaiLocalArvore SQL & execution")
else:
    print("6. FAILED: old_atualizar_bloco not found")

# 7. Update cache keys to V13
old_cache1 = 'var sufixos = ["", "_V3", "_V4", "_V5", "_V6", "_V7", "_V8", "_V9", "_V10", "_V11", "_V12"];'
new_cache1 = 'var sufixos = ["", "_V3", "_V4", "_V5", "_V6", "_V7", "_V8", "_V9", "_V10", "_V11", "_V12", "_V13"];'

if old_cache1 in code:
    code = code.replace(old_cache1, new_cache1, 1)
    print("7.1 Updated sufixos in invalidarCacheArmazenamentoOme_")
else:
    print("7.1 FAILED: old_cache1 not found")

old_cache2 = 'var chaveBase = "CACHE_ARM_COMPLETO_V12_" + omePadrao.toUpperCase().replace(/[^A-Z0-9]/g, "_");'
new_cache2 = 'var chaveBase = "CACHE_ARM_COMPLETO_V13_" + omePadrao.toUpperCase().replace(/[^A-Z0-9]/g, "_");'

if old_cache2 in code:
    code = code.replace(old_cache2, new_cache2, 1)
    print("7.2 Updated chaveBase in carregarDadosArmazenamentoCompleto")
else:
    print("7.2 FAILED: old_cache2 not found")

with open('Codigo.gs', 'w', encoding='utf-8') as f:
    f.write(code)

print("Codigo.gs successfully written.")
