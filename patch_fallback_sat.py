import codecs

def patch_fallback_sat(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        
        esri_url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        
        text = text.replace("var satelliteLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Satellite/{z}/{y}/{x}.jpeg'",
                            f"var satelliteLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Satellite/{{z}}/{{y}}/{{x}}.jpeg' : '{esri_url}'")
                            
        text = text.replace("var hybridLayer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Hybrid/{z}/{y}/{x}.png'",
                            f"var hybridLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Hybrid/{{z}}/{{y}}/{{x}}.png' : '{esri_url}'")

        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Patched {fpath}")
    except Exception as e:
        print("Error", e)

patch_fallback_sat(r"GUMAP-프론트\js\map\map-init.js")
patch_fallback_sat(r"GUMAP-일반지도\map\map-init.js")
