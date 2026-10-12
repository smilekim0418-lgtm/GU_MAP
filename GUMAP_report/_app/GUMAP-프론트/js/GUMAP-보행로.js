/**
 * 🚶 실외 도보 & 다층 보행로 (계단/평지/층수/묶음) 커스텀 샌드박스 모듈
 * (MaaS 정책 연구소 탭 연동 및 실외 층수/계단/묶음 그룹화 지원)
 */

(function() {
    'use strict';

    // 전역 상태
    window.outdoorWalkways = [];
    window.outdoorLayerGroup = L.layerGroup();
    window.currentWalkwayDraft = [];
    window.isOutdoorDrawActive = false;
    window.tempDrawPolyline = null;
    window.selectedGroupFilter = 'ALL';

    // 저장된 보행로 데이터 로드
    function loadSavedWalkways() {
        try {
            const saved = localStorage.getItem('gumap_outdoor_walkways');
            if (saved) {
                window.outdoorWalkways = JSON.parse(saved);
            }
        } catch(e) {
            window.outdoorWalkways = [];
        }
    }

    // 모듈 초기화
    window.initOutdoorWalkwayModule = function() {
        if (!window.map) return;

        loadSavedWalkways();
        window.outdoorLayerGroup.addTo(window.map);
        renderOutdoorWalkways();

        // 지점 클릭 시 작도 이벤트 바인딩
        window.map.on('click', handleOutdoorMapClick);
    };

    // 지점 클릭 작도 이벤트
    function handleOutdoorMapClick(e) {
        if (!window.isOutdoorDrawActive) return;

        const latlng = [e.latlng.lat, e.latlng.lng];
        window.currentWalkwayDraft.push(latlng);

        if (window.tempDrawPolyline) {
            window.tempDrawPolyline.setLatLngs(window.currentWalkwayDraft);
        } else {
            window.tempDrawPolyline = L.polyline(window.currentWalkwayDraft, {
                color: '#6366f1',
                weight: 4,
                dashArray: '6, 6'
            }).addTo(window.map);
        }

        const countEl = document.getElementById('outdoor-point-count');
        if (countEl) countEl.innerText = window.currentWalkwayDraft.length;
        if (window.showToast) window.showToast(`📍 도보 노드 추가됨 (${window.currentWalkwayDraft.length}개 지점)`);
    }

    // 작도 시작
    window.startOutdoorDrawing = function() {
        window.isOutdoorDrawActive = true;
        window.currentWalkwayDraft = [];
        if (window.tempDrawPolyline) {
            window.tempDrawPolyline.remove();
            window.tempDrawPolyline = null;
        }
        const btnStart = document.getElementById('btn-outdoor-draw-start');
        const btnFinish = document.getElementById('btn-outdoor-draw-finish');
        if (btnStart) btnStart.style.display = 'none';
        if (btnFinish) btnFinish.style.display = 'inline-block';
        if (window.showToast) window.showToast("🚶 지도 위를 연속 클릭하여 도보 보행로 노선을 작도하세요!");
    };

    // 작도 완료 및 묶음/층수 지정 모달/패널 팝업
    window.finishOutdoorDrawing = function() {
        if (window.currentWalkwayDraft.length < 2) {
            alert("보행로 작도를 위해 최소 2개 이상의 지점을 클릭해 주세요!");
            return;
        }

        window.isOutdoorDrawActive = false;
        const btnStart = document.getElementById('btn-outdoor-draw-start');
        const btnFinish = document.getElementById('btn-outdoor-draw-finish');
        if (btnStart) btnStart.style.display = 'inline-block';
        if (btnFinish) btnFinish.style.display = 'none';

        // 속성 지정 팝업
        const groupName = prompt("📌 이 보행로 묶음(그룹)의 이름을 입력하세요:", "테크노관 외부 연결선 묶음") || "실외 보행로 묶음";
        const typeSelect = document.getElementById('outdoor-type-select');
        const floorSelect = document.getElementById('outdoor-floor-select');

        const segmentType = typeSelect ? typeSelect.value : "flat";
        const floorLevel = floorSelect ? floorSelect.value : "1F";

        const newSegment = {
            id: 'walk_' + Date.now(),
            groupName: groupName,
            type: segmentType, // 'flat', 'stairs', 'ramp', 'bridge'
            floor: floorLevel, // '1F', '2F', '3F', 'B1F'
            points: window.currentWalkwayDraft,
            createdAt: new Date().toISOString()
        };

        window.outdoorWalkways.push(newSegment);
        saveOutdoorWalkways();

        // 초기화 및 렌더링
        if (window.tempDrawPolyline) {
            window.tempDrawPolyline.remove();
            window.tempDrawPolyline = null;
        }
        window.currentWalkwayDraft = [];

        renderOutdoorWalkways();
        updateOutdoorGroupListUI();
        if (window.showToast) window.showToast(`✅ 보행로 묶음 '${groupName}' (${floorLevel}) 지정 저장 완료!`);
    };

    // 보행로 렌더링
    function renderOutdoorWalkways() {
        window.outdoorLayerGroup.clearLayers();

        window.outdoorWalkways.forEach(w => {
            if (window.selectedGroupFilter !== 'ALL' && w.groupName !== window.selectedGroupFilter) {
                return;
            }

            let color = '#3b82f6';
            let dashArray = null;
            let labelEmoji = '🚶';

            if (w.type === 'stairs') {
                color = '#f97316';
                dashArray = '8, 8';
                labelEmoji = '🪜';
            } else if (w.type === 'bridge' || w.floor === '2F' || w.floor === '3F') {
                color = '#a855f7';
                labelEmoji = '🌉';
            } else if (w.type === 'ramp') {
                color = '#10b981';
                labelEmoji = '♿';
            }

            const polyline = L.polyline(w.points, {
                color: color,
                weight: 5,
                dashArray: dashArray,
                opacity: 0.85
            });

            const popupContent = `
                <div style="padding:8px; font-family:sans-serif; min-width:160px;">
                    <div style="font-size:10px; font-weight:800; color:#a855f7; margin-bottom:4px;">${labelEmoji} 실외 보행 묶음</div>
                    <h4 style="margin:0 0 4px 0; font-size:13px; color:var(--text-main, #fff); font-weight:700;">${w.groupName}</h4>
                    <div style="font-size:11px; color:var(--text-muted, #94a3b8); line-height:1.5;">
                        <div>🏢 층수: <b>${w.floor}</b></div>
                        <div>🛠️ 유형: <b>${getSegmentTypeName(w.type)}</b></div>
                        <div>📍 지점 수: <b>${w.points.length}개</b></div>
                    </div>
                    <button onclick="window.deleteOutdoorSegment('${w.id}')" style="margin-top:6px; width:100%; padding:4px; background:#ef4444; color:white; border:none; border-radius:4px; font-weight:700; font-size:10px; cursor:pointer;">❌ 이 묶음 삭제</button>
                </div>
            `;
            polyline.bindPopup(popupContent);
            window.outdoorLayerGroup.addLayer(polyline);

            // 층수 및 묶음 뱃지 마커
            if (w.points.length > 0) {
                const midPt = w.points[Math.floor(w.points.length / 2)];
                const badgeMarker = L.marker(midPt, {
                    icon: L.divIcon({
                        className: 'outdoor-badge-icon',
                        html: `<div style="background:rgba(15,23,42,0.85); color:white; border:1px solid ${color}; border-radius:6px; padding:2px 6px; font-size:10px; font-weight:800; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.4);">${labelEmoji} ${w.groupName} [${w.floor}]</div>`,
                        iconSize: [80, 20],
                        iconAnchor: [40, 10]
                    })
                });
                window.outdoorLayerGroup.addLayer(badgeMarker);
            }
        });
    }

    function getSegmentTypeName(type) {
        if (type === 'stairs') return '계단 🪜';
        if (type === 'ramp') return '경사로 ♿';
        if (type === 'bridge') return '구름다리/덱 🌉';
        return '평지 🚶';
    }

    // 묶음 삭제
    window.deleteOutdoorSegment = function(id) {
        window.outdoorWalkways = window.outdoorWalkways.filter(w => w.id !== id);
        saveOutdoorWalkways();
        renderOutdoorWalkways();
        updateOutdoorGroupListUI();
        if (window.showToast) window.showToast("🗑️ 보행로 묶음이 삭제되었습니다.");
    };

    // 로컬 저장
    function saveOutdoorWalkways() {
        localStorage.setItem('gumap_outdoor_walkways', JSON.stringify(window.outdoorWalkways));
    }

    // 묶음 리스트 UI 업데이트
    function updateOutdoorGroupListUI() {
        const listEl = document.getElementById('outdoor-group-list');
        if (!listEl) return;

        if (window.outdoorWalkways.length === 0) {
            listEl.innerHTML = `<div style="font-size:10px; color:var(--text-muted); text-align:center; padding:8px;">등록된 실외 보행 묶음이 없습니다.</div>`;
            return;
        }

        let html = '';
        window.outdoorWalkways.forEach(w => {
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:4px 6px; border-radius:4px; font-size:11px; margin-bottom:4px;">
                    <div>
                        <b style="color:var(--text-main);">${w.groupName}</b>
                        <span style="color:#a855f7; font-weight:700; margin-left:4px;">[${w.floor}]</span>
                        <span style="font-size:9px; color:var(--text-muted);">(${getSegmentTypeName(w.type)})</span>
                    </div>
                    <button onclick="window.deleteOutdoorSegment('${w.id}')" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer; font-size:11px;">✕</button>
                </div>
            `;
        });
        listEl.innerHTML = html;
    }

})();
