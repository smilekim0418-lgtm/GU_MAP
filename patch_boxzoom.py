import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = "map.doubleClickZoom.disable();"
replacement = "map.doubleClickZoom.disable();\nmap.boxZoom.disable(); // 쉬프트+드래그(또는 클릭 시 미세 이동)로 인한 원치 않는 확대 방지"

if target in text:
    text = text.replace(target, replacement)
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Disabled boxZoom successfully!")
else:
    print("Target not found!")
