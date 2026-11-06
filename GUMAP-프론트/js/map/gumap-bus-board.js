// ============================================================
// 📁 파일명: GUMAP-프론트/js/map/gumap-bus-board.js
// 📌 역할: TAGO 공식 노선(344개) 및 노선별 실제 경유 정류장 기반 버스 보드 &
// 실시간 버스 추적기
// ============================================================

(function() {
'use strict';

var currentSelectedRoute = null;
var realtimeBusMarkers = [];
var realtimeBusInterval = null;
var gumiStopsCoords = null; // 정류소 ID -> {lat, lng, name}
var routeStopsCache =
    {}; // routeId -> [{nodeid, nodenm, gpslati, gpslong, nodeord}]

// ── 구미 정류소 좌표 DB 사전 로드 (2,146개+ 정류장 매핑) ──
function loadGumiStopsCoords() {
  if (gumiStopsCoords)
    return Promise.resolve(gumiStopsCoords);
  return fetch('GUMAP-프론트/js/data/gumi_bus_stops.json')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        gumiStopsCoords = data;
        console.log('[GuMap Bus] Gumi bus stops database loaded:',
                    Object.keys(data).length);
        return gumiStopsCoords;
      })
      .catch(function(err) {
        console.warn('[GuMap Bus] Failed to load local stops database:', err);
        gumiStopsCoords = {};
        return gumiStopsCoords;
      });
}
loadGumiStopsCoords();

// ── 구미 339개 노선 경유 정류장 마스터 DB 사전 로드 (초고속 즉시 표시) ──
function loadMasterRouteStops() {
  return fetch('GUMAP-프론트/js/data/gumi_route_stops_master.json')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        window.fallbackRouteStops = window.fallbackRouteStops || {};
        Object.assign(window.fallbackRouteStops, data);
        Object.assign(routeStopsCache, data);
        console.log('[GuMap Bus] Master route stops database preloaded:',
                    Object.keys(data).length, 'routes');
      })
      .catch(function(err) {
        console.warn('[GuMap Bus] Failed to preload master route stops:', err);
      });
}
loadMasterRouteStops();

// ── TAGO 실제 구간 기준 초기 대표 노선 (서버 /bus/routes 로드 전 즉시 표시용)
// ──
var GUMI_ROUTES = [
  {
    routeNo : "11",
    routeId : "GMB1111",
    type : "일반",
    startNode : "구미역",
    endNode : "왜관남부",
    interval : "TAGO 실시간",
    firstBus : "06:05",
    lastBus : "22:30",
    color : "#2563eb"
  },
  {
    routeNo : "111",
    routeId : "GMB11110",
    type : "좌석",
    startNode : "구미역",
    endNode : "왜관남부",
    interval : "TAGO 실시간",
    firstBus : "06:30",
    lastBus : "22:10",
    color : "#e11d48"
  },
  {
    routeNo : "170",
    routeId : "GMB17012",
    type : "좌석",
    startNode : "선산터미널",
    endNode : "구미역(중앙시장)",
    interval : "TAGO 실시간",
    firstBus : "06:00",
    lastBus : "22:00",
    color : "#e11d48"
  },
  {
    routeNo : "171",
    routeId : "GMB17110",
    type : "좌석",
    startNode : "구미역(올림픽기념관)",
    endNode : "선산터미널",
    interval : "TAGO 실시간",
    firstBus : "06:15",
    lastBus : "22:10",
    color : "#e11d48"
  },
  {
    routeNo : "10",
    routeId : "GMB1010",
    type : "일반",
    startNode : "구미역",
    endNode : "왜관남부",
    interval : "TAGO 실시간",
    firstBus : "06:30",
    lastBus : "21:45",
    color : "#2563eb"
  },
  {
    routeNo : "72",
    routeId : "GMB7230",
    type : "일반",
    startNode : "구미종합터미널",
    endNode : "해평터미널",
    interval : "TAGO 실시간",
    firstBus : "08:00",
    lastBus : "18:30",
    color : "#2563eb"
  },
  {
    routeNo : "960",
    routeId : "GMB96010",
    type : "좌석",
    startNode : "구미역",
    endNode : "경운대학교",
    interval : "TAGO 실시간",
    firstBus : "07:55",
    lastBus : "22:10",
    color : "#e11d48"
  },
  {
    routeNo : "193",
    routeId : "GMB19310",
    type : "일반",
    startNode : "구미역",
    endNode : "장천버스터미널 종점",
    interval : "TAGO 실시간",
    firstBus : "06:30",
    lastBus : "21:20",
    color : "#2563eb"
  }
];

var PRIORITY_ROUTE_IDS = {
  "GMB1111" : 1,
  "GMB11110" : 2,
  "GMB17012" : 3,
  "GMB17110" : 4,
  "GMB1010" : 5,
  "GMB7230" : 6,
  "GMB96010" : 7,
  "GMB19310" : 8
};

function applyOfficialRoutes(list) {
  if (!Array.isArray(list) || list.length === 0)
    return;
  var byId = {};
  list.forEach(function(r) {
    if (!r || !r.routeId)
      return;
    var rType = r.type || "일반";
    var color = r.color ||
                (rType === "좌석" ? "#e11d48"
                                  : (rType === "순환" ? "#059669" : "#2563eb"));
    byId[r.routeId] = {
      routeId : String(r.routeId).trim(),
      routeNo : String(r.routeNo || "").trim(),
      type : rType,
      startNode : String(r.startNode || "기점").trim(),
      endNode : String(r.endNode || "종점").trim(),
      firstBus : r.firstBus || "정보없음",
      lastBus : r.lastBus || "정보없음",
      interval : r.interval || "TAGO 실시간",
      color : color,
      hasSnappedPath :
          Boolean(window.gumiBusRoadPaths && window.gumiBusRoadPaths[r.routeId])
    };
  });
  var all = Object.values(byId);
  all.sort(function(a, b) {
    var pa = PRIORITY_ROUTE_IDS[a.routeId] || 9999;
    var pb = PRIORITY_ROUTE_IDS[b.routeId] || 9999;
    if (pa !== pb)
      return pa - pb;
    return String(a.routeNo).localeCompare(String(b.routeNo), 'ko',
                                           {numeric : true});
  });
  GUMI_ROUTES = all;
  var titleEl = document.getElementById('bus-board-title');
  if (titleEl) {
    titleEl.textContent = '구미시 버스 노선 (' + GUMI_ROUTES.length + '개)';
  }
  var container = document.getElementById('bus-routes-list-container');
  if (container && container.style.display !== 'none') {
    var filterInput = document.getElementById('bus-route-filter-input');
    var activeChip =
        document.querySelector('#bus-filter-chips .bus-chip.active');
    var q = filterInput ? filterInput.value.trim() : '';
    var fType = activeChip ? activeChip.getAttribute('data-filter') : 'all';
    renderRouteList(q, fType);
  }
}

