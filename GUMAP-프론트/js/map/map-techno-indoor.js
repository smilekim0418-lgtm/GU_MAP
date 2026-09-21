/**
 * 금오공과대학교 테크노관 IMDF 국제표준 실내지도 모듈
 * map-techno-indoor.js
 * ──────────────────────────────────────────────────────────
 * • 네이버 / 카카오 지도 스타일 멀티줌 렌더링 (저/중배율 외곽 브랜딩 vs 고배율 상세 실내지도)
 * • 사용자 제공 실측 좌표 (SW: 36.146172, 128.393970 / NE: 36.147113, 128.394726) 100% 정밀 보정
 * • OGC / Apple IMDF (Indoor Mapping Data Format) v1.0 국제표준 준수
 * • 전층(B1F ~ 6F) 366개 공간 + 300개 연구실/점유자 + 출입구 표출
 */

(function () {
    'use strict';

    /* ══════════════════════════════════════════════════════════
       ① IMDF 데이터 획득 & 레벨 매핑
       ══════════════════════════════════════════════════════════ */
    let imdfBundle = null;
    let levelMap = {};      // level_id -> { id, ordinal, shortName, name }
    let unitMap = {};       // unit_id -> feature
    let unitsByLevel = {};  // level_id -> [features]
    let occupantsByUnit = {};// unit_id -> [features]
    let openingsByLevel = {};// level_id -> [features]

    // IMDF 카테고리별 테마 스타일 (네이버/카카오 지도 감성의 앰비언트 인더스트리 컬러)
    const IMDF_STYLE = {
        laboratory: { color: '#059669', fillColor: '#10b981', fillOpacity: 0.35, weight: 1.5, icon: '🔬', name: '연구실/실험실' },
        classroom:  { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.35, weight: 1.5, icon: '📚', name: '강의실' },
        office:     { color: '#7c3aed', fillColor: '#8b5cf6', fillOpacity: 0.30, weight: 1.5, icon: '💼', name: '교수실/사무실' },
        restroom:   { color: '#0891b2', fillColor: '#06b6d4', fillOpacity: 0.40, weight: 1.5, icon: '🚻', name: '화장실' },
        stairs:     { color: '#d97706', fillColor: '#f59e0b', fillOpacity: 0.50, weight: 1.5, icon: '🪜', name: '계단' },
        elevator:   { color: '#9333ea', fillColor: '#a855f7', fillOpacity: 0.50, weight: 1.5, icon: '🛗', name: '엘리베이터' },
        walkway:    { color: '#475569', fillColor: '#1e293b', fillOpacity: 0.25, weight: 1.0, icon: '🚶', name: '복도/통로' },
        utility:    { color: '#e11d48', fillColor: '#f43f5e', fillOpacity: 0.35, weight: 1.5, icon: '⚙️', name: '유틸리티' },
        breakroom:  { color: '#65a30d', fillColor: '#84cc16', fillOpacity: 0.35, weight: 1.5, icon: '☕', name: '휴게실' },
        library:    { color: '#ca8a04', fillColor: '#eab308', fillOpacity: 0.40, weight: 1.5, icon: '📖', name: '자료실/도서관' },
        atrium:     { color: '#0d9488', fillColor: '#14b8a6', fillOpacity: 0.20, weight: 1.2, icon: '🌿', name: '중정/테라스', dashArray: '4,4' }
    };
    const DEFAULT_STYLE = { color: '#64748b', fillColor: '#475569', fillOpacity: 0.30, weight: 1.0, icon: '🏢', name: '기타 공간' };

    /* ─────────────── 계단·엘리베이터 픽토그램 ───────────────
     *
     * 계단 박스에 "계단-A" 라고 적어 두면 글자를 읽어야 무엇인지 안다.
     * 도면에서는 그림으로 보여 주는 편이 빠르다. 이름은 박스를 누르면
     * 팝업이, 올려 두면 툴팁이 알려 준다.
     *
     * L.svgOverlay 는 위경도 범위에 맞춰 그려지므로 확대·축소를 따라
     * 저절로 커지고 작아진다. 픽셀 크기로 아이콘을 붙이면 renderTechnoFloor
     * 가 줌마다 다시 돌지 않아서 확대할수록 어긋난다.
     */
    const PICTOGRAM_ART = {
        // 옆에서 본 계단. 오르는 방향 화살표까지 있으면 한눈에 읽힌다.
        stairs: '<path d="M14,84 H33 V67 H52 V50 H71 V33 H88" />' +
                '<path d="M20,44 L30,34 L40,44" />' +
                '<path d="M30,34 V62" />',
        // 승강기 함과 위·아래 화살표. 표준 픽토그램 그대로다.
        elevator: '<rect x="26" y="16" width="48" height="68" rx="6" />' +
                  '<path d="M50,30 L59,43 H41 Z" />' +
                  '<path d="M50,70 L41,57 H59 Z" />'
    };

    /** 박스를 채우는 픽토그램. 밑에 어두운 획을 한 번 깔아 테두리를 만든다. */
    function makePictogram(kind) {
        const art = PICTOGRAM_ART[kind];
        if (!art) return null;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        // 박스가 기울어 있어 외접 상자가 실제 박스보다 크다. meet 로 넣어
        // 안쪽에 담기게 한다. 넘치는 것보다 조금 작은 편이 낫다.
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.innerHTML =
            '<g fill="none" stroke="#0f172a" stroke-width="16" stroke-opacity="0.55"' +
            ' stroke-linecap="round" stroke-linejoin="round">' + art + '</g>' +
            '<g fill="none" stroke="#ffffff" stroke-width="7"' +
            ' stroke-linecap="round" stroke-linejoin="round">' + art + '</g>';
        return svg;
    }

    function getCategoryStyle(cat) {
        return IMDF_STYLE[cat] || DEFAULT_STYLE;
    }

    function initImdfData() {
        imdfBundle = window.IMDF_TECHNO_DATA || null;
        if (!imdfBundle) {
            console.warn('[IMDF] IMDF_TECHNO_DATA가 로드되지 않았습니다.');
            return false;
        }

        // 1. Level 매핑
        levelMap = {};
        unitsByLevel = {};
        openingsByLevel = {};
        occupantsByUnit = {};

        const levels = imdfBundle.levels?.features || [];
        levels.forEach(lvl => {
            const lid = lvl.id;
            const props = lvl.properties || {};
            const sname = props.short_name?.['ko-KR'] || props.short_name?.en || '1F';
            const name  = props.name?.['ko-KR'] || props.name?.en || sname;
            const ord   = props.ordinal ?? 1;

            levelMap[lid] = { id: lid, ordinal: ord, shortName: sname, name: name };
            unitsByLevel[lid] = [];
            openingsByLevel[lid] = [];
        });

        // 2. Units 매핑
        const units = imdfBundle.units?.features || [];
        unitMap = {};
        units.forEach(u => {
            unitMap[u.id] = u;
            const lid = u.properties?.level_id;
            if (lid && unitsByLevel[lid]) {
                unitsByLevel[lid].push(u);
            }
        });

        // 3. Occupants 매핑
        const occupants = imdfBundle.occupants?.features || [];
        occupants.forEach(occ => {
            const uids = occ.properties?.unit_ids || [];
            uids.forEach(uid => {
                if (!occupantsByUnit[uid]) occupantsByUnit[uid] = [];
                occupantsByUnit[uid].push(occ);
            });
        });

        // 4. Openings 매핑
        const openings = imdfBundle.openings?.features || [];
        openings.forEach(op => {
            const lid = op.properties?.level_id;
            if (lid && openingsByLevel[lid]) {
                openingsByLevel[lid].push(op);
            }
        });

        console.log(`[IMDF] 테크노관 IMDF 정밀 좌표 적용 완료: ${levels.length}개 층, ${units.length}개 공간`);
        return true;
    }

    /* ══════════════════════════════════════════════════════════
       ② 전역 상태 관리
       ══════════════════════════════════════════════════════════ */
    window.technoIndoorLayerGroup = L.layerGroup();
    window.technoFootprintLayerGroup = L.layerGroup();
    window.technoB1LayerGroup     = window.technoIndoorLayerGroup;  // 하위 호환
    window.technoActiveFloor      = '1F';
    window.technoIndoorOpen       = false;
    window._technoLive            = null;

    /* ══════════════════════════════════════════════════════════
       ③ 렌더링 (저/중배율 외곽선 vs 고배율 상세 평면도)
       ══════════════════════════════════════════════════════════ */
    
    // (A) 저/중배율 (Zoom 14~16): 네이버/카카오 지도 스타일의 건물 외곽 다각형 & 랜드마크 뱃지 표출
    function renderTechnoFootprint() {
        if (!window.map) return;
        window.technoFootprintLayerGroup.clearLayers();
        if (!imdfBundle && !initImdfData()) return;

        const footprintData = imdfBundle.footprint || imdfBundle.building;
        if (!footprintData) return;

        const geoLayer = L.geoJSON(footprintData, {
            style: {
                color: '#6366f1',
                weight: 2.5,
                fillColor: '#6366f1',
                fillOpacity: 0.12,
                dashArray: null
            }
        });

        geoLayer.bindTooltip('🏫 금오공과대학교 테크노관 (61번 건물)<br><span style="font-size:10px;color:#818cf8;">실내지도 보기 버튼을 눌러 주세요</span>', {
            direction: 'top',
            className: 'techno-footprint-tooltip'
        });

        // 대표 랜드마크 라벨 마커
        const bounds = geoLayer.getBounds();
        if (bounds && bounds.isValid()) {
            const center = bounds.getCenter();
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'techno-indoor-open-button';
            button.setAttribute('aria-label', '테크노관 실내지도 보기');
            button.setAttribute('aria-controls', 'techno-indoor-panel');
            button.style.cssText = 'background:#4f46e5;border:2px solid #fff;color:#fff;' +
                'padding:10px 14px;min-height:44px;border-radius:22px;font-size:12px;' +
                'font-weight:800;white-space:nowrap;box-shadow:0 3px 12px rgba(0,0,0,.25);cursor:pointer;';
            button.textContent = '🏫 테크노관 · 실내지도 보기';
            button.addEventListener('click', event => {
                event.stopPropagation();
                window.openTechnoIndoorMap();
            });
            const landmarkMarker = L.marker(center, {
                keyboard: false,
                bubblingMouseEvents: false,
                icon: L.divIcon({
                    className: 'techno-building-badge',
                    html: button,
                    iconSize: [210, 44],
                    iconAnchor: [105, 22]
                })
            });
            window.technoFootprintLayerGroup.addLayer(landmarkMarker);
        }

        window.technoFootprintLayerGroup.addLayer(geoLayer);
    }

    // (B) 고배율 (Zoom >= 17): IMDF 상세 실내 공간 GeoJSON 렌더링
    window.renderTechnoFloor = window.renderTechnoB1Floor = function () {
        if (!window.map) return;
        window.technoIndoorLayerGroup.clearLayers();

        if (!imdfBundle && !initImdfData()) return;

        // 현재 활성화된 층 찾기
        const activeShortName = window.technoActiveFloor || '1F';
        let targetLevelId = null;
        let targetLevelInfo = null;

        for (const lid in levelMap) {
            if (levelMap[lid].shortName === activeShortName) {
                targetLevelId = lid;
                targetLevelInfo = levelMap[lid];
                break;
            }
        }
        if (!targetLevelId) return;

        const levelUnits = unitsByLevel[targetLevelId] || [];
        const levelOpenings = openingsByLevel[targetLevelId] || [];

        // 1. 공간(Unit) Polygons 렌더링
        levelUnits.forEach(unit => {
            const props = unit.properties || {};
            const cat = props.category || 'other';
            if (cat === 'walkway') return; // 사용자 요청: 복도는 표시하지 않고 데이터만 유지
            const st = getCategoryStyle(cat);
            const labelStr = props.label?.['ko-KR'] || props.label?.en || '';
            const rawName = props.name?.['ko-KR'] || props.name?.en || labelStr;

            // 점유자(Occupant) 정보 연결
            const occList = occupantsByUnit[unit.id] || [];
            let mainOccName = '';
            let tags = props.research_tags || [];

            if (occList.length > 0) {
                const occProps = occList[0].properties || {};
                mainOccName = occProps.name?.['ko-KR'] || occProps.name?.en || '';
                if (occProps.research_tags) {
                    tags = [...new Set([...tags, ...occProps.research_tags])];
                }
            }

            const displayName = mainOccName || rawName || labelStr || '미지정 공간';

            // Leaflet GeoJSON 레이어 생성
            const geoLayer = L.geoJSON(unit, {
                style: function () {
                    return {
                        color: st.color,
                        weight: st.weight,
                        fillColor: st.fillColor,
                        fillOpacity: st.fillOpacity,
                        dashArray: st.dashArray || null
                    };
                }
            });

            // 마우스 호버 강조 효과
            geoLayer.on('mouseover', function (e) {
                if (e.layer && e.layer.setStyle) {
                    e.layer.setStyle({
                        weight: 3,
                        color: '#6366f1',
                        fillOpacity: Math.min(st.fillOpacity + 0.25, 0.85)
                    });
                }
            });
            geoLayer.on('mouseout', function (e) {
                if (e.layer) geoLayer.resetStyle(e.layer);
            });

            // 공간 팝업 대화상자 (국제표준 세부 메타데이터 표출)
            const tagBadges = tags.map(t => `<span style="background:rgba(99,102,241,.2);color:#818cf8;border:1px solid rgba(99,102,241,.4);padding:1px 6px;border-radius:4px;font-size:10px;margin-right:4px;">#${escHtml(t)}</span>`).join('');

            const popupContent = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-width:220px;max-width:280px;padding:4px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
    <span style="background:${st.color};color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:800;">
      ${st.icon} ${escHtml(labelStr || st.name)}
    </span>
    <span style="font-size:10px;color:var(--text-muted);font-weight:700;">
      테크노관 ${escHtml(targetLevelInfo.name)}
    </span>
  </div>
  <h4 style="margin:4px 0 6px;font-size:15px;color:var(--text-main);font-weight:800;line-height:1.3;">
    ${escHtml(displayName)}
  </h4>
  ${tagBadges ? `<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:2px;">${tagBadges}</div>` : ''}
  <div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-bottom:10px;padding:8px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border-panel);">
    <div>🏛️ <b>구분:</b> <span style="color:var(--text-main)">${escHtml(st.name)}</span></div>
    ${props.department ? `<div>🏫 <b>소속:</b> <span style="color:var(--text-main)">${escHtml(props.department)}</span></div>` : ''}
    <div>🌐 <b>표준ID:</b> <span style="color:var(--text-muted);font-family:monospace;font-size:9px">${unit.id.slice(0,18)}…</span></div>
  </div>
  <div style="display:flex;gap:6px;">
    <button onclick="window.routeToTechnoRoom('${escHtml(labelStr || displayName)}', '${unit.id}')"
      style="flex:1;padding:8px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;
             border-radius:8px;font-weight:800;font-size:11px;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,.4);">
      🧭 여기까지 길찾기
    </button>
  </div>
</div>`;

            geoLayer.bindPopup(popupContent, { maxWidth: 290 });
            
            geoLayer.on('click', function(e) {
                if (e.originalEvent) {
                    L.DomEvent.stopPropagation(e.originalEvent);
                    window._indoorMapClicked = true;
                    setTimeout(() => window._indoorMapClicked = false, 100);
                }
            });

            // 계단·엘리베이터는 글자 대신 그림으로 채운다
            const bounds = geoLayer.getBounds();
            const pictogram = makePictogram(cat);
            if (pictogram && bounds && bounds.isValid()) {
                window.technoIndoorLayerGroup.addLayer(
                    L.svgOverlay(pictogram, bounds, { interactive: false }));
                geoLayer.bindTooltip(st.icon + ' ' + escHtml(labelStr || st.name),
                    { direction: 'top', className: 'imdf-unit-tip' });
            }

            // 그 밖의 공간은 텍스트 라벨 (중앙 배치)
            if (!pictogram && bounds && bounds.isValid()) {
                const center = bounds.getCenter();
                if (labelStr && cat !== 'walkway') {
                    const lblMarker = L.marker(center, {
                        interactive: false,
                        icon: L.divIcon({
                            className: 'imdf-unit-label cat-' + cat,
                            html: `<div style="font-size:10px;font-weight:800;color:#ffffff;text-shadow:0 1px 3px #000, 0 0 2px #000;text-align:center;white-space:nowrap;pointer-events:none;">${st.icon} ${escHtml(labelStr)}</div>`,
                            iconSize: [60, 26],
                            iconAnchor: [30, 13]
                        })
                    });
                    window.technoIndoorLayerGroup.addLayer(lblMarker);
                }
            }

            window.technoIndoorLayerGroup.addLayer(geoLayer);
        });

        // 2. 출입구(Opening) 렌더링
        //    한 층에 문이 60~90개다. 전부 그리면 방 번호가 안 보인다.
        //    건물 밖으로 나가는 문(pedestrian.principal)만 표시한다.
        levelOpenings.forEach(op => {
            const props = op.properties || {};
            if (props.category !== 'pedestrian.principal') return;

            const isWheelchair = props.accessibility?.includes('wheelchair');
            const label = props.name?.['ko-KR'] || props.name?.en || '건물 출입구';

            // 문지방 선분
            window.technoIndoorLayerGroup.addLayer(L.geoJSON(op, {
                style: { color: '#16a34a', weight: 5, opacity: 0.95, lineCap: 'round' }
            }));

            // 표식. LineString 이라 pointToLayer 가 안 걸리므로 직접 찍는다.
            const point = props.display_point?.coordinates;
            if (!point) return;
            const marker = L.marker([point[1], point[0]], {
                icon: L.divIcon({
                    className: 'imdf-opening-icon',
                    html: `<div style="font-size:17px;line-height:1;text-shadow:0 0 3px #fff,0 0 6px #fff;">${isWheelchair ? '♿' : '🚪'}</div>`,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                })
            });
            marker.bindTooltip(`🚪 ${label}${isWheelchair ? ' · ♿' : ''}`, {
                direction: 'top', className: 'imdf-entrance-tip'
            });
            window.technoIndoorLayerGroup.addLayer(marker);
        });

        console.log(`[IMDF] ${activeShortName} 렌더링 완료 (${levelUnits.length}개 공간)`);
    };

    function escHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    /* ══════════════════════════════════════════════════════════
       ④ 층 선택 UI 패널 (B1F ~ 6F 전층)
       ══════════════════════════════════════════════════════════ */
    const FLOOR_LIST = [
        { id: '6F', name: '6층', icon: '6F', color: '#ec4899' },
        { id: '5F', name: '5층', icon: '5F', color: '#8b5cf6' },
        { id: '4F', name: '4층', icon: '4F', color: '#3b82f6' },
        { id: '3F', name: '3층', icon: '3F', color: '#06b6d4' },
        { id: '2F', name: '2층', icon: '2F', color: '#10b981' },
        { id: '1F', name: '1층', icon: '1F', color: '#f59e0b' },
        { id: 'B1F', name: 'B1층', icon: 'B1', color: '#6366f1' }
    ];

    function createFloorUI() {
        if (document.getElementById('techno-indoor-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'techno-indoor-panel';
        panel.className = 'glass-panel';
        // 자리·색·크기는 css/indoor.css 가 정한다. 여기서는 처음에 숨겨만 둔다.
        panel.style.display = 'none';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', '테크노관 실내지도');

        const ICON = {
            building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h4M8 11h4M8 15h4M3 21h18"/></svg>',
            close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
            chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s"><path d="M6 9l6 6 6-6"/></svg>',
            search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
        };

        panel.innerHTML = `
<div class="ti-head">
  <div class="ti-mark" aria-hidden="true">${ICON.building}</div>
  <div class="ti-title">
    <strong>테크노관</strong>
    <span>금오공과대학교 · 실내지도 B1~6층</span>
  </div>
  <button id="ti-expand" class="ti-icon-btn" type="button" aria-expanded="false" aria-label="실내지도 메뉴 펼치기">${ICON.chevron}</button>
  <button id="ti-close" class="ti-icon-btn" type="button" aria-label="실내지도 닫기">${ICON.close}</button>
</div>
<div class="ti-body">
  <div class="ti-search">
    ${ICON.search}
    <input id="ti-search" type="text" placeholder="호실, 연구실, 교수명 검색" autocomplete="off" aria-label="테크노관 호실 검색">
    <div id="ti-results" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:10;margin-top:6px;max-height:220px;overflow-y:auto;padding:4px;"></div>
  </div>

  <div class="ti-floors">
    <div class="ti-label">층</div>
    <div id="ti-floor-btns" role="tablist" aria-label="층 선택"></div>
  </div>

  <details class="ti-acc" id="ti-acc-route" open>
    <summary>실내 길찾기</summary>
    <div class="ti-acc-body" id="ti-route-slot"></div>
  </details>

  <details class="ti-acc" id="ti-acc-layers">
    <summary>지도 표시</summary>
    <div class="ti-acc-body" id="ti-layers-slot">
      <div class="ti-legend" aria-label="범례">
        <span>🔬 연구실</span><span>📚 강의실</span><span>💼 교수실</span><span>🚻 화장실</span><span>🪜 계단·승강기</span>
      </div>
    </div>
  </details>
</div>
`;

        document.body.appendChild(panel);
        // 패널이 떠 있는지를 body 클래스로도 알린다. 모바일에서 날씨 칩처럼
        // 같은 자리를 쓰는 요소가 비켜 줄 수 있게 한다. 패널을 켜고 끄는 곳이
        // 여러 모듈에 흩어져 있어서, 켜는 쪽마다 고치는 대신 여기서 지켜본다.
        const syncOpen = () => document.body.classList.toggle('indoor-open', panel.style.display !== 'none');
        new MutationObserver(syncOpen).observe(panel, { attributes: true, attributeFilter: ['style'] });
        syncOpen();
        if (window.L && L.DomEvent) {
            // 패널 위에서 굴린 휠·끌기가 지도로 새지 않게 한다
            L.DomEvent.disableScrollPropagation(panel);
            L.DomEvent.disableClickPropagation(panel);
        }

        // 층 버튼 생성 (위층이 왼쪽). 선택 상태는 클래스로만 표시한다.
        const btnBox = panel.querySelector('#ti-floor-btns');
        FLOOR_LIST.forEach(fm => {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.floor = fm.id;
            b.className = 'ti-fbtn';
            b.setAttribute('role', 'tab');
            b.style.setProperty('--floor-color', fm.color);
            b.textContent = fm.id === 'B1F' ? 'B1' : fm.id.replace('F', '');
            b.title = fm.name;
            b.addEventListener('click', () => doFloorSwitch(fm.id, panel));
            btnBox.appendChild(b);
        });
        paintFloorButtons(panel, window.technoActiveFloor);

        // 모바일: 접힌 카드 ↔ 펼친 메뉴
        const expand = panel.querySelector('#ti-expand');
        expand.addEventListener('click', () => {
            const open = panel.classList.toggle('is-open');
            expand.setAttribute('aria-expanded', open ? 'true' : 'false');
            expand.setAttribute('aria-label', open ? '실내지도 메뉴 접기' : '실내지도 메뉴 펼치기');
        });

        // 닫기 버튼
        panel.querySelector('#ti-close').addEventListener('click', () => {
            window.closeTechnoIndoorMap();
            if (window.map && window.map.hasLayer(window.technoFootprintLayerGroup))
                window.map.removeLayer(window.technoFootprintLayerGroup);
        });

        // 실시간 검색
        const si = panel.querySelector('#ti-search');
        const sr = panel.querySelector('#ti-results');
        si.addEventListener('input', function () {
            const q = this.value.trim().toLowerCase();
            if (!q) { sr.style.display = 'none'; return; }

            const hits = [];
            const units = imdfBundle?.units?.features || [];

            units.forEach(u => {
                const props = u.properties || {};
                const label = props.label?.['ko-KR'] || props.label?.en || '';
                const name = props.name?.['ko-KR'] || props.name?.en || '';
                const lid = props.level_id;
                const levelInfo = levelMap[lid] || { shortName: '1F' };

                const occList = occupantsByUnit[u.id] || [];
                let occName = '';
                if (occList.length > 0) {
                    const op = occList[0].properties || {};
                    occName = op.name?.['ko-KR'] || op.name?.en || '';
                }

                const fullText = (label + ' ' + name + ' ' + occName + ' ' + (props.research_tags || []).join(' ')).toLowerCase();
                if (fullText.includes(q)) {
                    hits.push({
                        unit: u,
                        label,
                        name: occName || name || label,
                        levelShort: levelInfo.shortName,
                        cat: props.category
                    });
                }
            });

            if (!hits.length) {
                sr.style.display = 'block';
                sr.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text-muted);text-align:center;">검색 결과가 없습니다</div>';
                return;
            }

            sr.style.display = 'block';
            sr.innerHTML = hits.slice(0, 10).map(h => `
<div onclick="window._focusTechnoImdfUnit('${h.unit.id}', '${h.levelShort}')"
  style="padding:8px 10px;font-size:13px;color:var(--text-main);cursor:pointer;border-radius:8px;
         display:flex;justify-content:space-between;align-items:center;gap:8px;"
  onmouseover="this.style.background='var(--ui-soft-hover)'"
  onmouseout="this.style.background='transparent'">
  <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><b style="color:var(--ui-accent);margin-right:4px;">${h.levelShort}</b>${escHtml(h.label)} ${escHtml(h.name)}</span>
  <span style="color:var(--text-muted);font-size:11px;flex:0 0 auto;">이동</span>
</div>`).join('');
        });
    }

    function paintFloorButtons(panel, floorId) {
        panel.querySelectorAll('.ti-fbtn').forEach(b => {
            const active = b.dataset.floor === floorId;
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function doFloorSwitch(floorId, panel) {
        window.technoActiveFloor = floorId;
        paintFloorButtons(panel, floorId);

        setTimeout(() => {
            if (!window.technoIndoorOpen) return;
            window.renderTechnoFloor();
            checkVis();
        }, 50);

        if (window.showToast) window.showToast(`🏫 테크노관 ${floorId} 실내지도`);
    }

    /* ══════════════════════════════════════════════════════════
       ⑤ 검색 결과 포커스 및 길찾기 연동
       ══════════════════════════════════════════════════════════ */
    window._focusTechnoImdfUnit = function (unitId, levelShort) {
        if (levelShort && levelShort !== window.technoActiveFloor) {
            const panel = document.getElementById('techno-indoor-panel');
            if (panel) doFloorSwitch(levelShort, panel);
        }

        setTimeout(() => {
            const unit = unitMap[unitId];
            if (!unit || !window.map) return;

            const tempLayer = L.geoJSON(unit);
            const bounds = tempLayer.getBounds();
            if (bounds && bounds.isValid()) {
                window.map.flyTo(bounds.getCenter(), 20, { duration: 0.8 });
            }

            const sr = document.getElementById('ti-results');
            const si = document.getElementById('ti-search');
            if (sr) sr.style.display = 'none';
            if (si) si.value = '';
        }, 100);
    };

    window.routeToTechnoRoom = function (roomName, unitId) {
        const el = document.getElementById('search-end') || document.getElementById('search-input');
        if (el) el.value = `금오공대 테크노관 ${roomName}`;
        if (window.showToast) window.showToast(`🎯 도착지: 테크노관 ${roomName}`);
        if (typeof window.openRouteDetailPanel === 'function') window.openRouteDetailPanel();
    };

    /* ══════════════════════════════════════════════════════════
       ⑥ 멀티줌 가시성 제어 (네이버/카카오 지도 방식)
       ══════════════════════════════════════════════════════════ */
    const TECHNO_CENTER = [36.146643, 128.394348];

    function checkVis() {
        if (!window.map) return;
        const zoom = window.map.getZoom();
        const dist = window.map.distance(window.map.getCenter(), TECHNO_CENTER);
        const panel = document.getElementById('techno-indoor-panel');

        // 구형 제어기 숨기기
        const oldCtrl = document.getElementById('indoor-floor-controller');
        if (oldCtrl) oldCtrl.style.display = 'none';

        if (dist <= 1200) {
            if (zoom >= 17) {
                // (1) 고배율 (Zoom 17 이상): 세부 실내지도 표출
                if (panel) panel.style.display = 'flex';
                if (zoom < 19) {
                    document.getElementById('map').classList.add('indoor-zoom-low');
                } else {
                    document.getElementById('map').classList.remove('indoor-zoom-low');
                }

                if (window.map.hasLayer(window.technoFootprintLayerGroup)) {
                    window.map.removeLayer(window.technoFootprintLayerGroup);
                }
                if (!window.map.hasLayer(window.technoIndoorLayerGroup)) {
                    window.technoIndoorLayerGroup.addTo(window.map);
                    window.renderTechnoFloor();
                }
            } else if (zoom >= 14) {
                // (2) 저/중배율 (Zoom 14~16): 건물 외곽선 브랜딩 영역 표출 (네이버/카카오 방식)
                if (panel) panel.style.display = 'none';

                if (window.map.hasLayer(window.technoIndoorLayerGroup)) {
                    window.map.removeLayer(window.technoIndoorLayerGroup);
                }
                if (!window.map.hasLayer(window.technoFootprintLayerGroup)) {
                    window.technoFootprintLayerGroup.addTo(window.map);
                    renderTechnoFootprint();
                }
            } else {
                // (3) 광역배율 (Zoom 13 이하): 레이어 숨기기
                if (panel) panel.style.display = 'none';
                if (window.map.hasLayer(window.technoIndoorLayerGroup))
                    window.map.removeLayer(window.technoIndoorLayerGroup);
                if (window.map.hasLayer(window.technoFootprintLayerGroup))
                    window.map.removeLayer(window.technoFootprintLayerGroup);
            }
        } else {
            if (panel) panel.style.display = 'none';
            if (window.map.hasLayer(window.technoIndoorLayerGroup))
                window.map.removeLayer(window.technoIndoorLayerGroup);
            if (window.map.hasLayer(window.technoFootprintLayerGroup))
                window.map.removeLayer(window.technoFootprintLayerGroup);
        }
    }

    /* ══════════════════════════════════════════════════════════
       ⑦ 초기화 진입점
       ══════════════════════════════════════════════════════════ */
    window.initTechnoBuildingB1Map = window.initTechnoIndoorMap = function () {
        if (!window.map) return;
        initImdfData();
        createFloorUI();
        window.renderTechnoFloor();
        renderTechnoFootprint();
        window.map.on('zoomend moveend', checkVis);
        checkVis();
    };

    // DOMReady 시 자동 시도
    function waitForMap() {
        if (window.map) {
            window.initTechnoIndoorMap();
        } else {
            setTimeout(waitForMap, 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForMap);
    } else {
        waitForMap();
    }

})();
