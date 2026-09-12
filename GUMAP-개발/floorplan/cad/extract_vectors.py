"""Flatten CAD blocks with their transforms; keep original handles and layers."""
import json
import hashlib
from collections import Counter
from pathlib import Path
import ezdxf
from ezdxf import path as dxfpath

BASE = Path(__file__).resolve().parent

def main():
    doc = ezdxf.readfile(BASE/'source/techno.dxf')
    paths, texts, skipped = [], [], Counter()
    def visit(e, parent=None, inherited='0'):
        kind = e.dxftype()
        layer = e.dxf.layer if e.dxf.layer != '0' else inherited
        handle = parent or e.dxf.handle
        if kind == 'INSERT':
            for child in e.virtual_entities():
                visit(child,handle,layer)
            for child in e.attribs:
                visit(child,handle,layer)
            return
        if kind in ('TEXT','MTEXT','ATTRIB'):
            p = e.dxf.insert
            if kind != 'MTEXT' and e.dxf.hasattr('align_point') and (e.dxf.halign or e.dxf.valign):
                p = e.dxf.align_point
            texts.append(dict(text=e.plain_text(),p=list(p)[:2],height=e.dxf.char_height if kind=='MTEXT' else e.dxf.height,rotation=e.dxf.get('rotation',0),layer=layer,handle=handle))
            return
        if kind not in ('LINE','ARC','CIRCLE','LWPOLYLINE','POLYLINE','SPLINE','ELLIPSE','SOLID','TRACE'):
            skipped[kind] += 1
            return
        try:
            if kind == 'LINE':
                pts = [list(e.dxf.start)[:2],list(e.dxf.end)[:2]]
            else:
                pts = [list(p)[:2] for p in dxfpath.make_path(e).flattening(distance=2,segments=8)]
            if len(pts)<2:
                return
            record=dict(kind=kind,layer=layer,handle=handle,points=pts,color=e.dxf.color)
            if kind=='ARC':
                record['arc']=dict(center=list(e.dxf.center)[:2],radius=e.dxf.radius,start=e.dxf.start_angle,end=e.dxf.end_angle)
            paths.append(record)
        except (TypeError,ValueError,NotImplementedError) as exc:
            skipped[kind+':'+type(exc).__name__] += 1
    for e in doc.modelspace():
        visit(e)
    data=dict(paths=paths,texts=texts,skipped=dict(skipped),units='mm',curve_tolerance_mm=2,
              source_sha256=hashlib.sha256((BASE.parents[2]/'GIS_DATA/001.테크노관.dwg').read_bytes()).hexdigest(),
              dxf_sha256=hashlib.sha256((BASE/'source/techno.dxf').read_bytes()).hexdigest())
    (BASE/'source/vectors.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Paths',len(paths),'texts',len(texts),'skipped',dict(skipped))

if __name__ == '__main__':
    main()
