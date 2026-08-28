import codecs
text = codecs.open(r'GUMAP-프론트\js\map\map-techno-indoor.js', encoding='utf-8').read()
lines = text.split('\n')
for i, line in enumerate(lines):
    if '구분' in line or '소속' in line:
        for j in range(max(0, i-5), min(len(lines), i+6)):
            try:
                print(f'{j}: {lines[j].strip()}')
            except:
                pass
        print('---')
