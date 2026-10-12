/**
 * GUMAP 활동보고서용 주차 스냅샷 — 주차 게이트
 * ──────────────────────────────────────────────────────────
 * 각 주차 폴더의 index.html 이 이 파일보다 먼저 window.GUMAP_WEEK 를 정한다.
 * 이 파일은 (1) body 에 wk-ge-N 클래스를 달아 CSS 로 기능을 가리고,
 * (2) 머리글에 빌드 표시를 하고, (3) 15주차 전에는 검색창을 AI 대신
 * 일반 검색으로만 돌린다. 나머지 게이트는 _app/GUMAP-프론트 사본 안의
 * "[REPORT]" 주석이 붙은 줄에 있다.
 *
 * ?badge=0 을 붙이면 빌드 표시를 숨긴다.
 */
(function () {
    'use strict';

    var W = Number(window.GUMAP_WEEK) || 99;
    window.GUMAP_WEEK = W;
    window.gumapWeek = function (n) { return W >= n; };

    // 계획서 추진 일정의 산출물 이름을 그대로 빌드 이름으로 쓴다.
    var BUILDS = {
        1:  { ver: 'v0.1', label: '개발환경 구축',            date: '09.17' },
        2:  { ver: 'v0.1', label: '요구사항·아키텍처',        date: '09.24' },
        3:  { ver: 'v0.2', label: '도면 추출 파이프라인',     date: '10.01' },
        4:  { ver: 'v0.2', label: '층별 좌표 정합',           date: '10.08' },
        5:  { ver: 'v0.3', label: '테크노관 IMDF 실내지도',   date: '10.15' },
        6:  { ver: 'v0.4', label: '실내 길찾기 v0.1',         date: '10.22' },
        7:  { ver: 'v0.5', label: '실내외 통합 길찾기',       date: '10.29' },
        8:  { ver: 'v0.6', label: '테크노관 실내지도 완성본', date: '11.05' },
        9:  { ver: 'v0.6', label: '자동화 기준선·학습 데이터', date: '11.12' },
        10: { ver: 'v0.7', label: '도면 인식 모델 v1',        date: '11.19' },
        11: { ver: 'v0.7', label: '자동 라벨링 파이프라인',   date: '11.26' },
        12: { ver: 'v0.8', label: '신규 건물 실내지도',       date: '12.03' },
        13: { ver: 'v0.8', label: '캠퍼스 통합 경로망',       date: '12.10' },
        14: { ver: 'v0.85', label: '통합 경로 탐색 엔진',     date: '12.17' },
        15: { ver: 'v0.9', label: '자연어 안내 모듈',         date: '12.24' }
    };
    var build = BUILDS[W] || null;
    window.GUMAP_BUILD = build;

    var params = new URLSearchParams(location.search);
    var showBadge = params.get('badge') !== '0';

    function onReady() {
        var body = document.body;
        for (var i = 1; i <= Math.min(W, 30); i++) body.classList.add('wk-ge-' + i);
        body.classList.add('wk-' + W);

        if (build && showBadge) {
            var sub = document.querySelector('#app-header p');
            if (sub) {
                sub.innerHTML = '구미시 통합 모빌리티 지도 <span class="gm-build-chip">' +
                    build.ver + ' · ' + W + '주차</span>';
            }
        }
        if (build) document.title = 'GUMAP ' + build.ver + ' · ' + W + '주차 — ' + build.label;

        // 15주차(LLM 자연어 안내) 전에는 검색창이 장소·버스 검색만 한다.
        if (W < 15) {
            var input = document.getElementById('search-input');
            if (input) input.placeholder = '장소, 버스, 정류장 검색';
            window.handleSearchInput = function () {
                var query = (document.getElementById('search-input') || {}).value;
                if (!query || !query.trim()) return;
                if (window.searchPlace) window.searchPlace();
            };
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();
})();
