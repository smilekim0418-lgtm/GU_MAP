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
        link.textContent = '학교 공식 CAD 지도 보기 ↗';
        link.href = viewer.href;
        link.target = '_blank';
        link.rel = 'noopener';
        link.style.cssText = 'display:block;text-align:center;padding:9px 10px;border:1px solid #6b9afa;border-radius:8px;background:#244ba4;color:#fff;font-size:11px;font-weight:700;text-decoration:none;';
        link.addEventListener('click', () => {
            const target = new URL(viewer);
            target.hash = window.technoActiveFloor || '1F';
            link.href = target.href;
        });
        panel.appendChild(link);
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
