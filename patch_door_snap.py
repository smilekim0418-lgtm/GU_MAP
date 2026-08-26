import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = "if (state.drawing && state.drawing.type === 'corridor') return {x, y, snappedX: false, snappedY: false};"
repl = "if (state.drawing && (state.drawing.type === 'corridor' || state.drawing.type === 'door')) return {x, y, snappedX: false, snappedY: false};"

if target in text:
    text = text.replace(target, repl)
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Patched snapPoint for door!")
else:
    print("Target not found!")