// ── 서버 /bus/routes API (24시간 캐시) + 공식 JSON 폴백으로 344개 노선 로드 ──
function loadAllGumiRoutes() {
  fetch('/bus/routes')
      .then(function(res) {
        if (!res.ok)
          throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        var list = (data && Array.isArray(data.routes))
                       ? data.routes
                       : (Array.isArray(data) ? data : []);
        if (list.length > 0) {
          applyOfficialRoutes(list);
          console.log(
              '[GuMap Bus] Official TAGO bus routes loaded via /bus/routes:',
              GUMI_ROUTES.length);
          return;
        }
        throw new Error('Empty routes payload');
      })
      .catch(function() {
        fetch('GUMAP-프론트/js/data/gumi_official_routes.json')
            .then(function(res) { return res.json(); })
            .then(function(list) {
              applyOfficialRoutes(list);
              console.log(
                  '[GuMap Bus] Official TAGO bus routes loaded from local JSON:',
                  GUMI_ROUTES.length);
            })
            .catch(function(err) {
              console.warn('[GuMap Bus] Failed to load official routes:', err);
            });
      });
}
loadAllGumiRoutes();

// ── 정확한 routeId 매칭만 수행 (부분일치 및 가짜 구미역→인동 대체 경로 완전
// 제거) ──
function getCachedRouteStops(route) {
  if (!route || !route.routeId)
    return [];
  var rId = route.routeId;

  if (routeStopsCache[rId] && routeStopsCache[rId].length >= 2) {
    return routeStopsCache[rId];
  }
  if (window.fallbackRouteStops &&
      Array.isArray(window.fallbackRouteStops[rId]) &&
      window.fallbackRouteStops[rId].length >= 2) {
    routeStopsCache[rId] = window.fallbackRouteStops[rId];
    return routeStopsCache[rId];
  }
  return [];
}

// ── 서버 /bus/route-stops/{routeId} 에서 실제 경유 정류장 비동기 조회 ──
function fetchRouteStopsFromServer(routeId) {
  if (!routeId)
    return Promise.resolve([]);
  if (routeStopsCache[routeId] && routeStopsCache[routeId].length >= 2) {
    return Promise.resolve(routeStopsCache[routeId]);
  }
  return fetch('/bus/route-stops/' + encodeURIComponent(routeId))
      .then(function(res) {
        if (!res.ok)
          throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        var stops = (data && Array.isArray(data.stops)) ? data.stops : [];
        if (stops.length >= 2) {
          routeStopsCache[routeId] = stops;
          window.fallbackRouteStops = window.fallbackRouteStops || {};
          window.fallbackRouteStops[routeId] = stops;
          return stops;
        }
        return getCachedRouteStops({routeId : routeId});
      })
      .catch(function(err) {
        console.warn('[GuMap Bus] /bus/route-stops/' + routeId + ' error:',
                     err);
        return getCachedRouteStops({routeId : routeId});
      });
}

function isNightHours() {
  var h = new Date().getHours();
  return (h >= 22 || h < 6);
}

