/**
 * js/kumoh_tab.js
 * ──────────────────────────────────────────────────────────
 * • 연구지도 탭 하단에 (국립금오공대) 전용 탭 UI 구축
 * • 테크노관 방 정보 300개 연동 (주소: 경상북도 구미시 대학로 61 금오공과대학교 테크노관)
 * • 지정 좌표 (위도 36.14673127091222, 경도 128.39411961298228) 100% 매핑
 * • 일반 통합 검색창(#search-input)에서도 방 번호/이름/교수/사업단 키워드 자동 검색 연동
 * • 층별 필터(B1F~6F) 및 특성화 태그(CK-1, 특성화, 산학연, BK21) 다중 검색 지원
 */

(function () {
    'use strict';

    const DEFAULT_COORDS = [36.14673127091222, 128.39411961298228];
    const DEFAULT_ADDRESS = '경상북도 구미시 대학로 61 (양호동) 국립금오공과대학교 테크노관';

    let activeFloorFilter = 'ALL';
    let activeTagFilter = 'ALL';
    let searchKeyword = '';

    /* ══════════════════════════════════════════════════════════
       ① 데이터 파싱 & 통합
       ══════════════════════════════════════════════════════════ */
    function getRoomsData() {
        return window.KUMOH_TECHNO_ROOMS || [];
    }

    /* ══════════════════════════════════════════════════════════
       ② (국립금오공대) 전용 탭 HTML 구조 주입
       ══════════════════════════════════════════════════════════ */
    function initKumohTabUI() {
        const researchPanel = document.getElementById('maas-research-panel');
        if (!researchPanel) return;

        // 이미 탭 버튼이 생성되어 있으면 중복 방지
        if (document.getElementById('kumoh-tab-nav')) return;

        // 1. 기존 상단 제목 바로 아래에 탭 메인 스위처 헤더 생성
        const header = researchPanel.querySelector('h3');
        if (header) {
            const nav = document.createElement('div');
            nav.id = 'kumoh-tab-nav';
            nav.style.cssText = `
display: flex; gap: 6px; margin-bottom: 12px; margin-top: 6px;
border-bottom: 1px solid var(--border-panel, rgba(255,255,255,0.1)); padding-bottom: 8px;
`;
            nav.innerHTML = `
<button id="tab-btn-maas" onclick="window.switchResearchSubTab('maas')"
  style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid #6366f1;
         background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; font-size:11px; font-weight:800; cursor:pointer; transition:all .2s;">
  📊 MaaS 정책 분석
</button>
<button id="tab-btn-kumoh" onclick="window.switchResearchSubTab('kumoh')"
  style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.12);
         background:rgba(255,255,255,0.05); color:#94a3b8; font-size:11px; font-weight:800; cursor:pointer; transition:all .2s;">
  🎓 (국립금오공대) 테크노관
</button>`;
            header.parentNode.insertBefore(nav, header.nextSibling);
        }

        // 2. (국립금오공대) 전용 탭 패널 컨테이너 주입
        const kumohPanel = document.createElement('div');
        kumohPanel.id = 'kumoh-research-subpanel';
        kumohPanel.style.cssText = `display: none; flex-direction: column; gap: 10px; margin-top: 8px;`;

        kumohPanel.innerHTML = `
<!-- 대표 주소 & 좌표 안내 카드 -->
<div style="background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.25); border-radius: 12px; padding: 10px 12px; font-size: 11px; line-height: 1.5; color: #e2e8f0;">
  <div style="font-weight: 800; color: #38bdf8; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
    <span>🏛️ 국립금오공과대학교 테크노관 (61번 건물)</span>
    <span style="font-size: 9px; background: #0284c7; color: #fff; padding: 1px 6px; border-radius: 10px;">B1F~6F 통합</span>
  </div>
  <div>📍 <b>대표 주소:</b> ${DEFAULT_ADDRESS}</div>
  <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">📐 <b>대표 좌표:</b> 위도 36.146731, 경도 128.394120</div>
</div>

<!-- 실내 방 검색 입력창 -->
<div style="position: relative;">
  <input id="kumoh-search-input" type="text" placeholder="🔍 방 번호, 연구실, 학과, 사업단 검색..."
    style="width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #f8fafc; font-size: 12px; outline: none; box-sizing: border-box;">
</div>

<!-- 층 선택 칩 필터 -->
<div>
  <div style="font-size: 10px; color: #64748b; font-weight: 700; margin-bottom: 4px;">층 선택 (FLOOR)</div>
  <div id="kumoh-floor-chips" style="display: flex; flex-wrap: wrap; gap: 4px;">
    <button class="kchip active" onclick="window.setKumohFloorFilter('ALL', this)">전체</button>
    <button class="kchip" onclick="window.setKumohFloorFilter('B1F', this)">B1F</button>
    <button class="kchip" onclick="window.setKumohFloorFilter('1F', this)">1F</button>
    <button class="kchip" onclick="window.setKumohFloorFilter('2F', this)">2F</button>
    <button class="kchip" onclick="window.setKumohFloorFilter('3F', this)">3F</button>
    <button class="kchip" onclick="window.setKumohFloorFilter('4F', this)">4F</button>
    <button class="kchip" onclick="window.setKumohFloorFilter('5F', this)">5F</button>
    <button class="kchip" onclick="window.setKumohFloorFilter('6F', this)">6F</button>
  </div>
</div>

<!-- 특성화 / 사업단 칩 필터 -->
<div>
  <div style="font-size: 10px; color: #64748b; font-weight: 700; margin-bottom: 4px;">사업단 / 특성화 (TAG)</div>
  <div id="kumoh-tag-chips" style="display: flex; flex-wrap: wrap; gap: 4px;">
    <button class="ktag-chip active" onclick="window.setKumohTagFilter('ALL', this)">전체</button>
    <button class="ktag-chip" onclick="window.setKumohTagFilter('ck1', this)">CK-1</button>
    <button class="ktag-chip" onclick="window.setKumohTagFilter('spec', this)">특성화사업</button>
    <button class="ktag-chip" onclick="window.setKumohTagFilter('sanak', this)">산학연</button>
    <button class="ktag-chip" onclick="window.setKumohTagFilter('bk21', this)">BK21</button>
  </div>
</div>

<!-- 방 카드리스트 표출 영역 -->
<div id="kumoh-room-grid" style="display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto; padding-right: 2px;"></div>
`;

        researchPanel.appendChild(kumohPanel);

        // 스타일 주입
        injectKumohStyles();

        // 검색창 이벤트 처리
        const searchInput = document.getElementById('kumoh-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                searchKeyword = this.value.trim().toLowerCase();
                renderKumohRoomCards();
            });
        }

        renderKumohRoomCards();
    }

    function injectKumohStyles() {
        if (document.getElementById('kumoh-tab-styles')) return;
        const st = document.createElement('style');
        st.id = 'kumoh-tab-styles';
        st.textContent = `
.kchip, .ktag-chip {
  padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); color: #94a3b8; font-size: 10px; font-weight: 700;
  cursor: pointer; transition: all .15s;
}
.kchip.active { background: #6366f1 !important; color: #fff !important; border-color: #6366f1 !important; }
.ktag-chip.active { background: #0ea5e9 !important; color: #fff !important; border-color: #0ea5e9 !important; }
.kumoh-room-card {
  background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;
  transition: all .2s;
}
.kumoh-room-card:hover { border-color: #6366f1; background: rgba(30, 41, 59, 0.9); }
`;
        document.head.appendChild(st);
    }

    /* ══════════════════════════════════════════════════════════
       ③ 탭 스위칭 컨트롤러
       ══════════════════════════════════════════════════════════ */
    window.switchResearchSubTab = function (tabName) {
        const maasBtn = document.getElementById('tab-btn-maas');
        const kumohBtn = document.getElementById('tab-btn-kumoh');
        const kumohPanel = document.getElementById('kumoh-research-subpanel');
        const researchPanel = document.getElementById('maas-research-panel');

        if (!researchPanel) return;

        // MaaS 전용 자식 요소들 찾기
        const childNodes = Array.from(researchPanel.children);

        if (tabName === 'kumoh') {
            if (maasBtn) {
                maasBtn.style.background = 'rgba(255,255,255,0.05)';
                maasBtn.style.color = '#94a3b8';
                maasBtn.style.borderColor = 'rgba(255,255,255,0.12)';
            }
            if (kumohBtn) {
                kumohBtn.style.background = 'linear-gradient(135deg,#0ea5e9,#0284c7)';
                kumohBtn.style.color = '#fff';
                kumohBtn.style.borderColor = '#0ea5e9';
            }

            // MaaS 내용 숨기고 금오공대 전용 탭 보여주기
            childNodes.forEach(child => {
                if (child.id !== 'maas-research-panel-title' && child.id !== 'kumoh-tab-nav' && child.id !== 'kumoh-research-subpanel' && child.tagName !== 'H3') {
                    child.style.display = 'none';
                }
            });
            if (kumohPanel) kumohPanel.style.display = 'flex';
        } else {
            if (maasBtn) {
                maasBtn.style.background = 'linear-gradient(135deg,#6366f1,#4f46e5)';
                maasBtn.style.color = '#fff';
                maasBtn.style.borderColor = '#6366f1';
            }
            if (kumohBtn) {
                kumohBtn.style.background = 'rgba(255,255,255,0.05)';
                kumohBtn.style.color = '#94a3b8';
                kumohBtn.style.borderColor = 'rgba(255,255,255,0.12)';
            }

            // 금오공대 전용 탭 숨기고 MaaS 내용 보여주기
            if (kumohPanel) kumohPanel.style.display = 'none';
            childNodes.forEach(child => {
                if (child.id !== 'kumoh-tab-nav' && child.id !== 'kumoh-research-subpanel') {
                    child.style.display = '';
                }
            });
        }
    };

    /* ══════════════════════════════════════════════════════════
       ④ 필터링 및 카드리스트 렌더링
       ══════════════════════════════════════════════════════════ */
    window.setKumohFloorFilter = function (floor, btnEl) {
        activeFloorFilter = floor;
        const container = document.getElementById('kumoh-floor-chips');
        if (container) {
            container.querySelectorAll('.kchip').forEach(b => b.classList.remove('active'));
        }
        if (btnEl) btnEl.classList.add('active');
        renderKumohRoomCards();
    };

    window.setKumohTagFilter = function (tag, btnEl) {
        activeTagFilter = tag;
        const container = document.getElementById('kumoh-tag-chips');
        if (container) {
            container.querySelectorAll('.ktag-chip').forEach(b => b.classList.remove('active'));
        }
        if (btnEl) btnEl.classList.add('active');
        renderKumohRoomCards();
    };

    function renderKumohRoomCards() {
        const grid = document.getElementById('kumoh-room-grid');
        if (!grid) return;

        const rooms = getRoomsData();
        const filtered = rooms.filter(r => {
            // 층 필터
            if (activeFloorFilter !== 'ALL' && r.floor !== activeFloorFilter) return false;

            // 태그 필터
            if (activeTagFilter !== 'ALL') {
                if (activeTagFilter === 'ck1' && !r.ck1) return false;
                if (activeTagFilter === 'spec' && !r.spec) return false;
                if (activeTagFilter === 'sanak' && !r.sanak) return false;
                if (activeTagFilter === 'bk21' && !r.bk21) return false;
            }

            // 키워드 검색
            if (searchKeyword) {
                const text = (r.id + ' ' + r.name + ' ' + r.dept + ' ' + r.floor + ' ' + (r.address || '')).toLowerCase();
                if (!text.includes(searchKeyword)) return false;
            }

            return true;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `<div style="padding:20px; text-align:center; color:#64748b; font-size:11px;">검색 조건에 해당되는 방/연구실 정보가 없습니다.</div>`;
            return;
        }

        grid.innerHTML = filtered.map(r => {
            const tagBadges = [];
            if (r.ck1) tagBadges.push('<span style="background:rgba(99,102,241,0.2);color:#818cf8;padding:1px 5px;border-radius:4px;font-size:9px;border:1px solid rgba(99,102,241,0.3);">#CK-1</span>');
            if (r.spec) tagBadges.push('<span style="background:rgba(14,165,233,0.2);color:#38bdf8;padding:1px 5px;border-radius:4px;font-size:9px;border:1px solid rgba(14,165,233,0.3);">#특성화사업</span>');
            if (r.sanak) tagBadges.push('<span style="background:rgba(16,185,129,0.2);color:#34d399;padding:1px 5px;border-radius:4px;font-size:9px;border:1px solid rgba(16,185,129,0.3);">#산학연</span>');
            if (r.bk21) tagBadges.push('<span style="background:rgba(236,72,153,0.2);color:#f472b6;padding:1px 5px;border-radius:4px;font-size:9px;border:1px solid rgba(236,72,153,0.3);">#BK21</span>');

            return `
<div class="kumoh-room-card">
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="background:#6366f1; color:#fff; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:800;">${escHtml(r.floor)}</span>
      <b style="font-size:13px; color:#f8fafc;">${escHtml(r.id)}호</b>
    </div>
    <span style="font-size:10px; color:#94a3b8;">${escHtml(r.dept || '금오공과대학교')}</span>
  </div>

  <div style="font-size:12px; font-weight:700; color:#e2e8f0;">
    ${escHtml(r.name)}
  </div>

  <div style="font-size:9px; color:#64748b; display:flex; align-items:center; gap:4px;">
    📍 ${escHtml(r.address)}
  </div>

  ${tagBadges.length > 0 ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">${tagBadges.join('')}</div>` : ''}

  <div style="display:flex; gap:6px; margin-top:4px;">
    <button onclick="window.focusKumohRoomMap('${escHtml(r.id)}', '${escHtml(r.floor)}')"
      style="flex:1; padding:6px; background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; border:none; border-radius:6px; font-size:10px; font-weight:800; cursor:pointer;">
      📍 지도에서 보기
    </button>
    <button onclick="window.routeToTechnoRoom('${escHtml(r.name)}') "
      style="flex:1; padding:6px; background:rgba(255,255,255,0.08); color:#e2e8f0; border:1px solid rgba(255,255,255,0.12); border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;">
      🧭 길찾기
    </button>
  </div>
</div>`;
        }).join('');
    }

    function escHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    /* ══════════════════════════════════════════════════════════
       ⑤ 지도 이동 연동 (지정 위치 좌표: 36.146731, 128.394120)
       ══════════════════════════════════════════════════════════ */
    window.focusKumohRoomMap = function (roomId, floorLabel) {
        if (!window.map) return;

        // 1. 카메라 이동 (요청 좌표)
        window.map.flyTo(DEFAULT_COORDS, 19, { duration: 0.8 });

        // 2. 실내지도 층 전환
        if (floorLabel && typeof window.technoActiveFloor !== 'undefined') {
            window.technoActiveFloor = floorLabel;
            if (typeof window.renderTechnoFloor === 'function') {
                window.renderTechnoFloor();
            }
            const panel = document.getElementById('techno-indoor-panel');
            if (panel) panel.style.display = 'flex';
        }

        if (window.showToast) window.showToast(`📍 테크노관 ${floorLabel} ${roomId}호로 이동합니다.`);
    };

    /* ══════════════════════════════════════════════════════════
       ⑥ 메인 검색창(#search-input) 연동 ("일반검색으로도 찾게 해주기")
       ══════════════════════════════════════════════════════════ */
    function attachMainSearchIntegration() {
        if ((window.GUMAP_WEEK || 99) < 5) return;  /* [REPORT] 테크노관 호실 검색은 5주차 */
        const origSearchPlace = window.searchPlace;
        if (typeof origSearchPlace !== 'function') return;

        window.searchPlace = function () {
            const query = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
            if (!query) {
                origSearchPlace.apply(this, arguments);
                return;
            }

            const rooms = getRoomsData();
            const hits = rooms.filter(r => {
                const text = (r.id + ' ' + r.name + ' ' + r.dept + ' ' + r.floor + ' ' + (r.address || '')).toLowerCase();
                return text.includes(query);
            });

            // 원래 검색 먼저 실행
            origSearchPlace.apply(this, arguments);

            // 검색 결과 창에 테크노관 방 정보 결과 상단 삽입
            setTimeout(() => {
                const resultDiv = document.getElementById('search-results');
                if (!resultDiv || hits.length === 0) return;

                const kumohHtml = `
<div style="background:rgba(15,23,42,0.95); border:1px solid #6366f1; border-radius:10px; padding:10px; margin-bottom:8px;">
  <div style="font-size:11px; font-weight:800; color:#818cf8; margin-bottom:6px; display:flex; align-items:center; gap:4px;">
    🎓 (국립금오공대) 테크노관 검색 결과 (${hits.length}건)
  </div>
  <div style="display:flex; flex-direction:column; gap:4px; max-height:160px; overflow-y:auto;">
    ${hits.slice(0, 6).map(h => `
<div onclick="window.focusKumohRoomMap('${escHtml(h.id)}', '${escHtml(h.floor)}'); document.getElementById('search-results').style.display='none';"
  style="padding:6px 8px; background:rgba(255,255,255,0.05); border-radius:6px; cursor:pointer; font-size:11px; color:#e2e8f0; display:flex; justify-content:space-between; align-items:center;"
  onmouseover="this.style.background='rgba(99,102,241,0.2)'"
  onmouseout="this.style.background='rgba(255,255,255,0.05)'">
  <span><b style="color:#38bdf8;">[${escHtml(h.floor)}]</b> <b>${escHtml(h.id)}호</b> ${escHtml(h.name)}</span>
  <span style="font-size:10px; color:#10b981; font-weight:700;">위치 보기→</span>
</div>`).join('')}
  </div>
</div>`;

                resultDiv.innerHTML = kumohHtml + resultDiv.innerHTML;
                resultDiv.style.display = 'block';
            }, 100);
        };
    }

    /* ══════════════════════════════════════════════════════════
       ⑦ 초기화
       ══════════════════════════════════════════════════════════ */
    window.initKumohTab = function () {
        initKumohTabUI();
        attachMainSearchIntegration();
        console.log('[KumohTab] (국립금오공대) 전용 탭 및 통합검색 연동 완료 (300개 방 정보)');
    };

    function waitForDOM() {
        if (document.getElementById('maas-research-panel')) {
            window.initKumohTab();
        } else {
            setTimeout(waitForDOM, 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForDOM);
    } else {
        waitForDOM();
    }

})();
