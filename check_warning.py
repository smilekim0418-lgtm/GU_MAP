import codecs
text = codecs.open(r'GUMAP-프론트\js\map\map-techno-route-core.js', encoding='utf-8').read()
lines = text.split('\n')
for i, line in enumerate(lines):
    if '가장 가까운 복도로' in line or '출발점이' in line:
        for j in range(max(0, i-5), min(len(lines), i+6)):
            try: print(f'{j}: {lines[j].strip()}')
            except: pass
        print('---')
        break