// ── 선택 노선 강조 및 배경 정류장 흐리게 처리 ──
function highlightSelectedRouteOnMap(stops, color) {
  var map = window.gumapWebGLMap;
  if (!map)
    return;

  // 배경 전체 정류장 아이콘은 흐리게 처리해 선택 노선을 돋보이게 함
  try {
    if (map.getLayer('bus-stops-icon')) {
      map.setPaintProperty('bus-stops-icon', 'icon-opacity', 0.22);
      map.setPaintProperty('bus-stops-icon', 'text-opacity', 0.22);
    }
  } catch (e) {
  }

  // 선택된 노선의 경유 정류장만 별도 강조 포인트 레이어로 표시
  var features =
      (stops || [])
          .map(function(st, idx) {
            var lat =
                st.gpslati || (gumiStopsCoords && gumiStopsCoords[st.nodeid]
                                   ? gumiStopsCoords[st.nodeid].lat
                                   : null);
            var lng =
                st.gpslong || (gumiStopsCoords && gumiStopsCoords[st.nodeid]
                                   ? gumiStopsCoords[st.nodeid].lng
                                   : null);
            if (!lat || !lng)
              return null;
            return {
              type : 'Feature',
              geometry :
                  {type : 'Point', coordinates : [ Number(lng), Number(lat) ]},
              properties : {
                name : st.nodenm || st.name || '',
                nodeid : st.nodeid || '',
                isEndpoint : (idx === 0 || idx === stops.length - 1) ? 1 : 0
              }
            };
          })
          .filter(Boolean);

  var geojson = {type : 'FeatureCollection', features : features};
  var src = map.getSource('webgl-route-stops-source');
  if (src) {
    src.setData(geojson);
    if (map.getLayer('webgl-route-stops-circle')) {
      map.setPaintProperty('webgl-route-stops-circle', 'circle-stroke-color',
                           color || '#2563eb');
    }
  } else {
    try {
      map.addSource('webgl-route-stops-source',
                    {type : 'geojson', data : geojson});
      map.addLayer({
        id : 'webgl-route-stops-circle',
        type : 'circle',
        source : 'webgl-route-stops-source',
        paint : {
          'circle-radius' :
              [ 'case', [ '==', [ 'get', 'isEndpoint' ], 1 ], 6.5, 4.2 ],
          'circle-color' : '#ffffff',
          'circle-stroke-width' :
              [ 'case', [ '==', [ 'get', 'isEndpoint' ], 1 ], 3.0, 2.2 ],
          'circle-stroke-color' : color || '#2563eb'
        }
      });
    } catch (e) {
    }
  }

  if (!window._webglRouteStopsClickBound && map) {
    window._webglRouteStopsClickBound = true;
    map.on('mouseenter', 'webgl-route-stops-circle',
           function() { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'webgl-route-stops-circle',
           function() { map.getCanvas().style.cursor = ''; });
    map.on('click', 'webgl-route-stops-circle', function(e) {
      if (e.features && e.features.length) {
        var f = e.features[0];
        var p = f.properties || {};
        var coords = f.geometry.coordinates;
        var rNo = currentSelectedRoute ? currentSelectedRoute.routeNo : null;
        var rId = currentSelectedRoute ? currentSelectedRoute.routeId : null;
        if (typeof window.openStopInfo === 'function') {
          window.openStopInfo(p.name, coords[1], coords[0], p.nodeid,
                              rNo ? [ rNo ] : [], rId ? [ rId ] : []);
        }
      }
    });
  }
}

function restoreMapStopsOpacity() {
  var map = window.gumapWebGLMap;
  if (!map)
    return;
  try {
    if (map.getLayer('bus-stops-icon')) {
      map.setPaintProperty('bus-stops-icon', 'icon-opacity', 1.0);
      map.setPaintProperty('bus-stops-icon', 'text-opacity', 1.0);
    }
    if (map.getLayer('webgl-route-stops-circle')) {
      map.removeLayer('webgl-route-stops-circle');
    }
    if (map.getSource('webgl-route-stops-source')) {
      map.removeSource('webgl-route-stops-source');
    }
  } catch (e) {
  }
}

window.openBusBoard = function() {
  var panel = document.getElementById('routing-panel');
  if (!panel)
    return;

  if (panel.classList.contains('drawer-collapsed')) {
    if (typeof window.toggleSidebarDrawer === 'function') {
      window.toggleSidebarDrawer();
    }
  }

  var collContent = document.getElementById('collapsible-content');
  if (collContent)
    collContent.style.display = 'none';

  var existingBoard = document.getElementById('bus-board-panel');
  if (existingBoard) {
    existingBoard.style.display = 'block';
    renderRouteList('', 'all');
    return;
  }

  var board = document.createElement('div');
  board.id = 'bus-board-panel';
  board.style.cssText =
      'margin-top:14px; display:flex; flex-direction:column; gap:12px; font-family:-apple-system,BlinkMacSystemFont,"Pretendard",sans-serif;';

  board.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-panel); padding-bottom:8px;">' +
      '<div style="display:flex; align-items:center; gap:8px;">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"></path><path d="M15 6v6"></path><path d="M2 12h19.6"></path><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.2 6 18.1 6H5.9C4.8 6 3.9 6.8 3.6 7.8L2.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"></path><circle cx="7" cy="18" r="2"></circle><path d="M9 18h5"></path><circle cx="16" cy="18" r="2"></circle></svg>' +
      '<span id="bus-board-title" style="font-size:14px; font-weight:800; color:var(--text-main); letter-spacing:-0.3px;">구미시 버스 노선 (' +
      GUMI_ROUTES.length + '개)</span>' +
      '</div>' +
      '<button id="bus-board-close-btn" style="background:none; border:none; color:var(--text-muted); font-size:16px; cursor:pointer; padding:2px 6px;">✕</button>' +
      '</div>' +
      '<div style="display:flex; gap:6px; align-items:center;">' +
      '<input type="text" id="bus-route-filter-input" class="glass-input" placeholder="노선 번호 또는 기종점 검색 (예: 11, 170, 왜관, 선산)" style="flex:1; font-size:12px; padding:7px 12px;">' +
      '</div>' +
      '<div id="bus-filter-chips" style="display:flex; gap:5px; overflow-x:auto; padding-bottom:2px;">' +
      '<button class="bus-chip active" data-filter="all" style="padding:4px 10px; border-radius:12px; border:1px solid #cbd5e1; background:#2563eb; color:white; font-size:11px; font-weight:700; cursor:pointer;">전체</button>' +
      '<button class="bus-chip" data-filter="일반" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-panel); background:var(--bg-input); color:var(--text-muted); font-size:11px; font-weight:600; cursor:pointer;">일반</button>' +
      '<button class="bus-chip" data-filter="좌석" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-panel); background:var(--bg-input); color:var(--text-muted); font-size:11px; font-weight:600; cursor:pointer;">좌석</button>' +
      '<button class="bus-chip" data-filter="순환" style="padding:4px 10px; border-radius:12px; border:1px solid var(--border-panel); background:var(--bg-input); color:var(--text-muted); font-size:11px; font-weight:600; cursor:pointer;">순환</button>' +
      '</div>' +
      '<div id="bus-routes-list-container" style="display:flex; flex-direction:column; gap:8px; max-height:480px; overflow-y:auto; padding-right:2px;"></div>' +
      '<div id="bus-route-detail-container" style="display:none; flex-direction:column; gap:10px;"></div>';

  panel.appendChild(board);

  document.getElementById('bus-board-close-btn').onclick = function() {
    currentSelectedRoute = null;
    clearRealtimeBuses();
    restoreMapStopsOpacity();
    board.style.display = 'none';
    if (collContent)
      collContent.style.display = 'block';
    if (typeof window.clearGuMapWebGLRoute === 'function')
      window.clearGuMapWebGLRoute();
  };

  var filterInput = document.getElementById('bus-route-filter-input');
  filterInput.oninput = function() {
    var activeChip =
        document.querySelector('#bus-filter-chips .bus-chip.active');
    var fType = activeChip ? activeChip.getAttribute('data-filter') : 'all';
    renderRouteList(filterInput.value.trim(), fType);
  };

  var chips = document.querySelectorAll('#bus-filter-chips .bus-chip');
  chips.forEach(function(chip) {
    chip.onclick = function() {
      chips.forEach(function(c) {
        c.classList.remove('active');
        c.style.background = 'var(--bg-input)';
        c.style.color = 'var(--text-muted)';
        c.style.borderColor = 'var(--border-panel)';
      });
      chip.classList.add('active');
      chip.style.background = '#2563eb';
      chip.style.color = 'white';
      chip.style.borderColor = '#2563eb';
      renderRouteList(filterInput.value.trim(),
                      chip.getAttribute('data-filter'));
    };
  });

  renderRouteList('', 'all');
};

