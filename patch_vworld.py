import codecs

def patch_vworld(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        
        # We already replaced Carto with OSM. Let's replace OSM with VWorld white.
        text = text.replace("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{z}/{y}/{x}.png")
        
        # Replace darkLayer Carto with VWorld midnight
        text = text.replace("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", "https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/midnight/{z}/{y}/{x}.png")
        
        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Patched {fpath}")
    except Exception as e:
        print("Error", e)

patch_vworld(r"GUMAP-프론트\js\map\map-init.js")
patch_vworld(r"GUMAP-일반지도\map\map-init.js")
