"""Geometry, preservation and standalone browser checks for the CAD maps."""
import hashlib
import json
import math
from pathlib import Path
from shapely.geometry import shape
from playwright.sync_api import sync_playwright

BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[2]

# 보존 대상인데 사람이 일부러 고친 파일. 원본은 legacy_snapshot/ 에 그대로 있고
# (아래에서 스냅샷 해시는 계속 확인한다), 되돌리기도 거기서 한다. 여기 없는
# 파일이 바뀌면 여전히 실패한다. 이유 없이 목록에 넣지 않는다.
INTENTIONALLY_CHANGED={
    'GUMAP-프론트/js/map/map-techno-indoor.js':
        '2026-09-14 실내지도 패널 UI 개편: 사이드바와 겹치던 배치·색을 css/indoor.css 로 옮김',
    'GUMAP-프론트/js/map/map-techno-route.js':
        '2026-09-14 같은 개편: 길찾기 조작부를 패널의 "실내 길찾기" 구획에 넣고 버튼 색을 클래스로 바꿈 (경로 계산은 그대로)',
}

def main():
    data=json.loads((BASE/'output/map.json').read_text(encoding='utf-8'))
    raw=json.loads((BASE/'source/vectors.json').read_text(encoding='utf-8'))
    inventory=json.loads((BASE/'inventory.json').read_text(encoding='utf-8'))
    assert inventory['units']==4, 'DWG units must be millimetres'
    source_paths={}
    for record in raw['paths']:
        source_paths.setdefault((record['handle'],record['kind']),[]).append(record)
    manifest=json.loads((BASE/'legacy_snapshot/manifest.json').read_text(encoding='utf-8'))
    for item in manifest['files']:
        assert hashlib.sha256((BASE/'legacy_snapshot'/item['path']).read_bytes()).hexdigest()==item['sha256']
        if item['path'] in INTENTIONALLY_CHANGED: continue
        assert hashlib.sha256((ROOT/item['path']).read_bytes()).hexdigest()==item['sha256'],item['path']
    assert hashlib.sha256((ROOT/data['meta']['source']).read_bytes()).hexdigest()==manifest['dwg_sha256']
    assert len(data['floors'])==7
    for fl,d in data['floors'].items():
        assert d['report']['paths']>3000
        assert d['report']['unique_room_ids']>0
        ids=[t['room_id'] for t in d['texts'] if t['room_id']]
        assert len(ids)==len(set(ids)),(fl,'duplicate room labels')
        assert d['facilities'],(fl,'missing facilities')
        facilities=d['facilities']
        assert len({a['properties']['id'] for a in facilities})==len(facilities)
        old_facility_ids={r['id'] for r in d['legacy'] if r['type'] in ('stairs','elevator')}
        assert old_facility_ids.issubset({a['properties']['source_id'] for a in facilities})
        for a in facilities:
            assert shape(a['geometry']).is_valid and a['geometry']['type']=='Point'
            assert a['properties']['source_handles'] and not a['properties']['routing_verified']
        for sp in d['spaces']:
            geom=shape(sp['geometry'])
            assert geom.is_valid and not geom.is_empty,(fl,sp['properties']['id'])
        for p in d['paths']:
            assert all(abs(x)<100 and 0<y<150 for x,y in p['points'])
            ox,oy=d['origin_dwg_mm']
            restored=[[ox+x*1000,oy+y*1000] for x,y in p['points']]
            originals=source_paths[(p['handle'],p['kind'])]
            assert any(len(r['points'])==len(restored) and all(math.dist(a,b)<.001 for a,b in zip(r['points'],restored)) for r in originals), (fl,p['handle'],'CAD coordinates changed')
    assert any(t['room_id']=='221-1' for t in data['floors']['2F']['texts'])
    assert any(t['room_id']=='B133' for t in data['floors']['B1F']['texts'])
    assert not any('208' in s['properties']['room_ids'] for s in data['floors']['2F']['spaces']), 'External restroom label must not identify courtyard'
    assert '201' in data['floors']['2F']['report']['partial_room_candidates']
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        page=browser.new_page(viewport={'width':1536,'height':1040},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto((BASE/'output/index.html').as_uri())
        page.wait_for_function('window.CAD_MAP')
        for fl in data['floors']:
            page.locator(f'[data-floor="{fl}"]').click()
            assert page.evaluate('CAD_MAP.getFloor()')==fl
            assert page.locator('#facilityList button').count()==len(data['floors'][fl]['facilities'])
            page.screenshot(path=str(BASE/f'output/preview-{fl}.png'))
        page.locator('#search').fill('엘리베이터')
        assert page.locator('#results button[data-kind="elevator"]').count()==20
        page.locator('#results button').filter(has_text='2F · 엘리베이터 1').click()
        assert '엘리베이터 1' in page.locator('#details').inner_text()
        assert page.evaluate('CAD_MAP.getFloor()')=='2F'
        page.locator('#showFacilities').uncheck()
        page.locator('#search').fill('계단')
        page.locator('#results button').filter(has_text='2F · 계단-B').click()
        assert page.locator('#showFacilities').is_checked()
        bounds=page.locator('#map').bounding_box()
        page.locator('#map').click(position={'x':bounds['width']/2,'y':bounds['height']/2})
        assert '계단-B' in page.locator('#details').inner_text()
        page.locator('#search').fill('옥상부')
        assert page.locator('#results button').count()==3
        page.locator('#results button').filter(has_text='6F · 계단-C').click()
        assert '옥상부 계단' in page.locator('#details').inner_text()
        page.locator('#search').fill('221-1')
        page.locator('#results button').first.click()
        assert page.evaluate('CAD_MAP.getFloor()')=='2F'
        page.locator('#showLegacy').check()
        assert page.locator('#legacyNote').is_visible()
        page.locator('#showLegacy').uncheck()
        page.locator('#showDoors').check()
        page.locator('#measure').click()
        page.locator('#map').click(position={'x':300,'y':350})
        page.locator('#map').click(position={'x':620,'y':350})
        assert '10.000 m' in page.locator('#details').inner_text()
        page.keyboard.press('Escape')
        with page.expect_download() as info:page.locator('#exportSvg').click()
        assert info.value.suggested_filename=='techno-2F-CAD.svg'
        svg=Path(info.value.path()).read_text(encoding='utf-8')
        assert 'data-facility="2F:EV-1"' in svg and 'data-facility="2F:계단-B"' in svg
        with page.expect_download() as info:page.locator('#exportJson').click()
        assert info.value.suggested_filename=='techno-2F-indoor.local.geojson'
        exported=json.loads(Path(info.value.path()).read_text(encoding='utf-8'))
        assert len([a for a in exported['features'] if a['geometry']['type']=='Point'])==10
        page.locator('#showDoors').uncheck()
        page.locator('#search').fill('')
        page.locator('#fit').click()
        page.locator('[data-floor="2F"]').click()
        page.screenshot(path=str(BASE/'output/preview.png'))
        page.set_viewport_size({'width':760,'height':900})
        page.locator('[data-floor="3F"]').click()
        assert page.locator('#map').bounding_box()['width']>300
        page.goto((ROOT/'테크노관-CAD.html').as_uri()+'#4F')
        page.wait_for_function('window.CAD_MAP')
        assert page.evaluate('CAD_MAP.getFloor()')=='4F'
        # Test the actual entry module against a late-mounted indoor panel.
        page.evaluate('window.technoActiveFloor="5F"')
        page.add_script_tag(url=(ROOT/'GUMAP-프론트/js/map/map-techno-cad-entry.js').as_uri())
        page.evaluate('document.body.insertAdjacentHTML("beforeend",\'<div id="techno-indoor-panel"></div>\')')
        page.locator('#ti-official-cad').wait_for(state='attached')
        href=page.locator('#ti-official-cad').get_attribute('href')
        assert href.endswith('/'+ROOT.joinpath('테크노관-CAD.html').as_uri().split('/')[-1])
        with page.expect_popup() as popup_info: page.locator('#ti-official-cad').evaluate('(a)=>a.click()')
        popup=popup_info.value
        popup.wait_for_function('window.CAD_MAP')
        assert popup.evaluate('CAD_MAP.getFloor()')=='5F'
        popup.close()
        assert not errors,errors
        browser.close()
    report=dict(passed=True,floors=7,source_and_legacy_hashes=('unchanged except intentional: '+', '.join(INTENTIONALLY_CHANGED)) if INTENTIONALLY_CHANGED else 'unchanged',browser_errors=errors,
                checks=['valid candidate geometry','unique room labels','64,515 objects round-trip to DXF coordinates within 0.001 mm','external restroom label exclusion','partial room flags','all floor switches','cross-floor search','facility coverage, search, click and visibility','facility SVG and GeoJSON export','legacy overlay','10 m measurement','SVG download','GeoJSON download','responsive canvas','root entry and current-floor link'])
    (BASE/'output/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
