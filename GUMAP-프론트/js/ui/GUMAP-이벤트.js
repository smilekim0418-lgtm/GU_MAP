// ============================================================
// 📁 파일명: js/ui/GUMAP-이벤트.js
// 📌 역할: UI 버튼·토글·탭 등 사용자 인터랙션 이벤트 바인딩
// ============================================================

window.addEventListener('load', function() {
    console.log("Initializing GUMAP UI Event Bindings...");

    function bindClick(id, callback) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', callback);
        }
    }

    // ── 1. 길찾기 관련 이벤트 ──
    bindClick('btn-clear-waypoint', function() {
        if (typeof clearWaypoint === 'function') clearWaypoint();
    });

    bindClick('btn-clear-routing', function() {
        if (typeof clearRouting === 'function') clearRouting();
    });

    var routeBtns = document.querySelectorAll('.route-tab-btn');
    routeBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mode = btn.getAttribute('data-mode');
            if (typeof calcRoute === 'function') calcRoute(mode);
        });
    });

    // ── G-Route AI 3대 경로 프로파일 변경 이벤트 ──
    var profileRadios = document.querySelectorAll('input[name="route-profile"]');
    profileRadios.forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (typeof calcRoute === 'function') {
                calcRoute('car', 'ai');
            }
        });
    });

    // ── 2. 주변 편의시설 검색 이벤트 ──
    var categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var category = btn.getAttribute('data-category');
            if (typeof searchCategory === 'function') searchCategory(category);
        });
    });

    bindClick('btn-clear-category', function() {
        if (typeof clearCategoryMarkers === 'function') clearCategoryMarkers();
        if (typeof window.clearBusRoute === 'function') window.clearBusRoute();
        if (typeof window.closeBusRoutePanel === 'function') window.closeBusRoutePanel();
        if (typeof window.closeTransitDetailPanel === 'function') window.closeTransitDetailPanel();
        if (typeof window.closeRouteDetailPanel === 'function') window.closeRouteDetailPanel();
        if (typeof window.clearRouting === 'function') window.clearRouting();
    });

    // ── 3. 검색창 복구 버튼 (모바일) ──
    bindClick('show-routing-panel-btn', function() {
        if (typeof showRoutingPanel === 'function') showRoutingPanel();
    });

    // ── 4. 평점/리뷰 모달 이벤트 ──
    var starSpans = document.querySelectorAll('.review-star');
    starSpans.forEach(function(star) {
        star.addEventListener('click', function() {
            var rating = parseInt(star.getAttribute('data-star'));
            if (typeof setReviewStars === 'function') setReviewStars(rating);
        });
    });

    bindClick('btn-close-review-modal', function() {
        var modal = document.getElementById('review-modal');
        if (modal) modal.style.display = 'none';
    });

    bindClick('btn-submit-review', function() {
        if (typeof submitReview === 'function') submitReview();
    });

    // ── 5. 개발자 설정 모달 이벤트 ──
    bindClick('btn-close-dev-modal', function() {
        if (typeof hideDevModal === 'function') hideDevModal();
    });

    bindClick('btn-save-dev-config', function() {
        if (typeof saveDevConfig === 'function') saveDevConfig();
    });

    // ── 6. 서버 연결 모달 이벤트 ──
    bindClick('btn-close-server-modal', function() {
        var modal = document.getElementById('server-connect-modal');
        if (modal) modal.style.display = 'none';
    });

    bindClick('btn-save-server-ip', function() {
        if (typeof testAndSaveServerIp === 'function') testAndSaveServerIp();
    });
});