function renderRouteList(query, filterType) {
  var container = document.getElementById('bus-routes-list-container');
  var detailContainer = document.getElementById('bus-route-detail-container');
  if (!container)
    return;

  container.style.display = 'flex';
  if (detailContainer)
    detailContainer.style.display = 'none';
  container.innerHTML = '';

  var isNight = isNightHours();
  var qLower = (query || '').toLowerCase();

  var filtered = GUMI_ROUTES.filter(function(r) {
    var matchesQuery =
        !qLower || String(r.routeNo).toLowerCase().indexOf(qLower) !== -1 ||
        String(r.startNode).toLowerCase().indexOf(qLower) !== -1 ||
        String(r.endNode).toLowerCase().indexOf(qLower) !== -1 ||
        String(r.routeId).toLowerCase().indexOf(qLower) !== -1;
    var matchesType = (filterType === 'all' || r.type === filterType);
    return matchesQuery && matchesType;
  });

  if (filtered.length === 0) {
    container.innerHTML =
        '<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:12px;">일치하는 버스 노선이 없습니다.</div>';
    return;
  }

  filtered.forEach(function(route) {
    var isSelected =
        currentSelectedRoute && currentSelectedRoute.routeId === route.routeId;
    var hasOtherSelected =
        currentSelectedRoute && currentSelectedRoute.routeId !== route.routeId;

    var item = document.createElement('div');
    item.className = 'glass-panel bus-route-card';
    item.setAttribute('data-route-no', route.routeNo);
    item.setAttribute('data-route-id', route.routeId);
    item.style.cssText =
        'padding:10px 12px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; transition:all 0.2s ease; ' +
        'border:' +
        (isSelected ? '2px solid #2563eb' : '1px solid var(--border-panel)') +
        '; ' +
        'background:' +
        (isSelected ? 'rgba(37,99,235,0.08)' : 'var(--bg-input)') + '; ' +
        'opacity:' + (hasOtherSelected ? '0.55' : '1') + ';';

    item.onmouseover = function() {
      this.style.borderColor = '#2563eb';
      this.style.opacity = '1';
      this.style.transform = 'translateY(-1px)';
    };
    item.onmouseout = function() {
      this.style.borderColor = isSelected ? '#2563eb' : 'var(--border-panel)';
      this.style.opacity = hasOtherSelected ? '0.55' : '1';
      this.style.transform = 'none';
    };

    var statusBadge =
        isNight
            ? '<span style="font-size:10px; padding:2px 6px; border-radius:10px; background:#f1f5f9; color:#64748b; font-weight:700; white-space:nowrap;">🌙 운행종료</span>'
            : '<span style="font-size:10px; padding:2px 6px; border-radius:10px; background:#dcfce7; color:#15803d; font-weight:700; white-space:nowrap;">🟢 운행 중</span>';

    item.innerHTML =
        '<div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">' +
        '<div style="min-width:44px; padding:0 6px; height:32px; border-radius:8px; background:' +
        route.color +
        '; color:white; font-size:13px; font-weight:900; display:flex; align-items:center; justify-content:center; letter-spacing:-0.5px;">' +
        route.routeNo + '</div>' +
        '<div style="min-width:0; flex:1;">' +
        '<div style="font-size:12.5px; font-weight:700; color:var(--text-main); letter-spacing:-0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
        route.startNode + ' → ' + route.endNode + '</div>' +
        '<div style="font-size:10.5px; color:var(--text-muted); font-weight:500;">첫차 ' +
        route.firstBus + ' ~ 막차 ' + route.lastBus +
        ' · <span style="opacity:0.75;">' + route.routeId + '</span></div>' +
        '</div>' +
        '</div>' +
        '<div style="margin-left:6px;">' + statusBadge + '</div>';

    item.onclick = function() { showRouteDetail(route); };

    container.appendChild(item);
  });
}

