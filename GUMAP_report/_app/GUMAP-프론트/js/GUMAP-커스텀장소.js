/**
 * custom_places.js - 지도 핀 찍기 / 커스텀 장소 추가 모듈
 */
(function () {
    "use strict";

    var STORAGE_KEY = "gumap_custom_places";
    var CATEGORY_LIST = ["기타","학교·교육","음식·카페","의료·약국","쇼핑","업무·회사","문화·여가","스포츠","교통","주거","자연·공원"];

    var placingMode = false;
    var pendingLatLng = null;
    var customMarkers = [];
    var selEmoji = "📍";
    var selColor = "#6366f1";

    var EMOJIS = ["📍","🏫","🍽️","☕","🏥","🏪","🏢","🎭","⚽","🚌","🏠","🌿","🔬","🎓","🏗️","🌊","🗺️","⭐","🔥","💡"];
    var COLORS  = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#64748b"];

    function loadPlaces() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
        catch (e) { return []; }
    }
    function savePlaces(places) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    }

    function escHtml(s) {
        return String(s || "").replace(/[&<>"']/g, function(c) {
            return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
        });
    }

    function makeIcon(emoji, color) {
        var bg = color || "#6366f1";
        return L.divIcon({
            className: "gmap-cpin-wrap",
            html: '<div style="position:relative;display:flex;flex-direction:column;align-items:center;">' +
                  '<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
                  'background:' + bg + ';border-radius:50% 50% 50% 0;transform:rotate(-45deg);font-size:16px;' +
                  'box-shadow:0 4px 12px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.25);">' +
                  '<span style="transform:rotate(45deg);">' + (emoji || "📍") + "</span></div>" +
                  '<div style="width:4px;height:10px;background:' + bg + ';margin-top:-2px;border-radius:0 0 3px 3px;"></div>' +
                  "</div>",
            iconSize: [36, 46],
            iconAnchor: [18, 46],
            popupAnchor: [0, -50]
        });
    }

    function buildPopupHtml(p) {
        return '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;min-width:200px;' +
               'background:#0f172a;border-radius:12px;border:1px solid ' + (p.color||"#6366f1") + '40;padding:12px;">' +
               '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
               '<span style="font-size:22px;">' + escHtml(p.emoji||"📍") + '</span>' +
               '<div><div style="font-size:13px;font-weight:800;color:#f8fafc;">' + escHtml(p.name) + '</div>' +
               '<div style="font-size:10px;color:#64748b;">' + escHtml(p.category||"기타") + '</div></div></div>' +
               (p.memo ? '<div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-bottom:8px;' +
               'padding:6px;background:rgba(255,255,255,.05);border-radius:6px;">' + escHtml(p.memo) + "</div>" : "") +
               '<div style="font-size:10px;color:#475569;margin-bottom:8px;">📐 ' +
               p.lat.toFixed(6) + ", " + p.lng.toFixed(6) +
               '<br>🕒 ' + escHtml(p.createdAt||"") + '</div>' +
               '<div style="display:flex;gap:6px;">' +
               '<button id="cplace-fly-' + p.id + '" style="flex:1;padding:6px;background:' + (p.color||"#6366f1") + ';' +
               'color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">🗺️ 이동</button>' +
               '<button id="cplace-del-' + p.id + '" style="flex:1;padding:6px;background:rgba(239,68,68,.2);' +
               'color:#f87171;border:1px solid #f8717140;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">🗑️ 삭제</button>' +
               "</div></div>";
    }

    function addMarkerToMap(p) {
        if (!window.map) return;
        var marker = L.marker([p.lat, p.lng], { icon: makeIcon(p.emoji, p.color) });
        marker.bindPopup(buildPopupHtml(p), { maxWidth: 260 });
        marker.on("popupopen", function() {
            var del = document.getElementById("cplace-del-" + p.id);
            if (del) del.onclick = function() { deletePlace(p.id); };
            var fly = document.getElementById("cplace-fly-" + p.id);
            if (fly) fly.onclick = function() {
                window.map.flyTo([p.lat, p.lng], 18, { duration: 0.7 });
                marker.closePopup();
            };
        });
        marker.addTo(window.map);
        customMarkers.push({ id: p.id, marker: marker });
    }

    function deletePlace(id) {
        var entry = customMarkers.find(function(m) { return m.id === id; });
        if (entry) { try { window.map.removeLayer(entry.marker); } catch(e){} }
        customMarkers = customMarkers.filter(function(m) { return m.id !== id; });
        savePlaces(loadPlaces().filter(function(p) { return p.id !== id; }));
        refreshListPanel();
        if (window.showToast) window.showToast("🗑️ 장소가 삭제됐습니다.");
    }

    function renderAll() {
        customMarkers.forEach(function(m) { try { window.map.removeLayer(m.marker); } catch(e){} });
        customMarkers = [];
        loadPlaces().forEach(addMarkerToMap);
        refreshListPanel();
    }

    function refreshListPanel() {
        var list = document.getElementById("cplace-list-body");
        if (!list) return;
        var places = loadPlaces();
        if (!places.length) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:#475569;font-size:12px;">' +
                '아직 추가된 장소가 없습니다.<br><span style="font-size:11px;opacity:.7;">📍 버튼으로 핀을 찍어보세요!</span></div>';
            return;
        }
        list.innerHTML = places.map(function(p) {
            return '<div onclick="window.flyToCustomPlace(\'' + p.id + '\')" style="display:flex;align-items:center;gap:10px;' +
                   'padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;transition:background .15s;"' +
                   ' onmouseover="this.style.background=\'rgba(255,255,255,.06)\'" onmouseout="this.style.background=\'transparent\'">' +
                   '<span style="font-size:18px;flex-shrink:0;">' + escHtml(p.emoji||"📍") + '</span>' +
                   '<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                   escHtml(p.name) + '</div>' +
                   '<div style="font-size:10px;color:#64748b;">' + escHtml(p.category||"기타") + '</div></div>' +
                   '<button onclick="event.stopPropagation();window.deleteCustomPlace(\'' + p.id + '\')" ' +
                   'style="flex-shrink:0;background:none;border:none;color:#475569;cursor:pointer;font-size:14px;padding:2px 6px;" title="삭제">✕</button>' +
                   '</div>';
        }).join("");
    }

    window.flyToCustomPlace = function(id) {
        var p = loadPlaces().find(function(x) { return x.id === id; });
        if (!p || !window.map) return;
        window.map.flyTo([p.lat, p.lng], 18, { duration: 0.7 });
        var entry = customMarkers.find(function(m) { return m.id === id; });
        if (entry) setTimeout(function() { entry.marker.openPopup(); }, 750);
    };
    window.deleteCustomPlace = deletePlace;

    function injectStyles() {
        var st = document.createElement("style");
        st.id = "cplace-styles";
        st.textContent = [
            "#cplace-add-btn{position:absolute;top:72px;right:20px;z-index:1001;width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;transition:all .25s;box-shadow:0 4px 16px rgba(0,0,0,.35);}",
            "#cplace-add-btn.placing-mode{background:linear-gradient(135deg,#f59e0b,#ef4444)!important;transform:scale(1.08);animation:cpinpulse .8s ease-in-out infinite alternate;}",
            "@keyframes cpinpulse{from{box-shadow:0 4px 16px rgba(239,68,68,.3);}to{box-shadow:0 4px 24px rgba(239,68,68,.7);}}",
            "#cplace-list-btn{position:absolute;top:124px;right:20px;z-index:1001;width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:all .25s;box-shadow:0 4px 16px rgba(0,0,0,.35);}",
            "#cplace-list-panel{position:absolute;top:72px;right:72px;z-index:1002;width:260px;max-height:420px;background:rgba(15,23,42,.95);border:1px solid rgba(255,255,255,.1);border-radius:14px;overflow:hidden;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.5);backdrop-filter:blur(20px);}",
            "#cplace-modal{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);align-items:center;justify-content:center;}",
            "#cplace-modal.open{display:flex;}",
            "#cplace-mbox{background:#0f172a;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:24px;width:min(92vw,360px);box-shadow:0 24px 64px rgba(0,0,0,.7);animation:cmdin .2s ease;}",
            "@keyframes cmdin{from{opacity:0;transform:scale(.92) translateY(12px);}to{opacity:1;transform:scale(1) translateY(0);}}",
            ".cp-inp{width:100%;padding:10px 12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#e2e8f0;font-size:13px;outline:none;box-sizing:border-box;transition:border-color .15s;font-family:inherit;}",
            ".cp-inp:focus{border-color:#6366f1;}",
            ".cp-inp::placeholder{color:#475569;}",
            ".cp-lbl{display:block;font-size:11px;color:#64748b;font-weight:700;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em;}",
            ".cp-ebtn{width:34px;height:34px;border-radius:8px;border:1.5px solid transparent;background:rgba(255,255,255,.06);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s;}",
            ".cp-ebtn.sel,.cp-ebtn:hover{border-color:#6366f1;background:rgba(99,102,241,.2);}",
            ".cp-cdot{width:26px;height:26px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:transform .15s;}",
            ".cp-cdot.sel,.cp-cdot:hover{transform:scale(1.2);border-color:#fff;}",
            "body.cplace-cursor,.cplace-cursor *{cursor:crosshair!important;}"
        ].join("");
        document.head.appendChild(st);
    }

    function buildUI() {
        injectStyles();

        // 핀 추가 버튼
        var addBtn = document.createElement("button");
        addBtn.id = "cplace-add-btn";
        addBtn.className = "glass-panel";
        addBtn.title = "장소 추가 — 클릭 후 지도를 눌러 위치 선택";
        addBtn.textContent = "📍";
        addBtn.onclick = togglePlacingMode;
        document.body.appendChild(addBtn);

        // 목록 버튼
        var listBtn = document.createElement("button");
        listBtn.id = "cplace-list-btn";
        listBtn.className = "glass-panel";
        listBtn.title = "내 장소 목록";
        listBtn.textContent = "🗂️";
        listBtn.onclick = toggleListPanel;
        document.body.appendChild(listBtn);

        // 목록 패널
        var lp = document.createElement("div");
        lp.id = "cplace-list-panel";
        lp.style.display = "none";
        lp.innerHTML =
            '<div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:13px;font-weight:800;color:#f8fafc;">📍 내 장소</span>' +
            '<button onclick="document.getElementById(\'cplace-list-panel\').style.display=\'none\'" style="border:none;background:none;color:#64748b;cursor:pointer;font-size:16px;">✕</button>' +
            '</div><div id="cplace-list-body" style="overflow-y:auto;max-height:340px;"></div>';
        document.body.appendChild(lp);

        // 모달
        buildModal();
    }

    function buildModal() {
        var m = document.createElement("div");
        m.id = "cplace-modal";
        var emojiHtml = EMOJIS.map(function(e, i) {
            return '<button class="cp-ebtn' + (i===0?" sel":"") + '" onclick="window.cpSelEmoji(\'' + e + '\',this)">' + e + '</button>';
        }).join("");
        var colorHtml = COLORS.map(function(c, i) {
            return '<div class="cp-cdot' + (i===0?" sel":"") + '" style="background:' + c + ';" onclick="window.cpSelColor(\'' + c + '\',this)"></div>';
        }).join("");
        var catHtml = CATEGORY_LIST.map(function(c) {
            return '<option value="' + escHtml(c) + '">' + escHtml(c) + '</option>';
        }).join("");

        m.innerHTML =
            '<div id="cplace-mbox">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">' +
            '<h3 style="margin:0;font-size:16px;font-weight:800;color:#f8fafc;">✨ 새 장소 추가</h3>' +
            '<button onclick="window.closeCPlaceModal()" style="border:none;background:none;color:#64748b;cursor:pointer;font-size:20px;">✕</button></div>' +

            '<div style="margin-bottom:14px;"><label class="cp-lbl">이모지</label>' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">' + emojiHtml + '</div></div>' +

            '<div style="margin-bottom:14px;"><label class="cp-lbl">색상</label>' +
            '<div style="display:flex;gap:8px;margin-top:4px;">' + colorHtml + '</div></div>' +

            '<div style="margin-bottom:12px;"><label class="cp-lbl">장소 이름 *</label>' +
            '<input id="cp-name" class="cp-inp" type="text" placeholder="예: 내가 좋아하는 카페" maxlength="40"></div>' +

            '<div style="margin-bottom:12px;"><label class="cp-lbl">카테고리</label>' +
            '<select id="cp-cat" class="cp-inp">' + catHtml + '</select></div>' +

            '<div style="margin-bottom:14px;"><label class="cp-lbl">메모 <span style="font-weight:400;text-transform:none;">(선택)</span></label>' +
            '<textarea id="cp-memo" class="cp-inp" rows="2" placeholder="간단한 메모..." maxlength="200" style="resize:vertical;min-height:54px;"></textarea></div>' +

            '<div id="cp-coords" style="font-size:10px;color:#475569;margin-bottom:14px;padding:6px 10px;background:rgba(255,255,255,.04);border-radius:8px;"></div>' +

            '<div style="display:flex;gap:8px;">' +
            '<button onclick="window.closeCPlaceModal()" style="flex:1;padding:10px;background:rgba(255,255,255,.06);color:#94a3b8;border:1px solid rgba(255,255,255,.1);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">취소</button>' +
            '<button id="cp-save-btn" onclick="window.saveCPlace()" style="flex:2;padding:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;">📍 장소 저장</button>' +
            '</div></div>';

        m.addEventListener("click", function(e) { if (e.target === m) window.closeCPlaceModal(); });
        document.body.appendChild(m);
    }

    window.cpSelEmoji = function(e, el) {
        selEmoji = e;
        document.querySelectorAll(".cp-ebtn").forEach(function(b) { b.classList.remove("sel"); });
        el.classList.add("sel");
    };
    window.cpSelColor = function(c, el) {
        selColor = c;
        document.querySelectorAll(".cp-cdot").forEach(function(d) { d.classList.remove("sel"); });
        el.classList.add("sel");
        var btn = document.getElementById("cp-save-btn");
        if (btn) btn.style.background = "linear-gradient(135deg," + c + "," + c + "cc)";
    };

    function togglePlacingMode() {
        placingMode = !placingMode;
        var btn = document.getElementById("cplace-add-btn");
        if (!btn) return;
        if (placingMode) {
            btn.classList.add("placing-mode");
            btn.title = "취소 (ESC)";
            document.body.classList.add("cplace-cursor");
            if (window.showToast) window.showToast("📍 지도를 클릭해 위치를 선택하세요!");
        } else {
            btn.classList.remove("placing-mode");
            btn.title = "장소 추가";
            document.body.classList.remove("cplace-cursor");
        }
    }

    function toggleListPanel() {
        var panel = document.getElementById("cplace-list-panel");
        if (!panel) return;
        var isOpen = panel.style.display !== "none";
        panel.style.display = isOpen ? "none" : "flex";
        panel.style.flexDirection = "column";
        if (!isOpen) refreshListPanel();
    }

    function openCPlaceModal(latlng) {
        pendingLatLng = latlng;
        selEmoji = "📍"; selColor = "#6366f1";
        document.querySelectorAll(".cp-ebtn").forEach(function(b, i) { b.classList.toggle("sel", i===0); });
        document.querySelectorAll(".cp-cdot").forEach(function(d, i) { d.classList.toggle("sel", i===0); });
        var sb = document.getElementById("cp-save-btn");
        if (sb) sb.style.background = "linear-gradient(135deg,#6366f1,#4f46e5)";
        var ni = document.getElementById("cp-name"); if (ni) ni.value = "";
        var mi = document.getElementById("cp-memo"); if (mi) mi.value = "";
        var ci = document.getElementById("cp-cat");  if (ci) ci.selectedIndex = 0;
        var cd = document.getElementById("cp-coords");
        if (cd) cd.textContent = "📐 위치: " + latlng.lat.toFixed(6) + ", " + latlng.lng.toFixed(6);
        var modal = document.getElementById("cplace-modal");
        if (modal) modal.classList.add("open");
        setTimeout(function() { var ni = document.getElementById("cp-name"); if (ni) ni.focus(); }, 120);
    }

    window.closeCPlaceModal = function() {
        var m = document.getElementById("cplace-modal");
        if (m) m.classList.remove("open");
    };

    window.saveCPlace = function() {
        if (!pendingLatLng) return;
        var name = (document.getElementById("cp-name") ? document.getElementById("cp-name").value : "").trim();
        if (!name) { var ni = document.getElementById("cp-name"); if (ni) ni.focus(); return; }
        var cat = document.getElementById("cp-cat") ? document.getElementById("cp-cat").value : "기타";
        var memo = document.getElementById("cp-memo") ? document.getElementById("cp-memo").value.trim() : "";
        var place = {
            id: "cp_" + Date.now(),
            name: name, emoji: selEmoji, color: selColor,
            category: cat, memo: memo,
            lat: pendingLatLng.lat, lng: pendingLatLng.lng,
            createdAt: new Date().toLocaleString("ko-KR", { hour12: false })
        };
        var places = loadPlaces();
        places.push(place);
        savePlaces(places);
        addMarkerToMap(place);
        refreshListPanel();
        window.closeCPlaceModal();
        if (window.map) {
            window.map.flyTo([place.lat, place.lng], Math.max(window.map.getZoom(), 16), { duration: 0.5 });
            var entry = customMarkers.find(function(m) { return m.id === place.id; });
            if (entry) setTimeout(function() { entry.marker.openPopup(); }, 600);
        }
        if (window.showToast) window.showToast("✅ \"" + name + "\" 장소가 추가됐습니다!");
    };

    function attachMapClick() {
        if (!window.map) return;
        window.map.on("click", function(e) {
            if (!placingMode) return;
            placingMode = false;
            var btn = document.getElementById("cplace-add-btn");
            if (btn) btn.classList.remove("placing-mode");
            document.body.classList.remove("cplace-cursor");
            openCPlaceModal(e.latlng);
        });
        document.addEventListener("keydown", function(e) {
            if (e.key === "Escape") {
                if (placingMode) {
                    placingMode = false;
                    var btn = document.getElementById("cplace-add-btn");
                    if (btn) btn.classList.remove("placing-mode");
                    document.body.classList.remove("cplace-cursor");
                    if (window.showToast) window.showToast("📍 장소 추가 취소됨");
                }
                window.closeCPlaceModal();
            }
        });
    }

    window.initCustomPlaces = function() {
        buildUI();
        renderAll();
        attachMapClick();
        console.log("[CustomPlaces] 초기화 완료. 장소:", loadPlaces().length + "개");
    };

    function waitForMap() {
        if (window.map) { window.initCustomPlaces(); }
        else { setTimeout(waitForMap, 300); }
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", waitForMap);
    } else {
        waitForMap();
    }
})();