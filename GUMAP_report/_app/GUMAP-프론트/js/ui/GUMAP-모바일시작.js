/**
 * 모바일 첫 화면: 바텀시트를 접은 채로 시작한다.
 * ──────────────────────────────────────────────────────────
 * index.html 의 #routing-panel 은 panel-expanded 로 시작한다. 데스크톱에서는
 * 사이드바라 상관없지만, 모바일에서는 그게 화면 90% 를 덮는 바텀시트라서
 * 지도 앱을 열었는데 지도가 안 보였다. 모바일에서만 접힘으로 바꾼다.
 * 사용자가 핸들을 끌어 올리면 기존 제스처 코드가 그대로 펼친다.
 */
(function () {
    'use strict';
    function collapse() {
        if (window.innerWidth > 768) return;
        var panel = document.getElementById('routing-panel');
        if (!panel || !panel.classList.contains('panel-expanded')) return;
        panel.classList.remove('panel-expanded', 'panel-hidden');
        panel.classList.add('panel-collapsed');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', collapse);
    } else {
        collapse();
    }
})();
