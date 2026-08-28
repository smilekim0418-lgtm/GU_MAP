import codecs
import re

fpath = r'GUMAP-프론트\js\map\map-techno-indoor.js'
text = codecs.open(fpath, encoding='utf-8').read()

text = text.replace('color:#f8fafc;', 'color:var(--text-main);')
text = text.replace('color:#94a3b8;', 'color:var(--text-muted);')
text = text.replace('background:rgba(255,255,255,.05);', 'background:var(--bg-input);')
text = text.replace('border:1px solid rgba(255,255,255,.08);', 'border:1px solid var(--border-panel);')

# Also fix map-techno-b1.js if it exists
fpath2 = r'GUMAP-프론트\js\map\map-techno-b1.js'
try:
    text2 = codecs.open(fpath2, encoding='utf-8').read()
    text2 = text2.replace('color:#f8fafc;', 'color:var(--text-main);')
    text2 = text2.replace('color:#94a3b8;', 'color:var(--text-muted);')
    text2 = text2.replace('background:rgba(255,255,255,.05);', 'background:var(--bg-input);')
    text2 = text2.replace('border:1px solid rgba(255,255,255,.08);', 'border:1px solid var(--border-panel);')
    codecs.open(fpath2, 'w', encoding='utf-8').write(text2)
    print("Fixed map-techno-b1.js!")
except Exception as e:
    print("Skipped b1:", e)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
print("Fixed map-techno-indoor.js!")
