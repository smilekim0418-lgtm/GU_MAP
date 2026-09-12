/**
 * 금오공과대학교 테크노관 지하 1층 (B1F) 실내지도 모듈
 * (CAD/JSON 데이터 기반 Leaflet 벡터 및 층별 UI / 개발자 미세 조종 연동)
 */

(function() {
    'use strict';

    // 원본 CAD 데이터 정의
    window.technoB1RawData = {"buildingName": "금오공과대학교 테크노관", "floor": "B1F (지하 1층)", "exportedAt": "2026-08-10T06:03:31.927Z", "data": {"name": "지하 1층 (B1F)", "outerContour": "M130,20 L760,20 L758,228 L704,228 L702,266 L643,266 L643,325 L597,325 L597,317 L521,317 L521,408 L300,410 L300,770 L130,770 Z", "rooms": [{"id": "B108", "x": 223, "y": 21, "w": 90, "h": 108, "type": "office", "label": "B108", "name": "지하 대형 보강고", "area": 63, "status": "사용 가능", "features": "밀폐형 이동식 서가"}, {"id": "B107-1", "x": 313, "y": 22, "w": 40, "h": 64, "type": "office", "label": "B107-1", "name": "전산 캐비닛", "area": 14, "status": "접근 제한", "features": "보안 서류함"}, {"id": "B107-2", "x": 313, "y": 86, "w": 40, "h": 42, "type": "office", "label": "B107-2", "name": "보조 자재실", "area": 14, "status": "사용 가능", "features": "선반대"}, {"id": "B107", "x": 353, "y": 23, "w": 75, "h": 105, "type": "office", "label": "B107", "name": "지하 연구실 B107", "area": 52, "status": "사용 가능", "features": "환기 패널"}, {"id": "B106", "x": 428, "y": 21, "w": 85, "h": 109, "type": "office", "label": "B106", "name": "중앙 유틸리티실", "area": 60, "status": "가동 중", "features": "배관 모니터"}, {"id": "B105", "x": 548, "y": 22, "w": 209, "h": 149, "type": "office", "label": "B105", "name": "지하 대강의실", "area": 186, "status": "사용 가능", "features": "음향 장비"}, {"id": "B104", "x": 583, "y": 171, "w": 174, "h": 55, "type": "office", "label": "B104", "name": "기계 공조실", "area": 66, "status": "정상 가동 중", "features": "대형 공조기"}, {"id": "B103", "x": 643, "y": 226, "w": 60, "h": 40, "type": "office", "label": "B103", "name": "전력 제어실", "area": 24, "status": "접근 제한", "features": "수전반"}, {"id": "B113", "x": 223, "y": 166, "w": 80, "h": 130, "type": "office", "label": "B113", "name": "지하 문서 아카이브", "area": 104, "status": "사용 가능", "features": "모빌랙"}, {"id": "B112", "x": 303, "y": 166, "w": 45, "h": 73, "type": "office", "label": "B112", "name": "소형 자재고", "area": 31, "status": "사용 가능", "features": "수납장"}, {"id": "B111", "x": 348, "y": 166, "w": 75, "h": 73, "type": "office", "label": "B111", "name": "서버 테스팅 룸", "area": 52, "status": "테스트 중", "features": "서버 랙"}, {"id": "B110", "x": 423, "y": 166, "w": 35, "h": 73, "type": "office", "label": "B110", "name": "비상 발전기실", "area": 24, "status": "대기 중", "features": "발전기"}, {"id": "화장실", "x": 458, "y": 266, "w": 41, "h": 49, "type": "toilet", "label": "화장실", "name": "관리원 휴게실", "area": 22, "status": "사용 가능", "features": "소파"}, {"id": "B114", "x": 132, "y": 166, "w": 45, "h": 30, "type": "office", "label": "B114", "name": "지하 펌프실", "area": 12, "status": "정상 가동 중", "features": "급수 펌프"}, {"id": "B115", "x": 132, "y": 196, "w": 45, "h": 30, "type": "office", "label": "B115", "name": "통신 기지국실", "area": 12, "status": "정상 가동 중", "features": "중계기"}, {"id": "B116", "x": 132, "y": 226, "w": 45, "h": 30, "type": "office", "label": "B116", "name": "환경 관리실", "area": 12, "status": "근무 중", "features": "청소 용품함"}, {"id": "B117", "x": 132, "y": 256, "w": 45, "h": 40, "type": "office", "label": "B117", "name": "지하 감시 통합실", "area": 16, "status": "모니터링 중", "features": "CCTV"}, {"id": "B118", "x": 133, "y": 409, "w": 45, "h": 40, "type": "office", "label": "B118", "name": "동아리방 A", "area": 18, "status": "사용 가능", "features": "책상"}, {"id": "B119", "x": 133, "y": 449, "w": 45, "h": 40, "type": "office", "label": "B119", "name": "동아리방 B", "area": 18, "status": "사용 가능", "features": "책상"}, {"id": "B120", "x": 133, "y": 489, "w": 45, "h": 40, "type": "office", "label": "B120", "name": "동아리방 C", "area": 18, "status": "사용 가능", "features": "책상"}, {"id": "B121", "x": 133, "y": 529, "w": 45, "h": 40, "type": "office", "label": "B121", "name": "밴드 연습실", "area": 18, "status": "사용 가능", "features": "드럼 세트"}, {"id": "B122", "x": 133, "y": 569, "w": 45, "h": 40, "type": "office", "label": "B122", "name": "댄스 연습실", "area": 18, "status": "사용 가능", "features": "전면 거울"}, {"id": "B123", "x": 133, "y": 609, "w": 45, "h": 40, "type": "office", "label": "B123", "name": "창고 D", "area": 18, "status": "잠금 상태", "features": "선반"}, {"id": "B124", "x": 133, "y": 649, "w": 45, "h": 40, "type": "office", "label": "B124", "name": "창고 E", "area": 18, "status": "잠금 상태", "features": "선반"}, {"id": "B125", "x": 133, "y": 689, "w": 45, "h": 40, "type": "office", "label": "B125", "name": "창고 F", "area": 18, "status": "잠금 상태", "features": "선반"}, {"id": "B132", "x": 223, "y": 409, "w": 75, "h": 45, "type": "office", "label": "B132", "name": "연구자 휴게실", "area": 33, "status": "사용 가능", "features": "소파"}, {"id": "B131", "x": 223, "y": 455, "w": 75, "h": 75, "type": "office", "label": "B131", "name": "지하 로봇 작업장", "area": 56, "status": "작업 중", "features": "용접대"}, {"id": "B130", "x": 223, "y": 531, "w": 75, "h": 45, "type": "office", "label": "B130", "name": "목공 제작실", "area": 33, "status": "사용 가능", "features": "직소기"}, {"id": "B129", "x": 223, "y": 577, "w": 75, "h": 55, "type": "office", "label": "B129", "name": "도장 및 세척실", "area": 41, "status": "환기 중", "features": "스프레이 부스"}, {"id": "B128", "x": 223, "y": 633, "w": 75, "h": 50, "type": "office", "label": "B128", "name": "부품 조립실", "area": 37, "status": "사용 가능", "features": "작업대"}, {"id": "B126", "x": 235, "y": 700, "w": 30, "h": 30, "type": "office", "label": "B126", "name": "방재 창고", "area": 9, "status": "비상용", "features": "소화기"}, {"id": "B127", "x": 267, "y": 700, "w": 30, "h": 30, "type": "office", "label": "B127", "name": "청소 용품실", "area": 9, "status": "사용 가능", "features": "세척 대야"}], "corridors": [{"x": 128, "y": 123, "w": 416, "h": 46}, {"x": 168, "y": 164, "w": 64, "h": 571}, {"x": 515, "y": 23, "w": 30, "h": 149}, {"x": 132, "y": 23, "w": 90, "h": 107, "rotation": 0}, {"x": 212, "y": 334, "w": 93, "h": 74, "rotation": 0}, {"x": 229, "y": 684, "w": 69, "h": 20, "rotation": 0}, {"x": 198, "y": 732, "w": 37, "h": 36, "rotation": 0}, {"x": 494, "y": 168, "w": 102, "h": 149, "rotation": 0}, {"x": 583, "y": 225, "w": 58, "h": 43, "rotation": 0}, {"x": 350, "y": 350, "w": 180, "h": 30, "rotation": 0}], "roads": [{"points": [[204, 152], [530, 150], [531, 248]]}, {"points": [[206, 152], [201, 712]]}], "atriums": [{"x": 305, "y": 241, "w": 151, "h": 167, "isGridTerrace": true, "label": "야외 공터 / 중정", "rotation": 0}, {"x": 455, "y": 316, "w": 67, "h": 90, "isGridTerrace": true, "label": "야외 공터 / 중정", "rotation": 0}], "decorators": [{"type": "stairs", "x": 598, "y": 266, "w": 45, "h": 60}, {"type": "stairs", "x": 151, "y": 711, "w": 37, "h": 75, "rotation": 90}, {"type": "elevator", "shaftId": "shaft_1786162453766", "x": 241, "y": 304, "w": 30, "h": 30, "rotation": 0, "startFloor": "B1", "endFloor": "4"}, {"type": "elevator", "shaftId": "shaft_1786162651262", "x": 460, "y": 166, "w": 40, "h": 40, "rotation": 0, "startFloor": "B1", "endFloor": "6"}, {"type": "elevator", "shaftId": "shaft_1786162663840", "x": 460, "y": 207, "w": 40, "h": 40, "rotation": 0, "startFloor": "B1", "endFloor": "6"}, {"type": "stairs", "x": 284, "y": 312, "w": 30, "h": 49, "rotation": 270}, {"type": "gate", "x": 97, "y": 324, "w": 111, "h": 58, "rotation": 90}, {"type": "exit_door", "x": 98, "y": 132, "w": 33, "h": 33, "rotation": 180}, {"type": "exit_door", "x": 515, "y": -6, "w": 30, "h": 26, "rotation": 180}, {"type": "door", "x": 300, "y": 373, "w": 35, "h": 35, "rotation": 0}, {"type": "door_brick", "name": "미가시 통행 문 브릭", "x": 151, "y": 266, "w": 41, "h": 20, "rotation": 0}, {"type": "door_brick", "name": "미가시 통행 문 브릭", "x": 557, "y": 154, "w": 20, "h": 25, "rotation": 0}], "walls": []}};

    // ── 실시간 미리보기 상태 (사이드바 슬라이더 조종용, 저장 전 임시값) ──
    window._technoLive = null; // 저장 전 임시 오버라이드 값

    // 기본 지도 중심 및 스케일 변환 파라미터 (개발자 설정 → 실시간 임시값 우선 적용)
    function getDevConfig() {
        let cfg = {
            opacity: 0.85,
            centerLat: 36.146361,
            centerLon: 128.394600,
            scaleLon: 0.00000115,
            scaleLat: 0.00000095,
            rotation: 0
        };
        try {
            const saved = localStorage.getItem('gumap_developer_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.INDOOR_OPACITY)     cfg.opacity    = parseFloat(parsed.INDOOR_OPACITY);
                if (parsed.INDOOR_CENTER_LAT)  cfg.centerLat  = parseFloat(parsed.INDOOR_CENTER_LAT);
                if (parsed.INDOOR_CENTER_LON)  cfg.centerLon  = parseFloat(parsed.INDOOR_CENTER_LON);
                if (parsed.INDOOR_SCALE_LON)   cfg.scaleLon   = parseFloat(parsed.INDOOR_SCALE_LON);
                if (parsed.INDOOR_SCALE_LAT)   cfg.scaleLat   = parseFloat(parsed.INDOOR_SCALE_LAT);
                if (parsed.INDOOR_ROTATION)    cfg.rotation   = parseFloat(parsed.INDOOR_ROTATION);
            }
        } catch(e) {}
        // 실시간 임시 오버라이드 (슬라이더 조종 중)
        if (window._technoLive) {
            Object.assign(cfg, window._technoLive);
        }
        return cfg;
    }

    const CX = 445;
    const CY = 395;

    // 픽셀 좌표 -> [위도, 경도] 변환 함수 (회전 행렬 적용)
    function pxToLatLng(x, y) {
        const cfg = getDevConfig();
        const rad = (cfg.rotation || 0) * Math.PI / 180;

        // 픽셀 중심 기준 오프셋
        let dx = (x - CX) * cfg.scaleLon;
        let dy = (y - CY) * cfg.scaleLat;

        // 회전 행렬 적용 (반시계가 양수 회전 방향)
        const rx =  dx * Math.cos(rad) + dy * Math.sin(rad);
        const ry = -dx * Math.sin(rad) + dy * Math.cos(rad);

        const lon = cfg.centerLon + rx;
        const lat = cfg.centerLat - ry;
        return [lat, lon];
    }

    // ── 사이드바 슬라이더가 호출하는 실시간 미리보기 함수 ──
    window.technoLiveAdjust = function(key, value) {
        if (!window._technoLive) window._technoLive = {};
        window._technoLive[key] = parseFloat(value);
        // opacity 처리는 별도
        if (key === 'opacity') {
            window.technoB1Opacity = parseFloat(value);
        }
        window.renderTechnoB1Floor();
    };

    // ── 현재 실시간 값을 localStorage에 영구 저장 ──
    window.technoSaveConfig = function() {
        const live = window._technoLive || {};
        const cfg = getDevConfig();

        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('gumap_developer_config') || '{}'); } catch(e) {}

        // 현재 UI 값을 덮어쓰기
        saved.INDOOR_OPACITY    = String(live.opacity    !== undefined ? live.opacity    : cfg.opacity);
        saved.INDOOR_SCALE_LON  = String(live.scaleLon   !== undefined ? live.scaleLon   : cfg.scaleLon);
        saved.INDOOR_SCALE_LAT  = String((live.scaleLon  !== undefined ? live.scaleLon   : cfg.scaleLon) * 0.826);
        saved.INDOOR_CENTER_LAT = String(live.centerLat  !== undefined ? live.centerLat  : cfg.centerLat);
        saved.INDOOR_CENTER_LON = String(live.centerLon  !== undefined ? live.centerLon  : cfg.centerLon);
        saved.INDOOR_ROTATION   = String(live.rotation   !== undefined ? live.rotation   : cfg.rotation);

        localStorage.setItem('gumap_developer_config', JSON.stringify(saved));

        // 임시 오버라이드 초기화 (저장됐으므로 getDevConfig가 localStorage에서 읽음)
        window._technoLive = null;

        if (window.showToast) window.showToast('✅ 실내지도 위치/크기/회전 설정이 저장되었습니다!');
    };

    // 글로벌 전역 상태
    window.technoB1LayerGroup = L.layerGroup();
    window.technoB1ActiveFloor = 'B1F';
    window.technoB1Opacity = getDevConfig().opacity;

    // 실내 지도 초기화 함수
    window.initTechnoBuildingB1Map = function() {
        if (!window.map) return;

        // B1F 실내 레이어 구성
        renderTechnoB1Floor();

        // 층별 UI 컨트롤러 생성
        createIndoorFloorControllerUI();

        // 줌 및 이동 시 가시성 이벤트 바인딩
        window.map.on('zoomend moveend', checkTechnoBuildingVisibility);
        checkTechnoBuildingVisibility();
    };

    // B1F 실내 레이어 렌더링
    window.renderTechnoB1Floor = function() {
        window.technoB1LayerGroup.clearLayers();
        const data = window.technoB1RawData.data;
        const cfg = getDevConfig();
        const currentOpacity = window.technoB1Opacity !== undefined ? window.technoB1Opacity : cfg.opacity;

        // ── 헬퍼: 픽셀 사각형 x,y,w,h → 회전이 적용된 4꼭짓점 polygon 좌표 ──
        // L.rectangle 대신 반드시 이 함수를 사용해야 회전이 올바르게 적용됨
        function rectPoly(x, y, w, h) {
            return [
                pxToLatLng(x,     y),
                pxToLatLng(x + w, y),
                pxToLatLng(x + w, y + h),
                pxToLatLng(x,     y + h)
            ];
        }

        // 1. 외곽선 (Outer Contour) 렌더링
        if (data.outerContour) {
            const coords = parseSvgPathToLatLng(data.outerContour);
            if (coords.length > 0) {
                const outerPoly = L.polygon(coords, {
                    color: '#6366f1',
                    weight: 3,
                    fillColor: '#312e81',
                    fillOpacity: 0.35 * currentOpacity,
                    dashArray: '4, 4',
                    className: 'techno-outer-contour'
                });
                outerPoly.bindTooltip("🏫 금오공과대학교 테크노관 (외곽선)", { permanent: false, direction: 'top' });
                window.technoB1LayerGroup.addLayer(outerPoly);
            }
        }

        // 2. 복도 (Corridors) 렌더링 — rectPoly 사용으로 회전 적용
        if (data.corridors && data.corridors.length > 0) {
            data.corridors.forEach(c => {
                const corridorPoly = L.polygon(rectPoly(c.x, c.y, c.w, c.h), {
                    color: '#475569',
                    weight: 1,
                    fillColor: '#64748b',
                    fillOpacity: 0.25 * currentOpacity,
                    className: 'techno-corridor'
                });
                window.technoB1LayerGroup.addLayer(corridorPoly);
            });
        }

        // 3. 호실 (Rooms) 렌더링 — rectPoly 사용으로 회전 적용
        if (data.rooms && data.rooms.length > 0) {
            data.rooms.forEach(r => {
                // 호실 타입별 색상 설정
                let strokeColor = '#3b82f6';
                let fillColor = '#1e3a8a';
                if (r.name.includes('연습실') || r.name.includes('작업장') || r.name.includes('제작실')) {
                    strokeColor = '#ec4899';
                    fillColor = '#831843';
                } else if (r.name.includes('동아리')) {
                    strokeColor = '#8b5cf6';
                    fillColor = '#4c1d95';
                } else if (r.name.includes('창고') || r.name.includes('용품실')) {
                    strokeColor = '#64748b';
                    fillColor = '#1e293b';
                }

                const roomPoly = L.polygon(rectPoly(r.x, r.y, r.w, r.h), {
                    color: strokeColor,
                    weight: 1.5,
                    fillColor: fillColor,
                    fillOpacity: 0.65 * currentOpacity,
                    className: 'techno-room-rect'
                });

                // 방 클릭 팝업 디자인
                const popupContent = `
                    <div class="techno-room-popup" style="padding:10px; font-family:sans-serif; min-width:180px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="background:var(--primary-grad, #6366f1); color:white; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:800;">${r.label}</span>
                            <span style="font-size:11px; color:#10b981; font-weight:700;">● ${r.status || '사용 가능'}</span>
                        </div>
                        <h4 style="margin:0 0 6px 0; font-size:14px; color:var(--text-main, #f8fafc); font-weight:700;">${r.name}</h4>
                        <div style="font-size:11px; color:var(--text-muted, #94a3b8); line-height:1.5;">
                            <div>📐 면적: <b>${r.area || 20} m²</b></div>
                            <div>🛠️ 주요 설비: <b>${r.features || '일반 시설'}</b></div>
                            <div>📍 구역: 금오공대 테크노관 B1F</div>
                        </div>
                        <button onclick="window.routeToTechnoRoom('${r.id}')" style="margin-top:8px; width:100%; padding:6px; background:#6366f1; color:white; border:none; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;">🧭 여기까지 길찾기</button>
                    </div>
                `;
                roomPoly.bindPopup(popupContent);

                // 방 번호/이름 라벨 표시 (중심점)
                const centerPt = pxToLatLng(r.x + r.w / 2, r.y + r.h / 2);
                const labelMarker = L.marker(centerPt, {
                    icon: L.divIcon({
                        className: 'techno-room-label',
                        html: `<div style="font-size:10px; font-weight:800; color:#ffffff; text-shadow:0 0 3px #000; text-align:center; white-space:nowrap;">${r.label}<br><span style="font-size:9px; font-weight:500; opacity:0.85;">${r.name}</span></div>`,
                        iconSize: [60, 20],
                        iconAnchor: [30, 10]
                    })
                });

                window.technoB1LayerGroup.addLayer(roomPoly);
                window.technoB1LayerGroup.addLayer(labelMarker);
            });
        }

        // 4. 엘리베이터(🛗), 계단(🪜), 출입문 렌더링
        if (data.decorators && data.decorators.length > 0) {
            data.decorators.forEach(d => {
                const pt = pxToLatLng(d.x + (d.w || 30) / 2, d.y + (d.h || 30) / 2);
                let emoji = '🚪';
                let title = '출입문';
                if (d.type === 'elevator') { emoji = '🛗'; title = '엘리베이터 (B1F ~ ' + (d.endFloor || '4') + 'F)'; }
                else if (d.type === 'stairs') { emoji = '🪜'; title = '비상계단 / 주계단'; }

                const decMarker = L.marker(pt, {
                    icon: L.divIcon({
                        className: 'techno-decorator-marker',
                        html: `<div style="font-size:14px; background:rgba(15,23,42,0.85); border:1px solid #6366f1; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 6px rgba(99,102,241,0.5);" title="${title}">${emoji}</div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                });
                decMarker.bindTooltip(title);
                window.technoB1LayerGroup.addLayer(decMarker);
            });
        }
    };

    // SVG Path 파서
    function parseSvgPathToLatLng(pathStr) {
        const coords = [];
        const matches = pathStr.match(/([ML])\s*([\d\.-]+)\s*,\s*([\d\.-]+)/gi);
        if (!matches) return coords;
        matches.forEach(m => {
            const parts = m.trim().replace(/[ML]/i, '').split(',');
            if (parts.length === 2) {
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                coords.push(pxToLatLng(x, y));
            }
        });
        return coords;
    }

    // 층별 UI 컨트롤러
    function createIndoorFloorControllerUI() {
        if (document.getElementById('indoor-floor-controller')) return;

        const container = document.createElement('div');
        container.id = 'indoor-floor-controller';
        container.className = 'glass-panel';
        container.style.cssText = `
            position: absolute;
            right: 15px;
            bottom: 120px;
            z-index: 1000;
            padding: 10px;
            border-radius: 12px;
            display: none;
            flex-direction: column;
            gap: 8px;
            width: 210px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-panel, rgba(255,255,255,0.15));
            background: var(--bg-panel, rgba(15, 23, 42, 0.85));
            backdrop-filter: blur(12px);
            transition: all 0.3s ease;
        `;

        const cfg = getDevConfig();

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
                <span style="font-size:12px; font-weight:800; color:var(--text-main, #f8fafc); display:flex; align-items:center; gap:4px;">
                    🏫 테크노관 실내지도
                </span>
                <span style="font-size:10px; color:#10b981; font-weight:700;">● B1F 활성</span>
            </div>
            
            <div style="font-size:11px; color:var(--text-muted, #94a3b8); margin-bottom:2px;">층수 선택 (Floor Selector)</div>
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px;">
                <button class="floor-btn active" data-floor="B1F" style="padding:6px 0; font-size:11px; font-weight:800; border-radius:6px; border:1px solid #6366f1; background:#6366f1; color:white; cursor:pointer;">B1F</button>
                <button class="floor-btn" data-floor="1F" style="padding:6px 0; font-size:11px; font-weight:700; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:var(--text-main); cursor:pointer;">1F</button>
                <button class="floor-btn" data-floor="2F" style="padding:6px 0; font-size:11px; font-weight:700; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:var(--text-main); cursor:pointer;">2F</button>
                <button class="floor-btn" data-floor="3F" style="padding:6px 0; font-size:11px; font-weight:700; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:var(--text-main); cursor:pointer;">3F</button>
            </div>

            <!-- 실내 시설 검색 -->
            <div style="margin-top:4px;">
                <input type="text" id="indoor-room-search" placeholder="🔍 호실/연습실/동아리 검색..." style="width:100%; padding:6px 8px; font-size:11px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.2); color:white; box-sizing:border-box;">
            </div>

            <!-- 투명도/밝기 조절 -->
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:var(--text-muted); margin-top:2px;">
                <span>밝기/투명도</span>
                <input type="range" id="indoor-opacity-slider" min="0.2" max="1.0" step="0.05" value="${cfg.opacity}" style="width:110px; cursor:pointer;">
            </div>
        `;

        document.body.appendChild(container);

        // 이벤트 바인딩
        const floorBtns = container.querySelectorAll('.floor-btn');
        floorBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                floorBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'rgba(255,255,255,0.05)';
                    b.style.borderColor = 'rgba(255,255,255,0.15)';
                    b.style.color = 'var(--text-main)';
                });
                this.classList.add('active');
                this.style.background = '#6366f1';
                this.style.borderColor = '#6366f1';
                this.style.color = 'white';

                const targetFloor = this.getAttribute('data-floor');
                window.technoB1ActiveFloor = targetFloor;
                
                if (targetFloor === 'B1F') {
                    if (!window.map.hasLayer(window.technoB1LayerGroup)) {
                        window.technoB1LayerGroup.addTo(window.map);
                    }
                    if (window.showToast) window.showToast('🏫 금오공대 테크노관 지하 1층(B1F) 실내지도가 전환되었습니다.');
                } else {
                    if (window.map.hasLayer(window.technoB1LayerGroup)) {
                        window.technoB1LayerGroup.remove();
                    }
                    if (window.showToast) window.showToast(`🏫 테크노관 ${targetFloor} 레이어 준비 중입니다.`);
                }
            });
        });

        // 투명도 슬라이더
        const opacitySlider = document.getElementById('indoor-opacity-slider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', function() {
                window.technoB1Opacity = parseFloat(this.value);
                window.renderTechnoB1Floor();
            });
        }

        // 호실 검색 필터
        const searchInput = document.getElementById('indoor-room-search');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const q = this.value.trim().toLowerCase();
                if (!q) return;
                const rooms = window.technoB1RawData.data.rooms;
                const matched = rooms.find(r => r.name.toLowerCase().includes(q) || r.label.toLowerCase().includes(q));
                if (matched) {
                    const pt = pxToLatLng(matched.x + matched.w/2, matched.y + matched.h/2);
                    window.map.flyTo(pt, 19, { duration: 1 });
                }
            });
        }
    }

    // 지도 줌/위치 변화 시 가시성 감지
    function checkTechnoBuildingVisibility() {
        if (!window.map) return;
        const zoom = window.map.getZoom();
        const center = window.map.getCenter();
        const controller = document.getElementById('indoor-floor-controller');
        const cfg = getDevConfig();

        // 테크노관 중심부 근처인지 확인
        const dist = window.map.distance(center, [cfg.centerLat, cfg.centerLon]);
        
        // 줌레벨 15 이상 & 테크노관 1000m 이내 진입 시 표출
        if (zoom >= 15 && dist <= 1000) {
            if (controller) controller.style.display = 'flex';
            if (window.technoB1ActiveFloor === 'B1F' && !window.map.hasLayer(window.technoB1LayerGroup)) {
                window.technoB1LayerGroup.addTo(window.map);
            }
        } else {
            if (controller) controller.style.display = 'none';
            if (window.map.hasLayer(window.technoB1LayerGroup)) {
                window.technoB1LayerGroup.remove();
            }
        }
    }

    // 호실 길찾기 연동 헬퍼
    window.routeToTechnoRoom = function(roomId) {
        const rooms = window.technoB1RawData.data.rooms;
        const room = rooms.find(r => r.id === roomId);
        if (!room) return;
        const pt = pxToLatLng(room.x + room.w/2, room.y + room.h/2);
        
        // 검색창 및 길찾기 도착지로 입력
        const endInput = document.getElementById('search-end') || document.getElementById('search-input');
        if (endInput) {
            endInput.value = `금오공대 테크노관 ${room.label} (${room.name})`;
        }
        if (window.showToast) window.showToast(`🎯 도착지로 설정됨: ${room.name} (${room.label})`);
        
        if (typeof window.openRouteDetailPanel === 'function') {
            window.openRouteDetailPanel();
        }
    };

})();
