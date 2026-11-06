window.getGuMap2DStyle = function (getVectorUrl) {
    if (typeof getVectorUrl !== 'function') {
        getVectorUrl = function (name) {
            var isSubDir = typeof window !== 'undefined' && window.location.pathname.indexOf('/GUMAP-일반지도/') !== -1;
            return (isSubDir ? '../' : '') + 'GUMAP-데이터/vector_layers/' + encodeURIComponent(name) + '?v=20261106_v4';
        };
    }
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            'gumi-water': { type: 'geojson', data: getVectorUrl('gumi_integrated_water.geojson'), maxzoom: 14, buffer: 16, tolerance: 0.4 },
            'gumi-roads': { type: 'geojson', data: getVectorUrl('gumi_roads_hierarchy.geojson'), maxzoom: 14, buffer: 16, tolerance: 0.35 },
            'gumi-buildings': { type: 'geojson', data: getVectorUrl('gumi_buildings_fast.geojson'), maxzoom: 15, buffer: 16, tolerance: 0.25, generateId: true },
            'gumi-contours': { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, maxzoom: 12, buffer: 8, tolerance: 1.0 },
            'gumi-parks': { type: 'geojson', data: getVectorUrl('gumi_park_polygons.geojson'), maxzoom: 14, buffer: 16, tolerance: 0.4 },
            'gumi-railways': { type: 'geojson', data: getVectorUrl('gumi_railways.geojson'), maxzoom: 15, buffer: 16, tolerance: 0.25 },
            'gumi-road-surfaces': { type: 'geojson', data: getVectorUrl('gumi_roads_surface_hierarchy.geojson'), maxzoom: 14, buffer: 16, tolerance: 0.35 },
            'gumi-facility-zones': { type: 'geojson', data: getVectorUrl('gumi_facility_zones.geojson'), maxzoom: 14, buffer: 16, tolerance: 0.4 },
            'gumi-bus-stops': { type: 'geojson', data: getVectorUrl('gumi_bus_stops.geojson'), maxzoom: 14, buffer: 16 },
            'gumi-poi': { type: 'geojson', data: getVectorUrl('gumi_poi_landmarks.geojson'), maxzoom: 14, buffer: 16 },
            'selected-building': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
            'daegyeong-stations': {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.33120, 36.12817] }, properties: { name: '구미역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.35644, 36.09857] }, properties: { name: '사곡역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.34533, 36.05579] }, properties: { name: '북삼역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.40046, 35.99200] }, properties: { name: '왜관역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.48528, 35.95545] }, properties: { name: '신동역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.50018, 35.89740] }, properties: { name: '지천역', line: '대경선', status: '장래' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.54192, 35.88146] }, properties: { name: '서대구역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.56971, 35.88416] }, properties: { name: '원대역', line: '대경선', status: '신설예정' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.59528, 35.87618] }, properties: { name: '대구역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.62796, 35.87869] }, properties: { name: '동대구역', line: '대경선', status: '운행중' } },
                        { type: 'Feature', geometry: { type: 'Point', coordinates: [128.72756, 35.81931] }, properties: { name: '경산역', line: '대경선', status: '운행중' } }
                    ]
                }
            }
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#f1f5f9' }
            },
            {
                id: 'parks-fill',
                type: 'fill',
                source: 'gumi-parks',
                filter: ['==', ['get', 'type'], '공원'],
                paint: { 'fill-color': '#d9eed6', 'fill-opacity': 0.55 }
            },
            {
                id: 'parks-outline',
                type: 'line',
                source: 'gumi-parks',
                filter: ['==', ['get', 'type'], '공원'],
                paint: { 'line-color': '#bddcb8', 'line-width': 0.8, 'line-opacity': 0.65 }
            },
            {
                id: 'contours-line',
                type: 'line',
                source: 'gumi-contours',
                minzoom: 9.5,
                paint: {
                    'line-color': '#7c8f7a',
                    'line-opacity': 0.52,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9.5, 0.7, 13, 1.1, 16, 1.6]
                }
            },
            {
                id: 'facility-zones-fill',
                type: 'fill',
                source: 'gumi-facility-zones',
                minzoom: 11.5,
                paint: {
                    'fill-color': [
                        'match',
                        ['coalesce', ['get', 'cat'], ''],
                        'education', '#fef3c7',    // 네이버·카카오맵 스타일 따뜻한 학교 부지 연노랑
                        'residential', '#f4efe8',  // 아파트 단지 포근한 웜베이지
                        'industrial', '#edf2f7',   // 산단·공장 부지 깔끔한 쿨그레이
                        'public', '#eff6ff',       // 공공청사 신뢰감 있는 연하늘
                        'sports', '#e8f5e9',       // 체육/운동장 잔디느낌 연초록
                        'medical', '#fff1f2',      // 병원/의료 은은한 연분홍
                        'park', '#e6f4ea',         // 공원/녹지 부지
                        'transport', '#f1f5f9',    // 철도역/터미널 부지
                        '#f8fafc'
                    ],
                    'fill-opacity': 0.88
                }
            },
            {
                id: 'facility-zones-outline',
                type: 'line',
                source: 'gumi-facility-zones',
                minzoom: 12.0,
                paint: {
                    'line-color': [
                        'match',
                        ['coalesce', ['get', 'cat'], ''],
                        'education', '#fbbf24',    // 학교 부지 외곽선
                        'residential', '#e5d9c8',  // 아파트 부지 외곽선
                        'industrial', '#cbd5e1',
                        'public', '#bfdbfe',
                        'sports', '#c8e6c9',
                        'medical', '#fecdd3',
                        'park', '#bbf7d0',
                        'transport', '#cbd5e1',
                        '#e2e8f0'
                    ],
                    'line-width': 0.8,
                    'line-opacity': 0.7
                }
            },
            {
                id: 'water-fill',
                type: 'fill',
                source: 'gumi-water',
                paint: { 'fill-color': '#a5d3fd', 'fill-opacity': 0.95 }
            },
            {
                id: 'water-outline',
                type: 'line',
                source: 'gumi-water',
                paint: { 'line-color': '#7ec0fb', 'line-width': 1.0 }
            },
            // ── 일반 철도(기차길: 대경선 미운행 김천 방면 경부선, 경북선, 경부고속철도 등) ──
            {
                id: 'railways-casing',
                type: 'line',
                source: 'gumi-railways',
                filter: ['!=', ['get', 'daegyeong'], true],
                minzoom: 9.0,
                paint: {
                    'line-color': '#475569',
                    'line-opacity': ['match', ['coalesce', ['get', 'cls'], ''], 'yard', 0.65, 0.9],
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 13, 2.6, 16, 3.8]
                }
            },
            {
                id: 'railways-dash',
                type: 'line',
                source: 'gumi-railways',
                filter: ['!=', ['get', 'daegyeong'], true],
                minzoom: 9.5,
                paint: {
                    'line-color': '#ffffff',
                    'line-dasharray': [2, 2],
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9.5, 0.9, 13, 1.5, 16, 2.2]
                }
            },
            // ── 대경선 광역철도 (구미역 ~ 경산역 운행 구간: 표준 철도 궤도 규격 + 코레일 블루 침목 패턴) ──
            {
                id: 'daegyeong-rail-casing',
                type: 'line',
                source: 'gumi-railways',
                filter: ['==', ['get', 'daegyeong'], true],
                minzoom: 9.0,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#ffffff',
                    'line-opacity': 0.95,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9.0, 2.8, 12, 4.2, 15, 5.6]
                }
            },
            {
                id: 'daegyeong-rail-main',
                type: 'line',
                source: 'gumi-railways',
                filter: ['==', ['get', 'daegyeong'], true],
                minzoom: 9.0,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#004ea2',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9.0, 1.8, 12, 2.8, 15, 4.0]
                }
            },
            {
                id: 'daegyeong-rail-dash',
                type: 'line',
                source: 'gumi-railways',
                filter: ['==', ['get', 'daegyeong'], true],
                minzoom: 10.5,
                paint: {
                    'line-color': '#ffffff',
                    'line-opacity': 0.85,
                    'line-dasharray': [2, 2.2],
                    'line-width': ['interpolate', ['linear'], ['zoom'], 10.5, 0.9, 13, 1.5, 16, 2.2]
                }
            },
            // ── 1단계: 도로 외곽선(케이싱) - 하위 등급부터 렌더링 ──
            // 소로/골목길 케이싱 (cls 4, z13 이상에서만 등장하여 저배율 거미줄 현상 방지)
            {
                id: 'roads-minor-casing',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 13.0,
                filter: ['==', ['to-string', ['get', 'cls']], '4'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#cbd5e1',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.8, 15, 2.8, 17, 5.0]
                }
            },
            // 보조간선도로 케이싱 (cls 3, z11 이상)
            {
                id: 'roads-secondary-casing',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 11.0,
                filter: ['==', ['to-string', ['get', 'cls']], '3'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#94a3b8',
                    'line-opacity': 0.85,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.0, 13, 3.6, 16, 6.0]
                }
            },
            // 주간선/대로 케이싱 (cls 2, z9 이상) - 네이버/카카오맵 스타일 깔끔한 뉴트럴 슬레이트 테두리
            {
                id: 'roads-primary-casing',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 9.0,
                filter: ['==', ['to-string', ['get', 'cls']], '2'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#64748b',
                    'line-opacity': 0.9,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.2, 12, 4.0, 15, 7.0]
                }
            },
            // 고속도로 케이싱 (cls 1, z7 이상) - 선명한 웜 오렌지 테두리
            {
                id: 'roads-highway-casing',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 7.0,
                filter: ['==', ['to-string', ['get', 'cls']], '1'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ea580c',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2.5, 10, 4.5, 13, 7.0]
                }
            },
            

            // ── 2단계: 도로 내부 채우기 (하위 등급 → 상위 등급 순서) ──
            // 소로/골목길 채우기 (cls 4, z13 이상, 순백색)
            {
                id: 'roads-minor-fill',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 13.0,
                filter: ['==', ['to-string', ['get', 'cls']], '4'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ffffff',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.0, 15, 1.8, 17, 3.5]
                }
            },
            // 보조간선도로 채우기 (cls 3, z11 이상, 순백색)
            {
                id: 'roads-secondary-fill',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 11.0,
                filter: ['==', ['to-string', ['get', 'cls']], '3'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ffffff',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 13, 2.4, 16, 4.5]
                }
            },
            // 주간선/대로 채우기 (cls 2, z9 이상) - 카카오/네이버맵 스타일 깔끔한 순백색 (두께로 위계 구분)
            {
                id: 'roads-primary-fill',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 9.0,
                filter: ['==', ['to-string', ['get', 'cls']], '2'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ffffff',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 12, 3.0, 15, 5.5]
                }
            },
            // 고속도로 채우기 (cls 1, z7 이상) - 카카오/네이버맵 스타일 웜 오렌지
            {
                id: 'roads-highway-fill',
                type: 'line',
                source: 'gumi-roads',
                minzoom: 7.0,
                filter: ['==', ['to-string', ['get', 'cls']], '1'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ffa03d',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 10, 3.0, 13, 5.0]
                }
            },
            // 🛣️ 도로 면 채움 (gumi-road-surfaces, 실폭 아스팔트 면 형태 완벽 표출)
            {
                id: 'road-surfaces-fill',
                type: 'fill',
                source: 'gumi-road-surfaces',
                minzoom: 10.5,
                paint: {
                    'fill-color': [
                        'match',
                        ['to-string', ['get', 'cls']],
                        '1', '#ffa03d',
                        '2', '#fdd835',
                        '#ffffff'
                    ],
                    'fill-opacity': 0.98
                }
            },
            // 🛣️ 도로 끝선 외곽선 (road-surfaces-casing, 실폭 도로 면 바로 위에 렌더링되어 도로 끝선 완벽 표시)
            {
                id: 'road-surfaces-casing',
                type: 'line',
                source: 'gumi-road-surfaces',
                minzoom: 10.5,
                paint: {
                    'line-color': [
                        'match',
                        ['to-string', ['get', 'cls']],
                        '1', '#ea580c',
                        '2', '#94a3b8',
                        '#cbd5e1'
                    ],
                    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 13, 1.0, 16, 1.6],
                    'line-opacity': 0.9
                }
            },

            // ── 3단계: 건물 (도로 상단에 위치하여 건물 블록이 선명하게 도드라짐) ──
            {
                id: 'buildings-fill',
                type: 'fill',
                source: 'gumi-buildings',
                minzoom: 11.5,
                paint: {
                    'fill-color': [
                        'match',
                        ['coalesce', ['get', 'cat'], ''],
                        'education', '#fde68a',
                        'residential', '#e9e5dc',
                        'industrial', '#dde5ed',
                        'public', '#dbeafe',
                        'commercial', '#fef08a',
                        'medical', '#ffe4e6',
                        '#e9e5dc'
                    ],
                    'fill-opacity': 0.96
                }
            },
            {
                id: 'buildings-outline',
                type: 'line',
                source: 'gumi-buildings',
                minzoom: 11.8,
                paint: {
                    'line-color': '#94a3b8',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 14, 0.9, 17, 1.4],
                    'line-opacity': 0.9
                }
            },
            {
                id: 'buildings-selected-outline',
                type: 'line',
                source: 'selected-building',
                minzoom: 13.0,
                paint: {
                    'line-color': '#2563eb',
                    'line-width': 2.5
                }
            },
            {
                id: 'roads-labels',
                type: 'symbol',
                source: 'gumi-roads',
                minzoom: 14,
                filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']],
                layout: {
                    'symbol-placement': 'line',
                    'text-field': '{name}',
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 16, 11.5, 18, 13]
                },
                paint: {
                    'text-color': '#334155',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.8
                }
            },
            {
                id: 'bus-stops-icon',
                type: 'symbol',
                source: 'gumi-bus-stops',
                minzoom: 14.0,
                layout: {
                    'icon-image': 'bus_stop_icon',
                    'icon-size': 0.14,
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                    'text-field': ''
                }
            },
            // ── POI 명칭 위계질서 1단계: 광역 대표 랜드마크 (Zoom 11.0+) ──
            {
                id: 'gumap-poi-tier1',
                type: 'symbol',
                source: 'gumi-poi',
                minzoom: 11.0,
                filter: [
                    'all',
                    ['has', 'name'],
                    ['!=', ['get', 'name'], ''],
                    [
                        'any',
                        ['in', '구미역', ['get', 'name']],
                        ['in', '사곡역', ['get', 'name']],
                        ['in', '구미시청', ['get', 'name']],
                        ['in', '금오공과대학교', ['get', 'name']],
                        ['in', '금오공대', ['get', 'name']],
                        ['in', '구미종합터미널', ['get', 'name']],
                        ['in', '구미터미널', ['get', 'name']],
                        ['in', '선산터미널', ['get', 'name']],
                        ['in', '순천향', ['get', 'name']],
                        ['in', '차병원', ['get', 'name']],
                        ['in', '금오산', ['get', 'name']],
                        ['in', '경운대', ['get', 'name']]
                    ]
                ],
                layout: {
                    'text-field': '{name}',
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 11, 13, 13.5, 14.5, 16, 16],
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'text-allow-overlap': false,
                    'text-ignore-placement': false
                },
                paint: {
                    'text-color': '#0f172a',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2.8,
                    'text-halo-blur': 0.5
                }
            },
            // ── POI 명칭 위계질서 2단계: 주요 공공/교육/의료/교통 거점 (Zoom 13.5+) ──
            {
                id: 'gumap-poi-tier2',
                type: 'symbol',
                source: 'gumi-poi',
                minzoom: 13.5,
                filter: [
                    'all',
                    ['has', 'name'],
                    ['!=', ['get', 'name'], ''],
                    [
                        'any',
                        ['==', ['get', 'cat'], 'public'],
                        ['in', '행정복지센터', ['get', 'name']],
                        ['in', '보건소', ['get', 'name']],
                        ['in', '경찰서', ['get', 'name']],
                        ['in', '소방서', ['get', 'name']],
                        ['in', '우체국', ['get', 'name']],
                        ['in', '도서관', ['get', 'name']],
                        ['in', '초등학교', ['get', 'name']],
                        ['in', '중학교', ['get', 'name']],
                        ['in', '고등학교', ['get', 'name']],
                        ['in', '병원', ['get', 'name']]
                    ],
                    [
                        '!',
                        [
                            'any',
                            ['in', '구미역', ['get', 'name']],
                            ['in', '사곡역', ['get', 'name']],
                            ['in', '구미시청', ['get', 'name']],
                            ['in', '금오공과대학교', ['get', 'name']],
                            ['in', '금오공대', ['get', 'name']],
                            ['in', '구미종합터미널', ['get', 'name']],
                            ['in', '구미터미널', ['get', 'name']],
                            ['in', '선산터미널', ['get', 'name']],
                            ['in', '순천향', ['get', 'name']],
                            ['in', '차병원', ['get', 'name']],
                            ['in', '금오산', ['get', 'name']],
                            ['in', '경운대', ['get', 'name']]
                        ]
                    ]
                ],
                layout: {
                    'text-field': '{name}',
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 13.5, 11, 15, 12.5, 18, 14],
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'text-allow-overlap': false,
                    'text-ignore-placement': false
                },
                paint: {
                    'text-color': '#1e293b',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2.2
                }
            },
            // ── POI 명칭 위계질서 3단계: 일반 상가/주거/개별 건축물 (Zoom 15.5+) ──
            {
                id: 'gumap-poi-tier3',
                type: 'symbol',
                source: 'gumi-poi',
                minzoom: 15.5,
                filter: [
                    'all',
                    ['has', 'name'],
                    ['!=', ['get', 'name'], ''],
                    [
                        '!',
                        [
                            'any',
                            ['in', '구미역', ['get', 'name']],
                            ['in', '사곡역', ['get', 'name']],
                            ['in', '구미시청', ['get', 'name']],
                            ['in', '금오공과대학교', ['get', 'name']],
                            ['in', '금오공대', ['get', 'name']],
                            ['in', '구미종합터미널', ['get', 'name']],
                            ['in', '구미터미널', ['get', 'name']],
                            ['in', '선산터미널', ['get', 'name']],
                            ['in', '순천향', ['get', 'name']],
                            ['in', '차병원', ['get', 'name']],
                            ['in', '금오산', ['get', 'name']],
                            ['in', '경운대', ['get', 'name']]
                        ]
                    ],
                    [
                        '!',
                        [
                            'any',
                            ['==', ['get', 'cat'], 'public'],
                            ['in', '행정복지센터', ['get', 'name']],
                            ['in', '보건소', ['get', 'name']],
                            ['in', '경찰서', ['get', 'name']],
                            ['in', '소방서', ['get', 'name']],
                            ['in', '우체국', ['get', 'name']],
                            ['in', '도서관', ['get', 'name']],
                            ['in', '초등학교', ['get', 'name']],
                            ['in', '중학교', ['get', 'name']],
                            ['in', '고등학교', ['get', 'name']],
                            ['in', '병원', ['get', 'name']]
                        ]
                    ]
                ],
                layout: {
                    'text-field': '{name}',
                    'text-font': ['Noto Sans Regular'],
                    'text-size': 11,
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'text-allow-overlap': false,
                    'text-ignore-placement': false
                },
                paint: {
                    'text-color': '#475569',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.6
                }
            },
            // ── 대경선 광역철도 정차역 서클 마커 ──
            {
                id: 'daegyeong-stations-circle',
                type: 'circle',
                source: 'daegyeong-stations',
                minzoom: 9.0,
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 9.0, 4.5, 12, 6.5, 15, 8.5],
                    'circle-color': '#004ea2',
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 2.5
                }
            },
            {
                id: 'daegyeong-stations-inner',
                type: 'circle',
                source: 'daegyeong-stations',
                minzoom: 11.0,
                paint: {
                    'circle-radius': 3.0,
                    'circle-color': '#ffffff'
                }
            },
            // ── 대경선 광역철도 정차역 라벨 & 뱃지 ──
            {
                id: 'daegyeong-stations-label',
                type: 'symbol',
                source: 'daegyeong-stations',
                minzoom: 9.5,
                layout: {
                    'text-field': ['concat', '[대경선] ', ['get', 'name']],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 9.5, 11, 13, 13, 16, 15],
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'text-allow-overlap': true
                },
                paint: {
                    'text-color': '#004ea2',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2.8
                }
            }
        ]
    };
};