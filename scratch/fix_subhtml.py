# -*- coding: utf-8 -*-
with open('App.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'subHtml +=' in line and 'node-item' in lines[i+1] and 'd-flex align-items-center justify-content-between w-100' in lines[i+2]:
        lines[i+2] = '              <div class="d-flex align-items-center justify-content-between w-100 node-header-content">\n'
        lines[i+3] = '                <div class="node-title-box">\n'
        # lines[i+4] is temMateriais
        # lines[i+5] is iconeFilho...
        # lines[i+6] is badgeVtr
        lines[i+7] = '                  <span class="badge bg-secondary ms-1">${totalItens} ite(ns)</span>\n'
        lines[i+8] = '                </div>\n'
        print("Replaced successfully at line", i+1)
        break

with open('App.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)
