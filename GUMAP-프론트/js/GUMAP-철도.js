// ============================================================
// 📁 파일명: railway.js
// 📌 역할: 대구권 광역철도(대경선) 노선도 시각화 모듈
// ============================================================
//
// [파일 설명]
//   구미역~동대구역~경산역 구간의 대경선(대구권 광역철도) 노선을
//   지도 위에 철도 궤도선 스타일로 시각화하는 모듈입니다.
//   - 역 마커: 구미 관할(구미역, 사곡역, 북삼역) 강조 표시
//   - 역 클릭 시: KORAIL 승하차 통계 API 호출하여 이용객 수 표시
//   - 폴리라인 이중선: 외곽선(검정) + 점선(흰색)으로 철도 느낌 연출
//
// [의존 관계]
//   - config.js → 프록시 URL
//   - map-init.js → window.map 전역 지도 객체
//
// [사용된 외부 API]
//   - KORAIL 역별 승하차 통계 API (B551457)
// ============================================================

window.railwayLayerGroup = L.layerGroup();
window.isRailwayLayerOn = false;
window.railwayLines = [];
window.railwayMarkers = [];

// 하드코딩된 대경선 (구미역 ~ 사곡역 ~ 북삼역) 데이터 (API가 아직 제공하지 않을 경우 대비)
const DAEGYEONG_LINE_STATIONS = [
    { name: "구미역", lat: 36.1284, lng: 128.3309 },
    { name: "사곡역", lat: 36.0967, lng: 128.3564 },
    { name: "북삼역(예정)", lat: 36.0620, lng: 128.3750 },
    { name: "왜관역", lat: 35.9934, lng: 128.4019 },
    { name: "대구역", lat: 35.8765, lng: 128.5960 },
    { name: "동대구역", lat: 35.8797, lng: 128.6284 },
    { name: "경산역", lat: 35.8175, lng: 128.7252 }
];

window.drawDaegyeongLine = function() {
    // 로직 제거
};

window.toggleRailwayLayer = function(show) {
    // 로직 제거
};

function renderDaegyeongLine(stations) {
    var latlngs = stations.map(s => [s.lat, s.lng]);
    
    // 철도 궤도선 효과 (아웃라인)
    var railOutline = L.polyline(latlngs, {
        color: '#1e293b',
        weight: 6,
        opacity: 0.8
    }).addTo(window.railwayLayerGroup);
    
    // 철도 궤도선 점선 (인라인)
    var railInner = L.polyline(latlngs, {
        color: '#f8fafc',
        weight: 3,
        dashArray: '10, 10',
        opacity: 0.9
    }).addTo(window.railwayLayerGroup);

    window.railwayLines.push(railOutline, railInner);

    // 각 역 마커 추가
    stations.forEach(function(st, idx) {
        var isGumiArea = (st.name.includes("구미") || st.name.includes("사곡") || st.name.includes("북삼"));
        var color = isGumiArea ? '#3b82f6' : '#94a3b8';
        var radius = isGumiArea ? 8 : 5;
        
        var marker = L.circleMarker([st.lat, st.lng], {
            radius: radius,
            fillColor: 'white',
            color: color,
            weight: 3,
            opacity: 1,
            fillOpacity: 1
        }).addTo(window.railwayLayerGroup);
        
        var tooltipHtml = `<div style="font-family:Noto Sans KR,sans-serif; font-weight:700; color:${color}; font-size:13px; text-shadow:0 0 4px white;">${st.name}</div>`;
        marker.bindTooltip(tooltipHtml, { permanent: isGumiArea, direction: 'right', offset: [5, 0], className: 'railway-tooltip' });
        
        // 역 클릭 시 통계 (KORAIL API) 호출 바인딩
        marker.on('click', function() {
            var dateStr = getTwoDaysAgoYYYYMMDD(); // D-2 데이터
            window.fetchAPI(`https://apis.data.go.kr/B551457/issueStatistics/mainLineStationPer?_type=json&pageNo=1&numOfRows=50&dttm=${dateStr}&statnNm=${encodeURIComponent(st.name.replace('(예정)', ''))}`)
            .then(function(data) {
                var statsHtml = `<b>${st.name}</b> 통계 데이터 없음`;
                if (data.response && data.response.body && data.response.body.items && data.response.body.items.item) {
                    var items = data.response.body.items.item;
                    if (!Array.isArray(items)) items = [items];
                    var totalBoard = 0, totalAlight = 0;
                    items.forEach(function(i) {
                        totalBoard += parseInt(i.tkcarNprCnt || 0);
                        totalAlight += parseInt(i.gffNprCnt || 0);
                    });
                    statsHtml = `
                    <div style="font-family:Noto Sans KR; min-width:150px;">
                        <h4 style="margin:0 0 6px 0; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">🚆 ${st.name} 승하차 통계</h4>
                        <div style="font-size:11px; color:#64748b; margin-bottom:6px;">기준일자: ${dateStr} (KORAIL 제공)</div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="color:#ef4444; font-weight:700;">승차 인원</span>
                            <b>${totalBoard.toLocaleString()} 명</b>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#3b82f6; font-weight:700;">하차 인원</span>
                            <b>${totalAlight.toLocaleString()} 명</b>
                        </div>
                    </div>`;
                }
                marker.bindPopup(statsHtml).openPopup();
            }).catch(function(e) {
                marker.bindPopup(`<b>${st.name}</b><br>통계 데이터를 불러오지 못했습니다.`).openPopup();
            });
        });
        window.railwayMarkers.push(marker);
    });
}

function getTwoDaysAgoYYYYMMDD() {
    var d = new Date();
    d.setDate(d.getDate() - 2);
    var month = '' + (d.getMonth() + 1);
    var day = '' + d.getDate();
    var year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('');
}
