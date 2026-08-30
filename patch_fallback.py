import codecs

def patch_fallback(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        
        # In map-init.js:
        # var vworldKey = window.VWORLD_KEY || (window.AppConfig && window.AppConfig.VWORLD_KEY) || '';
        # If vworldKey is empty, use OSM instead for baseLayer and lightGrayLayer
        
        osm_url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        
        text = text.replace("var baseLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{z}/{y}/{x}.png'",
                            f"var baseLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{{z}}/{{y}}/{{x}}.png' : '{osm_url}'")
                            
        text = text.replace("var osmLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{z}/{y}/{x}.png'",
                            f"var osmLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{{z}}/{{y}}/{{x}}.png' : '{osm_url}'")
                            
        text = text.replace("var lightGrayLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{z}/{y}/{x}.png'",
                            f"var lightGrayLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/white/{{z}}/{{y}}/{{x}}.png' : '{osm_url}'")
                            
        text = text.replace("var darkLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/midnight/{z}/{y}/{x}.png'",
                            f"var darkLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/midnight/{{z}}/{{y}}/{{x}}.png' : '{osm_url}'")

        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Patched {fpath}")
    except Exception as e:
        print("Error", e)

patch_fallback(r"GUMAP-프론트\js\map\map-init.js")
patch_fallback(r"GUMAP-일반지도\map\map-init.js")