function showRouteDetail(route) {
  currentSelectedRoute = route;
  clearRealtimeBuses();

  var listContainer = document.getElementById('bus-routes-list-container');
  var detailContainer = document.getElementById('bus-route-detail-container');
  if (!detailContainer)
    return;

  listContainer.style.display = 'none';
  detailContainer.style.display = 'flex';
  detailContainer.innerHTML = '';

  var stops = getCachedRouteStops(route);
  var isNight = isNightHours();

  // 같은 노선번호(routeNo)의 다른 방향/지선 목록
  var siblingRoutes = GUMI_ROUTES.filter(function(
      r) { return String(r.routeNo) === String(route.routeNo); });

  var headerCard = document.createElement('div');
  headerCard.className = 'glass-panel';
  headerCard.style.cssText =
      'padding:12px; border-radius:12px; background:var(--bg-input); border:1px solid var(--border-panel); display:flex; flex-direction:column; gap:8px;';

  var statusDesc =
      isNight
          ? '<span style="color:#64748b; font-weight:700; font-size:11px;">🌙 현재 심야 운행 종료 (첫차 ' +
                route.firstBus + ')</span>'
          : '<span style="color:#16a34a; font-weight:700; font-size:11px;">🟢 실시간 운행 추적 중</span>';

  var siblingHtml = '';
  if (siblingRoutes.length > 1) {
    siblingHtml =
        '<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:2px;">' +
        siblingRoutes
            .map(function(sr) {
              var active = sr.routeId === route.routeId;
              return '<button class="bus-sibling-btn" data-route-id="' +
                     sr.routeId +
                     '" style="padding:3px 8px; font-size:10.5px; border-radius:8px; cursor:pointer; font-weight:' +
                     (active ? '800' : '600') + '; border:1px solid ' +
                     (active ? route.color : 'var(--border-panel)') +
                     '; background:' + (active ? route.color : 'transparent') +
                     '; color:' + (active ? '#fff' : 'var(--text-muted)') +
                     ';">' + sr.startNode + '→' + sr.endNode + ' (' +
                     sr.routeId.replace('GMB', '') + ')' +
                     '</button>';
            })
            .join('') +
        '</div>';
  }

  headerCard.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:center;">' +
      '<button id="bus-detail-back-btn" style="background:none; border:none; color:#2563eb; font-size:12px; font-weight:700; cursor:pointer; padding:0;">← 목록으로</button>' +
      '<span style="font-size:11px; padding:2px 8px; border-radius:10px; background:' +
      route.color + '15; color:' + route.color + '; font-weight:800;">' +
      route.type + '버스 · ' + route.routeId + '</span>' +
      '</div>' +
      '<div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">' +
      '<div style="font-size:24px; font-weight:900; color:' + route.color +
      '; letter-spacing:-0.5px;">' + route.routeNo + '번</div>' +
      '<div style="font-size:13px; font-weight:700; color:var(--text-main);">' +
      route.startNode + ' → ' + route.endNode + '</div>' +
      '</div>' + siblingHtml +
      '<div style="font-size:11px; color:var(--text-muted);">' + statusDesc +
      ' | 첫차 ' + route.firstBus + ' ~ 막차 ' + route.lastBus + '</div>' +
      '<div style="display:flex; gap:6px; margin-top:4px;">' +
      '<button id="bus-view-route-btn" class="glass-btn" style="flex:1; padding:7px 0; font-size:12px; font-weight:700; background:#2563eb !important; color:white !important; border:none !important; border-radius:8px; cursor:pointer;">버스 전체 노선 보기</button>' +
      '<button id="bus-refresh-btn" class="glass-btn" style="padding:7px 12px; font-size:11.5px; font-weight:600; border-radius:8px; cursor:pointer;">새로고침</button>' +
      '</div>';

  detailContainer.appendChild(headerCard);

  headerCard.querySelectorAll('.bus-sibling-btn').forEach(function(btn) {
    btn.onclick = function() {
      var targetId = btn.getAttribute('data-route-id');
      var targetRoute =
          GUMI_ROUTES.find(function(x) { return x.routeId === targetId; });
      if (targetRoute)
        showRouteDetail(targetRoute);
    };
  });

  document.getElementById('bus-detail-back-btn').onclick = function() {
    currentSelectedRoute = null;
    clearRealtimeBuses();
    restoreMapStopsOpacity();
    if (typeof window.clearGuMapWebGLRoute === 'function')
      window.clearGuMapWebGLRoute();
    var filterInput = document.getElementById('bus-route-filter-input');
    var activeChip =
        document.querySelector('#bus-filter-chips .bus-chip.active');
    renderRouteList(filterInput ? filterInput.value.trim() : '',
                    activeChip ? activeChip.getAttribute('data-filter')
                               : 'all');
  };

  document.getElementById('bus-view-route-btn').onclick = function() {
    if (stops && stops.length >= 2) {
      fitRouteBounds(stops);
    }
  };

  document.getElementById('bus-refresh-btn').onclick =
      function() { fetchRealtimeBusLocation(route); };

  var timelineHeader = document.createElement('div');
  timelineHeader.id = 'bus-timeline-header';
  timelineHeader.style.cssText =
      'font-size:12px; font-weight:800; color:var(--text-main); margin-top:8px; display:flex; justify-content:space-between; align-items:center;';
  detailContainer.appendChild(timelineHeader);

  var timelineList = document.createElement('div');
  timelineList.id = 'bus-timeline-list';
  timelineList.style.cssText =
      'max-height:280px; overflow-y:auto; display:flex; flex-direction:column; padding-left:14px; position:relative;';
  detailContainer.appendChild(timelineList);

  function renderTimelineStops(activeStops, isLoading) {
    if (isLoading) {
      timelineHeader.innerHTML = '<span>경유 정류장 불러오는 중...</span>';
      timelineList.innerHTML =
          '<div style="padding:20px 6px; color:var(--text-muted); font-size:12px; text-align:center;">TAGO 서버에서 실제 경유 정류장을 조회하고 있습니다...</div>';
      return;
    }
    if (!activeStops || activeStops.length < 2) {
      timelineHeader.innerHTML = '<span>경유 정류장 (0개소)</span>';
      timelineList.innerHTML =
          '<div style="padding:20px 6px; color:#ef4444; font-size:12px; font-weight:600; text-align:center;">경로 정보 없음 (해당 노선의 정류장 데이터가 없습니다)</div>';
      if (typeof window.clearGuMapWebGLRoute === 'function')
        window.clearGuMapWebGLRoute();
      restoreMapStopsOpacity();
      return;
    }

    var snapBadge =
        (window.gumiBusRoadPaths && window.gumiBusRoadPaths[route.routeId])
            ? '<span style="font-size:10px; color:#2563eb; font-weight:700;">도로 스냅 경로</span>'
            : '<span style="font-size:10px; color:var(--text-muted); font-weight:500;">정류장 순차 연결</span>';

    timelineHeader.innerHTML =
        '<span>경유 정류장 (' + activeStops.length + '개소)</span>' + snapBadge;
    timelineList.innerHTML = '';

    activeStops.forEach(function(st, idx) {
      var isFirst = (idx === 0);
      var isLast = (idx === activeStops.length - 1);
      var dotColor = isFirst ? route.color : (isLast ? '#ef4444' : '#94a3b8');

      var stopRow = document.createElement('div');
      stopRow.style.cssText =
          'display:flex; align-items:center; gap:10px; position:relative; padding:7px 0; cursor:pointer;';
      stopRow.innerHTML =
          '<div style="position:absolute; left:-7px; top:0; bottom:0; width:2px; background:#e2e8f0;' +
          (isFirst ? ' top:50%;' : '') + (isLast ? ' bottom:50%;' : '') +
          '"></div>' +
          '<div style="position:absolute; left:-11px; width:10px; height:10px; border-radius:50%; background:' +
          dotColor +
          '; border:2px solid #ffffff; box-shadow:0 0 4px rgba(0,0,0,0.15); z-index:1;"></div>' +
          '<div style="flex:1; margin-left:12px;">' +
          '<div style="font-size:12px; font-weight:700; color:var(--text-main); letter-spacing:-0.2px;">' +
          (idx + 1) + '. ' + (st.nodenm || st.name) + '</div>' +
          (st.nodeid
               ? '<div style="font-size:10px; color:var(--text-muted);">' +
                     st.nodeid + '</div>'
               : '') +
          '</div>';

      stopRow.onclick = function() {
        var lat = st.gpslati || (gumiStopsCoords && gumiStopsCoords[st.nodeid]
                                     ? gumiStopsCoords[st.nodeid].lat
                                     : null);
        var lng = st.gpslong || (gumiStopsCoords && gumiStopsCoords[st.nodeid]
                                     ? gumiStopsCoords[st.nodeid].lng
                                     : null);
        if (window.gumapWebGLMap && lat && lng) {
          window.gumapWebGLMap.flyTo({
            center : [ Number(lng), Number(lat) ],
            zoom : 16.5,
            duration : 800
          });
          if (typeof window.openStopInfo === 'function') {
            window.openStopInfo(st.nodenm || st.name, Number(lat), Number(lng),
                                st.nodeid, [ route.routeNo ],
                                [ route.routeId ]);
          }
        }
      };
      timelineList.appendChild(stopRow);
    });
  }

  if (stops.length >= 2) {
    renderTimelineStops(stops, false);
    drawBusRouteOnMap(stops, route.color);
    fitRouteBounds(stops);
  } else {
    renderTimelineStops([], true);
  }

  // 서버 /bus/route-stops/{routeId} 로부터 실제 TAGO 정류장 목록 확인/갱신
  fetchRouteStopsFromServer(route.routeId).then(function(apiStops) {
    if (!currentSelectedRoute || currentSelectedRoute.routeId !== route.routeId)
      return;
    if (apiStops && apiStops.length >= 2) {
      var wasEmpty = (stops.length < 2);
      stops = apiStops;
      renderTimelineStops(stops, false);
      drawBusRouteOnMap(stops, route.color);
      if (wasEmpty) {
        fitRouteBounds(stops);
      }
    } else if (stops.length < 2) {
      renderTimelineStops([], false);
    }
  });

  // 실시간 버스 위치 API 호출 및 주기적 갱신
  fetchRealtimeBusLocation(route);
  realtimeBusInterval = setInterval(function() {
    if (currentSelectedRoute &&
        currentSelectedRoute.routeId === route.routeId) {
      fetchRealtimeBusLocation(route);
    }
  }, 20000);
}

