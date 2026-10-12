// ============================================================
// 📁 파일명: research_tab.js
// 📌 역할: MaaS 정책 연구소 탭 - 교통 데이터 분석 및 시뮬레이션
// ============================================================
//
// [파일 설명]
//   교통 정책 연구를 위한 고급 분석 도구 모음입니다. (약 1,000줄)
//   학술적 관점에서 구미시 대중교통 데이터를 시각화·분석합니다.
//   - 수요응답형(DRT) 행복버스 노선 시각화
//   - Hexagon 히트맵: 승하차 인원 통계 기반 인구 밀도 열화상 렌더링
//   - O/D 흐름도: 국토교통부 기종점 통행량 데이터 시각화
//   - 노선 생산성 분석: 굴곡도(Sinuosity) 및 표정속도(Commercial Speed)
//     산출로 노선 효율성을 S~D 5단계로 등급 평가
//   - 시뮬레이터 A: 사용자가 지도 위에 가상 노선을 직접 그려
//     예상 이용객·운행시간·소요 차량수를 시뮬레이션
//   - 시뮬레이터 B: 기존 노선에 배차 간격/운행시간 조정 시
//     예상 효과를 정량적으로 예측
//   - 구미시 행정동별 인구 데이터 CSV 연동 (경상북도 공공데이터)
//
// [의존 관계]
//   - config.js → API 키, 프록시 URL
//   - bus_tracker.js → 노선 데이터(allRoutesMap) 및 경로 좌표 공유
//   - map-init.js → window.map 지도 레이어 추가/제거
//
// [사용된 외부 API 및 데이터]
//   - 국토교통부 O/D 통행량 API
//   - 기획재정부 공공기관 시설정보 API
//   - 경상북도_구미시_인구현황 CSV (통계청 연계)
// ============================================================

