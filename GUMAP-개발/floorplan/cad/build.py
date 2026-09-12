"""Build all seven official CAD floor maps in local metres, preserving legacy data.

CAD linework is authoritative to this DWG. Derived spaces are candidates, not
surveyed room boundaries; no inferred doors are used to replace routing data.
"""
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path

import numpy as np
from shapely import set_precision
from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.ops import polygonize, unary_union

BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[2]
FLOORS=['B1F']+[f'{i}F' for i in range(1,7)]
OUT=BASE/'output'

def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,d): p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def feature(geom,props): return dict(type='Feature',geometry=mapping(geom),properties=props)
def fc(features): return dict(type='FeatureCollection',features=features)

def room_id(text,floor):
    text=text.strip()
    # Basement room labels may have a B prefix, depending on the drawing.
    if floor=='B1F':
        return text.upper() if re.fullmatch(r'B1\d{2}(?:-\d+)?',text,re.I) else None
    return text if re.fullmatch(floor[0]+r'\d{2}(?:-\d+)?',text) else None

def legacy(floor):
    g=read(BASE.parent/'techno_georef.json')
    old=read(BASE.parent/f'work/{floor}_labeled.json')
    origin=g['floor_origin_px'][floor]; scale=g['floor_px_per_mm'][floor]*1000
    records=[]
    for r in old['polygons']:
        pts=r['points']; rings=pts if isinstance(pts[0][0],list) else [pts]
        rings=[[[ (x-origin[0])/scale,-(y-origin[1])/scale] for x,y in ring] for ring in rings]
        records.append(dict(id=r.get('room_id'),type=r.get('type','room'),rings=rings))
    return records

def build_floor(v,floor,facility_annotations):
    title=next(t for t in v['texts'] if t['text']==('지하1층 평면도' if floor=='B1F' else floor[0]+'층 평면도'))
    ox,oy=title['p']
    def local(p):return [round((p[0]-ox)/1000,6),round((p[1]-oy)/1000,6)]
    def inside(p):return -55<(p[0]-ox)/1000<59 and 12<(p[1]-oy)/1000<124
    paths=[]; texts=[]; doors=[]
    for p in v['paths']:
        if not all(inside(q) for q in p['points']): continue
        if p['layer'] in ('DIM','CEN','1CEN','1W'): continue
        q={k:p[k] for k in ('kind','layer','handle')};q['points']=[local(a) for a in p['points']]
        paths.append(q)
        if p['kind']=='ARC':
            a=p['arc'];sweep=(a['end']-a['start'])%360
            if 550<=a['radius']<=1600 and 70<=sweep<=110:
                c=local(a['center']); r=a['radius']/1000
                ends=[[c[0]+r*math.cos(math.radians(ang)),c[1]+r*math.sin(math.radians(ang))] for ang in (a['start'],a['end'])]
                doors.append(dict(id=f'{floor}-arc-{p["handle"]}-{len(doors)}',center=c,radius_m=r,ends=ends,handle=p['handle'],status='arc_candidate'))
    for t in v['texts']:
        if inside(t['p']):
            q=dict(t);q['p']=local(t['p']);q['height']=t['height']/1000
            q['room_id']=room_id(t['text'],floor);texts.append(q)
    # Node at 1 mm; a 20 mm half-width joins drafting gaps of at most 40 mm.
    # This affects derived space candidates ONLY, never the source linework.
    lines=[]
    for p in paths:
        if p['kind'] in ('LINE','LWPOLYLINE','POLYLINE') and p['layer']!='_CHAIR':
            line=LineString(p['points'])
            if line.length>0.001:lines.append(set_precision(line,.001))
    for door in doors:
        for end in door['ends']:
            lines.append(set_precision(LineString([door['center'],end]),.001))
    wall_network=unary_union(lines).buffer(.02,cap_style=3,join_style=2)
    candidates=sorted([Polygon(r).buffer(.02,join_style=2) for p in getattr(wall_network,'geoms',[wall_network]) for r in p.interiors if 2<=Polygon(r).area<=1600],key=lambda p:p.area)
    labels=[t for t in texts if t['room_id']]
    # Toilet/shower numbers are often drawn outside the room. Never assign the
    # courtyard underneath an external label to that restroom (e.g. 2F 208).
    facility_labels={}
    for t in texts:
        if any(w in t['text'] for w in ('화장','샤워')) and labels:
            nearest=min(labels,key=lambda a:math.dist(t['p'],a['p']))
            if math.dist(t['p'],nearest['p'])<4:
                facility_labels[nearest['room_id']]=t['text']
    for t in labels:
        if t['room_id'] in facility_labels:t['facility']=facility_labels[t['room_id']]
    spaces=[]
    for i,poly in enumerate(candidates):
        hits=[t['room_id'] for t in labels if t['room_id'] not in facility_labels and poly.covers(Point(t['p']))]
        props=dict(id=f'{floor}-space-{i+1}',floor=floor,room_ids=hits,area_m2=round(poly.area,3),
                   status='single_label_candidate' if len(hits)==1 else 'multiple_labels_review' if hits else 'unlabelled_candidate',
                   method='CAD lines + door arc radial closures; 1 mm precision; drafting gaps <=40 mm joined for candidate topology')
        spaces.append(feature(poly,props))
    # Match existing room centroids only to compare drawings. This fit is not a
    # geographic registration and must never change the exact CAD metre scale.
    old=legacy(floor);pairs=[]
    for r in old:
        match=[t for t in labels if t['room_id']==r['id']]
        if len(match)==1 and r['type']=='room':
            c=Polygon(r['rings'][0]).centroid
            pairs.append(([c.x,c.y],match[0]['p']))
    alignment=None
    if len(pairs)>=3:
        src=np.array([p[0] for p in pairs]);dst=np.array([p[1] for p in pairs]);delta=np.median(dst-src,axis=0)
        # Translation only: comparing true metre dimensions must not stretch CAD.
        residual=np.linalg.norm(src+delta-dst,axis=1)
        alignment=dict(translation_m=delta.tolist(),matched_labels=len(pairs),median_label_residual_m=round(float(np.median(residual)),3),purpose='approximate visual comparison only; label positions differ from room centroids')
        for r in old:r['rings']=[[[x+delta[0],y+delta[1]] for x,y in ring] for ring in r['rings']]
        old_areas={r['id']:Polygon(r['rings'][0]).area for r in old if r['type']=='room'}
        for sp in spaces:
            props=sp['properties']
            if len(props['room_ids'])==1:
                previous=old_areas.get(props['room_ids'][0])
                if previous and props['area_m2']/previous<.65:
                    props['status']='partial_room_candidate'
                    props['review_reason']='CAD internal lines may split this room; area below 65% of legacy room'
    unique=sorted(set(t['room_id'] for t in labels))
    old_ids=sorted(set(r['id'] for r in old if r['type']=='room' and r['id']))
    located={h for s in spaces for h in s['properties']['room_ids'] if s['properties']['status']=='single_label_candidate'}
    report=dict(paths=len(paths),texts=len(texts),room_labels=len(labels),unique_room_ids=len(unique),
                door_arc_candidates=len(doors),space_candidates=len(spaces),single_label_spaces=sum(s['properties']['status']=='single_label_candidate' for s in spaces),
                labels_without_single_space=sorted(set(unique)-located),external_facility_labels=facility_labels,
                partial_room_candidates=[s['properties']['room_ids'][0] for s in spaces if s['properties']['status']=='partial_room_candidate'],
                cad_only_ids=sorted(set(unique)-set(old_ids)),legacy_only_ids=sorted(set(old_ids)-set(unique)),
                alignment=alignment,layers=dict(Counter(p['layer'] for p in paths)))
    facilities=[]
    for annotation in facility_annotations:
        position=Point(annotation['point'])
        evidence=sorted(((LineString(p['points']).distance(position),p['handle']) for p in paths),key=lambda r:r[0])
        if not evidence or evidence[0][0]>1.5:
            raise ValueError(f'{floor} {annotation["id"]}: facility has no nearby CAD geometry')
        props=dict(annotation)
        props.pop('point')
        props.update(floor=floor,source_id=annotation['id'],id=f'{floor}:{annotation["id"]}',
                     name=annotation['id'].replace('EV-','엘리베이터 '),
                     status='cad_visual_location',routing_verified=False,
                     source_handles=list(dict.fromkeys(handle for distance,handle in evidence[:12] if distance<=1.5)))
        facilities.append(feature(position,props))
    report['facilities']=dict(Counter(a['properties']['kind'] for a in facilities))
    report['additional_cad_facilities']=[a['properties']['name'] for a in facilities if a['properties']['source']=='cad_visual_annotation']
    wall_features=[feature(LineString(p['points']),dict(floor=floor,source_handle=p['handle'],source_layer=p['layer'],cad_type=p['kind'],status='source_geometry')) for p in paths]
    write(OUT/f'{floor}.linework.local.geojson',fc(wall_features))
    write(OUT/f'{floor}.spaces.local.geojson',fc(spaces))
    write(OUT/f'{floor}.labels.local.geojson',fc([feature(Point(t['p']),dict(floor=floor,**{k:t[k] for k in ('text','room_id','handle','layer')})) for t in texts]))
    write(OUT/f'{floor}.doors.json',doors)
    write(OUT/f'{floor}.facilities.local.geojson',fc(facilities))
    return dict(floor=floor,origin_dwg_mm=[ox,oy],paths=paths,texts=texts,spaces=spaces,doors=doors,facilities=facilities,legacy=old,report=report)

