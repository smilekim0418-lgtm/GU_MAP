import codecs

def patch_file(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        text = text.replace('color:#f8fafc;', 'color:var(--text-main);')
        text = text.replace('color:#94a3b8;', 'color:var(--text-muted);')
        text = text.replace('background:rgba(255,255,255,.05);', 'background:var(--bg-input);')
        text = text.replace('border:1px solid rgba(255,255,255,.08);', 'border:1px solid var(--border-panel);')
        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Fixed {fpath}!")
    except Exception as e:
        print(f"Skipped {fpath}:", e)

patch_file(r'GUMAP-일반지도\map\map-techno-indoor.js')
patch_file(r'GUMAP-일반지도\map\map-techno-b1.js')
