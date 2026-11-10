# -*- coding: utf-8 -*-
with open('App.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'subHtml +=' in line and 'node-item' in lines[i+1]:
        print(f"Found at line {i+1}")
        for j in range(i, i+15):
            print(f"{j+1}: {repr(lines[j])}")
        break