function fitRouteBounds(stops) {
  if (!window.gumapWebGLMap || !stops || stops.length < 2)
    return;
  var minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
  stops.forEach(function(s) {
    var lat = s.gpslati || (gumiStopsCoords && gumiStopsCoords[s.nodeid]
                                ? gumiStopsCoords[s.nodeid].lat
                                : null);
    var lng = s.gpslong || (gumiStopsCoords && gumiStopsCoords[s.nodeid]
                                ? gumiStopsCoords[s.nodeid].lng
                                : null);
    if (lat && lng) {
      minLng = Math.min(minLng, Number(lng));
      maxLng = Math.max(maxLng, Number(lng));
      minLat = Math.min(minLat, Number(lat));
      maxLat = Math.max(maxLat, Number(lat));
    }
  });
  if (minLng < maxLng) {
    window.gumapWebGLMap.fitBounds([ [ minLng, minLat ], [ maxLng, maxLat ] ],
                                   {padding : 60, duration : 900});
  }
}

// ── 정확한 routeId 의 도로 스냅 경로가 있으면 사용하고, 없으면 실제 경유
// 정류장들을 순서대로 연결 ──
function getRouteRoadPath(route, stops) {
  if (route && route.routeId && window.gumiBusRoadPaths &&
      Array.isArray(window.gumiBusRoadPaths[route.routeId])) {
    var snapped = window.gumiBusRoadPaths[route.routeId];
    if (snapped.length >= 2) {
      return snapped;
    }
  }
  return (stops || [])
      .map(function(s) {
        var lat = s.gpslati || (gumiStopsCoords && gumiStopsCoords[s.nodeid]
                                    ? gumiStopsCoords[s.nodeid].lat
                                    : null);
        var lng = s.gpslong || (gumiStopsCoords && gumiStopsCoords[s.nodeid]
                                    ? gumiStopsCoords[s.nodeid].lng
                                    : null);
        return [ Number(lat), Number(lng) ];
      })
      .filter(function(p) { return p[0] && p[1]; });
}

