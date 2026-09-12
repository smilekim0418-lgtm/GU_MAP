/**
 * 테크노관 실내 로드뷰 — 지도 위 촬영 지점과 작은 창
 * map-techno-pano-layer.js
 * ──────────────────────────────────────────────────────────
 * 카카오맵·네이버지도의 로드뷰와 같은 흐름이다. 지도에 카메라 자리가 찍히고,
 * 누르면 **작은 창** 이 열린다. 전체화면은 거기서 한 번 더 눌러야 열린다.
 * 지도를 보다가 안이 궁금할 때 지도를 잃지 않게 하려는 것이다.
 *
 * 지점 자리는 panorama_nodes.py 가 도면에서 뽑아 map-techno-pano-data.js 에
 * 넣어 둔다. 배열 순서가 곧 뷰어의 지점 번호라서, 여기서 번호만 넘기면 뷰어가
 * 그 자리를 연다. 창이 이미 열려 있으면 다시 싣지 않고 번호만 보낸다.
 *
 * 아직 실사진이 없다. 지금 창에 뜨는 그림은 CAD 벽선으로 합성한 것이고,
 * 화면에도 그렇게 적어 둔다.
 */
(function () {
    'use strict';

    const DATA = window.TECHNO_PANO;
    if (!DATA || !Array.isArray(DATA.floors)) return;

    const SCRIPT = document.currentScript;
    const PROJECT_ROOT = new URL('../../../', SCRIPT.src).href;
    const TOUR = new URL(DATA.tour, PROJECT_ROOT).href;

    const FLOORS = {};
    DATA.floors.forEach(f => { FLOORS[f.floor] = f.nodes; });

    const TECHNO_CENTER = [36.146643, 128.394348];
    const NEAR_M = 1200;
    const MIN_ZOOM = 19;       // 이보다 멀면 점이 서로 겹쳐 도면만 더럽힌다
    const KIND_TEXT = { door: '문간', corridor: '복도' };

    let showPoints = true;
    let open = null;           // {floor, index}

    const renderer = L.canvas({ padding: 0.3 });
    const pointLayer = L.layerGroup();
    window.technoPanoLayer = pointLayer;

    function activeFloor() { return window.technoActiveFloor || '1F'; }

    function placeName(node) {
        const kind = KIND_TEXT[node[3]] || node[3];
        return node[2] ? node[2] + '호 앞 ' + kind : kind;
    }

    /* ─────────────── 지도 위의 카메라 자리 ─────────────── */
    function renderPoints() {
        pointLayer.clearLayers();
        if (!showPoints) return;
        const floor = activeFloor();
        const nodes = FLOORS[floor];
        if (!nodes || !window.map) return;
        const bounds = window.map.getBounds().pad(0.25);
        nodes.forEach((node, index) => {
            if (!bounds.contains([node[0], node[1]])) return;
            const here = open && open.floor === floor && open.index === index;
            const marker = L.circleMarker([node[0], node[1]], {
                renderer: renderer,
                radius: here ? 7 : 4.5,
                weight: here ? 3 : 1.6,
                color: here ? '#fbbf24' : '#e0e7ff',
                fillColor: node[3] === 'door' ? '#f59e0b' : '#6366f1',
                fillOpacity: 0.95
            });
            marker.on('click', () => openViewer(floor, index));
            marker.bindTooltip(floor + ' · ' + placeName(node) + ' — 눌러서 로드뷰',
                { direction: 'top', offset: [0, -6] });
            pointLayer.addLayer(marker);
        });
    }

    /* ─────────────── 작은 창 ─────────────── */
    let panel = null, frame = null, title = null, fullButton = null;

    function buildPanel() {
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'techno-pano-panel';
        panel.style.cssText = [
            'position:fixed', 'right:16px', 'bottom:16px', 'width:420px', 'height:300px',
            'z-index:1200', 'display:none', 'flex-direction:column', 'overflow:hidden',
            'border-radius:12px', 'border:1px solid rgba(148,163,184,.35)',
            'background:#0b1020', 'box-shadow:0 18px 44px rgba(0,0,0,.55)'
        ].join(';');

        const bar = document.createElement('div');
        bar.style.cssText = [
            'display:flex', 'align-items:center', 'gap:8px', 'padding:7px 10px',
            'background:rgba(15,23,42,.95)', 'border-bottom:1px solid rgba(148,163,184,.2)',
            'cursor:move', 'flex:0 0 auto', 'user-select:none'
        ].join(';');

        title = document.createElement('div');
        title.style.cssText = 'flex:1;min-width:0;font-size:11px;font-weight:800;color:#e2e8f0;' +
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        title.textContent = '실내 로드뷰';
        bar.appendChild(title);

        const tag = document.createElement('span');
        tag.textContent = '프로토타입';
        tag.style.cssText = 'flex:0 0 auto;font-size:9px;font-weight:700;background:#b45309;' +
            'color:#fff;padding:1px 6px;border-radius:9px;';
        bar.appendChild(tag);

        fullButton = chip('⛶ 전체화면', toggleFull);
        bar.appendChild(fullButton);
        bar.appendChild(chip('↗', () => window.open(frame.src, '_blank', 'noopener'), '새 창으로'));
        bar.appendChild(chip('✕', close, '닫기'));
        panel.appendChild(bar);

        frame = document.createElement('iframe');
        frame.title = '테크노관 실내 로드뷰';
        frame.allow = 'fullscreen';
        frame.style.cssText = 'flex:1 1 auto;width:100%;border:0;display:block;background:#0b1020;';
        panel.appendChild(frame);

        drag(bar);
        document.body.appendChild(panel);
        return panel;
    }

    function chip(text, onClick, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        if (label) button.title = label;
        button.style.cssText = 'flex:0 0 auto;padding:3px 8px;font-size:10px;font-weight:700;' +
            'cursor:pointer;border-radius:6px;border:1px solid rgba(148,163,184,.35);' +
            'background:rgba(255,255,255,.06);color:#cbd5e1;';
        button.addEventListener('click', event => { event.stopPropagation(); onClick(); });
        return button;
    }

    function drag(handle) {
        let from = null;
        handle.addEventListener('pointerdown', event => {
            if (panel.dataset.full === '1' || event.target.tagName === 'BUTTON') return;
            const box = panel.getBoundingClientRect();
            from = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
            handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener('pointermove', event => {
            if (!from) return;
            const box = panel.getBoundingClientRect();
            const left = Math.max(0, Math.min(window.innerWidth - box.width,
                from.left + event.clientX - from.x));
            const top = Math.max(0, Math.min(window.innerHeight - box.height,
                from.top + event.clientY - from.y));
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });
        handle.addEventListener('pointerup', () => { from = null; });
    }

    function setBox(full) {
        const style = panel.style;
        style.left = full ? '0px' : 'auto';
        style.top = full ? '0px' : 'auto';
        style.right = full ? '0px' : '16px';
        style.bottom = full ? '0px' : '16px';
        style.width = full ? '100vw' : '420px';
        style.height = full ? '100vh' : '300px';
        style.borderRadius = full ? '0' : '12px';
        panel.dataset.full = full ? '1' : '0';
        if (fullButton) fullButton.textContent = full ? '⤢ 작은 창' : '⛶ 전체화면';
    }

    function toggleFull() { setBox(panel.dataset.full !== '1'); }

    function openViewer(floor, index) {
        const nodes = FLOORS[floor];
        if (!nodes || !nodes[index]) return;
        buildPanel();
        const was = open;
        open = { floor: floor, index: index };
        panel.style.display = 'flex';
        title.textContent = '📷 ' + floor + ' · ' + placeName(nodes[index]);
        const target = TOUR + '?embed=1&floor=' + encodeURIComponent(floor) + '&node=' + index;
        if (was && frame.contentWindow && frame.dataset.ready === '1') {
            // 이미 떠 있으면 다시 싣지 않는다. 1.8 MB 를 매번 받을 이유가 없다.
            frame.contentWindow.postMessage({ kind: 'pano:go', floor: floor, node: index }, '*');
        } else {
            frame.dataset.ready = '0';
            frame.onload = () => { frame.dataset.ready = '1'; };
            frame.src = target;
        }
        renderPoints();
    }
    window.openTechnoPano = openViewer;

    function close() {
        open = null;
        if (panel) {
            panel.style.display = 'none';
            setBox(false);
            frame.src = 'about:blank';
            frame.dataset.ready = '0';
        }
        renderPoints();
    }

    /* ─────────────── 표시 제어 ─────────────── */
    function refresh() {
        const map = window.map;
        if (!map) return;
        const visible = showPoints && map.getZoom() >= MIN_ZOOM &&
            map.distance(map.getCenter(), TECHNO_CENTER) <= NEAR_M;
        if (visible && !map.hasLayer(pointLayer)) pointLayer.addTo(map);
        if (!visible && map.hasLayer(pointLayer)) map.removeLayer(pointLayer);
        if (visible) renderPoints();
    }
    window.refreshTechnoPanoLayer = refresh;

    function mountUI() {
        const box = document.getElementById('ti-cad-box');
        if (!box) return false;
        if (document.getElementById('ti-pano-points')) return true;

        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;' +
            'color:var(--text-muted);cursor:pointer;';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.id = 'ti-pano-points';
        check.checked = showPoints;
        check.style.cssText = 'width:13px;height:13px;accent-color:#6366f1;cursor:pointer;';
        check.addEventListener('change', () => { showPoints = check.checked; refresh(); });
        row.appendChild(check);
        row.appendChild(document.createTextNode('360 촬영 지점 (누르면 로드뷰)'));

        const tour = document.getElementById('ti-cad-tour');
        box.insertBefore(row, tour || null);

        const note = document.createElement('div');
        note.style.cssText = 'font-size:9px;color:var(--text-muted);line-height:1.5;';
        note.textContent = '지점은 확대(줌 ' + MIN_ZOOM + ' 이상)해야 나온다. 복도·계단·로비만 ' +
            '찍는 계획이라 호실 안에는 지점이 없다.';
        box.insertBefore(note, tour || null);
        return true;
    }

    function start() {
        if (!window.map || typeof L === 'undefined') { setTimeout(start, 300); return; }
        if (!mountUI()) {
            const observer = new MutationObserver(() => { if (mountUI()) observer.disconnect(); });
            observer.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
        }

        // 층을 바꾸면 그 층 지점으로 갈아 끼운다. 열려 있는 창도 같이 옮긴다.
        const original = window.renderTechnoFloor;
        if (typeof original === 'function' && !original._panoWrapped) {
            const wrapped = function () {
                const result = original.apply(this, arguments);
                if (open && open.floor !== activeFloor()) close();
                refresh();
                return result;
            };
            wrapped._panoWrapped = true;
            window.renderTechnoFloor = window.renderTechnoB1Floor = wrapped;
        }

        window.map.on('zoomend moveend', refresh);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && open) close();
        });
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
