import codecs

def patch_file(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        text = text.replace('color:#e2e8f0', 'color:var(--text-main)')
        text = text.replace('color:#64748b', 'color:var(--text-muted)')
        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Fixed {fpath}!")
    except Exception as e:
        print(f"Skipped {fpath}:", e)

patch_file(r'GUMAP-프론트\js\map\map-techno-indoor.js')
patch_file(r'GUMAP-프론트\js\map\map-techno-b1.js')
patch_file(r'GUMAP-일반지도\map\map-techno-indoor.js')
patch_file(r'GUMAP-일반지도\map\map-techno-b1.js')