function drawBusRouteOnMap(stops, color) {
  if (!stops || stops.length < 2) {
    if (typeof window.clearGuMapWebGLRoute === 'function')
      window.clearGuMapWebGLRoute();
    restoreMapStopsOpacity();
    return;
  }
  var path = getRouteRoadPath(currentSelectedRoute, stops);
  var curRoute = currentSelectedRoute;
  var path = getRouteRoadPath(curRoute, stops);
  if (path.length >= 2 && typeof window.renderGuMapWebGLRoute === 'function') {
    window.renderGuMapWebGLRoute(path, color || "#2563eb");
    highlightSelectedRouteOnMap(stops, color || "#2563eb");
  }

  // 🛣️ 사전 캐시에 없는 노선일 경우, 백엔드 A* 도로 스냅 API 비동기 자동
  // 호출하여 실시간 곡선 도로로 업그레이드
  if (curRoute && curRoute.routeId &&
      (!window.gumiBusRoadPaths ||
       !window.gumiBusRoadPaths[curRoute.routeId])) {
    var reqRouteId = curRoute.routeId;
    fetch('/bus/route-path/' + encodeURIComponent(reqRouteId))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(res) {
          if (res && Array.isArray(res.path) && res.path.length >= 2) {
            if (!window.gumiBusRoadPaths)
              window.gumiBusRoadPaths = {};
            window.gumiBusRoadPaths[reqRouteId] = res.path;
            if (currentSelectedRoute &&
                currentSelectedRoute.routeId === reqRouteId) {
              if (typeof window.renderGuMapWebGLRoute === 'function') {
                window.renderGuMapWebGLRoute(res.path, color || "#2563eb");
              }
              var th = document.getElementById('bus-timeline-header');
              if (th) {
                var badge = th.querySelector('span:last-child');
                if (badge) {
                  badge.outerHTML =
                      '<span style="font-size:10px; color:#2563eb; font-weight:700;">도로 스냅 경로</span>';
                }
              }
            }
          }
        })
        .catch(function(
            err) { console.warn('Road snap async fetch error:', err); });
  }
}

function clearRealtimeBuses() {
  if (realtimeBusInterval) {
    clearInterval(realtimeBusInterval);
    realtimeBusInterval = null;
  }
  realtimeBusMarkers.forEach(function(m) { m.remove(); });
  realtimeBusMarkers = [];
}

// ── 실시간 버스 위치 API 호출 및 정밀 정류장 좌표 매핑 ──
function fetchRealtimeBusLocation(route) {
  loadGumiStopsCoords().then(function(stopsDb) {
    var url =
        '/tago-api?targetUrl=' +
        encodeURIComponent(
            'https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList') +
        '&cityCode=37050&routeId=' + encodeURIComponent(route.routeId) +
        '&_type=json';

    fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          var items = [];
          if (data && data.response && data.response.body &&
              data.response.body.items && data.response.body.items.item) {
            items = data.response.body.items.item;
            if (!Array.isArray(items))
              items = [ items ];
          }

          if (items.length > 0) {
            console.log('[GuMap Bus] Real-time buses online for ' +
                            route.routeNo + ' (' + route.routeId + '):',
                        items.length);
            renderRealtimeBusMarkers(items, route, stopsDb);
          } else {
            fetchArrivalInfoFallback(route, stopsDb);
          }
        })
        .catch(function(err) {
          console.log('[GuMap Bus] Bus location query error:', err.message);
          fetchArrivalInfoFallback(route, stopsDb);
        });
  });
}

function fetchArrivalInfoFallback(route, stopsDb) {
  var stops = getCachedRouteStops(route);
  var sampleStop = stops[0];
  if (!sampleStop || !sampleStop.nodeid)
    return;

  var url =
      '/tago-api?targetUrl=' +
      encodeURIComponent(
          'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoSpcifyRouteBusArvlPrearngeInfoList') +
      '&cityCode=37050&nodeId=' + encodeURIComponent(sampleStop.nodeid) +
      '&routeId=' + encodeURIComponent(route.routeId) + '&_type=json';

  fetch(url)
      .then(function(res) { return res.json(); })
      .then(function() {})
      .catch(function() {});
}

function computeAngleBetween(lat1, lon1, lat2, lon2) {
  var toRad = Math.PI / 180;
  var toDeg = 180 / Math.PI;
  var dLon = (lon2 - lon1) * toRad;
  var y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  var x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
          Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  var brng = Math.atan2(y, x) * toDeg;
  return (brng + 360) % 360;
}

