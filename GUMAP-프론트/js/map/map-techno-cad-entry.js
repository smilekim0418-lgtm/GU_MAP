/** Add the official CAD viewer while preserving the existing IMDF and routing. */
(function () {
    'use strict';
    const script = document.currentScript;
    const viewer = new URL('../../../테크노관-CAD.html', script.src);
    function mount() {
        const panel = document.getElementById('techno-indoor-panel');
        if (!panel) return false;
        if (document.getElementById('ti-official-cad')) return true;
        const link = document.createElement('a');
        link.id = 'ti-official-cad';
        link.textContent = '학교 공식 CAD 도면 뷰어 ↗';
        link.href = viewer.href;
        link.target = '_blank';
        link.rel = 'noopener';
        // 모양은 css/indoor.css 가 정한다. 그 스타일시트가 없는 페이지를 위해 최소한만 둔다.
        link.style.cssText = 'display:block;text-align:center;padding:9px 10px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;';
        link.addEventListener('click', () => {
            const target = new URL(viewer);
            target.hash = window.technoActiveFloor || '1F';
            link.href = target.href;
        });
        (document.getElementById('ti-layers-slot') || panel).appendChild(link);
        return true;
    }
    if (!mount()) {
        const observer = new MutationObserver(() => {
            if (mount()) observer.disconnect();
        });
        observer.observe(document.body, {childList: true, subtree: true});
        window.addEventListener('pagehide', () => observer.disconnect(), {once: true});
    }
})();
