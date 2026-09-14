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
    // 자리·크기·색은 css/indoor.css 가 정한다 (#techno-pano-panel, .is-full, .is-moved).
    // 여기서는 구조와 동작만 만든다.
    let panel = null, frame = null, title = null, fullButton = null;

    const ICON = {
        expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
        shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
        external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    };

    function buildPanel() {
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'techno-pano-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '테크노관 실내 로드뷰');
        // 이 두 줄만 인라인으로 둔다: 스타일시트가 없는 페이지에서도 창이 겹쳐 뜨지 않게
        panel.style.cssText = 'position:fixed;z-index:1200;display:none;flex-direction:column;overflow:hidden;';

        const bar = document.createElement('div');
        bar.className = 'tp-bar';

        title = document.createElement('div');
        title.className = 'tp-title';
        title.textContent = '실내 로드뷰';
        bar.appendChild(title);

        const tag = document.createElement('span');
        tag.className = 'tp-tag';
        tag.textContent = '프로토타입';
        tag.title = '아직 실사진이 없어 CAD 도면으로 합성한 화면입니다';
        bar.appendChild(tag);

        fullButton = iconButton('full', ICON.expand, '전체화면', toggleFull);
        bar.appendChild(fullButton);
        bar.appendChild(iconButton('external', ICON.external, '새 창으로 열기',
            () => window.open(frame.src, '_blank', 'noopener')));
        bar.appendChild(iconButton('close', ICON.close, '닫기', close));
        panel.appendChild(bar);

        frame = document.createElement('iframe');
        frame.title = '테크노관 실내 로드뷰';
        frame.allow = 'fullscreen';
        frame.style.cssText = 'flex:1 1 auto;width:100%;border:0;display:block;background:#0b1020;';
        panel.appendChild(frame);

        if (window.L && L.DomEvent) {
            L.DomEvent.disableScrollPropagation(panel);
            L.DomEvent.disableClickPropagation(panel);
        }
        drag(bar);
        document.body.appendChild(panel);
        return panel;
    }

    function iconButton(action, svg, label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tp-btn';
        button.dataset.act = action;
        button.innerHTML = svg;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', event => { event.stopPropagation(); onClick(); });
        return button;
    }

    function drag(handle) {
        let from = null;
        handle.addEventListener('pointerdown', event => {
            // 전체화면·모바일에서는 끌지 않는다. 모바일은 자리가 정해져 있다.
            if (panel.classList.contains('is-full') || window.innerWidth <= 768) return;
            if (event.target.closest('button')) return;
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
            panel.classList.add('is-moved');
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });
        handle.addEventListener('pointerup', () => { from = null; });
    }

    function setBox(full) {
        panel.classList.toggle('is-full', full);
        panel.dataset.full = full ? '1' : '0';
        if (full) {
            // 끌어 옮긴 자리는 기억만 해 두고, 전체화면 동안은 비운다
            panel.dataset.left = panel.style.left;
            panel.dataset.top = panel.style.top;
            panel.style.left = '';
            panel.style.top = '';
        } else if (panel.classList.contains('is-moved')) {
            panel.style.left = panel.dataset.left || '';
            panel.style.top = panel.dataset.top || '';
        }
        fullButton.innerHTML = full ? ICON.shrink : ICON.expand;
        const label = full ? '작은 창' : '전체화면';
        fullButton.title = label;
        fullButton.setAttribute('aria-label', label);
    }

    function toggleFull() { setBox(panel.dataset.full !== '1'); }

    function openViewer(floor, index) {
        const nodes = FLOORS[floor];
        if (!nodes || !nodes[index]) return;
        buildPanel();
        const was = open;
        open = { floor: floor, index: index };
        panel.style.display = 'flex';
        document.body.classList.add('pano-open');
        title.textContent = floor + ' · ' + placeName(nodes[index]);
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
            document.body.classList.remove('pano-open');
            setBox(false);
            panel.classList.remove('is-moved');
            panel.style.left = '';
            panel.style.top = '';
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
        row.className = 'ti-switch';
        row.title = '줌 ' + MIN_ZOOM + ' 이상 확대하면 복도에 점이 나온다. 복도·계단·로비만 찍는 ' +
            '계획이라 호실 안에는 지점이 없다.';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.id = 'ti-pano-points';
        check.checked = showPoints;
        check.setAttribute('role', 'switch');
        check.addEventListener('change', () => { showPoints = check.checked; refresh(); });
        row.appendChild(document.createTextNode('360 촬영 지점 (로드뷰)'));
        row.appendChild(check);

        const tour = document.getElementById('ti-cad-tour');
        box.insertBefore(row, tour || null);
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
