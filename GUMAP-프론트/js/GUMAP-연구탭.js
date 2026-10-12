// ============================================================
// 📁 파일명: research_tab.js
// 📌 역할: MaaS 정책 연구소 탭 - 교통 데이터 분석 및 시뮬레이션
// ============================================================
//
// [파일 설명]
//   교통 정책 연구를 위한 고급 분석 도구 모음입니다. (약 1,000줄)
//   학술적 관점에서 구미시 대중교통 데이터를 시각화·분석합니다.
//   - 수요응답형(DRT) 행복버스 노선 시각화
//   - Hexagon 히트맵: 구미시 정류장별 승하차 실측(2025.8)을 약 500m 칸으로 합산
//   - 승차·하차 우세 지도: 정류장별 승차(출발)·하차(도착) 비중 (O/D 원자료는 없음)
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
//   - GUMAP-데이터/data/gumi_bus_ridership.json (GUMAP-개발/build_ridership.py)
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

    // 이 스크립트 위치(GUMAP-프론트/js/) 기준으로 찾는다. 루트·GUMAP-일반지도·앱 어디서 열어도 같은 파일이다.
    var PROJECT_ROOT = new URL('../../', (document.currentScript && document.currentScript.src) || window.location.href).href;
    var RIDERSHIP_URL = new URL('GUMAP-데이터/data/gumi_bus_ridership.json', PROJECT_ROOT).href;
    // [데이터] 구미시 정류장별 승하차 실측(하루 평균). GUMAP-개발/build_ridership.py 가 만든다.
    // 히트맵·수요 리포트·승하차 흐름·지역 수요·노선 점수판이 모두 이 한 파일을 쓴다.
    // (예전에는 손으로 적은 핫스팟 10곳, sin 함수로 만든 'WASM 수요 모델', 난수 O/D 를 그렸다.)
    var ridershipPromise = null;
    window.loadGumiRidership = function() {
        if (!ridershipPromise) {
            ridershipPromise = fetch(RIDERSHIP_URL)
                .then(function(res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json();
                })
                .then(function(data) {
                    data.stopList = data.stops.map(function(s) {
                        return { id: s[0], name: s[1], lat: s[2], lng: s[3], board: s[4], alight: s[5] };
                    });
                    return data;
                })
                .catch(function(error) {
                    ridershipPromise = null;   // 다음에 다시 시도
                    throw error;
                });
        }
        return ridershipPromise;
    };

    function ridershipPeriodLabel(data) {
        return data.period.from.slice(0, 7).replace('-', '년 ') + '월';
    }

    function ridershipSourceHtml(data) {
        return '출처: ' + data.source + ' · ' + data.period.from + ' ~ ' + data.period.to +
            ' (' + data.period.days + '일 평균)';
    }

    function escapeResearchText(text) {
        return String(text == null ? '' : text).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function showResearchInfo(html) {
        var infoBar = document.getElementById('clicked-info');
        if (infoBar) infoBar.innerHTML = html;
    }

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

    // 6. 승하차 밀도 히트맵 - 실제 정류장 승하차를 약 500m 육각형 칸으로 합친다
    window.toggleResearchHeatmap = function(isOn) {
        window.isResearchHeatmapOn = isOn;
        window.researchHeatmapLayers.forEach(function(layer) {
            window.map.removeLayer(layer);
        });
        window.researchHeatmapLayers = [];
        if (!isOn) return;

        showResearchInfo('👥 정류장 승하차 데이터를 불러오는 중...');
        window.loadGumiRidership().then(function(data) {
            if (!window.isResearchHeatmapOn) return;

            // 위도 1도 ≈ 111km, 경도 1도 ≈ 90km(위도 36°). 칸 반지름 약 500m.
            var radiusLat = 0.0045, radiusLng = 0.0056;
            var rowStep = radiusLat * 1.5, colStep = radiusLng * Math.sqrt(3);
            var cells = {};
            data.stopList.forEach(function(stop) {
                var row = Math.round(stop.lat / rowStep);
                var offset = (Math.abs(row) % 2 === 1) ? colStep / 2 : 0;
                var col = Math.round((stop.lng - offset) / colStep);
                var key = row + ':' + col;
                var cell = cells[key] || (cells[key] = {
                    lat: row * rowStep, lng: col * colStep + offset, board: 0, alight: 0, stops: []
                });
                cell.board += stop.board;
                cell.alight += stop.alight;
                cell.stops.push(stop);
            });

            var list = Object.keys(cells).map(function(key) { return cells[key]; })
                .filter(function(cell) { return cell.board + cell.alight >= 50; });
            var totals = list.map(function(cell) { return cell.board + cell.alight; }).sort(function(a, b) { return a - b; });
            function quantile(q) { return totals[Math.floor((totals.length - 1) * q)] || 0; }
            var cuts = [quantile(0.5), quantile(0.75), quantile(0.9), quantile(0.97)];
            var colors = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#8b0000'];

            list.forEach(function(cell) {
                var total = cell.board + cell.alight;
                var level = cuts.filter(function(cut) { return total > cut; }).length;
                var hexPoints = [];
                for (var k = 0; k < 6; k++) {
                    var angle = (Math.PI / 3) * k + (Math.PI / 6);
                    hexPoints.push([cell.lat + radiusLat * Math.sin(angle), cell.lng + radiusLng * Math.cos(angle)]);
                }
                var polygon = L.polygon(hexPoints, {
                    color: 'white', weight: 1, fillColor: colors[level], fillOpacity: 0.6
                }).addTo(window.map);
                var topStops = cell.stops.slice().sort(function(a, b) {
                    return (b.board + b.alight) - (a.board + a.alight);
                }).slice(0, 3).map(function(stop) { return escapeResearchText(stop.name); }).join(', ');
                polygon.bindPopup(
                    '<div style="font-size:12px; line-height:1.5;">' +
                    '<b>👥 정류장 ' + cell.stops.length + '곳 (반경 약 500m)</b><br>' +
                    '하루 평균 승차 <b>' + Math.round(cell.board).toLocaleString() + '명</b> · 하차 <b>' +
                    Math.round(cell.alight).toLocaleString() + '명</b><br>' +
                    '<span style="font-size:11px; color:#64748b;">주요 정류장: ' + topStops + '</span><br>' +
                    '<span style="font-size:10px; color:#94a3b8;">' + escapeResearchText(ridershipPeriodLabel(data)) + ' 구미시 정류장별 승하차 실측</span>' +
                    '</div>');
                window.researchHeatmapLayers.push(polygon);
            });
            showResearchInfo('👥 ' + escapeResearchText(ridershipPeriodLabel(data)) + ' 정류장 승하차 실측을 ' +
                list.length + '개 칸으로 표시했습니다.');
            window.map.setView([36.138, 128.360], 12);
        }).catch(function(error) {
            console.error('[연구] 승하차 데이터 로드 실패', error);
            showResearchInfo('⚠️ 승하차 데이터를 불러오지 못했습니다.');
        });
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

    // 8. 정류장 이용 수요 리포트 (실측 상위 정류장)
    window.openPopulationReport = function() {
        window.loadGumiRidership().then(renderRidershipReport).catch(function(error) {
            console.error('[연구] 승하차 데이터 로드 실패', error);
            alert('승하차 데이터를 불러오지 못했습니다.');
        });
    };

    function renderRidershipReport(data) {
        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:var(--bg-card, white); color:var(--text-main); padding:25px; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); z-index:9999; width:min(450px, calc(100vw - 32px)); max-height:80vh; overflow-y:auto; font-family:"Noto Sans KR", sans-serif;';
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9998; backdrop-filter:blur(3px);';
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute; top:15px; right:15px; background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted);';
        closeBtn.onclick = function() {
            modal.remove();
            overlay.remove();
        };
        overlay.onclick = closeBtn.onclick;

        var top = data.stopList.slice(0, 10);
        var max = top.length ? top[0].board + top[0].alight : 1;
        var html = '<h2 style="margin:0 0 12px 0; font-size:18px; border-bottom:2px solid var(--border-panel); padding-bottom:10px;">📈 구미시 버스 정류장 이용 수요</h2>' +
            '<p style="font-size:12px; color:var(--text-muted); line-height:1.6; margin:0 0 15px 0;">교통카드 승하차 기록을 정류장별로 모은 공공데이터입니다. 하루 평균 승차+하차 인원이 많은 정류장 10곳입니다.</p>' +
            '<div style="display:flex; flex-direction:column; gap:10px;">';
        top.forEach(function(stop, idx) {
            var total = stop.board + stop.alight;
            html += '<div style="padding:10px; border-radius:8px; border:1px solid var(--border-panel); background:var(--bg-input);">' +
                '<div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px; font-weight:700;">' +
                '<span>' + (idx + 1) + '. ' + escapeResearchText(stop.name) + '</span>' +
                '<span style="color:#ef4444;">' + Math.round(total).toLocaleString() + '명/일</span></div>' +
                '<div style="font-size:11px; color:var(--text-muted); margin-bottom:5px;">승차 ' + Math.round(stop.board).toLocaleString() +
                ' · 하차 ' + Math.round(stop.alight).toLocaleString() + '</div>' +
                '<div style="width:100%; height:8px; background:var(--border-panel); border-radius:4px; overflow:hidden;">' +
                '<div style="width:' + (total / max * 100).toFixed(1) + '%; height:100%; background:#ef4444;"></div></div></div>';
        });
        html += '</div><p style="font-size:10px; color:var(--text-muted); margin:12px 0 0 0;">' + escapeResearchText(ridershipSourceHtml(data)) + '</p>';

        modal.innerHTML = html;
        modal.appendChild(closeBtn);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    }
    // [신규] 정류장별 승차·하차 우세 지도
    // 기종점(O/D) 원자료가 없어 정류장 사이 이동량은 알 수 없다. 대신 승차가 많은 곳
    // (출발 성격)과 하차가 많은 곳(도착 성격)을 실측 크기대로 표시한다.
    window.odFlowLayerGroup = L.layerGroup();
    window.toggleOdFlowLayer = function(show) {
        window.odFlowLayerGroup.clearLayers();
        if (!show) {
            window.map.removeLayer(window.odFlowLayerGroup);
            var infoBar = document.getElementById('clicked-info');
            if (infoBar && infoBar.innerHTML.includes('승차·하차')) infoBar.innerHTML = '';
            return;
        }
        window.odFlowLayerGroup.addTo(window.map);
        showResearchInfo('🔄 정류장 승하차 데이터를 불러오는 중...');
        window.loadGumiRidership().then(function(data) {
            if (!window.map.hasLayer(window.odFlowLayerGroup)) return;
            var top = data.stopList.slice(0, 80);
            var max = top.length ? top[0].board + top[0].alight : 1;
            top.forEach(function(stop) {
                var total = stop.board + stop.alight;
                var share = total > 0 ? stop.board / total : 0.5;
                // 승차가 60% 넘으면 출발 성격(파랑), 하차가 60% 넘으면 도착 성격(빨강)
                var color = share >= 0.6 ? '#3b82f6' : (share <= 0.4 ? '#ef4444' : '#a855f7');
                var circle = L.circleMarker([stop.lat, stop.lng], {
                    radius: 4 + 14 * Math.sqrt(total / max),
                    color: color, weight: 1, fillColor: color, fillOpacity: 0.45
                }).addTo(window.odFlowLayerGroup);
                circle.bindTooltip('<b>' + escapeResearchText(stop.name) + '</b><br>하루 평균 승차 ' +
                    Math.round(stop.board).toLocaleString() + '명 · 하차 ' + Math.round(stop.alight).toLocaleString() +
                    '명<br><span style="font-size:10px;">' + (share >= 0.6 ? '출발 성격(승차 우세)' : share <= 0.4 ? '도착 성격(하차 우세)' : '승하차 비슷') +
                    '</span>', { sticky: true, className: 'od-tooltip' });
            });
            showResearchInfo('🔄 정류장별 승차·하차 우세 표시 완료 (파랑=승차 우세, 빨강=하차 우세, ' +
                escapeResearchText(ridershipPeriodLabel(data)) + ' 실측 상위 80곳)');
        }).catch(function(error) {
            console.error('[연구] 승하차 데이터 로드 실패', error);
            showResearchInfo('⚠️ 승하차 데이터를 불러오지 못했습니다.');
        });
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
                // 좌표가 있는 시설만 찍는다. 예전에는 좌표가 없으면 지도 중심 주변
                // 아무 데나 흩뿌려서, 없는 곳에 공공기관이 있는 것처럼 보였다.
                var items = data.result || [];
                var placed = 0;
                items.forEach(function(item) {
                    var lat = parseFloat(item.lat || item.la || item.latitude || item.yCrdnt);
                    var lng = parseFloat(item.lng || item.lot || item.lo || item.longitude || item.xCrdnt);
                    if (!isFinite(lat) || !isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) return;
                    var icon = L.divIcon({
                        html: '<div style="font-size:18px; text-shadow:0 0 4px white;">🏛️</div>',
                        className: 'moef-icon', iconSize: [20, 20]
                    });
                    var marker = L.marker([lat, lng], {icon: icon});
                    marker.bindPopup(DOMPurify.sanitize(`<b>🏛️ ${item.fcltNm || '공공시설'}</b><br><span style="font-size:11px; color:#64748b;">${item.instNm || ''} / ${item.fcltTypeNm || ''}</span>`));
                    window.moefLayerGroup.addLayer(marker);
                    placed++;
                });
                if (infoBar) {
                    infoBar.innerHTML = placed
                        ? `🏛️ 공공기관 시설 ${placed}곳 표시 완료`
                        : `🏛️ 공공기관 시설 ${items.length}곳을 받았지만 위치 좌표가 없어 지도에 표시하지 않았습니다.`;
                }
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
        var coordEl = document.getElementById('demand-coord');
        if (coordEl) coordEl.textContent = center.lat.toFixed(4) + ', ' + center.lng.toFixed(4);

        // 지도 중심 반경 500m 안 정류장의 실측 승하차 합
        window.loadGumiRidership().then(function(data) {
            var board = 0, alight = 0, count = 0;
            data.stopList.forEach(function(stop) {
                if (center.distanceTo([stop.lat, stop.lng]) <= 500) {
                    board += stop.board;
                    alight += stop.alight;
                    count++;
                }
            });
            var densityEl = document.getElementById('demand-pax-density');
            var forecastEl = document.getElementById('demand-forecast');
            if (densityEl) densityEl.textContent = Math.round(board).toLocaleString() + ' 명 (정류장 ' + count + '곳)';
            if (forecastEl) forecastEl.textContent = Math.round(alight).toLocaleString() + ' 명';
        }).catch(function() { /* 데이터가 없으면 칸을 비워 둔다 */ });
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
        // 예전 경로(루트의 data(데이터 파일)/…)에는 파일이 없어 늘 404 후 아래 폴백 표를 썼다.
        fetch(new URL('GUMAP-데이터/경상북도_구미시_인구현황_20260228.csv', PROJECT_ROOT).href)
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

    // 주요 노선 점수판 - 실측 하루 평균 승차 인원
    var SCORECARD_ROUTES = [
        { no: '11', label: '11번', color: '' },
        { no: '111', label: '111번', color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' },
        { no: '170', label: '170번', color: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
        { no: '960', label: '960번', color: 'linear-gradient(135deg, #f97316, #ea580c)' },
        { no: '72', label: '72번 (선산 지선)', color: 'linear-gradient(135deg, #ef4444, #dc2626)' }
    ];

    window.resetMaaSScorecardToDefault = function() {
        var scorecardContainer = document.getElementById('maas-scorecard-container');
        if (scorecardContainer) {
            window.loadGumiRidership().then(function(data) {
                var rows = SCORECARD_ROUTES.map(function(route, idx) {
                    var info = data.routes[route.no];
                    var value = info ? info.boardings_per_day.toLocaleString() + '명' : '자료 없음';
                    var badgeStyle = route.color ? ' style="background:' + route.color + ';"' : '';
                    var border = idx < SCORECARD_ROUTES.length - 1 ? 'border-bottom:1px solid var(--border-panel); ' : '';
                    return '<div onclick="if(window.selectRoute) selectRoute(\'' + route.no + '\');" style="display:flex; justify-content:space-between; ' + border +
                        'padding:4px 6px; cursor:pointer; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background=\'rgba(99,102,241,0.1)\'" onmouseout="this.style.background=\'transparent\'" title="클릭하여 실시간 노선 정보 보기">' +
                        '<span><span class="bus-badge-glow"' + badgeStyle + '>BUS</span> ' + route.label + '</span> <b style="color:var(--primary-color);">' + value + '</b></div>';
                }).join('');
                scorecardContainer.innerHTML =
                    '<div style="font-weight:700; color: var(--text-main); margin-bottom:4px;">🚌 주요 노선 하루 평균 승차 (' + escapeResearchText(ridershipPeriodLabel(data)) + ' 실측)</div>' +
                    rows +
                    '<div style="font-size:9px; color:var(--text-muted); margin-top:4px;">지선(예: 11-1)을 합친 값 · ' + escapeResearchText(data.source) + '</div>';
            }).catch(function() {
                scorecardContainer.innerHTML = '<div style="font-size:11px; color:var(--text-muted);">노선 승차 자료를 불러오지 못했습니다.</div>';
            });
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