def main():
    OUT.mkdir(exist_ok=True)
    v=read(BASE/'source/vectors.json')
    dwg=ROOT/'GIS_DATA/001.테크노관.dwg'
    if v.get('source_sha256')!=hashlib.sha256(dwg.read_bytes()).hexdigest():
        raise RuntimeError('DWG changed or vector provenance missing. Run convert.py and extract_vectors.py first.')
    facilities=read(BASE/'facilities.json')
    if facilities['source_sha256']!=v['source_sha256']:
        raise RuntimeError('Facility annotations were reviewed against a different DWG.')
    result={}
    for floor in FLOORS:
        result[floor]=build_floor(v,floor,facilities['floors'][floor])
        print(floor,json.dumps(result[floor]['report'],ensure_ascii=False),flush=True)
    data=dict(meta=dict(source='GIS_DATA/001.테크노관.dwg',sha256=hashlib.sha256(dwg.read_bytes()).hexdigest(),units='m',coordinate_system='local CAD XY, Y up; NOT WGS84',curve_tolerance_mm=2,
                        converter='LibreDWG 0.14',conversion_warnings='See source/conversion.log: two proxy entities, SORTENTSTABLE and DICTIONARY errors; original DWG retained.',
                        skipped=v['skipped'],legacy_preserved=True),floors=result)
    write(OUT/'map.json',data)
    write(OUT/'quality_report.json',dict(meta=data['meta'],floors={k:v['report'] for k,v in result.items()}))
    template=(BASE/'viewer.html').read_text(encoding='utf-8')
    payload=json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
    (OUT/'index.html').write_text(template.replace('/*__CAD_DATA__*/', 'const DATA='+payload+';'),encoding='utf-8')

if __name__=='__main__':main()
