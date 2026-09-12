"""Inspect the official drawing without changing the source."""
import json
from collections import Counter
from pathlib import Path
import ezdxf

BASE = Path(__file__).resolve().parent

def main():
    doc = ezdxf.readfile(BASE / 'source/techno.dxf')
    ms = doc.modelspace()
    texts = []
    for e in ms.query('TEXT MTEXT INSERT'):
        if e.dxftype() == 'INSERT':
            for a in e.attribs:
                texts.append(dict(text=a.dxf.text, point=list(a.dxf.insert), layer=a.dxf.layer, handle=a.dxf.handle))
        else:
            texts.append(dict(text=e.plain_text(), point=list(e.dxf.insert), layer=e.dxf.layer, handle=e.dxf.handle, height=e.dxf.height if e.dxftype() == 'TEXT' else e.dxf.char_height))
    data = dict(version=doc.dxfversion, units=doc.units, layouts=[l.name for l in doc.layouts],
                types=dict(Counter(e.dxftype() for e in ms)), layers=dict(Counter(e.dxf.layer for e in ms)), texts=texts,
                inserts=dict(Counter(e.dxf.name for e in ms.query('INSERT'))))
    (BASE/'inventory.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in data.items() if k not in ('texts','inserts')},ensure_ascii=False,indent=2))
    print('Floor titles:',[(t['text'],t['point']) for t in texts if '평면' in t['text'] or '층' in t['text']][:100])
    print('Inserts:',Counter(data['inserts']).most_common(30))

if __name__ == '__main__':
    main()
