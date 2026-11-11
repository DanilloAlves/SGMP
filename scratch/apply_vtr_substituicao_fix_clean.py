import os

def run():
    with open("Codigo.gs", "r", encoding="utf-8") as f:
        code = f.read()

    s = code.find("function migrarEstruturaEMateriaisViatura(dados) {")
    e = code.find("function excluirLocalDaArvore(idLocal) {")

    if s == -1 or e == -1:
        print(f"Error: bounds not found: s={s}, e={e}")
        return

    new_func = '''function migrarEstruturaEMateriaisViatura(dados) {
  try {
    var idOrigem = String(dados.idOrigem || "").trim();
    var nomeOrigem = String(dados.nomeOrigem || "").trim();
    var idDestino = String(dados.idDestino || "").trim();
    var nomeDestino = String(dados.nomeDestino || "").trim();
    var unidade = String(dados.unidade || "").trim();
    var migrarLocais = dados.migrarLocais !== false;
    var migrarSubunidade = dados.migrarSubunidade !== false;
    var marcarManutencao = dados.marcarManutencao !== false;
    var motivo = String(dados.motivo || "Substituição Operacional / Manutenção").trim();
    var cpf = String(dados.cpf || "").trim();

    var omePadrao = (typeof obterOmePadronizada === 'function') ? obterOmePadronizada(unidade) : unidade;
    if (!omePadrao) throw new Error("OME não identificada.");
    if (!idOrigem || !nomeOrigem) throw new Error("Viatura de origem não informada.");
    if (!idDestino || !nomeDestino) throw new Error("Viatura de destino não informada.");
    if (idOrigem === idDestino || nomeOrigem.toUpperCase() === nomeDestino.toUpperCase()) {
      throw new Error("A viatura de destino não pode ser igual à viatura de origem.");
    }

    garantirTabelaArvore_();
    function limparSQL(t) { return String(t || '').replace(/'/g, "\\\\'"); }

    var inSqlOme = (typeof obterVariacoesOmeParaSql_ === 'function') 
      ? obterVariacoesOmeParaSql_(omePadrao) 
      : ("'" + limparSQL(omePadrao.toUpperCase()) + "'");

    var numOrigLimpo = nomeOrigem.replace(/[^0-9]/g, '').replace(/^0+/, '');
    var nomeOrigemSemEsp = nomeOrigem.replace(/\\s+/g, '');
    var numDestLimpo = nomeDestino.replace(/[^0-9]/g, '').replace(/^0+/, '');
    var nomeDestinoSemEsp = nomeDestino.replace(/\\s+/g, '');

    // 1. IDENTIFICA A POSIÇÃO EXATA DA VIATURA SUBSTITUÍDA NA ÁRVORE (ID_Pai e Subunidade Raiz)
    var todosLocaisOme = (typeof getArvoreLocais === 'function') ? (getArvoreLocais(omePadrao) || []) : [];
    var noOrigem = todosLocaisOme.find(function(l) { 
      if (idOrigem && String(l.id) === String(idOrigem)) return true;
      if (nomeOrigem && String(l.nome).toUpperCase().trim() === String(nomeOrigem).toUpperCase().trim()) return true;
      if (nomeOrigemSemEsp && String(l.nome).replace(/\\s+/g, '').toUpperCase() === nomeOrigemSemEsp.toUpperCase()) return true;
      return false;
    });

    var idPaiOrigem = (noOrigem && noOrigem.idPai) ? String(noOrigem.idPai).trim() : "";
    var subunidadeAlvo = "SEDE";

    if (idPaiOrigem) {
      var noPai = todosLocaisOme.find(function(l) { return String(l.id) === String(idPaiOrigem); });
      if (noPai) {
        var cur = noPai;
        var vis = {};
        while (cur && !vis[cur.id]) {
          vis[cur.id] = true;
          if (!cur.idPai || String(cur.idPai).trim() === "") {
            subunidadeAlvo = String(cur.nome || "").trim();
            break;
          }
          cur = todosLocaisOme.find(function(l) { return String(l.id) === String(cur.idPai); });
        }
      }
    }

    if (!subunidadeAlvo || (typeof ehSubunidadeEquivalenteOme_ === 'function' && ehSubunidadeEquivalenteOme_(subunidadeAlvo, omePadrao))) {
      subunidadeAlvo = "SEDE";
    }

    if (!idPaiOrigem) {
      idPaiOrigem = (typeof garantirSedePadraoOme === 'function') ? garantirSedePadraoOme(omePadrao) : "";
    }

    // 2. REMANEJAR A VIATURA SUBSTITUTA PARA A MESMA POSIÇÃO DA ÁRVORE QUE A SUBSTITUÍDA
    if (migrarSubunidade && idPaiOrigem) {
      // 2.1 Garante que a viatura substituta esteja registrada na tb_Arvore com ID_Pai = idPaiOrigem
      try {
        var sqlCheckDest = "SELECT ID_Local FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                           "WHERE UPPER(TRIM(Unidade_OME)) IN (" + inSqlOme + ") " +
                           "  AND (ID_Local = '" + limparSQL(idDestino) + "' OR UPPER(TRIM(Nome_Local)) = '" + limparSQL(nomeDestino.toUpperCase()) + "') LIMIT 1";
        var resCheckDest = executarConsultaBigQuerySegura(sqlCheckDest);
        if (resCheckDest && resCheckDest.rows && resCheckDest.rows.length > 0) {
          var sqlUpPaiDest = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                             "SET ID_Pai = '" + limparSQL(idPaiOrigem) + "' " +
                             "WHERE UPPER(TRIM(Unidade_OME)) IN (" + inSqlOme + ") " +
                             "  AND (ID_Local = '" + limparSQL(idDestino) + "' OR UPPER(TRIM(Nome_Local)) = '" + limparSQL(nomeDestino.toUpperCase()) + "')";
          executarEscritaBigQuerySegura(sqlUpPaiDest);
        } else {
          var sqlInsDest = "INSERT INTO `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` (ID_Local, Unidade_OME, Nome_Local, ID_Pai) " +
                           "VALUES ('" + limparSQL(idDestino) + "', '" + limparSQL(omePadrao) + "', '" + limparSQL(nomeDestino) + "', '" + limparSQL(idPaiOrigem) + "')";
          executarEscritaBigQuerySegura(sqlInsDest);
        }
      } catch(ePaiDest) {
        console.warn("Aviso ao atualizar/inserir viatura substituta na tb_Arvore: " + ePaiDest.message);
      }

      // 2.2 Sincroniza na planilha auxiliar
      try {
        var ss = abrirPlanilhaSegura_(ID_PLANILHA_AUXILIAR);
        var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
        if (sheet && sheet.getLastRow() > 1) {
          var dadosSheet = sheet.getDataRange().getValues();
          var achouDestSheet = false;
          for (var i = 1; i < dadosSheet.length; i++) {
            var omeSh = String(dadosSheet[i][1] || "").trim().toUpperCase();
            var idSh = String(dadosSheet[i][0] || "").trim();
            var nomeSh = String(dadosSheet[i][2] || "").trim().toUpperCase();
            if (omeSh === omePadrao.toUpperCase() && (idSh === idDestino || nomeSh === nomeDestino.toUpperCase())) {
              sheet.getRange(i + 1, 4).setValue(idPaiOrigem);
              achouDestSheet = true;
              break;
            }
          }
          if (!achouDestSheet) {
            sheet.appendRow([idDestino, omePadrao, nomeDestino, idPaiOrigem]);
          }
        }
      } catch(eShDest) {
        console.warn("Aviso ao sincronizar viatura substituta na planilha: " + eShDest.message);
      }

      // 2.3 Atualiza a viatura substituta na tb_Inventario para SUBUNIDADE = subunidadeAlvo e STATUS = 'ECD'
      try {
        var sqlUpVtrDestInv = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                              "SET SUBUNIDADE = '" + limparSQL(subunidadeAlvo) + "', " +
                              "    SETOR = '" + limparSQL(nomeDestino) + "', " +
                              "    STATUS = 'ECD' " +
                              "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                              "  AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) NOT IN ('BAIXADO', 'EXCLUIDO')) " +
                              "  AND (REPLACE(UPPER(TRIM(COALESCE(N_SERIE, ''))), ' ', '') = '" + limparSQL(numDestLimpo) + "' " +
                              "       OR (UPPER(OBJETO) LIKE '%" + limparSQL(numDestLimpo) + "%' AND REGEXP_CONTAINS(UPPER(OBJETO), r'\\\\b(AR|ABT|ABTS|AT|ASE|BIS|MSA|MR|UR|VIATURA|AUTO)\\\\b')))";
        executarEscritaBigQuerySegura(sqlUpVtrDestInv);
      } catch(eDestInv) {
        console.warn("Aviso ao atualizar viatura substituta no inventário: " + eDestInv.message);
      }
    }

    var locaisMigradosCount = 0;
    var nomesLocaisMigrados = [];

    // 3. TRANSFERIR TODOS OS LOCAIS (Compartimentos / Gavetas / Baús / Portas) PARA A VIATURA SUBSTITUTA
    if (migrarLocais) {
      var whereFilhosArvore = "UPPER(TRIM(Unidade_OME)) IN (" + inSqlOme + ") AND (" +
                              "ID_Pai = '" + limparSQL(idOrigem) + "' " +
                              "OR UPPER(TRIM(ID_Pai)) = '" + limparSQL(nomeOrigem.toUpperCase()) + "' " +
                              "OR REPLACE(UPPER(TRIM(ID_Pai)), ' ', '') = '" + limparSQL(nomeOrigemSemEsp.toUpperCase()) + "' " +
                              (numOrigLimpo ? ("OR (ID_Pai LIKE '%" + numOrigLimpo + "%' AND REGEXP_CONTAINS(UPPER(ID_Pai), r'\\\\b(AR|ABT|ABTS|AT|ASE|BIS|MSA|MR|UR|VTR)\\\\b')) ") : "") +
                              ")";

      try {
        var sqlBuscaFilhos = "SELECT ID_Local, Nome_Local FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` WHERE " + whereFilhosArvore;
        var resFilhos = executarConsultaBigQuerySegura(sqlBuscaFilhos);
        if (resFilhos && resFilhos.rows && resFilhos.rows.length > 0) {
          locaisMigradosCount = resFilhos.rows.length;
          resFilhos.rows.forEach(function(r) {
            nomesLocaisMigrados.push(String(r.f[1].v || ""));
          });

          // Atualiza o ID_Pai para idDestino na base BigQuery
          var sqlUpdateArvore = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ARVORE + "` " +
                                "SET ID_Pai = '" + limparSQL(idDestino) + "' " +
                                "WHERE " + whereFilhosArvore;
          executarEscritaBigQuerySegura(sqlUpdateArvore);
        }
      } catch (eFilhos) {
        console.warn("Aviso ao migrar sublocais da viatura em tb_Arvore: " + eFilhos.message);
      }

      // Atualiza na planilha auxiliar para redundância
      try {
        var ss = abrirPlanilhaSegura_(ID_PLANILHA_AUXILIAR);
        var sheet = ss.getSheetByName(ABA_LOCAIS_ARMAZENAMENTO);
        if (sheet && sheet.getLastRow() > 1) {
          var dadosSheet = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
          for (var i = 0; i < dadosSheet.length; i++) {
            var omeSh = String(dadosSheet[i][1] || "").trim().toUpperCase();
            var idPaiSh = String(dadosSheet[i][3] || "").trim();
            var idPaiNorm = idPaiSh.replace(/\\s+/g, '').toUpperCase();
            if (omeSh === omePadrao.toUpperCase() && (
                idPaiSh === idOrigem || 
                idPaiSh.toUpperCase() === nomeOrigem.toUpperCase() || 
                idPaiNorm === nomeOrigemSemEsp.toUpperCase() ||
                (numOrigLimpo && idPaiSh.indexOf(numOrigLimpo) !== -1)
            )) {
              sheet.getRange(i + 2, 4).setValue(idDestino);
              var nmComp = String(dadosSheet[i][2] || "");
              if (nomesLocaisMigrados.indexOf(nmComp) === -1) {
                locaisMigradosCount++;
                nomesLocaisMigrados.push(nmComp);
              }
            }
          }
        }
      } catch (eSh) {
        console.warn("Aviso ao atualizar sublocais na planilha auxiliar: " + eSh.message);
      }
    }

    // 4. TRANSFERIR TODOS OS MATERIAIS ATRIBUÍDOS À VIATURA DE ORIGEM PARA A SUBSTITUTA (tb_Inventario)
    var whereMatsInventario = "UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                              "AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) NOT IN ('BAIXADO', 'EXCLUIDO')) " +
                              "AND (" +
                              "  UPPER(TRIM(SETOR)) = '" + limparSQL(nomeOrigem.toUpperCase()) + "' " +
                              "  OR REPLACE(UPPER(TRIM(SETOR)), ' ', '') = '" + limparSQL(nomeOrigemSemEsp.toUpperCase()) + "' " +
                              (numOrigLimpo ? (" OR (REPLACE(UPPER(TRIM(SETOR)), ' ', '') LIKE '%" + limparSQL(numOrigLimpo) + "%' AND REGEXP_CONTAINS(UPPER(SETOR), r'\\\\b(AR|ABT|ABTS|AT|ASE|BIS|MSA|MR|UR|VTR)\\\\b')) ") : "") +
                              ") " +
                              // Exclui o bem patrimonial da própria viatura que está saindo!
                              "AND NOT (" +
                              "  REGEXP_CONTAINS(UPPER(OBJETO), r'\\\\b(VIATURA|AUTO|CAMINHAO|CAMINHONETE|MOTO|AMBULANCIA|RESGATE|ABT|ABTS|AR|AT|ASE|BIS|UR|MSA|MR)\\\\b') " +
                              "  AND (" +
                              "    REPLACE(UPPER(COALESCE(N_SERIE, '')), ' ', '') = '" + limparSQL(numOrigLimpo) + "' " +
                              "    OR UPPER(OBJETO) LIKE '%" + limparSQL(numOrigLimpo) + "%'" +
                              "  )" +
                              ")";

    var sqlBuscaItens = "SELECT ITEM, OBJETO, COALESCE(LOCALIZACAO_ESPCIFICA_NA_OME_Se_Necessario, '') as local_esp, STATUS " +
                        "FROM `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                        "WHERE " + whereMatsInventario;

    var itensMigradosCount = 0;
    var eventosHistorico = [];
    var emailUser = "";
    try { emailUser = Session.getActiveUser().getEmail(); } catch(eU) {}
    var userLogado = emailUser ? (typeof verificarPermissaoUsuario === 'function' ? verificarPermissaoUsuario(emailUser) : null) : null;
    var respNome = (userLogado && userLogado.nome) || "Operador OME";
    var respCpf = cpf || (userLogado && userLogado.cpf) || "-";

    try {
      var resItens = executarConsultaBigQuerySegura(sqlBuscaItens);
      if (resItens && resItens.rows && resItens.rows.length > 0) {
        itensMigradosCount = resItens.rows.length;
        resItens.rows.forEach(function(r) {
          var codItem = String(r.f[0].v || "");
          var objNome = String(r.f[1].v || "");
          var locEsp = String(r.f[2].v || "");
          var stItem = String(r.f[3].v || "-");

          var origemTxt = nomeOrigem + (locEsp ? " > " + locEsp : "");
          var destinoTxt = subunidadeAlvo + " > " + nomeDestino + (locEsp ? " > " + locEsp : "");

          eventosHistorico.push({
            item: codItem,
            objeto: objNome,
            nPatrimonio: "",
            tipoEvento: "SUBSTITUICAO_VIATURA",
            origemUnidade: omePadrao,
            origemLocal: origemTxt,
            destinoUnidade: omePadrao,
            destinoLocal: destinoTxt,
            statusAnterior: stItem,
            statusNovo: stItem,
            responsavelNome: respNome,
            responsavelCpf: respCpf,
            documentoRef: motivo,
            observacao: "Migração completa de materiais por substituição de viatura (" + subunidadeAlvo + "): " + nomeOrigem + " -> " + nomeDestino + (locEsp ? " (Compartimento: " + locEsp + ")" : "")
          });
        });

        // Atualiza SETOR = nomeDestino e SUBUNIDADE = subunidadeAlvo, preservando rigorosamente a LOCALIZACAO_ESPECIFICA (ex: Porta 01, Porta 02)
        var sqlUpdateItens = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                             "SET SETOR = '" + limparSQL(nomeDestino) + "', " +
                             "    SUBUNIDADE = '" + limparSQL(subunidadeAlvo) + "' " +
                             "WHERE " + whereMatsInventario;
        executarEscritaBigQuerySegura(sqlUpdateItens);
      }
    } catch (eItens) {
      console.warn("Aviso ao migrar itens da viatura em tb_Inventario: " + eItens.message);
    }

    // 5. ATUALIZAR STATUS DA VIATURA SUBSTITUÍDA PARA 'MANUTENÇÃO' (SCD)
    if (marcarManutencao) {
      var dataHoraHoje = Utilities.formatDate(new Date(), "America/Recife", "dd/MM/yyyy HH:mm");
      var sqlUpVtrOrig = "UPDATE `" + PROJECT_ID + "." + DATASET_ID + "." + TABELA_ID + "` " +
                         "SET STATUS = 'SCD', " +
                         "    OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material = CONCAT(COALESCE(OBSERVACAO_Mais_detalhes_sobre_a_situacao_do_material, ''), ' | Substituída por " + limparSQL(nomeDestino) + " e enviada para manutenção em " + dataHoraHoje + " (" + limparSQL(motivo) + ")') " +
                         "WHERE UPPER(TRIM(UNIDADE)) IN (" + inSqlOme + ") " +
                         "  AND (STATUS IS NULL OR UPPER(TRIM(STATUS)) NOT IN ('BAIXADO', 'EXCLUIDO')) " +
                         "  AND (REPLACE(UPPER(TRIM(COALESCE(N_SERIE, ''))), ' ', '') = '" + limparSQL(numOrigLimpo) + "' " +
                         "       OR (UPPER(OBJETO) LIKE '%" + limparSQL(numOrigLimpo) + "%' AND REGEXP_CONTAINS(UPPER(OBJETO), r'\\\\b(AR|ABT|ABTS|AT|ASE|BIS|MSA|MR|UR|VIATURA|AUTO)\\\\b')))";
      try {
        executarEscritaBigQuerySegura(sqlUpVtrOrig);
      } catch(eUpOrig) {}
    }

    // 6. REGISTRAR HISTÓRICO E AUDITORIA
    if (eventosHistorico.length > 0) {
      try {
        registrarHistoricoMovimentacao(eventosHistorico);
      } catch (eHist) {
        console.warn("Aviso ao registrar histórico de migração: " + eHist.message);
      }
    }

    var detalheLocaisTxt = nomesLocaisMigrados.length > 0 ? " [" + nomesLocaisMigrados.join(", ") + "]" : "";
    var logTexto = "Substituição/Migração de Viatura: de '" + nomeOrigem + "' para '" + nomeDestino + "' na Subunidade '" + subunidadeAlvo + "' (OME " + omePadrao + "). " +
                   "Locais/Compartimentos migrados: " + locaisMigradosCount + detalheLocaisTxt + ". " +
                   "Materiais físicos transferidos: " + itensMigradosCount + " item(ns). Motivo: " + motivo;
    if (typeof registrarLogAuditoria === 'function') {
      registrarLogAuditoria("MIGRACAO_TOTAL_VIATURA", logTexto, userLogado);
    }

    // 7. INVALIDA O CACHE PARA ATUALIZAÇÃO IMEDIATA DA ÁRVORE
    if (typeof invalidarCacheArmazenamentoOme_ === 'function') {
      invalidarCacheArmazenamentoOme_(omePadrao);
    }

    return {
      sucesso: true,
      subunidadeAlvo: subunidadeAlvo,
      locaisMigrados: locaisMigradosCount,
      itensMigrados: itensMigradosCount,
      mensagem: "Migração concluída com sucesso! A viatura " + nomeDestino + " assumiu o posto na Subunidade " + subunidadeAlvo + " com " + locaisMigradosCount + " local(is) e " + itensMigradosCount + " material(is) transferidos de " + nomeOrigem + "."
    };

  } catch (err) {
    console.error("Erro em migrarEstruturaEMateriaisViatura: " + err.message);
    throw new Error(err.message);
  }
}

'''
    code = code[:s] + new_func + code[e:]
    print("Replaced migrarEstruturaEMateriaisViatura successfully.")

    # In getArvoreLocais, sort roots so SEDE is strictly at index 0
    tag_sync = "sincronizarViaturasInventarioNaArvore_(omePadrao, idSedeOficial, locais, dadosLocais);"
    idx_sync = code.find(tag_sync)
    if idx_sync != -1:
        idx_ret = code.find("return locais;", idx_sync)
        if idx_ret != -1:
            repl_sort = """// Garante que a SEDE seja sempre a primeira raiz no topo da árvore
    locais.sort(function(a, b) {
      var aPai = a.idPai ? String(a.idPai).trim() : '';
      var bPai = b.idPai ? String(b.idPai).trim() : '';
      if (!aPai && !bPai) {
        var aNome = String(a.nome || '').trim().toUpperCase();
        var bNome = String(b.nome || '').trim().toUpperCase();
        if (aNome === 'SEDE') return -1;
        if (bNome === 'SEDE') return 1;
        var aOrd = (a.ordem !== undefined && a.ordem !== null && a.ordem !== '') ? parseInt(a.ordem) : 999999;
        var bOrd = (b.ordem !== undefined && b.ordem !== null && b.ordem !== '') ? parseInt(b.ordem) : 999999;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return aNome.localeCompare(bNome);
      }
      return 0;
    });

    return locais;"""
            code = code[:idx_ret] + repl_sort + code[idx_ret + len("return locais;"):]
            print("Added root sorting to getArvoreLocais.")

    with open("Codigo.gs", "w", encoding="utf-8") as f:
        f.write(code)
    print("Codigo.gs written.")

run()
