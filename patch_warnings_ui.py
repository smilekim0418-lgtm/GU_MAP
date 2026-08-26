import codecs
import re

def disable_warnings_ui(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        # Find the block:
        # (result.warnings.length
        # ? '<div style="color:#b91c1c;margin-top:6px;">⚠ ' +
        # result.warnings.map(escapeHtml).join('<br>⚠ ') + '</div>' : '') +
        
        # We can just replace result.warnings.length with false
        text = re.sub(r'result\.warnings\.length', 'false', text)
        codecs.open(fpath, 'w', encoding='utf-8').write(text)
        print(f"Patched {fpath}")
    except Exception as e:
        print("Error", e)

disable_warnings_ui(r"GUMAP-프론트\js\map\map-techno-route.js")
disable_warnings_ui(r"GUMAP-일반지도\map\map-techno-route.js")
