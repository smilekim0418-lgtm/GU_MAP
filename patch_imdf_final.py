import codecs

fpath = r'GUMAP-개발\floorplan\04_build_imdf.py'
text = codecs.open(fpath, encoding='utf-8').read()

target = '        points = [(float(x), float(y)) for x, y in record["points"]]'
repl = """        if len(record["points"]) > 0 and isinstance(record["points"][0][0], list):
            pts = record["points"][0]
            points = [(float(x), float(y)) for x, y in pts]
        else:
            points = [(float(x), float(y)) for x, y in record["points"]]"""
        
text = text.replace(target, repl)
codecs.open(fpath, 'w', encoding='utf-8').write(text)
print("Patched 04_build_imdf.py properly!")
