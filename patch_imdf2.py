import codecs

fpath = r'GUMAP-개발\floorplan\04_build_imdf.py'
text = codecs.open(fpath, encoding='utf-8').read()

import re
text = re.sub(r'if len\(record\["points"\]\) > 0 and isinstance\(record\["points"\]\[0\]\[0\], list\):.*?(?=\n\s+return)', r'if len(record["points"]) > 0 and isinstance(record["points"][0][0], list):\n        pts = record["points"][0]\n        points = [(float(x), float(y)) for x, y in pts]\n    else:\n        points = [(float(x), float(y)) for x, y in record["points"]]', text, flags=re.DOTALL)

codecs.open(fpath, 'w', encoding='utf-8').write(text)