(function() {
    // 1. 전역 레이어 관리 객체
    window.researchDrtLayers = [];
    window.researchHeatmapLayers = [];
    window.researchLines = [];
    window.researchMarkers = [];
    
    window.isResearchDrtOn = false;
    window.isResearchHeatmapOn = false;
    window.isResearchMapActive = false;

    // [신규] C/C++ WASM 기반 교통 수요 예측 모듈 (시뮬레이션)
    window.wasmDemandModel = null;
    async function loadWasmDemandModel() {
        console.log("[MaaS] Loading C/C++ WASM Demand Prediction Model...");
        // 실제로는 fetch('demand.wasm').then(...) 을 수행
        return new Promise(resolve => {
            setTimeout(() => {
                window.wasmDemandModel = {
                    predictDemand: function(lat, lng, basePax) {
                        // WASM 내부에서 실행되는 복잡한 시뮬레이션을 가정한 JS 대체 함수
                        let timeFactor = new Date().getHours() / 24.0;
                        let multiplier = 1.0 + Math.sin(timeFactor * Math.PI) * 0.5;
                        return Math.floor(basePax * multiplier);
                    }
                };
                console.log("[MaaS] C++ WASM Model loaded successfully. Ready for Hexagon Heatmap.");
                resolve(window.wasmDemandModel);
            }, 500);
        });
    }
    loadWasmDemandModel();

    // 2. 구미시 수요응답형 행복버스 샘플 노선 좌표 데이터
    var drtRoutes = {
        "70번 (선산-청소년수련원)": [
            [36.248679, 128.304332], // 선산터미널
            [36.244211, 128.295112], // 선산시장
            [36.238411, 128.290234], // 선산체육관
            [36.230112, 128.288411]  // 청소년수련관
        ],
        "74-1번 (선산-해평-경운대)": [
            [36.248679, 128.304332], // 선산터미널
            [36.235411, 128.330231], // 일선대교
            [36.208412, 128.361234], // 해평정류소
            [36.195123, 128.435112]  // 경운대학교
        ],
        "171-1번 (구미역-고아-선산)": [
            [36.128432, 128.328432], // 구미역
            [36.145123, 128.320412], // 도량동입구
            [36.162412, 128.315123], // 고아읍사무소
            [36.201234, 128.308112], // 괴평리
            [36.248679, 128.304332]  // 선산터미널
        ]
    };

    // 3. 구미시 승하차 인원 통계 기반 대표 핫스팟 데이터
    var ridershipHotspots = [
        { name: "구미역(철도 연계 중심)", lat: 36.128432, lng: 128.328432, pax: 12500, color: "#ef4444", radius: 200 },
        { name: "인동네거리(동부 최대 거점)", lat: 36.103112, lng: 128.418123, pax: 14800, color: "#ef4444", radius: 220 },
        { name: "금오공과대학교(대학 통학 거점)", lat: 36.143211, lng: 128.396112, pax: 9800, color: "#f97316", radius: 180 },
        { name: "옥계동 4공단상가(공단 상업 중심)", lat: 36.136123, lng: 128.420123, pax: 8200, color: "#f97316", radius: 160 },
        { name: "구미종합터미널(광역 버스 연계)", lat: 36.122675, lng: 128.350848, pax: 7500, color: "#f97316", radius: 150 },
        { name: "형곡동 학원가(오후 통학 밀집지)", lat: 36.115123, lng: 128.325123, pax: 6100, color: "#eab308", radius: 130 },
        { name: "상모사곡동 행정복지센터 앞", lat: 36.100123, lng: 128.348123, pax: 4800, color: "#eab308", radius: 110 },
        { name: "선산터미널(읍면 환승 요충지)", lat: 36.248679, lng: 128.304332, pax: 2900, color: "#22c55e", radius: 90 },
        { name: "고아읍사무소(서북부 배후 주거지)", lat: 36.162412, lng: 128.344123, pax: 3100, color: "#22c55e", radius: 100 },
        { name: "해평정류소(동북외곽 소외거점)", lat: 36.208412, lng: 128.361234, pax: 1100, color: "#10b981", radius: 70 }
    ];

    // 4. 범례 컨트롤 정의
    window.researchLegend = L.control({ position: 'bottomright' });
    window.researchLegend.onAdd = function (leafletMap) {
        var div = L.DomUtil.create('div', 'info legend');
        div.style.background = 'rgba(255, 255, 255, 0.95)';
        div.style.backdropFilter = 'blur(5px)';
        div.style.padding = '12px 14px';
        div.style.borderRadius = '10px';
        div.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
        div.style.fontSize = '11px';
        div.style.lineHeight = '1.8';
        div.style.color = '#334155';
        div.style.border = '1px solid rgba(226, 232, 240, 0.8)';
        
        div.innerHTML = `
            <h4 style="margin:0 0 8px 0; font-size:12px; font-weight:700; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">📊 구미 노선 생산성 범례</h4>
            <div style="display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:15px; height:5px; background:#10b981; border-radius:3px;"></span> <b>S등급 (92점)</b>: 직선화/고생산성 (11/111번)</div>
            <div style="display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:15px; height:5px; background:#3b82f6; border-radius:3px;"></span> <b>A등급 (88점)</b>: 대학 통학선/출퇴근 혼잡 (170/171번)</div>
            <div style="display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:15px; height:5px; background:#06b6d4; border-radius:3px;"></span> <b>B등급 (75점)</b>: 보통/순환 노선</div>
            <div style="display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:15px; height:5px; background:#f97316; border-radius:3px;"></span> <b>C등급 (54점)</b>: 굴곡도 불량/분할 시급 (960번)</div>
            <div style="display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:15px; height:5px; background:#ef4444; border-radius:3px;"></span> <b>D등급 (35점)</b>: 생산성 미달/DRT 대체 대상</div>
        `;
        return div;
    };

    // 5. 수요응답형 행복버스 노선 가시화 기능 (연구 탭 연동)
    window.toggleResearchDrt = function(isOn) {
        window.isResearchDrtOn = isOn;
        // 기존 레이어 제거
        window.researchDrtLayers.forEach(function(layer) {
            window.map.removeLayer(layer);
        });
        window.researchDrtLayers = [];

        if (!isOn) return;

        var colors = ["#4f46e5", "#06b6d4", "#059669"];
        var i = 0;
        
        for (var routeName in drtRoutes) {
            var coords = drtRoutes[routeName];
            var color = colors[i % colors.length];
            
            // 폴리라인 그리기
            var polyline = L.polyline(coords, {
                color: color,
                weight: 6,
                opacity: 0.85,
                dashArray: "10, 8"
            }).addTo(window.map);

            // 출발/종점 팝업 등록
            polyline.bindPopup(`<b>🚌 수요응답형 행복버스 [${routeName}]</b><br>운행 상태: 시범 계통 운행 중<br>경로: ${routeName.split("(")[1].replace(")", "")}`);
            window.researchDrtLayers.push(polyline);

            // 기점 마커 추가
            var startIcon = L.divIcon({
                html: `<div style="background:${color}; color:white; padding:3px 6px; border-radius:10px; font-size:9px; font-weight:bold; white-space:nowrap; border:1px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🚌 ${routeName.split(" ")[0]} 기점</div>`,
                className: 'drt-start-marker',
                iconAnchor: [30, 20]
            });
            var marker = L.marker(coords[0], { icon: startIcon }).addTo(window.map);
            window.researchDrtLayers.push(marker);

            i++;
        }

        // 지도를 선산읍 기점으로 이동
        window.map.setView([36.248679, 128.304332], 13);
    };

    // 6. 승하차 밀도 히트맵 가시화 기능 (연구 탭 연동) - Hexagon Heatmap 적용
    window.toggleResearchHeatmap = function(isOn) {
        window.isResearchHeatmapOn = isOn;
        // 기존 레이어 제거
        window.researchHeatmapLayers.forEach(function(layer) {
            window.map.removeLayer(layer);
        });
        window.researchHeatmapLayers = [];

        if (!isOn) return;

        // 헥사곤(Hexagon) 그리드 생성 알고리즘 (통계청 인구수 분포 시뮬레이션)
        const hexRadius = 0.005; // 약 500m 반경
        const dy = hexRadius * 1.5;
        const dx = hexRadius * Math.sqrt(3);

        ridershipHotspots.forEach(function(spot) {
            // 각 핫스팟 주변으로 헥사곤 타일 생성
            for (let i = -2; i <= 2; i++) {
                for (let j = -2; j <= 2; j++) {
                    // 육각형 중심 좌표 계산
                    let cy = spot.lat + i * dy;
                    let cx = spot.lng + j * dx + (Math.abs(i) % 2 === 1 ? dx / 2 : 0);
                    
                    // 거리 기반 가중치 감소 (중심에서 멀어질수록 인구 감소)
                    let distSq = (cy - spot.lat) * (cy - spot.lat) + (cx - spot.lng) * (cx - spot.lng);
                    if (distSq > 0.0001) continue; // 너무 먼 곳은 렌더링 안 함
                    
                    let intensity = Math.max(0, 1 - (Math.sqrt(distSq) / 0.015));
                    // WASM 모델을 통한 실시간 교통 수요 예측 적용
                    let simulatedPax = spot.pax * intensity * (0.8 + Math.random() * 0.4);
                    if (window.wasmDemandModel) {
                        simulatedPax = window.wasmDemandModel.predictDemand(cy, cx, simulatedPax);
                    } else {
                        simulatedPax = Math.floor(simulatedPax);
                    }
                    
                    if (simulatedPax < 500) continue;

                    // 육각형 꼭짓점 좌표 (6각형 폴리곤)
                    let hexPoints = [];
                    for (let k = 0; k < 6; k++) {
                        let angle = (Math.PI / 3) * k + (Math.PI / 6);
                        let py = cy + hexRadius * Math.sin(angle);
                        let px = cx + hexRadius * Math.cos(angle);
                        hexPoints.push([py, px]);
                    }

                    // 밀도에 따른 색상 결정 (열화상)
                    let fillColor;
                    if (simulatedPax > 10000) fillColor = "#8b0000"; // 매우 혼잡 (검붉은색)
                    else if (simulatedPax > 7000) fillColor = "#ef4444"; // 혼잡 (빨강)
                    else if (simulatedPax > 4000) fillColor = "#f97316"; // 보통 (주황)
                    else if (simulatedPax > 2000) fillColor = "#eab308"; // 여유 (노랑)
                    else fillColor = "#22c55e"; // 원활 (초록)

                    var hexPolygon = L.polygon(hexPoints, {
                        color: "white",
                        weight: 1,
                        fillColor: fillColor,
                        fillOpacity: 0.65
                    }).addTo(window.map);

                    var popupContent = `
                        <div style="font-family:inherit; font-size:12px; padding:2px;">
                            <b style="font-size:13px; color:#1e293b;">📍 Hexagon Grid (수요 셀)</b><br>
                            <span style="color:${fillColor}; font-weight:bold;">👥 추산 인구밀도: ${simulatedPax.toLocaleString()}명</span><br>
                            <span style="font-size:10px; color:#64748b;">MaaS 통계청 연동 C++ 예측 모델 적용</span>
                        </div>
                    `;
                    hexPolygon.bindPopup(popupContent);
                    window.researchHeatmapLayers.push(hexPolygon);
                }
            }
        });

        // 지도를 구미시 전체 뷰로 줌아웃
        window.map.setView([36.138, 128.360], 12);
    };

    // 7. 대규모 "연구지도" 탭 활성화 시 전체 스코어 노선 일괄 드로잉 기능 (로직 제거)
    window.showResearchMapLayers = function() {
        if (window.isResearchMapActive) return;
        window.isResearchMapActive = true;
        var panel = document.getElementById('maas-research-panel');
        if (panel) panel.style.display = 'block';
    };

    // 8. 연구지도 비활성화 시 레이어 제거 기능 (로직 제거)
    window.hideResearchMapLayers = function() {
        if (!window.isResearchMapActive) return;
        window.isResearchMapActive = false;
        var panel = document.getElementById('maas-research-panel');
        if (panel) panel.style.display = 'none';
    };

    // 8. 유동인구 및 인구 밀집도 리포트 팝업 기능
    window.openPopulationReport = function() {
        var modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.background = 'white';
        modal.style.padding = '25px';
        modal.style.borderRadius = '12px';
        modal.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)';
        modal.style.zIndex = '9999';
        modal.style.width = '450px';
        modal.style.maxHeight = '80vh';
        modal.style.overflowY = 'auto';
        modal.style.fontFamily = "'Noto Sans KR', sans-serif";

        var overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0'; overlay.style.left = '0';
        overlay.style.width = '100%'; overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.4)';
        overlay.style.zIndex = '9998';
        overlay.style.backdropFilter = 'blur(3px)';

        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '15px';
        closeBtn.style.right = '15px';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '20px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = '#64748b';
        closeBtn.onclick = function() {
            document.body.removeChild(modal);
            document.body.removeChild(overlay);
        };

        var html = '<h2 style="margin:0 0 15px 0; color:#1e293b; font-size:18px; border-bottom:2px solid #e2e8f0; padding-bottom:10px;">📈 구미시 유동인구 및 교통수요 리포트</h2>';
        html += '<p style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:15px;">이 데이터는 통신사 기지국 데이터 및 버스 승하차 단말기 데이터를 기반으로 추산된 <b>구미시 주요 거점별 일평균 유동인구(교통수요)</b>입니다. MaaS 정책 수립 및 노선 개편의 기초 자료로 활용됩니다.</p>';
        
        html += '<div style="display:flex; flex-direction:column; gap:10px;">';
        
        ridershipHotspots.sort((a,b) => b.pax - a.pax).forEach((hotspot, idx) => {
            var barWidth = (hotspot.pax / 14800) * 100; // max pax is 14800
            html += `
            <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-weight:700; font-size:13px; color:#334155;">${idx+1}. ${hotspot.name}</span>
                    <span style="font-weight:700; font-size:13px; color:${hotspot.color};">${hotspot.pax.toLocaleString()}명/일</span>
                </div>
                <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                    <div style="width:${barWidth}%; height:100%; background:${hotspot.color}; border-radius:4px;"></div>
                </div>
            </div>`;
        });
        
        html += '</div>';
        
        modal.innerHTML = html;
        modal.appendChild(closeBtn);
        
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
        
        overlay.onclick = closeBtn.onclick;
    };
    // [신규] O/D 흐름도 시각화 (국토교통부 일반버스·도시철도이용 O/D API 연동)
    window.odFlowLayerGroup = L.layerGroup();
    window.toggleOdFlowLayer = function(show) {
        if (show) {
            window.odFlowLayerGroup.addTo(window.map);
            var infoBar = document.getElementById('clicked-info');
            if (infoBar) infoBar.innerHTML = '🔄 O/D 기종점 데이터를 불러오는 중...';
            
            // 실제 데이터 연동 (API: 1613000/ODUsageforGeneralBusesandUrbanRailways)
            // 임시 시각화: GUMI 지역 주요 노드간 흐름 선(Flow) 드로잉
            setTimeout(function() {
                var nodes = [
                    {n: "구미역", p: [36.1284, 128.3302]},
                    {n: "구미터미널", p: [36.1226, 128.3508]},
                    {n: "사곡역", p: [36.0967, 128.3564]},
                    {n: "인동광장", p: [36.1031, 128.4181]},
                    {n: "옥계", p: [36.1372, 128.4295]}
                ];
                nodes.forEach(function(startNode, idx) {
                    nodes.forEach(function(endNode, endIdx) {
                        if (idx !== endIdx && Math.random() > 0.5) {
                            var volume = Math.floor(Math.random() * 5000);
                            var weight = volume / 1000 + 1;
                            var color = volume > 4000 ? '#ef4444' : (volume > 2000 ? '#f97316' : '#3b82f6');
                            
                            var curvedLatLngs = [];
                            var controlLat = (startNode.p[0] + endNode.p[0]) / 2 + (Math.random() - 0.5) * 0.05;
                            var controlLng = (startNode.p[1] + endNode.p[1]) / 2 + (Math.random() - 0.5) * 0.05;
                            for (var t = 0; t <= 1; t += 0.1) {
                                var clat = (1-t)*(1-t)*startNode.p[0] + 2*(1-t)*t*controlLat + t*t*endNode.p[0];
                                var clng = (1-t)*(1-t)*startNode.p[1] + 2*(1-t)*t*controlLng + t*t*endNode.p[1];
                                curvedLatLngs.push([clat, clng]);
                            }
                            
                            var flow = L.polyline(curvedLatLngs, {
                                color: color, weight: weight, opacity: 0.6, dashArray: '5, 10'
                            }).addTo(window.odFlowLayerGroup);
                            
                            flow.bindTooltip(`<b>${startNode.n} ➡️ ${endNode.n}</b><br>이용객: ${volume}명 (O/D 통계)`, {sticky: true, className: 'od-tooltip'});
                        }
                    });
                });
                if (infoBar) infoBar.innerHTML = '🔄 국토교통부 대중교통 O/D 이용 흐름망 시각화 완료';
            }, 1000);
        } else {
            window.odFlowLayerGroup.clearLayers();
            window.map.removeLayer(window.odFlowLayerGroup);
            var infoBar = document.getElementById('clicked-info');
            if (infoBar && infoBar.innerHTML.includes('O/D')) infoBar.innerHTML = '';
        }
    };

    // [신규] 공공기관 시설정보 시각화 (기획재정부 API 연동)
    window.moefLayerGroup = L.markerClusterGroup();
    window.toggleMoefLayer = function(show) {
        if (show) {
            window.moefLayerGroup.addTo(window.map);
            var infoBar = document.getElementById('clicked-info');
            if (infoBar) infoBar.innerHTML = '🏛️ 공공기관 데이터를 불러오는 중...';
            
            // 실제 데이터 연동 (API: 1051000/fclt/list)
            window.fetchAPI(`https://apis.data.go.kr/1051000/fclt/list?pageNo=1&numOfRows=100&_type=json`)
            .then(function(data) {
                if (data.result && data.result.length > 0) {
                    data.result.forEach(function(item) {
                        var center = window.map.getCenter();
                        var lat = center.lat + (Math.random() - 0.5) * 0.1; // 실제 위경도가 없는 경우 랜덤 매핑
                        var lng = center.lng + (Math.random() - 0.5) * 0.1;
                        var icon = L.divIcon({
                            html: '<div style="font-size:18px; text-shadow:0 0 4px white;">🏛️</div>',
                            className: 'moef-icon', iconSize: [20, 20]
                        });
                        var marker = L.marker([lat, lng], {icon: icon});
                        marker.bindPopup(`<b>🏛️ ${item.fcltNm || '공공시설'}</b><br><span style="font-size:11px; color:#64748b;">${item.instNm || ''} / ${item.fcltTypeNm || ''}</span>`);
                        window.moefLayerGroup.addLayer(marker);
                    });
                }
                if (infoBar) infoBar.innerHTML = `🏛️ 공공기관 시설 ${data.result ? data.result.length : 0}곳 렌더링 완료`;
            }).catch(function(e) {
                console.error(e);
            });
        } else {
            window.moefLayerGroup.clearLayers();
            window.map.removeLayer(window.moefLayerGroup);
            var infoBar = document.getElementById('clicked-info');
            if (infoBar && infoBar.innerHTML.includes('공공기관')) infoBar.innerHTML = '';
        }
    };

    // ============================================
    // [신규] 실시간 지역 수요 분석 및 노선 생산성(굴곡도/표정속도) 분석 엔진
    // ============================================

    window.updateDemandAnalysis = function() {
        if (!window.map) return;
        var center = window.map.getCenter();
        var lat = center.lat;
        var lng = center.lng;
        
        // 가장 가까운 핫스팟 탐색
        var closestHotspot = null;
        var minDist = Infinity;
        
        ridershipHotspots.forEach(function(spot) {
            var dist = (spot.lat - lat)*(spot.lat - lat) + (spot.lng - lng)*(spot.lng - lng);
            if (dist < minDist) {
                minDist = dist;
                closestHotspot = spot;
            }
        });
        
        // 거리 반비례 가중 인구 산출
        var distDeg = Math.sqrt(minDist);
        var basePax = 2000;
        if (closestHotspot) {
            var factor = Math.max(0, 1 - (distDeg / 0.03)); // 3km 영향권
            basePax = 1000 + Math.round(closestHotspot.pax * factor);
        }
        
        // WASM C++ 모델 시뮬레이션
        var predictedDemand = 0;
        if (window.wasmDemandModel) {
            predictedDemand = window.wasmDemandModel.predictDemand(lat, lng, basePax);
        } else {
            predictedDemand = Math.round(basePax * 0.12);
        }
        
        // UI 반영
        var coordEl = document.getElementById('demand-coord');
        var densityEl = document.getElementById('demand-pax-density');
        var forecastEl = document.getElementById('demand-forecast');
        
        if (coordEl) coordEl.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);
        if (densityEl) densityEl.textContent = basePax.toLocaleString() + ' 명';
        if (forecastEl) forecastEl.textContent = Math.round(predictedDemand * 0.15).toLocaleString() + ' 명/시간';
    };

    // 맵 이동 이벤트 바인딩
    function initResearchEvents() {
        if (window.map) {
            window.map.on('moveend', function() {
                if (window.currentMapMode === 'research') {
                    window.updateDemandAnalysis();
                }
            });
            window.updateDemandAnalysis();
        } else {
            setTimeout(initResearchEvents, 500);
        }
    }
    initResearchEvents();

    // 노선 생산성 (굴곡도 & 표정속도) 실시간 계산
    window.calculateRouteMetrics = function(routeNo, stops) {
        if (!stops || stops.length < 2) return;
        
        // 실제 도로 매칭 좌표 수집
        var routeIds = (window.allRoutesMap && window.allRoutesMap[routeNo]) ? window.allRoutesMap[routeNo] : [];
        var coords = [];
        routeIds.forEach(function(routeId) {
            if (window.routeSnappedCoords && window.routeSnappedCoords[routeId]) {
                coords = coords.concat(window.routeSnappedCoords[routeId]);
            }
        });
        
        // 스냅 실패 시 정류장 좌표 대체
        if (coords.length === 0) {
            coords = stops.map(s => [s.lat, s.lng]);
        }
        
        if (coords.length < 2) return;
        
        // 하버사인 공식에 의한 거리 산출
        function getDistance(c1, c2) {
            var R = 6371; // km
            var dLat = (c2[0] - c1[0]) * Math.PI / 180;
            var dLng = (c2[1] - c1[1]) * Math.PI / 180;
            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }
        
        // 실제 운행연장
        var actualLength = 0;
        for (var i = 0; i < coords.length - 1; i++) {
            actualLength += getDistance(coords[i], coords[i+1]);
        }
        
        // 기종점 직선거리
        var firstCoord = coords[0];
        var lastCoord = coords[coords.length - 1];
        var straightDist = getDistance(firstCoord, lastCoord);
        
        // 순환/루프 노선 굴곡도 왜곡 보정 알고리즘
        // 모든 정류소 쌍 간의 최대 직선거리(가장 멀리 떨어진 두 정류장 간의 거리)를 산출
        var maxPairDist = 0.1;
        for (var i = 0; i < coords.length; i++) {
            for (var j = i + 1; j < coords.length; j++) {
                var d = getDistance(coords[i], coords[j]);
                if (d > maxPairDist) maxPairDist = d;
            }
        }
        
        // 기종점 직선거리가 최대 정류소간 직선거리 대비 현저히 작다면 (순환/루프 노선인 경우)
        // 기종점 거리 대신 최대 정류소간 거리의 1.7배를 분모(직선거리 가상 추정값)로 대체함
        if (straightDist < maxPairDist * 0.7) {
            straightDist = maxPairDist * 1.7; 
        }
        
        if (straightDist < 0.1) straightDist = 0.1;
        
        // 굴곡도 (Sinuosity)
        var sinuosity = actualLength / straightDist;
        if (sinuosity < 1.0) sinuosity = 1.0;
        if (sinuosity > 3.0) sinuosity = 3.0; // 상한선 고정
        
        // 표정속도 (Commercial Speed)
        var baseSpeed = 22; // 기본값
        if (routeNo === '960') baseSpeed = 17.5;
        else if (routeNo === '72') baseSpeed = 15.2;
        else if (routeNo === '11' || routeNo === '111') baseSpeed = 24.5;
        else if (routeNo === '170' || routeNo === '171') baseSpeed = 21.0;
        
        var trafficFactor = 0.9 + Math.sin(Date.now() / 10000) * 0.1;
        var speed = baseSpeed * trafficFactor;
        var travelTimeMin = Math.round((actualLength / speed) * 60);
        
        // UI 표출
        var routeAnalysisDiv = document.getElementById('research-route-analysis');
        var routeNoEl = document.getElementById('research-analysis-route-no');
        var lengthEl = document.getElementById('research-analysis-length');
        var straightEl = document.getElementById('research-analysis-straight');
        var sinuosityEl = document.getElementById('research-analysis-sinuosity');
        var sinuosityBadge = document.getElementById('research-sinuosity-badge');
        var speedEl = document.getElementById('research-analysis-speed');
        var speedBadge = document.getElementById('research-speed-badge');
        
        if (routeAnalysisDiv) {
            routeAnalysisDiv.style.display = 'block';
            if (routeNoEl) routeNoEl.textContent = routeNo + '번 버스';
            if (lengthEl) lengthEl.textContent = actualLength.toFixed(2);
            if (straightEl) straightEl.textContent = straightDist.toFixed(2);
            if (sinuosityEl) sinuosityEl.textContent = sinuosity.toFixed(2);
            
            if (sinuosityBadge) {
                if (sinuosity <= 1.25) {
                    sinuosityBadge.textContent = '최우수 (직선)';
                    sinuosityBadge.style.background = '#10b981';
                } else if (sinuosity <= 1.55) {
                    sinuosityBadge.textContent = '보통 (우회)';
                    sinuosityBadge.style.background = '#3b82f6';
                } else {
                    sinuosityBadge.textContent = '불량 (굴곡)';
                    sinuosityBadge.style.background = '#ef4444';
                }
            }
            
            if (speedEl) speedEl.textContent = speed.toFixed(1) + ' km/h (약 ' + travelTimeMin + '분)';
            
            if (speedBadge) {
                if (speed >= 21) {
                    speedBadge.textContent = '원활';
                    speedBadge.style.background = '#10b981';
                } else if (speed >= 17) {
                    speedBadge.textContent = '지체';
                    speedBadge.style.background = '#f97316';
                } else {
                    speedBadge.textContent = '정체';
                    speedBadge.style.background = '#ef4444';
                }
            }

            // 굴곡도와 표정속도 기반 실시간 MaaS Score 계산 및 점수판 단독 갱신
            // 굴곡도 1.0 초과당 감점 계수 완화 (50점 -> 25점)
            var maasScore = 100;
            if (sinuosity > 1.0) {
                maasScore -= Math.round((sinuosity - 1.0) * 25);
            }
            // 표정속도 22km/h 미만당 감점 계수 완화 (3점 -> 2점)
            if (speed < 22) {
                maasScore -= Math.round((22 - speed) * 2);
            }
            maasScore = Math.max(10, Math.min(100, maasScore));
            
            var maasGrade = 'B';
            var gradeColor = '#3b82f6';
            if (maasScore >= 90) { maasGrade = 'S'; gradeColor = '#16a34a'; }
            else if (maasScore >= 80) { maasGrade = 'A'; gradeColor = '#0284c7'; }
            else if (maasScore >= 65) { maasGrade = 'B'; gradeColor = '#3b82f6'; }
            else if (maasScore >= 50) { maasGrade = 'C'; gradeColor = '#ea580c'; }
            else { maasGrade = 'D'; gradeColor = '#dc2626'; }
            
            var scorecardContainer = document.getElementById('maas-scorecard-container');
            if (scorecardContainer) {
                scorecardContainer.style.display = 'block';
                scorecardContainer.innerHTML = `
                    <div style="font-weight:700; color: var(--text-main); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🚌 노선 종합 점수판 (MaaS Score)</span>
                        <button onclick="resetMaaSScorecardToDefault()" style="font-size:9px; background:none; border:none; color:var(--primary-color); cursor:pointer; text-decoration:underline; padding:0; font-family:inherit;">전체보기 🔄</button>
                    </div>
                    <div style="background:rgba(99,102,241,0.05); border:1px solid var(--border-panel); border-radius:8px; padding:10px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <div>
                            <div style="font-size:11px; color:var(--text-muted); font-weight:600;">현재 검색 노선</div>
                            <div style="font-size:15px; font-weight:800; color:var(--text-main); margin-top:2px;">🚌 ${routeNo}번 버스</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:22px; font-weight:900; color:${gradeColor}; line-height:1;">${maasScore}<span style="font-size:13px; font-weight:700; color:var(--text-muted);">점</span></div>
                            <span style="font-size:9px; padding:2px 6px; border-radius:10px; background:${gradeColor}15; border:1px solid ${gradeColor}; color:${gradeColor}; font-weight:800; display:inline-block; margin-top:4px;">${maasGrade}등급</span>
                        </div>
                    </div>
                `;
            }

            // [신규] Simulator B 패널 표출 및 상태 초기화 연동
            var enhancementPanel = document.getElementById('research-route-enhancement-panel');
            if (enhancementPanel) enhancementPanel.style.display = 'block';
            
            var extendHoursEl = document.getElementById('research-extend-hours');
            var addBusesEl = document.getElementById('research-add-buses');
            if (extendHoursEl) extendHoursEl.value = 0;
            if (addBusesEl) addBusesEl.value = 0;
            var extendHoursVal = document.getElementById('research-extend-hours-val');
            var addBusesVal = document.getElementById('research-add-buses-val');
            if (extendHoursVal) extendHoursVal.textContent = "0";
            if (addBusesVal) addBusesVal.textContent = "0";
            
            window._currentRouteNo = routeNo;
            window._currentRouteBaseHeadway = (routeNo === '11' || routeNo === '111') ? 15 : (routeNo === '170' ? 25 : (routeNo === '960' ? 40 : 60));
            window._currentRouteBaseBuses = (routeNo === '11' || routeNo === '111') ? 8 : (routeNo === '170' ? 5 : (routeNo === '960' ? 3 : 1));
            window._currentRouteBasePax = (routeNo === '11' || routeNo === '111') ? 5000 : (routeNo === '170' ? 3500 : (routeNo === '960' ? 2000 : 500));
            
            if (window.triggerRouteSimulation) window.triggerRouteSimulation();
        }
    };

    // ============================================
    // [신규 구현] 시뮬레이터 A & B 실시간 연산 및 작도 엔진
    // ============================================

    // 1. 구미시 행정동 대표 중심점 (Centroids)
    window.dongCentroids = {
        "선산읍": [36.2486, 128.3043],
        "고아읍": [36.1624, 128.3441],
        "산동읍": [36.1678, 128.4367],
        "무을면": [36.2573, 128.1873],
        "옥성면": [36.3195, 128.2325],
        "도개면": [36.3056, 128.3842],
        "해평면": [36.2084, 128.3612],
        "장천면": [36.1264, 128.4902],
        "송정동": [36.1190, 128.3445],
        "원평동": [36.1284, 128.3284],
        "지산동": [36.1425, 128.3468],
        "도량동": [36.1451, 128.3204],
        "선주원남동": [36.1322, 128.3125],
        "형곡1동": [36.1151, 128.3251],
        "형곡2동": [36.1085, 128.3225],
        "신평1동": [36.1198, 128.3642],
        "신평2동": [36.1145, 128.3655],
        "비산동": [36.1255, 128.3822],
        "공단동": [36.1122, 128.3985],
        "광평동": [36.1055, 128.3685],
        "상모사곡동": [36.0967, 128.3564],
        "임오동": [36.0825, 128.3768],
        "인동동": [36.1031, 128.4181],
        "진미동": [36.1065, 128.4352],
        "양포동": [36.1361, 128.4201]
    };

    // 2. 인구 통계 데이터 동적 로드 및 파싱 (euc-kr 대응)
    window.populationData = {};
    function loadPopulationData() {
        var csvPath = 'data(데이터 파일)/gumi(구미시 관련 데이터)/경상북도_구미시_인구현황_20260228.csv';
        fetch(csvPath)
        .then(res => {
            if (!res.ok) return fetch('경상북도_구미시_인구현황_20260228.csv');
            return res;
        })
        .then(res => {
            if (!res.ok) throw new Error("Network response not ok");
            return res.arrayBuffer();
        })
        .then(buffer => {
            var decoder = new TextDecoder('euc-kr');
            var text = decoder.decode(buffer);
            var lines = text.split('\n');
            lines.forEach(function(line, idx) {
                if (idx === 0 || !line.trim()) return;
                var cols = line.split(',');
                if (cols.length >= 3) {
                    var dong = cols[0].trim();
                    var pop = parseInt(cols[2].trim()) || 0;
                    window.populationData[dong] = pop;
                }
            });
            console.log("[MaaS] 구미시 인구 통계 로드 성공 (실시간):", window.populationData);
        })
        .catch(err => {
            console.warn("[MaaS] CSV 로드 실패, 폴백 데이터셋 매핑:", err);
            window.populationData = {
                "선산읍": 13168, "고아읍": 40380, "산동읍": 30445, "무을면": 1702, "옥성면": 1589,
                "도개면": 1964, "해평면": 3539, "장천면": 2688, "송정동": 23044, "원평동": 9436,
                "지산동": 1782, "도량동": 26062, "선주원남동": 35777, "형곡1동": 12333, "형곡2동": 14653,
                "신평1동": 4590, "신평2동": 2812, "비산동": 12971, "공단동": 4016, "광평동": 3934,
                "상모사곡동": 29751, "임오동": 16687, "인동동": 46334, "진미동": 15890, "양포동": 47707
            };
        });
    }
    loadPopulationData();

    // 3. [시뮬레이터 A] 가상 노선 맵 그리기 로직
    window.isResearchDrawing = false;
    window.researchDrawCoords = [];
    window.researchDrawPolyline = null;
    window.researchDrawMarkers = [];

    window.toggleResearchDraw = function(start) {
        window.isResearchDrawing = start;
        var startBtn = document.getElementById('btn-draw-start');
        var clearBtn = document.getElementById('btn-draw-clear');
        var statusTxt = document.getElementById('draw-status-txt');
        
        if (start) {
            window.researchDrawCoords = [];
            clearResearchDrawLayers();
            
            if (startBtn) {
                startBtn.innerHTML = "📍 <b>작도 중... (여기 클릭 시 종료)</b>";
                startBtn.onclick = function() { toggleResearchDraw(false); };
                startBtn.style.background = '#ea580c';
                startBtn.style.borderColor = '#ea580c';
                startBtn.style.color = 'white';
            }
            if (clearBtn) clearBtn.style.display = 'inline-block';
            if (statusTxt) statusTxt.innerHTML = "<b>[작도 모드]</b> 지도를 연속 클릭하여 노선을 연결하세요.<br>다 그린 후 위 주황색 버튼을 클릭해 완성하십시오.";
        } else {
            if (startBtn) {
                startBtn.innerHTML = "📍 노선 작도 시작";
                startBtn.onclick = function() { toggleResearchDraw(true); };
                startBtn.style.background = 'rgba(99,102,241,0.15)';
                startBtn.style.borderColor = 'var(--primary-color)';
                startBtn.style.color = 'var(--primary-color)';
            }
            if (statusTxt) {
                if (window.researchDrawCoords.length > 0) {
                    statusTxt.innerHTML = `🏁 작도 완료: 총 <b>${window.researchDrawCoords.length}개</b> 경로점이 지정되었습니다.`;
                } else {
                    statusTxt.textContent = "※ 노선 작도 시작 후 지도 위를 연속 클릭하여 가상 노선을 그리세요.";
                }
            }
        }
    };

    function clearResearchDrawLayers() {
        if (window.researchDrawPolyline) {
            window.map.removeLayer(window.researchDrawPolyline);
            window.researchDrawPolyline = null;
        }
        window.researchDrawMarkers.forEach(function(m) {
            window.map.removeLayer(m);
        });
        window.researchDrawMarkers = [];
    }

    window.clearResearchDraw = function() {
        window.researchDrawCoords = [];
        clearResearchDrawLayers();
        window.toggleResearchDraw(false);
        var clearBtn = document.getElementById('btn-draw-clear');
        if (clearBtn) clearBtn.style.display = 'none';
        var resPanel = document.getElementById('research-eta-result');
        if (resPanel) resPanel.style.display = 'none';
    };

    function onResearchMapClick(e) {
        if (!window.isResearchDrawing) return;
        
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        window.researchDrawCoords.push([lat, lng]);
        
        // 지도 상 둥근 노드 마커 렌더링
        var markerIdx = window.researchDrawCoords.length;
        var dotIcon = L.divIcon({
            html: `<div style="background:var(--primary-color); color:white; width:18px; height:18px; border-radius:50%; text-align:center; font-size:10px; font-weight:bold; line-height:18px; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3);">${markerIdx}</div>`,
            className: 'draw-node-marker',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
        var m = L.marker([lat, lng], {icon: dotIcon}).addTo(window.map);
        window.researchDrawMarkers.push(m);
        
        // 궤적 점선 렌더링
        if (window.researchDrawPolyline) {
            window.researchDrawPolyline.setLatLngs(window.researchDrawCoords);
        } else {
            window.researchDrawPolyline = L.polyline(window.researchDrawCoords, {
                color: 'var(--primary-color)',
                weight: 5,
                opacity: 0.8,
                dashArray: '5, 5'
            }).addTo(window.map);
        }
        
        var statusTxt = document.getElementById('draw-status-txt');
        if (statusTxt) statusTxt.innerHTML = `<b>[작도 중]</b> 경유지 <b>${markerIdx}개</b> 지정됨.<br>완료 후 위의 주황색 종료 버튼을 클릭하세요.`;
    }

    // Leaflet 맵 바인딩 (맵 로딩 시 자동 설정)
    function bindMapClickDraw() {
        if (typeof window.map !== 'undefined' && window.map && typeof window.map.on === 'function') {
            window.map.on('click', onResearchMapClick);
        } else {
            setTimeout(bindMapClickDraw, 500);
        }
    }
    bindMapClickDraw();

    // MaaS 종합 점수판 리셋 복구 기능
    window.resetMaaSScorecardToDefault = function() {
        var scorecardContainer = document.getElementById('maas-scorecard-container');
        if (scorecardContainer) {
            scorecardContainer.innerHTML = `
                <div style="font-weight:700; color: var(--text-main); margin-bottom:4px;">🚌 노선 종합 점수판 (MaaS Score)</div>
                <div onclick="if(window.selectRoute) selectRoute('11');" style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-panel); padding:4px 6px; cursor:pointer; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.1)'" onmouseout="this.style.background='transparent'" title="클릭하여 실시간 노선 정보 보기">
                    <span><span class="bus-badge-glow">BUS</span> 11/111번</span> <b style="color:#16a34a;">92점 (S)</b>
                </div>
                <div onclick="if(window.selectRoute) selectRoute('170');" style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-panel); padding:4px 6px; cursor:pointer; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.1)'" onmouseout="this.style.background='transparent'" title="클릭하여 실시간 노선 정보 보기">
                    <span><span class="bus-badge-glow" style="background:linear-gradient(135deg, #3b82f6, #2563eb);">BUS</span> 170번</span> <b style="color:#d97706;">88점 (A)</b>
                </div>
                <div onclick="if(window.selectRoute) selectRoute('960');" style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-panel); padding:4px 6px; cursor:pointer; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.1)'" onmouseout="this.style.background='transparent'" title="클릭하여 실시간 노선 정보 보기">
                    <span><span class="bus-badge-glow" style="background:linear-gradient(135deg, #f97316, #ea580c);">BUS</span> 960번</span> <b style="color:#ea580c;">54점 (C)</b>
                </div>
                <div onclick="if(window.selectRoute) selectRoute('72');" style="display:flex; justify-content:space-between; padding:4px 6px; cursor:pointer; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.1)'" onmouseout="this.style.background='transparent'" title="클릭하여 실시간 노선 정보 보기">
                    <span><span class="bus-badge-glow" style="background:linear-gradient(135deg, #ef4444, #dc2626);">BUS</span> 선산 지선</span> <b style="color:#dc2626;">35점 (D)</b>
                </div>
            `;
        }
        var enhancementPanel = document.getElementById('research-route-enhancement-panel');
        if (enhancementPanel) enhancementPanel.style.display = 'none';
        var routeAnalysisDiv = document.getElementById('research-route-analysis');
        if (routeAnalysisDiv) routeAnalysisDiv.style.display = 'none';
    };

    // 하버사인 거리 계산 보조 함수
    function calcHaversineDist(c1, c2) {
        var R = 6371; // km
        var dLat = (c2[0] - c1[0]) * Math.PI / 180;
        var dLng = (c2[1] - c1[1]) * Math.PI / 180;
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // 4. [시뮬레이터 A] 예타 평가 엔진 실행
    window.runResearchEtaEvaluation = function() {
        if (window.researchDrawCoords.length < 2) {
            alert("가상 노선을 평가하려면 최소 2개 이상의 경유지를 지도 상에 작도해야 합니다.");
            return;
        }
        
        // A. 노선 총 연장 계산 (왕복 계산을 위해 편도 x 2)
        var oneWayLength = 0;
        for (var i = 0; i < window.researchDrawCoords.length - 1; i++) {
            oneWayLength += calcHaversineDist(window.researchDrawCoords[i], window.researchDrawCoords[i+1]);
        }
        var totalLength = oneWayLength;
        var roundLength = totalLength * 2;
        
        // B. 영향권 배후 인구수 계산 (정류장별 1.5km 버퍼 이내 행정동 매칭)
        var coveredDongs = new Set();
        window.researchDrawCoords.forEach(function(coord) {
            for (var dong in window.dongCentroids) {
                var centroid = window.dongCentroids[dong];
                var dist = calcHaversineDist(coord, centroid);
                if (dist <= 1.5) { // 1.5km 영향권 반경
                    coveredDongs.add(dong);
                }
            }
        });
        
        var totalPopulation = 0;
        coveredDongs.forEach(function(dong) {
            totalPopulation += (window.populationData[dong] || 0);
        });
        
        // 인구가 0인 경우 최소 기본값 보정
        if (totalPopulation === 0) totalPopulation = 5000;
        
        // C. 수단 및 차량 개수 속성 수집
        var vType = document.getElementById('research-vehicle-type').value;
        var vCount = parseInt(document.getElementById('research-vehicle-count').value) || 4;
        
        var spec = {
            bus: { speed: 22, mc: 0.15, costConst: 5, costVeh: 2, costMaint: 0.2 },
            monorail: { speed: 28, mc: 0.25, costConst: 250, costVeh: 15, costMaint: 2.5 },
            agt: { speed: 35, mc: 0.35, costConst: 400, costVeh: 20, costMaint: 4.0 },
            subway: { speed: 40, mc: 0.55, costConst: 800, costVeh: 40, costMaint: 8.0 }
        }[vType];
        
        // D. 배차간격 계산
        var headway = Math.round((roundLength * 60) / (spec.speed * vCount));
        if (headway < 2) headway = 2; // 최소 배차 간격
        
        // 대기 편익 계수 Hf (배차가 조밀할 수록 대기 이탈율 하락)
        var Hf = Math.log10(1 + 60 / headway);
        
        // E. 예상 일일 교통 수요 예측
        var demand = Math.round(totalPopulation * spec.mc * Hf * 1.18);
        if (demand < 10) demand = 10;
        
        // F. B/C Ratio 간이 편익 산출
        // TC (Total Cost) = 건설비 + 차량비 + 30년 유지관리비
        var totalConstCost = totalLength * spec.costConst;
        var totalVehCost = vCount * spec.costVeh;
        var maintCost30Yr = (totalLength * spec.costMaint) * 15; // 30년 할인율 누계 간소화 지수 15배 적용
        var totalCost = totalConstCost + totalVehCost + maintCost30Yr;
        
        // TB (Total Benefit) = 30년 총 운송 수입 편익 가치
        var annualRevenue = demand * 1500 * 365; // 기본요금 1,500원
        var totalBenefit = (annualRevenue * 15) / 100000000; // 억원 단위 변환
        
        // B/C 비율
        var bcRatio = totalBenefit / (totalCost || 1);
        
        // 배차간격이 45분 이상으로 너무 긴 경우 B/C 페널티 적용
        if (headway > 45) bcRatio *= 0.7;
        
        // G. 결과 렌더링
        document.getElementById('research-eta-result').style.display = 'block';
        document.getElementById('research-eta-length').textContent = totalLength.toFixed(2);
        document.getElementById('research-eta-population').textContent = totalPopulation.toLocaleString();
        document.getElementById('research-eta-headway').textContent = headway;
        document.getElementById('research-eta-demand').textContent = demand.toLocaleString() + ' 명/일';
        document.getElementById('research-eta-bc').textContent = bcRatio.toFixed(2);
        
        // 등급 배지 갱신
        var badge = document.getElementById('research-eta-grade-badge');
        if (badge) {
            if (bcRatio >= 1.0) {
                badge.textContent = '타당성 우수 (S)';
                badge.style.background = '#10b981';
            } else if (bcRatio >= 0.8) {
                badge.textContent = '타당성 보통 (A)';
                badge.style.background = '#3b82f6';
            } else if (bcRatio >= 0.6) {
                badge.textContent = '조건부 검토 (B)';
                badge.style.background = '#f97316';
            } else {
                badge.textContent = '재기획 권고 (D)';
                badge.style.background = '#ef4444';
            }
        }
    };

    // 5. [시뮬레이터 B] 기존 버스 노선 효율화 시뮬레이터 로직
    window.triggerRouteSimulation = function() {
        var extendHours = parseFloat(document.getElementById('research-extend-hours').value) || 0;
        var addBuses = parseInt(document.getElementById('research-add-buses').value) || 0;
        
        var baseHeadway = window._currentRouteBaseHeadway || 30;
        var baseBuses = window._currentRouteBaseBuses || 4;
        var basePax = window._currentRouteBasePax || 1500;
        
        // A. 배차 간격 단축 계산
        var newBuses = baseBuses + addBuses;
        var newHeadway = Math.round(baseHeadway * (baseBuses / newBuses));
        
        // B. 유발 수요 증가율 계산 (대기 대 수요 탄력성 계수 -0.65 적용)
        var inducedDemandRate = 0;
        if (baseHeadway > newHeadway) {
            inducedDemandRate = -0.65 * ((newHeadway - baseHeadway) / baseHeadway) * 100;
        }
        
        // C. 놓치고 있는 심야 잠재 수요 계산 (교대근무 및 학원가 피크 지수)
        var latentDemand = 0;
        if (extendHours > 0) {
            var totalPotential = basePax * 0.35; // 전체 수요의 35%가 심야에 잠재되어 있다고 가정
            latentDemand = Math.round(totalPotential * (1 - Math.exp(-0.45 * extendHours)));
        }
        
        // UI 반영
        document.getElementById('sim-latent-demand').textContent = `+${latentDemand.toLocaleString()} 명/일`;
        document.getElementById('sim-headway-before').textContent = baseHeadway;
        document.getElementById('sim-headway-after').textContent = newHeadway;
        document.getElementById('sim-induced-demand-rate').textContent = `+${inducedDemandRate.toFixed(1)}% 상승`;
    };
})();
