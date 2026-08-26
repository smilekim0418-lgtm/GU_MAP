import codecs
import re

def remove_warning(fpath):
    try:
        text = codecs.open(fpath, encoding='utf-8').read()
        target = """warnings.push(spot.where === 'room'
        ? floor + ' ' + spot.room_id + ' 의 문으로 못 나가 최근접 복도점으로 붙였다'
        : '출발점이 복도·방 어느 쪽도 아니라 가장 가까운 복도로 붙였다');"""
        
        # We can also just regex replace warnings.push
        if target in text:
            text = text.replace(target, "/* warnings.push disabled */")
            codecs.open(fpath, 'w', encoding='utf-8').write(text)
            print(f"Patched {fpath}")
        else:
            print(f"Not found in {fpath} exactly as expected. Trying regex...")
            # More robust regex
            text = re.sub(r"warnings\.push\(\s*spot\.where\s*===\s*'room'[^;]+;\s*", "/* warnings disabled */\n      ", text)
            codecs.open(fpath, 'w', encoding='utf-8').write(text)
            print(f"Regex patched {fpath}")
    except Exception as e:
        print("Error", e)

remove_warning(r"GUMAP-프론트\js\map\map-techno-route-core.js")
remove_warning(r"GUMAP-일반지도\map\map-techno-route-core.js")
