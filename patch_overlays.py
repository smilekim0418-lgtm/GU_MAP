import codecs

def patch_overlays(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        
        # In map-init.js:
        # var activeOverlays = [hybridLayer]; -> var activeOverlays = [];
        
        text = text.replace("var activeOverlays = [hybridLayer];", "var activeOverlays = [];")
        
        # Also let's fix hybridLayer initialization so it doesn't fallback to Esri!
        esri_url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        text = text.replace(f"var hybridLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Hybrid/{{z}}/{{y}}/{{x}}.png' : '{esri_url}'",
                            "var hybridLayer = L.tileLayer(vworldKey ? 'https://api.vworld.kr/req/wmts/1.0.0/' + vworldKey + '/Hybrid/{z}/{y}/{x}.png' : ''")
                            
        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Patched {fpath}")
    except Exception as e:
        print("Error", e)

patch_overlays(r"GUMAP-프론트\js\map\map-init.js")
patch_overlays(r"GUMAP-일반지도\map\map-init.js")
