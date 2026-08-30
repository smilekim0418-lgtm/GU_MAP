import codecs
import re

def patch_carto(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        
        # Replace Carto light/voyager with OSM or VWorld
        # Let's use standard OSM for baseLayer if VWorld is too specific, 
        # but wait, the user's config already pulls VWorld!
        # Let's replace Carto with standard OSM to be safe without API keys, 
        # OR we can just use VWorld! Let's use standard OSM for osmLayer.
        
        text = text.replace("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
        text = text.replace("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
        # For dark mode, CARTO's dark matter is gone. We can use CartoDB dark_all? Actually cartocdn requires api key for everything now.
        # Let's use Stadia Alidade Smooth Dark (requires no API key for localhost, but might fail on loca.lt).
        # Best safe bet for now is standard OSM, and tell the user they can configure VWorld.
        
        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Patched {fpath}")
    except Exception as e:
        print("Error", e)

patch_carto(r"GUMAP-프론트\js\map\map-init.js")
patch_carto(r"GUMAP-일반지도\map\map-init.js")
