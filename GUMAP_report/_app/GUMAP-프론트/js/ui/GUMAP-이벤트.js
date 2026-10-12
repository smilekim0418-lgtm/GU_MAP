// ============================================================
// 📁 파일명: js/ui/events.js
// 📌 역할: UI 버튼·토글·탭 등 사용자 인터랙션 이벤트 바인딩
// ============================================================
//
// [파일 설명]
//   HTML 페이지의 모든 버튼, 토글 스위치, 탭 전환 등의 클릭 이벤트를
//   JavaScript 핸들러에 연결(바인딩)하는 초기화 모듈입니다.
//   - 탭 전환: 지도/길찾기/AI비서/연구소 탭 클릭 시 화면 전환
//   - 레이어 토글: CCTV, 교통사고, 공유PM, 철도 등 ON/OFF
//   - 테마 전환: 라이트/다크 모드 토글
//   - 사이드바 개폐: 모바일 햄버거 메뉴 동작
//   - 길찾기 UI: 출발/도착 설정, 검색 실행 버튼 바인딩
//
// [의존 관계]
//   - map-layers.js → 레이어 토글 함수 호출
//   - routing.js → 길찾기 실행 함수 호출
//   - bus_tracker.js → 노선 검색/비교 함수 호출
//   - ai_assistant.js → AI 챗봇 전송 함수 호출
// ============================================================

window.addEventListener('load', function() {
    console.log("Initializing GUMAP UI Event Bindings...");

    // Helper to safely bind click event
    function bindClick(id, callback) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', callback);
        }
    }

    // Helper to safely bind change event
    function bindChange(id, callback) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', callback);
        }
    }

    // Helper to safely bind input event
    function bindInput(id, callback) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', callback);
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

    // ── 3. 실시간 버스 퀵링크 카드 이벤트 ──
    var routeCards = document.querySelectorAll('.route-card-link');
    routeCards.forEach(function(card) {
        card.addEventListener('click', function() {
            var routeNo = card.getAttribute('data-route');
            if (typeof window.selectRoute === 'function') {
                window.selectRoute(routeNo);
            }
        });
    });

    // ── 4. MaaS 정책 연구소 토글 이벤트 ──
    bindChange('research-drt-toggle', function() {
        if (typeof toggleResearchDrt === 'function') toggleResearchDrt(this.checked);
    });

    bindChange('research-heatmap-toggle', function() {
        if (typeof toggleResearchHeatmap === 'function') toggleResearchHeatmap(this.checked);
    });

    bindChange('research-railway-toggle', function() {
        if (typeof window.toggleRailwayLayer === 'function') window.toggleRailwayLayer(this.checked);
    });

    bindChange('research-od-toggle', function() {
        if (typeof window.toggleOdFlowLayer === 'function') window.toggleOdFlowLayer(this.checked);
    });

    bindChange('research-moef-toggle', function() {
        if (typeof window.toggleMoefLayer === 'function') window.toggleMoefLayer(this.checked);
    });

    bindClick('btn-population-report', function() {
        if (typeof window.openPopulationReport === 'function') window.openPopulationReport();
    });

    // ── 5. 시뮬레이터 A (예타 샌드박스) 이벤트 ──
    bindClick('btn-draw-start', function() {
        if (typeof toggleResearchDraw === 'function') toggleResearchDraw(true);
    });

    bindClick('btn-draw-clear', function() {
        if (typeof clearResearchDraw === 'function') clearResearchDraw();
    });

    bindInput('research-vehicle-count', function() {
        var valEl = document.getElementById('research-vehicle-count-val');
        if (valEl) valEl.textContent = this.value;
    });

    bindClick('btn-run-eta-eval', function() {
        if (typeof runResearchEtaEvaluation === 'function') runResearchEtaEvaluation();
    });

    // ── 6. 시뮬레이터 B (기존 노선 효율화) 이벤트 ──
    bindInput('research-extend-hours', function() {
        var valEl = document.getElementById('research-extend-hours-val');
        if (valEl) valEl.textContent = this.value;
        if (typeof window.triggerRouteSimulation === 'function') window.triggerRouteSimulation();
    });

    bindInput('research-add-buses', function() {
        var valEl = document.getElementById('research-add-buses-val');
        if (valEl) valEl.textContent = this.value;
        if (typeof window.triggerRouteSimulation === 'function') window.triggerRouteSimulation();
    });

    // ── 7. 베타 테스트 검증 패널 이벤트 ──
    bindChange('research-cctv-toggle', function() {
        if (typeof toggleResearchCctv === 'function') toggleResearchCctv(this.checked);
    });

    bindClick('btn-shared-calculator', function() {
        if (typeof triggerResearchSharedCalculator === 'function') triggerResearchSharedCalculator();
    });

    bindClick('btn-taxi-call', function() {
        if (typeof triggerResearchTaxiCall === 'function') triggerResearchTaxiCall();
    });

    bindClick('btn-waypoint-mode', function() {
        if (typeof triggerResearchWaypointMode === 'function') triggerResearchWaypointMode();
    });

    // ── 8. 검색창 복구 버튼 ──
    bindClick('show-routing-panel-btn', function() {
        if (typeof showRoutingPanel === 'function') showRoutingPanel();
    });

    // ── 9. 평점/리뷰 모달 이벤트 ──
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

    // ── 10. 개발자 설정 모달 이벤트 ──
    bindClick('btn-close-dev-modal', function() {
        if (typeof hideDevModal === 'function') hideDevModal();
    });

    bindClick('btn-save-dev-config', function() {
        if (typeof saveDevConfig === 'function') saveDevConfig();
    });

    // ── 11. 서버 연결 모달 이벤트 ──
    bindClick('btn-close-server-modal', function() {
        var modal = document.getElementById('server-connect-modal');
        if (modal) modal.style.display = 'none';
    });

    bindClick('btn-save-server-ip', function() {
        if (typeof testAndSaveServerIp === 'function') testAndSaveServerIp();
    });
});