function calculateBusBearing(lat, lng, route, stops, nodeord) {
  if (nodeord !== undefined && stops && stops.length >= 2) {
    var ordIdx = Number(nodeord) - 1;
    var curr = stops[ordIdx];
    var next = stops[ordIdx + 1] || stops[ordIdx - 1];
    if (curr && next) {
      var cLat =
          curr.gpslati || (gumiStopsCoords && gumiStopsCoords[curr.nodeid]
                               ? gumiStopsCoords[curr.nodeid].lat
                               : null);
      var cLng =
          curr.gpslong || (gumiStopsCoords && gumiStopsCoords[curr.nodeid]
                               ? gumiStopsCoords[curr.nodeid].lng
                               : null);
      var nLat =
          next.gpslati || (gumiStopsCoords && gumiStopsCoords[next.nodeid]
                               ? gumiStopsCoords[next.nodeid].lat
                               : null);
      var nLng =
          next.gpslong || (gumiStopsCoords && gumiStopsCoords[next.nodeid]
                               ? gumiStopsCoords[next.nodeid].lng
                               : null);
      if (cLat && cLng && nLat && nLng) {
        return computeAngleBetween(Number(cLat), Number(cLng), Number(nLat),
                                   Number(nLng));
      }
    }
  }
  var path = getRouteRoadPath(route, stops);
  if (path && path.length >= 2) {
    var bestDist = Infinity;
    var bestIdx = 0;
    for (var i = 0; i < path.length - 1; i++) {
      var p1 = path[i];
      var p2 = path[i + 1];
      var midLat = (p1[0] + p2[0]) / 2;
      var midLng = (p1[1] + p2[1]) / 2;
      var d = Math.hypot(midLat - lat, midLng - lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return computeAngleBetween(path[bestIdx][0], path[bestIdx][1],
                               path[bestIdx + 1][0], path[bestIdx + 1][1]);
  }
  return 90;
}

function renderRealtimeBusMarkers(buses, route, stopsDb) {
  if (!window.gumapWebGLMap || !buses.length)
    return;

  clearRealtimeBuses();

  var stops = getCachedRouteStops(route);

  buses.forEach(function(b) {
    var lat = null, lng = null, stName = b.nodenm || '';

    if (b.gpslati && b.gpslong && Number(b.gpslati) > 0) {
      lat = Number(b.gpslati);
      lng = Number(b.gpslong);
    } else if (b.nodeid && stopsDb[b.nodeid]) {
      lat = Number(stopsDb[b.nodeid].lat);
      lng = Number(stopsDb[b.nodeid].lng);
      stName = stopsDb[b.nodeid].name || stName;
    } else if (b.nodeord !== undefined) {
      var ordIdx = Number(b.nodeord) - 1;
      if (ordIdx >= 0 && ordIdx < stops.length) {
        var targetStop = stops[ordIdx];
        lat = targetStop.gpslati ||
              (stopsDb[targetStop.nodeid] ? stopsDb[targetStop.nodeid].lat
                                          : null);
        lng = targetStop.gpslong ||
              (stopsDb[targetStop.nodeid] ? stopsDb[targetStop.nodeid].lng
                                          : null);
        stName = targetStop.nodenm || stName;
      }
    }

    if (lat && lng) {
      var vehNo = b.vehicleno || '';
      var shortVehNo = vehNo.length >= 4 ? vehNo.slice(-4) : vehNo;

      var bearing = calculateBusBearing(lat, lng, route, stops, b.nodeord);
      var iconUrl = 'GUMAP-아이콘/bus_right.png';
      var tilt = 0;

      if (bearing >= 0 && bearing < 180) {
        iconUrl = 'GUMAP-아이콘/bus_right.png';
        tilt = Math.max(-45, Math.min(45, bearing - 90));
      } else {
        iconUrl = 'GUMAP-아이콘/bus_left.png';
        tilt = Math.max(-45, Math.min(45, bearing - 270));
      }

      var el = document.createElement('div');
      el.className = 'realtime-bus-marker';
      el.style.cssText =
          'display:flex; flex-direction:column; align-items:center; cursor:pointer; user-select:none; z-index:900;';

      var badgeHtml =
          shortVehNo
              ? '<div style="background:#1e293b; color:#ffffff; font-size:10px; font-weight:800; padding:1px 6px; border-radius:8px; border:1px solid #ffffff; box-shadow:0 2px 5px rgba(0,0,0,0.3); white-space:nowrap; margin-bottom:2px;">' +
                    shortVehNo + '</div>'
              : '';

      el.innerHTML =
          badgeHtml +
          '<div class="bus-icon-body" style="width:34px; height:34px; background:url(\'' +
          iconUrl +
          '\') no-repeat center/contain; filter:drop-shadow(0 3px 8px rgba(0,0,0,0.4)); transform:rotate(' +
          tilt.toFixed(1) +
          'deg); transition:transform 0.25s ease, filter 0.2s ease;"></div>';

      el.onmouseenter = function() {
        var icon = el.querySelector('.bus-icon-body');
        if (icon) {
          icon.style.filter =
              'drop-shadow(0 5px 12px rgba(0,0,0,0.6)) brightness(1.15)';
          icon.style.transform =
              'rotate(' + tilt.toFixed(1) + 'deg) scale(1.2)';
        }
      };
      el.onmouseleave = function() {
        var icon = el.querySelector('.bus-icon-body');
        if (icon) {
          icon.style.filter = 'drop-shadow(0 3px 8px rgba(0,0,0,0.4))';
          icon.style.transform = 'rotate(' + tilt.toFixed(1) + 'deg) scale(1)';
        }
      };

      var popupHtml =
          '<div style="padding:4px; font-size:12px;">' +
          '<div style="font-weight:800; color:' + route.color +
          '; font-size:14px; margin-bottom:4px;">' + route.routeNo +
          '번 버스</div>' +
          '<div style="color:#334155; margin-bottom:2px;"><b>차량:</b> ' +
          (vehNo || '운행중') + '</div>' +
          '<div style="color:#64748b;"><b>위치:</b> ' +
          (stName || '정류소 부근') + '</div>' +
          '</div>';

      var popup =
          new maplibregl.Popup({offset : [ 0, -20 ], closeButton : true})
              .setHTML(popupHtml);

      var marker = new maplibregl.Marker({element : el, anchor : 'center'})
                       .setLngLat([ lng, lat ])
                       .setPopup(popup)
                       .addTo(window.gumapWebGLMap);

      realtimeBusMarkers.push(marker);
    }
  });
}

// ── 외부에서 노선 번호 또는 노선 ID로 상세 패널을 열 때 정확한 일치만 사용 ──
window.showBusRouteDetail = function(routeNoOrId) {
  if (!routeNoOrId)
    return;
  var clean = String(routeNoOrId).trim();
  var r = GUMI_ROUTES.find(function(
      x) { return String(x.routeId).trim() === clean; });
  if (!r) {
    r = GUMI_ROUTES.find(function(
        x) { return String(x.routeNo).trim() === clean; });
  }
  if (typeof window.switchSidebarMenu === 'function') {
    window.switchSidebarMenu('bus');
  } else {
    window.openBusBoard();
  }
  if (r) {
    showRouteDetail(r);
  } else {
    var filterInput = document.getElementById('bus-route-filter-input');
    if (filterInput) {
      filterInput.value = clean;
      renderRouteList(clean, 'all');
    }
  }
};

window.navigateToBusRoute = function(routeNo) {
  if (window.gumapStopPopup) {
    window.gumapStopPopup.remove();
  }
  window.showBusRouteDetail(routeNo);
};

window.openBusRoutePanel = function(
    routeNo) { window.showBusRouteDetail(routeNo || '11'); };

window.renderRealtimeBusMarkers = renderRealtimeBusMarkers;
})();
