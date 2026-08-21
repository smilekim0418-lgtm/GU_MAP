// ============================================================
// 📁 파일명: js/ui/favorites.js
// 📌 역할: 장소 즐겨찾기 CRUD 및 렌더링 (localStorage 기반)
// ============================================================
//
// [파일 설명]
//   사용자가 자주 방문하는 장소를 브라우저 localStorage에 저장하고
//   사이드바에 목록으로 표시하는 즐겨찾기 시스템입니다.
//   - addFavorite(): 장소명, 좌표, 주소를 저장
//   - removeFavorite(): 인덱스 기반 삭제
//   - renderFavorites(): 저장된 목록을 사이드바 UI에 렌더링
//   - 각 즐겨찾기 항목에 "출발"/"도착" 버튼으로 길찾기 연동
//   - DOMPurify 라이브러리로 XSS 방지 처리
//
// [의존 관계]
//   - routing.js → setRoutingPoint() 출발/도착지 설정 연동
//   - map-init.js → map.setView() 즐겨찾기 위치로 지도 이동
//
// [데이터 저장소]
//   - localStorage key: 'gumap_favorites'
// ============================================================

window.getFavorites = function() {
    try { return JSON.parse(localStorage.getItem('gumap_favorites') || '[]'); }
    catch(e) { return []; }
};

window.addFavorite = function(name, lat, lng, addr) {
    var favs = window.getFavorites();
    var exists = favs.some(function(f) { return f.name === name && Math.abs(f.lat - lat) < 0.0001; });
    if (exists) { alert('이미 즐겨찾기에 추가된 장소입니다.'); return; }
    favs.push({ name: name, lat: lat, lng: lng, addr: addr || '', icon: '📍', addedAt: new Date().toISOString() });
    localStorage.setItem('gumap_favorites', JSON.stringify(favs));
    window.renderFavorites();
    var infoBar = document.getElementById('clicked-info');
    if (infoBar) infoBar.innerHTML = '⭐ <b>' + name + '</b>을(를) 즐겨찾기에 추가했습니다!';
};

window.removeFavorite = function(index) {
    var favs = window.getFavorites();
    if (index >= 0 && index < favs.length) {
        var removed = favs.splice(index, 1)[0];
        localStorage.setItem('gumap_favorites', JSON.stringify(favs));
        window.renderFavorites();
        var infoBar = document.getElementById('clicked-info');
        if (infoBar) infoBar.innerHTML = '🗑️ <b>' + removed.name + '</b>을(를) 즐겨찾기에서 삭제했습니다.';
    }
};

window.renderFavorites = function() {
    var container = document.getElementById('favorites-list');
    if (!container) return;
    var favs = window.getFavorites();
    if (favs.length === 0) {
        container.innerHTML = '<div style="padding:8px; color:#94a3b8; text-align:center;">저장된 즐겨찾기가 없습니다</div>';
        return;
    }
    var html = '';
    favs.forEach(function(fav, idx) {
        var safeName = (fav.name || '').replace(/'/g, "\\'");
        html += '<div style="display:flex; align-items:center; padding:6px 4px; border-bottom:1px solid #f1f5f9; gap:6px;">';
        html += '<span style="font-size:16px;">' + (fav.icon || '📍') + '</span>';
        html += '<div style="flex:1; min-width:0;">';
        html += '<div onclick="window.map.setView([' + fav.lat + ', ' + fav.lng + '], 17)" style="font-size:12px; font-weight:700; color:#2563eb; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="클릭하여 이동">' + fav.name + '</div>';
        html += '<div style="font-size:10px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (fav.addr || '') + '</div>';
        html += '</div>';
        html += '<div style="display:flex; gap:2px; flex-shrink:0;">';
        html += '<button onclick="window.setRoutingPoint(\'START\',' + fav.lat + ',' + fav.lng + ',\'' + safeName + '\')" style="padding:2px 5px; font-size:9px; background:#3b82f6; color:white; border:none; border-radius:3px; cursor:pointer; font-weight:700;">출발</button>';
        html += '<button onclick="window.setRoutingPoint(\'END\',' + fav.lat + ',' + fav.lng + ',\'' + safeName + '\')" style="padding:2px 5px; font-size:9px; background:#ef4444; color:white; border:none; border-radius:3px; cursor:pointer; font-weight:700;">도착</button>';
        html += '<button onclick="window.removeFavorite(' + idx + ')" style="padding:2px 5px; font-size:9px; background:#f1f5f9; color:#ef4444; border:1px solid #fecaca; border-radius:3px; cursor:pointer; font-weight:700;">🗑️</button>';
        html += '</div></div>';
    });
    container.innerHTML = DOMPurify.sanitize(html, window.DOM_PURIFY_CONFIG);
};
