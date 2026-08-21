// ============================================================
// 📁 파일명: js/map/map-search.js
// 📌 역할: 통합 검색 엔진 (주소·장소·노선·카테고리 통합 검색)
// ============================================================
//
// [파일 설명]
//   검색창에 입력된 키워드를 분석하여 적절한 검색 전략을 자동 결정합니다.
//   - 자연어 파싱: "구미역 근처 카페", "11번 버스" 등 의도 자동 인식
//   - 주소 검색: 행정안전부 도로명주소 API 연동
//   - 장소 검색: VWorld 검색 API 연동
//   - 노선 검색: 버스 노선번호 감지 시 selectRoute() 자동 호출
//   - 카테고리 검색: "카페", "약국", "주유소" 등 카테고리별 주변 검색
//   - 최근 검색어 기록 및 자동완성 제안
//
// [의존 관계]
//   - config.js → API 키, 프록시 URL 참조
//   - bus_tracker.js → selectRoute() 노선 선택 연동
//   - map-init.js → window.map 지도 이동 및 마커 생성
//
// [사용된 외부 API]
//   - 행정안전부 도로명주소 검색 API (juso.go.kr)
//   - VWorld 검색 API
//   - 공공데이터포털 버스노선정보 API
// ============================================================

window.searchMarkers = [];
window.categoryMarkers = [];
window.categoryClusterGroup = null;

// ── 검색 Race Condition 방지 토큰 ──
let searchToken = 0;

// 검색 마커 초기화
window.clearSearchMarkers = function() {
    window.searchMarkers.forEach(m => m.remove());
    window.searchMarkers = [];
};

// 메인 검색 함수 (버스 노선, AI 검색 및 로컬 파서 통합) - 300ms 디바운싱 적용
let searchPlaceTimeout = null;
window.searchPlace = function() {
    clearTimeout(searchPlaceTimeout);
    searchPlaceTimeout = setTimeout(function() {
        var mySearchToken = ++searchToken; // Race Condition 방지 토큰
        if (typeof window.clearSearchMarkers === 'function') {
            window.clearSearchMarkers();
        }
        var query = document.getElementById('search-input').value.trim();
        if (!query) {
            alert("검색할 장소나 건물명, 또는 버스 노선번호를 입력해주세요!");
            return;
        }

        // 개발자 모드 전용 특수 명령어 감지
        if (query === 'hydrogen007') {
            if (window.showDevModal) window.showDevModal();
            document.getElementById('search-input').value = '';
            return;
        }
        if (query === 'hydrogen008') {
            if (window.saveDevConfig) window.saveDevConfig();
            document.getElementById('search-input').value = '';
            return;
        }
        
        var resultDiv = document.getElementById('search-results');
        resultDiv.style.display = 'block';

        // 1. 버스 노선 번호 검색인지 확인
        var routeQuery = query.replace(/번|버스|노선/g, '').trim();
        if (typeof allRoutesMap !== 'undefined' && allRoutesMap[routeQuery]) {
            var typeInfo = (typeof getBusTypeInfo === 'function') ? getBusTypeInfo(routeQuery) : { color: '#10b981' };
            var color = typeInfo.color;
            resultDiv.innerHTML = `
                <div style="padding:12px; text-align:center; border-bottom:2px solid ${color};">
                    <b style="color:${color}; font-size:14px;">🚌 ${routeQuery}번 버스 노선</b><br>
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">노선이 확인되었습니다.</div>
                    <button onclick="selectRoute('${routeQuery}'); document.getElementById('search-results').style.display='none';" style="margin-top:8px; padding:6px 12px; background:${color}; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:700; font-size:12px;">지도에 노선 표시 + 상세 보기</button>
                </div>`;
            return;
        }

        resultDiv.innerHTML = '<div style="padding:10px; text-align:center; color:#64748b;">🔍 검색 중...</div>';
        
        // ── 2. Gemini / OpenAI AI 자연어 검색 연동 ──
    var isNaturalLanguage = query.includes(' ') || query.includes('알려줘') || query.includes('가는') || query.includes('어떻게') || query.includes('추천') || query.includes('찾아줘') || query.includes('맛집') || query.includes('근처') || query.includes('주변') || query.includes('켜') || query.includes('보여') || query.includes('보여줘') || query.includes('지도') || query.length > 10;
    
    if (isNaturalLanguage) {
        resultDiv.innerHTML = '<div style="padding:10px; text-align:center; color:#8b5cf6;">✨ AI(Gemini)가 문맥을 파악 중입니다...</div>';
        
        var center = window.map ? window.map.getCenter() : { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
        var promptText = `
너는 대중교통 및 교통지도 AI 에이전트야.
사용자가 현재 지도로 바라보고 있는 중심 좌표(지리적 맥락)는 다음과 같아:
- 위도: ${center.lat}
- 경도: ${center.lng}

사용자의 검색어/질문: "${query}"

이 질문이 어떤 교통 지도 기능/의도인지 파악해서 반드시 JSON 포맷으로만 응답해. 백틱(\`\`\`json) 쓰지 말고 순수 JSON만 출력해. 설명이나 텍스트는 절대 포함하지 마.

가능한 의도(intent) 목록과 JSON 구조는 다음과 같아:

1. [지도 레이어 온/오프 토글] (CCTV, 실시간 교통정보, 도로 공사/통제, 공유 킥보드, 사고다발지역 등)
   - CCTV 켜달라/꺼달라, cctv 보여줘: {"intent": "toggle_layer", "layer": "cctv", "active": true/false}
   - 실시간 교통망 정보, 막히는 길, 교통 상황: {"intent": "toggle_layer", "layer": "traffic", "active": true/false}
   - 도로 통제/공사 정보, 통제구간: {"intent": "toggle_layer", "layer": "event", "active": true/false}
   - 공유 킥보드/자전거 찾기, 씽씽이, 타슈: {"intent": "toggle_layer", "layer": "pm", "active": true/false}
   - 교통사고 다발지역 표시: {"intent": "toggle_layer", "layer": "wms_accident", "active": true/false}
   - 보행자사고 다발지역 표시: {"intent": "toggle_layer", "layer": "wms_pedestrian", "active": true/false}
   - 치안/안전정보 표시, 치안지도: {"intent": "toggle_layer", "layer": "wms_safety", "active": true/false}

2. [특정 편의시설/주유소 반경 검색]
   - 휘발유 가격, 싼 주유소, 주유소 검색, lpg 충전소: {"intent": "search_category", "category": "주유소"}
   - 경로당, 실버센터, 노인정: {"intent": "search_category", "category": "경로당"}
   - 음식점, 식당, 맛집: {"intent": "search_category", "category": "음식점"}
   - 편의점, 마트, 슈퍼마켓: {"intent": "search_category", "category": "편의점"}
   - 병원, 의원, 약국: {"intent": "search_category", "category": "약국"}

3. [실시간 버스 노선 조회] (버스 번호가 언급된 경우)
   - 170번 버스 노선, 11번 버스 어디있어: {"intent": "search_bus", "route": "버스번호"}

4. [나의 즐겨찾기 목록 조회]
   - 즐겨찾기 보여줘, 저장한 곳: {"intent": "show_favorites"}

5. [MaaS 정책 연구 레이어 제어] (DRT, 승하차 히트맵, 인구 리포트 등)
   - 행복버스(DRT) 노선 가시화: {"intent": "toggle_research", "feature": "drt", "active": true/false}
   - 승하차 인원 밀도 히트맵: {"intent": "toggle_research", "feature": "heatmap", "active": true/false}
   - 인구 및 교통수요 리포트 열기: {"intent": "toggle_research", "feature": "report"}

6. [길찾기] (출발지에서 도착지까지 어떻게 가는지 묻는 경우)
   - {"intent": "route", "start": "출발지명(없거나 '내위치'면 '현위치'로)", "end": "도착지명"}

7. [일반 장소/건물 검색] (위 항목에 해당하지 않는 경우)
   - {"intent": "search", "keyword": "검색 키워드", "location_context": "지명 랜드마크(없으면 null)"}
`;
        fetch(`${window.PROXY_URL}/gemini-api`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(errData => {
                    throw new Error(errData.error?.message || `HTTP ${res.status}`);
                });
            }
            return res.json();
        })
        .then(data => {
            if (data.candidates && data.candidates.length > 0) {
                var text = data.candidates[0].content.parts[0].text.trim();
                
                var jsonStart = text.indexOf('{');
                var jsonEnd = text.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    text = text.substring(jsonStart, jsonEnd + 1);
                }
                
                var aiResult = JSON.parse(text);
                console.log("[AI Agent Response Intent]", aiResult);
                
                if (aiResult.intent === 'toggle_layer') {
                    var layer = aiResult.layer;
                    var active = aiResult.active !== false;
                    var layerObj = null;
                    var layerName = "";
                    
                    if (layer === 'cctv') {
                        layerObj = window.cctvLayerGroup;
                        layerName = "📹 실시간 CCTV";
                        if (window.toggleCctvLayer) window.toggleCctvLayer(active);
                    } else if (layer === 'traffic') {
                        layerObj = window.trafficLayer;
                        layerName = "🚦 실시간 교통망 정보";
                        if (window.toggleTrafficLayer) window.toggleTrafficLayer(active);
                    } else if (layer === 'event') {
                        layerObj = window.eventLayerGroup;
                        layerName = "🚧 실시간 도로 통제/공사";
                        window.isEventLayerOn = active;
                        if (active) {
                            window.map.addLayer(window.eventLayerGroup);
                            if (window.fetchAndRenderEvent) window.fetchAndRenderEvent();
                        } else {
                            window.map.removeLayer(window.eventLayerGroup);
                            window.eventMarkers.forEach(m => m.remove());
                            window.eventMarkers = [];
                        }
                    } else if (layer === 'pm') {
                        layerObj = window.sharedPmLayerGroup;
                        layerName = "🛴 공유 킥보드/자전거";
                        if (window.toggleSharedPmLayer) window.toggleSharedPmLayer(active);
                    } else if (layer === 'wms_accident') {
                        layerObj = window.wmsTrafficAccident;
                        layerName = "⚠️ 교통사고 다발지역 (WMS)";
                    } else if (layer === 'wms_pedestrian') {
                        layerObj = window.wmsPedestrianHazard;
                        layerName = "🚶 보행자사고 다발지역 (WMS)";
                    } else if (layer === 'wms_safety') {
                        layerObj = window.wmsSafetyInfo;
                        layerName = "🚨 생활밀착 치안/안전정보 (WMS)";
                    }
                    
                    if (layerObj) {
                        if (active) {
                            if (!window.map.hasLayer(layerObj)) window.map.addLayer(layerObj);
                            resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#8b5cf6; font-weight:700;">✅ [AI 완료] "${layerName}" 레이어를 활성화했습니다!</div>`;
                        } else {
                            if (window.map.hasLayer(layerObj)) window.map.removeLayer(layerObj);
                            resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#64748b; font-weight:700;">🚫 [AI 완료] "${layerName}" 레이어를 비활성화했습니다!</div>`;
                        }
                    } else {
                        resultDiv.innerHTML = `<div style="padding:10px; text-align:center; color:#ef4444;">⚠️ 알 수 없는 레이어 요청입니다.</div>`;
                    }
                    
                } else if (aiResult.intent === 'search_category') {
                    var cat = aiResult.category;
                    resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#8b5cf6; font-weight:700;">🧭 [AI 연동] 주변 "${cat}" 검색을 자동 시작합니다...</div>`;
                    setTimeout(() => {
                        window.searchCategory(cat);
                    }, 600);
                    
                } else if (aiResult.intent === 'search_bus') {
                    var route = aiResult.route.replace(/번|버스/g, '').trim();
                    resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#8b5cf6; font-weight:700;">🚌 [AI 연동] "${route}번" 버스 노선 상세 조회를 시작합니다...</div>`;
                    setTimeout(() => {
                        if (window.selectRoute) window.selectRoute(route);
                        resultDiv.style.display = 'none';
                    }, 600);
                    
                } else if (aiResult.intent === 'show_favorites') {
                    resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#8b5cf6; font-weight:700;">⭐ [AI 연동] 나의 즐겨찾기 목록을 보여드립니다!</div>`;
                    if (window.expandPanel) window.expandPanel();
                    setTimeout(() => {
                        var favList = document.getElementById('favorites-list');
                        if (favList) favList.scrollIntoView({ behavior: 'smooth' });
                    }, 500);
                    
                } else if (aiResult.intent === 'toggle_research') {
                    var feature = aiResult.feature;
                    var active = aiResult.active !== false;
                    
                    if (feature === 'drt') {
                        var toggle = document.getElementById('research-drt-toggle');
                        if (toggle) {
                            toggle.checked = active;
                            if (window.toggleResearchDrt) window.toggleResearchDrt(active);
                        }
                        resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#8b5cf6; font-weight:700;">📊 [AI 연동] 행복버스(DRT) 노선을 ${active ? '표시합니다' : '해제합니다'}.</div>`;
                    } else if (feature === 'heatmap') {
                        var toggle = document.getElementById('research-heatmap-toggle');
                        if (toggle) {
                            toggle.checked = active;
                            if (window.toggleResearchHeatmap) window.toggleResearchHeatmap(active);
                        }
                        resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#8b5cf6; font-weight:700;">📊 [AI 연동] 승하차 밀도 히트맵을 ${active ? '표시합니다' : '해제합니다'}.</div>`;
                    } else if (feature === 'report') {
                        resultDiv.innerHTML = `<div style="padding:12px; text-align:center; color:#8b5cf6; font-weight:700;">📊 [AI 연동] 인구 및 교통수요 리포트를 불러옵니다...</div>`;
                        if (window.openPopulationReport) window.openPopulationReport();
                    }
                    
                } else if (aiResult.intent === 'route') {
                    window.handleAiRouting(aiResult.start, aiResult.end);
                } else {
                    if (aiResult.location_context) {
                        resultDiv.innerHTML = `<div style="padding:10px; text-align:center; color:#8b5cf6;">📍 먼저 "${aiResult.location_context}"의 위치를 조회하고 있습니다...</div>`;
                        var contextUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=1&page=1&query=${encodeURIComponent(aiResult.location_context)}&type=place&format=json&errorformat=json&domain=${window.location.host}`;
                        fetch(contextUrl)
                            .then(res => res.json())
                            .then(data => {
                                if (data.response && data.response.status === "OK" && data.response.result && data.response.result.items && data.response.result.items.length > 0) {
                                    var item = data.response.result.items[0];
                                    var lat = parseFloat(item.point.y);
                                    var lng = parseFloat(item.point.x);
                                    if (window.map) {
                                        window.map.setView([lat, lng], 15);
                                    }
                                    console.log(`[AI Location Context] 지도 중심 이동: ${aiResult.location_context} (${lat}, ${lng})`);
                                    setTimeout(() => {
                                        executeStandardSearch(aiResult.keyword || query);
                                    }, 300);
                                } else {
                                    console.log(`[AI Location Context] "${aiResult.location_context}" 위치 조회 실패. 일반 검색 진행.`);
                                    executeStandardSearch(aiResult.keyword || query);
                                }
                            })
                            .catch(err => {
                                console.warn(`[AI Location Context] 에러 발생:`, err);
                                executeStandardSearch(aiResult.keyword || query);
                            });
                    } else {
                        executeStandardSearch(aiResult.keyword || query);
                    }
                }
            } else {
                if (data.error) {
                    throw new Error(data.error.message);
                }
                fallbackToLocalParser(query);
            }
        })
        .catch(err => {
            console.error("Gemini AI API 호출 실패:", err);
            resultDiv.innerHTML = `<div style="padding:10px; text-align:center; color:#ef4444;">
                ⚠️ AI(Gemini) 인식 오류: ${err.message}<br>
                <span style="font-size:11px; color:#64748b;">(로컬 검색 파서로 전환하여 지능형 검색을 시도합니다)</span>
            </div>`;
            setTimeout(() => {
                fallbackToLocalParser(query);
            }, 1500);
        });
        return;
    }

    // AI 조건에 맞지 않거나 AI 키가 없는 경우 로컬 파서 확인 후 일반 검색 실행
    fallbackToLocalParser(query);
    }, 300);
};

// ── 로컬 자연어 파싱 엔진 (Gemini API 503 장애 대비 백업) ──
function parseLocalQuery(q) {
    if (!q) return null;
    var landmarks = ["구미역", "금오산", "형곡동", "인동동", "인동", "송정동", "신평동", "금오공대", "경운대", "구미시청"];
    var matchedLocation = null;
    for (var i = 0; i < landmarks.length; i++) {
        if (q.includes(landmarks[i])) {
            matchedLocation = landmarks[i];
            break;
        }
    }

    var categories = {
        "대형마트": ["대형마트", "마트"],
        "음식점": ["음식점", "식당", "맛집", "밥집", "고기집", "삼겹살", "한식", "일식", "중식", "양식", "먹거리"],
        "카페": ["카페", "커피", "디저트", "찻집", "베이커리"],
        "약국": ["약국", "메디컬"],
        "병원": ["병원", "의원", "치과", "소아과", "이비인후과"],
        "편의점": ["편의점", "슈퍼", "GS25", "CU", "세븐일레븐", "이마트24"],
        "주차장": ["주차장", "주차"],
        "공원": ["공원", "유원지", "체육공원"],
        "공공기관": ["시청", "구청", "주민센터", "행정복지센터", "도청"],
        "경찰서": ["경찰서", "파출소", "지구대"],
        "소방서": ["소방서", "119"]
    };
    
    var matchedCategory = null;
    for (var cat in categories) {
        var keywords = categories[cat];
        for (var j = 0; j < keywords.length; j++) {
            // 특정 브랜드명 검색 시 범용 카테고리인 '마트' 등으로 뭉뚱그려지지 않도록 방어
            if (q === "이마트" || q === "홈플러스" || q === "롯데마트" || q === "스타벅스") {
                return null; // bypass local rule, run exact keyword search
            }
            
            if (q.includes(keywords[j])) {
                matchedCategory = cat;
                break;
            }
        }
        if (matchedCategory) break;
    }

    if (matchedCategory) {
        return {
            keyword: matchedCategory,
            location_context: matchedLocation
        };
    }
    return null;
}

function executeLocalRuleSearch(ruleResult) {
    var resultDiv = document.getElementById('search-results');
    if (ruleResult.location_context) {
        resultDiv.innerHTML = `<div style="padding:10px; text-align:center; color:#8b5cf6;">📍 로컬 파서: 먼저 "${ruleResult.location_context}"의 위치를 조회하고 있습니다...</div>`;
        var contextUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=1&page=1&query=${encodeURIComponent(ruleResult.location_context)}&type=place&format=json&errorformat=json&domain=${window.location.host}`;
        fetch(contextUrl)
            .then(res => res.json())
            .then(data => {
                if (data.response && data.response.status === "OK" && data.response.result && data.response.result.items && data.response.result.items.length > 0) {
                    var item = data.response.result.items[0];
                    var lat = parseFloat(item.point.y);
                    var lng = parseFloat(item.point.x);
                    if (window.map) {
                        window.map.setView([lat, lng], 15);
                    }
                    console.log(`[Local Rule Search] 지도 중심 이동: ${ruleResult.location_context} (${lat}, ${lng})`);
                    setTimeout(() => {
                        executeStandardSearch(ruleResult.keyword);
                    }, 300);
                } else {
                    executeStandardSearch(ruleResult.keyword);
                }
            })
            .catch(() => {
                executeStandardSearch(ruleResult.keyword);
            });
    } else {
        executeStandardSearch(ruleResult.keyword);
    }
}

function fallbackToLocalParser(q) {
    var localResult = parseLocalQuery(q);
    if (localResult) {
        executeLocalRuleSearch(localResult);
    } else {
        executeStandardSearch(q);
    }
}

// ── 일반 검색 함수 (병렬 및 통합 랭킹 적용) ──
async function executeStandardSearch(searchKeyword) {
    var resultDiv = document.getElementById('search-results');
    resultDiv.innerHTML = '<div style="padding:10px; text-align:center; color:#64748b;">🔍 검색 중...</div>';
    
    var cleanKeyword = searchKeyword.trim();
    if (!cleanKeyword) {
        resultDiv.innerHTML = '';
        return;
    }

    try {
        // 1. JUSO API 및 VWorld Place API (BBox 포함) 병렬 호출 설정
        var jusoUrl = `${window.PROXY_URL}/juso?currentPage=1&countPerPage=15&keyword=${encodeURIComponent(cleanKeyword)}&resultType=json`;
        var bounds = window.map ? window.map.getBounds() : null;
        var vworldPlaceUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=15&page=1&query=${encodeURIComponent(cleanKeyword)}&type=place&format=json&errorformat=json&domain=${window.location.host}`;
        if (bounds) {
            var bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            vworldPlaceUrl += `&bbox=${bbox}`;
        }

        var jusoPromise = fetch(jusoUrl)
            .then(res => res.json())
            .catch(err => {
                console.warn("도로명주소 API 통신 실패:", err);
                return null;
            });

        var vworldPromise = fetch(vworldPlaceUrl)
            .then(res => res.json())
            .catch(err => {
                console.warn("[VWorld BBox Search] 에러:", err);
                return null;
            });

        var [jusoData, vworldData] = await Promise.all([jusoPromise, vworldPromise]);

        var jusoList = (jusoData && jusoData.results && jusoData.results.juso) ? jusoData.results.juso : [];
        var vworldList = [];

        if (vworldData && vworldData.response && vworldData.response.status === "OK" && vworldData.response.result && vworldData.response.result.items && vworldData.response.result.items.length > 0) {
            vworldList = vworldData.response.result.items;
            console.log(`[VWorld BBox Search] 성공: ${vworldList.length}개 결과 (검색어: ${cleanKeyword})`);
        } else if (bounds) {
            console.log(`[VWorld BBox Search] 결과 없음. 전체 영역으로 검색합니다.`);
            var globalPlaceUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=15&page=1&query=${encodeURIComponent(cleanKeyword)}&type=place&format=json&errorformat=json&domain=${window.location.host}`;
            var globalVworldData = await fetch(globalPlaceUrl).then(res => res.json()).catch(err => { console.warn("Global VWorld Search failed:", err); return null; });
            if (globalVworldData && globalVworldData.response && globalVworldData.response.status === "OK" && globalVworldData.response.result && globalVworldData.response.result.items) {
                vworldList = globalVworldData.response.result.items;
            }
        }

        // 2. 만약 Place 검색 및 Juso 검색 결과가 모두 없으면 VWorld Address 검색으로 폴백
        if (jusoList.length === 0 && vworldList.length === 0) {
            console.log("검색 결과가 없으므로 도로명 주소 API로 폴백합니다.");
            var vworldAddrUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=15&page=1&query=${encodeURIComponent(cleanKeyword)}&type=address&category=road&format=json&errorformat=json&domain=${window.location.host}`;
            var addrData = await fetch(vworldAddrUrl).then(res => res.json()).catch(err => { console.warn("VWorld Address (road) Search failed:", err); return null; });
            if (addrData && addrData.response && addrData.response.status === "OK" && addrData.response.result && addrData.response.result.items) {
                vworldList = addrData.response.result.items;
            } else {
                // parcel(지번) 검색으로 최종 시도
                var vworldParcelUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=15&page=1&query=${encodeURIComponent(cleanKeyword)}&type=address&category=parcel&format=json&errorformat=json&domain=${window.location.host}`;
                var parcelData = await fetch(vworldParcelUrl).then(res => res.json()).catch(err => { console.warn("VWorld Address (parcel) Search failed:", err); return null; });
                if (parcelData && parcelData.response && parcelData.response.status === "OK" && parcelData.response.result && parcelData.response.result.items) {
                    vworldList = parcelData.response.result.items;
                }
            }
        }

        if (jusoList.length === 0 && vworldList.length === 0) {
            resultDiv.innerHTML = '<div style="padding:12px; text-align:center; color:#94a3b8; font-size:12px;">검색 결과가 없습니다.</div>';
            window.clearSearchMarkers();
            return;
        }

        // 3. 통합 결과 렌더링
        renderUnifiedResults(jusoList, vworldList, cleanKeyword);

    } catch (error) {
        console.error("통합 검색 중 에러 발생:", error);
        resultDiv.innerHTML = '<div style="padding:12px; text-align:center; color:#ef4444; font-size:12px;">🚨 검색 서버 통신 실패</div>';
    }
}

// ── 검색 결과 점수 시스템 (랜드마크/공공장소 우선 정렬) ──
function getSearchScore(name) {
    if (!name) return 10;
    if (name.includes('역') && (name.endsWith('역') || name.includes('역사') || name.includes('전철역') || name.includes('기차역'))) return 100;
    if (name.includes('시청') || name.includes('도청') || name.includes('구청')) return 100;
    if (name.includes('터미널') || name.includes('KTX') || name.includes('동대구역')) return 100;
    if (name.includes('대학교') || name.includes('대학')) return 100;
    if (name.includes('종합병원') || name.includes('대학병원') || name.includes('순천향') || name.includes('차병원')) return 100;
    if (name.includes('공원') || name.includes('도서관') || name.includes('박물관') || name.includes('미술관') || name.includes('체육관') || name.includes('예술회관')) return 80;
    if (name.includes('초등학교') || name.includes('중학교') || name.includes('고등학교') || name.includes('학교')) return 80;
    if (name.includes('경찰서') || name.includes('소방서') || name.includes('우체국') || name.includes('법원')) return 80;
    if (name.includes('의원') || name.includes('치과') || name.includes('한의원') || name.includes('약국') || name.includes('보건소')) return 60;
    if (name.includes('주민센터') || name.includes('행정복지센터') || name.includes('읍사무소')) return 60;
    if (name.includes('마트') || name.includes('백화점') || name.includes('쇼핑')) return 50;
    if (name.includes('빌라') || name.includes('원룸') || name.includes('투룸') || name.includes('오피스텔') || name.includes('맨션')) return 10;
    return 40;
}

// ── 통합 랭킹 스코어 계산 함수 ──
function calculateUnifiedScore(item, searchKeyword, center) {
    var rawTitle = item.rawTitle || "";
    var cleanTitle = rawTitle.replace(/\s+/g, '').toLowerCase();
    var cleanKeyword = searchKeyword.replace(/\s+/g, '').toLowerCase();
    
    // 1. 기본 분류 점수
    var score = getSearchScore(rawTitle);
    
    // 2. 키워드 텍스트 매칭도 (가장 중요)
    if (cleanKeyword) {
        // 완전 일치
        if (cleanTitle === cleanKeyword) {
            score += 10000;
        }
        // 검색어로 시작
        else if (cleanTitle.startsWith(cleanKeyword)) {
            score += 5000;
        }
        // 검색어 포함
        else if (cleanTitle.includes(cleanKeyword)) {
            score += 2000;
        }
    }
    
    // 3. 지도 중심점과의 거리 가중치 (최대 3000점)
    if (item.lat && item.lng && center) {
        var dLat = item.lat - center.lat;
        var dLng = item.lng - center.lng;
        var dist = Math.sqrt(dLat * dLat + dLng * dLng); // 단순 유클리드 도 단위 거리
        
        // 거리가 매우 가까울수록 3000점에 근접, 멀어질수록 반비례 감쇄
        score += 3000 / (1 + dist * 10);
    }
    
    // 4. 평점 및 리뷰 연동 가산점
    if (item.source === 'vworld' && item.ratingInfo) {
        var isRatingQuery = cleanKeyword.includes('평점') || cleanKeyword.includes('별점') || cleanKeyword.includes('리뷰') || cleanKeyword.includes('인기') || cleanKeyword.includes('맛집') || cleanKeyword.includes('최고') || cleanKeyword.includes('높은');
        var avgRating = parseFloat(item.ratingInfo.avg) || 0;
        if (isRatingQuery) {
            score += avgRating * 1000; // 최대 5000점
        } else {
            score += avgRating * 20;   // 최대 100점
        }
        
        // 좌표를 기본 제공하는 랜드마크 우선 가중치
        score += 500;
    }
    
    return score;
}

// ── 기차 노선 뱃지 HTML 생성 함수 ──
window.getTrainBadgesHtml = function(stationName) {
    if (!stationName) return "";
    var cleanName = stationName.replace(/\s+/g, '');
    if (cleanName === "구미역") {
        return `
            <span style="display:inline-flex; gap:2px; align-items:center; vertical-align:middle; margin-left:4px; flex-wrap:wrap;">
                <span style="font-size:9px; padding:1px 4px; background:#e0f2fe; color:#0369a1; border-radius:3px; font-weight:700;">ITX-마음</span>
                <span style="font-size:9px; padding:1px 4px; background:#fee2e2; color:#b91c1c; border-radius:3px; font-weight:700;">ITX-새마을</span>
                <span style="font-size:9px; padding:1px 4px; background:#0052A4; color:white; border-radius:3px; font-weight:700; border:1px solid #0052A4;">대경선</span>
                <span style="font-size:9px; padding:1px 4px; background:#e51d24; color:white; border-radius:3px; font-weight:700; border:1px solid #e51d24;">무궁화호</span>
            </span>
        `;
    }
    if (cleanName === "사곡역") {
        return `
            <span style="display:inline-flex; gap:2px; align-items:center; vertical-align:middle; margin-left:4px;">
                <span style="font-size:9px; padding:1px 4px; background:#0052A4; color:white; border-radius:3px; font-weight:700; border:1px solid #0052A4;">대경선</span>
            </span>
        `;
    }
    return "";
};

// ── 통합 검색결과 렌더링 및 중복 제거 ──
function renderUnifiedResults(jusoList, vworldList, searchKeyword) {
    var resultDiv = document.getElementById('search-results');
    var center = window.map ? window.map.getCenter() : null;
    
    // 1. Juso 결과를 규격화된 객체로 변환
    var uniformJuso = jusoList.map(function(item) {
        var title = item.bdNm || item.roadAddr;
        var roadAddr = item.roadAddr || "";
        var jibunAddr = item.jibunAddr || "";
        return {
            source: "juso",
            id: item.bdMgtSn || Math.random().toString(),
            title: window.cleanDetailedName(title, 15, false, roadAddr + " " + jibunAddr),
            rawTitle: title,
            roadAddr: roadAddr,
            jibunAddr: jibunAddr,
            lat: null,
            lng: null,
            ratingInfo: { avg: "0.0", count: 0 }
        };
    });
    
    // 2. Vworld 결과를 규격화된 객체로 변환
    var uniformVworld = vworldList.map(function(item) {
        var rawTitle = item.title || (item.address && (item.address.road || item.address.parcel)) || "이름 없는 장소/건물";
        var roadAddr = (item.address && item.address.road) ? item.address.road : ((item.address && item.address.parcel) ? item.address.parcel : "");
        var jibunAddr = (item.address && item.address.parcel) ? item.address.parcel : "";
        var title = window.cleanDetailedName(rawTitle, 15, false, roadAddr + " " + jibunAddr);
        
        return {
            source: "vworld",
            id: item.id || Math.random().toString(),
            title: title,
            rawTitle: rawTitle,
            roadAddr: roadAddr,
            jibunAddr: jibunAddr,
            lat: item.point ? parseFloat(item.point.y) : null,
            lng: item.point ? parseFloat(item.point.x) : null,
            ratingInfo: (typeof getAverageRating === 'function') ? getAverageRating(rawTitle) : { avg: "0.0", count: 0 },
            category: item.category || ""
        };
    });
    
    // 3. 중복 제거 및 리스트 병합 (VWorld 데이터 우선)
    var combined = [];
    var seenAddresses = new Set();
    
    var cleanKeyword = (searchKeyword || "").replace(/\s+/g, '').toLowerCase();
    var isStationSearch = cleanKeyword === "구미역" || cleanKeyword === "사곡역";
    
    // VWorld 데이터 우선 추가 및 필터링
    uniformVworld.forEach(function(item) {
        if (isStationSearch) {
            var titleLower = item.rawTitle.toLowerCase();
            var catLower = item.category.toLowerCase();
            if (titleLower.includes("와이파이") || titleLower.includes("wifi") || 
                titleLower.includes("정류장") || titleLower.includes("승강장") || 
                catLower.includes("와이파이") || catLower.includes("정류장") || 
                catLower.includes("승강장") || titleLower.includes("김천행") || 
                titleLower.includes("선산노선")) {
                return;
            }
        }
        
        // 대형마트 검색 시 편의점 제거
        if (cleanKeyword === "이마트" || cleanKeyword === "홈플러스" || cleanKeyword === "롯데마트" || cleanKeyword === "대형마트") {
            if (item.rawTitle.includes("24") || item.rawTitle.includes("편의점")) return;
        }
        var addrKey = (item.roadAddr || item.jibunAddr).replace(/\s+/g, '').replace(/\([^)]+\)/g, '');
        if (addrKey) {
            seenAddresses.add(addrKey);
        }
        item.score = calculateUnifiedScore(item, searchKeyword, center);
        combined.push(item);
    });
    
    // Juso 데이터 중 중복되지 않는 것만 추가
    uniformJuso.forEach(function(item) {
        if (isStationSearch) {
            var titleLower = item.rawTitle.toLowerCase();
            if (titleLower.includes("와이파이") || titleLower.includes("wifi") || 
                titleLower.includes("정류장") || titleLower.includes("승강장") || 
                titleLower.includes("김천행") || titleLower.includes("선산노선")) {
                return;
            }
        }
        
        // 대형마트 검색 시 편의점 제거
        if (cleanKeyword === "이마트" || cleanKeyword === "홈플러스" || cleanKeyword === "롯데마트" || cleanKeyword === "대형마트") {
            if (item.rawTitle.includes("24") || item.rawTitle.includes("편의점")) return;
        }
        var addrKey = (item.roadAddr || item.jibunAddr).replace(/\s+/g, '').replace(/\([^)]+\)/g, '');
        if (addrKey && seenAddresses.has(addrKey)) {
            return;
        }
        item.score = calculateUnifiedScore(item, searchKeyword, center);
        combined.push(item);
    });
    
    // 4. 점수순 정렬
    combined.sort(function(a, b) { return b.score - a.score; });
    
    var topResults = combined.slice(0, 15);
    window.clearSearchMarkers();
    
    var bounds = L.latLngBounds();
    var hasValidCoords = false;
    
    var html = '<ul style="list-style:none; padding:0; margin:0;">';
    
    topResults.forEach(function(item) {
        var safeName = item.title.replace(/'/g, "\\'");
        var safeAddr = item.roadAddr.replace(/'/g, "\\'");
        var cleanKeyword = searchKeyword.replace(/\s+/g, '').toLowerCase();
        
        // 검색 키워드에 따른 기본 아이콘 매핑
        var iconSymbol = (typeof window.getIconForName === 'function') ? window.getIconForName(item.title) : '🏢';
        if ((!iconSymbol || iconSymbol === '📍' || iconSymbol === '🏢') && item.rawTitle) {
            if (cleanKeyword.includes('음식') || cleanKeyword.includes('식당') || cleanKeyword.includes('맛집') || cleanKeyword.includes('밥') || cleanKeyword.includes('고기') || cleanKeyword.includes('먹거리')) iconSymbol = '🍕';
            else if (cleanKeyword.includes('카페') || cleanKeyword.includes('커피') || cleanKeyword.includes('디저트')) iconSymbol = '☕';
            else if (cleanKeyword.includes('약국')) iconSymbol = '💊';
            else if (cleanKeyword.includes('병원') || cleanKeyword.includes('의원') || cleanKeyword.includes('치과')) iconSymbol = '🏥';
            else if (cleanKeyword.includes('대형마트') || cleanKeyword.includes('이마트') || cleanKeyword.includes('홈플러스') || cleanKeyword.includes('롯데마트')) iconSymbol = '🛒';
            else if (cleanKeyword.includes('편의점') || cleanKeyword.includes('마트') || cleanKeyword.includes('슈퍼')) iconSymbol = '🏪';
            else if (cleanKeyword.includes('주차')) iconSymbol = '🅿️';
            else if (cleanKeyword.includes('공원')) iconSymbol = '🌳';
            else iconSymbol = '🏢';
        }
        
        var ratingBadgeHtml = "";
        var starsHtml = "";
        if (item.source === "vworld" && item.ratingInfo && parseFloat(item.ratingInfo.avg) > 0) {
            var avgRating = parseFloat(item.ratingInfo.avg);
            starsHtml = (typeof renderStars === 'function') ? renderStars(avgRating) : '';
            ratingBadgeHtml = `<span style="font-size:11px; color:#f59e0b; font-weight:700; margin-left:6px;" title="평점">${starsHtml} ${avgRating} (${item.ratingInfo.count}건)</span>`;
        }
        
        // 좌표가 존재하는 항목은 지도 마커 등록
        if (item.lat !== null && item.lng !== null && !isNaN(item.lat) && !isNaN(item.lng)) {
            var mIcon = L.divIcon({
                html: `<div style="font-size:22px; text-shadow:0 0 3px white; cursor:pointer;" title="${item.title}">${iconSymbol}</div>`,
                className: 'search-result-marker-icon', iconSize: [26, 26], iconAnchor: [13, 13]
            });
            
            var marker = L.marker([item.lat, item.lng], { icon: mIcon }).addTo(window.map);
            
            var popupHtml = `<div style="font-family:'Noto Sans KR',sans-serif; padding:5px; min-width:180px;">
                <b style="font-size:14px; color: var(--text-main); display:block; margin-bottom:2px;">${iconSymbol} ${item.title}${window.getTrainBadgesHtml(item.title)}</b>
                ${ratingBadgeHtml ? `<div style="font-size:11px; color:#f59e0b; font-weight:700; margin-bottom:4px;">${starsHtml} ${item.ratingInfo.avg} (${item.ratingInfo.count}건)</div>` : ''}
                <div style="font-size:11px; color: var(--text-muted); margin-bottom:8px;">${item.roadAddr}</div>
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                    <button onclick="setRoutingPoint('START', ${item.lat}, ${item.lng}, '${safeName}'); window.map.closePopup();" style="padding:4px 8px; font-size:10px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">출발</button>
                    <button onclick="setRoutingPoint('END', ${item.lat}, ${item.lng}, '${safeName}'); window.map.closePopup();" style="padding:4px 8px; font-size:10px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">도착</button>
                    <button onclick="window.addFavorite('${safeName}', ${item.lat}, ${item.lng}, '${safeAddr}'); window.map.closePopup();" style="padding:4px 8px; font-size:10px; background:#92400e; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">⭐ 즐겨찾기</button>
                </div>
            </div>`;
            marker.bindPopup(popupHtml);
            window.searchMarkers.push(marker);
            bounds.extend([item.lat, item.lng]);
            hasValidCoords = true;
        }
        
        if (item.source === "vworld") {
            html += `
            <li style="padding:10px; border-bottom:1px solid #f1f5f9; display:flex; flex-direction:column; gap:6px;">
                <div>
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                        <b onclick="showPlacePopup('${safeName}', ${item.lat}, ${item.lng}, '${safeAddr}')" style="color:#3b82f6; font-size:13px; font-weight:700; cursor:pointer; text-decoration:underline;" title="클릭 시 지도 이동 및 주소 보기">${iconSymbol} ${item.title}</b>
                        ${window.getTrainBadgesHtml(item.title)}
                        ${ratingBadgeHtml}
                    </div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">${item.roadAddr}</div>
                </div>
                <div style="display:flex; gap:4px;">
                    <button onclick="setRoutingPoint('START', ${item.lat}, ${item.lng}, '${safeName}'); document.getElementById('search-results').style.display='none';" style="flex:1; padding:5px; font-size:10px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">출발</button>
                    <button onclick="setRoutingPoint('WAYPOINT', ${item.lat}, ${item.lng}, '${safeName}'); document.getElementById('search-results').style.display='none';" style="flex:1; padding:5px; font-size:10px; background:#f59e0b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">경유</button>
                    <button onclick="setRoutingPoint('END', ${item.lat}, ${item.lng}, '${safeName}'); document.getElementById('search-results').style.display='none';" style="flex:1; padding:5px; font-size:10px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">도착</button>
                    <button onclick="showPlacePopup('${safeName}', ${item.lat}, ${item.lng}, '${safeAddr}'); document.getElementById('search-results').style.display='none';" style="padding:5px 8px; font-size:10px; background:#64748b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">위치</button>
                </div>
            </li>`;
        } else {
            // Juso 결과 (좌표 비동기 취득식)
            html += `
            <li style="padding:10px; border-bottom:1px solid #f1f5f9; display:flex; flex-direction:column; gap:6px;">
                <div>
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                        <b onclick="window.geocodeAddress('${safeAddr}', function(lat, lng) { showPlacePopup('${safeName}', lat, lng, '${safeAddr}'); })" style="color:#2563eb; font-size:13px; font-weight:700; cursor:pointer; text-decoration:underline;" title="클릭 시 지도 이동 및 주소 보기">${iconSymbol} ${item.title}</b>
                        ${window.getTrainBadgesHtml(item.title)}
                    </div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">${item.roadAddr}</div>
                    ${item.jibunAddr ? `<div style="font-size:10px; color:#94a3b8; margin-top:1px;">[지번] ${item.jibunAddr}</div>` : ''}
                </div>
                <div style="display:flex; gap:4px;">
                    <button onclick="window.geocodeAddress('${safeAddr}', function(lat, lng) { setRoutingPoint('START', lat, lng, '${safeName}'); document.getElementById('search-results').style.display='none'; })" style="flex:1; padding:5px; font-size:10px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">출발</button>
                    <button onclick="window.geocodeAddress('${safeAddr}', function(lat, lng) { setRoutingPoint('WAYPOINT', lat, lng, '${safeName}'); document.getElementById('search-results').style.display='none'; })" style="flex:1; padding:5px; font-size:10px; background:#f59e0b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">경유</button>
                    <button onclick="window.geocodeAddress('${safeAddr}', function(lat, lng) { setRoutingPoint('END', lat, lng, '${safeName}'); document.getElementById('search-results').style.display='none'; })" style="flex:1; padding:5px; font-size:10px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">도착</button>
                    <button onclick="window.geocodeAddress('${safeAddr}', function(lat, lng) { showPlacePopup('${safeName}', lat, lng, '${safeAddr}'); document.getElementById('search-results').style.display='none'; })" style="padding:5px 8px; font-size:10px; background:#64748b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">위치</button>
                </div>
            </li>`;
        }
    });
    
    html += '</ul>';
    resultDiv.innerHTML = DOMPurify.sanitize(html, window.DOM_PURIFY_CONFIG);
    
    if (hasValidCoords && window.map) {
        window.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
}

// AI 검색 결과를 받아 자동으로 길찾기 세팅 및 실행
window.handleAiRouting = async function(startStr, endStr) {
    var resultDiv = document.getElementById('search-results');
    resultDiv.innerHTML = '<div style="padding:10px; text-align:center; color:#3b82f6;">🚀 AI가 경로 좌표를 찾는 중입니다...</div>';

    async function getCoordFromStr(placeStr) {
        if (!placeStr) return null;
        if (placeStr.includes("현위치") || placeStr.includes("내위치") || placeStr.includes("현재위치")) {
            if (window.userLocation) {
                return { lat: window.userLocation.lat, lng: window.userLocation.lng, addr: "현위치" };
            } else {
                alert("GPS 현위치를 찾을 수 없습니다.");
                return null;
            }
        }
        var url = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=1&page=1&query=${encodeURIComponent(placeStr)}&type=place&format=json&errorformat=json&domain=${window.location.host}`;
        try {
            var res = await fetch(url);
            var data = await res.json();
            if (data.response && data.response.status === "OK" && data.response.result && data.response.result.items) {
                var item = data.response.result.items[0];
                return { lat: parseFloat(item.point.y), lng: parseFloat(item.point.x), addr: item.title };
            }
        } catch(e) { console.warn("VWorld Geocode 실패", e); }
        return null;
    }

    var startObj = await getCoordFromStr(startStr);
    var endObj = await getCoordFromStr(endStr);

    if (!startObj || !endObj) {
        resultDiv.innerHTML = '<div style="padding:10px; text-align:center; color:#ef4444;">🚨 출발지나 도착지를 정확히 찾지 못했습니다. 일반 검색을 이용해 주세요.</div>';
        return;
    }

    setRoutingPoint('START', startObj.lat, startObj.lng, startObj.addr);
    setRoutingPoint('END', endObj.lat, endObj.lng, endObj.addr);
    
    resultDiv.style.display = 'none';
    if (window.calcRoute) {
        window.calcRoute('transit');
    }
};

// 주변 편의시설 검색 및 마커 관리
window.searchCategory = function(category, options = {}) {
    if (typeof window.clearCategoryMarkers === 'function') {
        window.clearCategoryMarkers();
    }
    window.currentCategorySearch = category; // track active category search

    if (!window.map) return;
    var center = window.map.getCenter();
    
    if (!window.categoryClusterGroup) {
        window.categoryClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            iconCreateFunction: function(cluster) {
                var count = cluster.getChildCount();
                return L.divIcon({
                    html: `<div style="background:rgba(99,102,241,0.9); color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; border:2px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3);">${count}</div>`,
                    className: 'custom-cluster-icon',
                    iconSize: [30, 30]
                });
            }
        });
    }

    if (category === '주유소') {
        if (typeof window.searchOpinetGasStations === 'function') {
            window.searchOpinetGasStations(center, options);
        }
        return;
    }

    var searchKeyword = category;
    if (category === "이마트") searchKeyword = "이마트 대형마트";
    else if (category === "홈플러스") searchKeyword = "홈플러스 대형마트";
    else if (category === "롯데마트") searchKeyword = "롯데마트 대형마트";

    // TMAP POI Search API
    fetch(`${window.PROXY_URL}/tmap-pois?version=1&searchKeyword=${encodeURIComponent(searchKeyword)}&centerLat=${center.lat}&centerLon=${center.lng}&reqCoordType=WGS84GEO&resCoordType=WGS84GEO&radius=2&count=100`, {
        headers: { }
    })
    .then(res => res.json())
    .then(data => {
        if (window.currentCategorySearch !== category) return;
        var infoBar = document.getElementById('clicked-info');
        if (data.searchPoiInfo && data.searchPoiInfo.pois && data.searchPoiInfo.pois.poi) {
            var items = data.searchPoiInfo.pois.poi;
            if (!Array.isArray(items)) items = [items];
            
            if (category === "이마트" || category.includes("마트")) {
                if (category === "이마트" || category === "홈플러스" || category === "롯데마트" || category === "대형마트") {
                    items = items.filter(item => !item.name.includes("24") && !item.name.includes("편의점"));
                }
                
                items.sort((a, b) => {
                    var aIs24 = a.name.includes("24") || a.name.includes("편의점");
                    var bIs24 = b.name.includes("24") || b.name.includes("편의점");
                    if (aIs24 && !bIs24) return 1;
                    if (!aIs24 && bIs24) return -1;
                    return 0;
                });
            }

            var uniqueGroups = (typeof filterPoisForOverlap === 'function') ? filterPoisForOverlap(items, 'noorLat', 'noorLon') : [];
            
            var createdMarkers = [];
            var refPoint = (window.userLocation && window.userLocation.lat) ? window.userLocation : window.map.getCenter();
            var closestGroup = null;
            var minDistance = Infinity;
            
            uniqueGroups.forEach(group => {
                var lat = group.lat;
                var lng = group.lng;
                var item = group.main;
                var title = item.name;
                
                var dist = (typeof window.getLatLngDistance === 'function') ? window.getLatLngDistance(refPoint.lat, refPoint.lng, lat, lng) : 9999;
                if (dist < minDistance) {
                    minDistance = dist;
                    closestGroup = group;
                }
                
                var addr = '';
                if (item.newAddressList && item.newAddressList.newAddress && item.newAddressList.newAddress[0]) {
                    addr = item.newAddressList.newAddress[0].fullAddressRoad;
                } else {
                    addr = (item.upperAddrName || '') + ' ' + (item.middleAddrName || '') + ' ' + (item.lowerAddrName || '');
                }

                var itemEmoji = "📍";
                var itemBorder = '#6366f1';
                var itemGlow = 'rgba(99,102,241,0.15)';
                
                if (title.includes('스타벅스')) {
                    itemEmoji = "☕"; itemBorder = '#059669'; itemGlow = 'rgba(5,150,105,0.3)';
                } else if (title.includes('카페') || title.includes('커피') || title.includes('투썸') || title.includes('이디야')) {
                    itemEmoji = "🧋"; itemBorder = '#d97706'; itemGlow = 'rgba(217,119,6,0.3)';
                } else if (title.includes('이마트24') || title.includes('CU') || title.includes('GS25') || title.includes('세븐일레븐') || title.includes('편의점')) {
                    itemEmoji = "🏪"; itemBorder = '#8b5cf6'; itemGlow = 'rgba(139,92,246,0.3)';
                } else if (title.includes('이마트') || title.includes('홈플러스') || title.includes('롯데마트') || title.includes('대형마트') || title.includes('하나로마트') || title.includes('슈퍼')) {
                    itemEmoji = "🛒"; itemBorder = '#eab308'; itemGlow = 'rgba(234,179,8,0.3)';
                } else if (title.includes('약국') || title.includes('병원') || title.includes('의원') || title.includes('보건소') || title.includes('한의원')) {
                    itemEmoji = "💊"; itemBorder = '#3b82f6'; itemGlow = 'rgba(59,130,246,0.3)';
                } else if (title.includes('식당') || title.includes('음식') || title.includes('가든') || title.includes('반점') || title.includes('버거') || title.includes('치킨')) {
                    itemEmoji = "🍕"; itemBorder = '#f43f5e'; itemGlow = 'rgba(244,63,94,0.3)';
                } else if (title.includes('경로당') || title.includes('노인') || title.includes('마을회관')) {
                    itemEmoji = "👴"; itemBorder = '#10b981'; itemGlow = 'rgba(16,185,129,0.3)';
                } else if (title.includes('초등학교') || title.includes('중학교') || title.includes('고등학교') || title.includes('대학교') || title.includes('대학') || title.includes('학교')) {
                    itemEmoji = "🏫"; itemBorder = '#0ea5e9'; itemGlow = 'rgba(14,165,233,0.3)';
                } else if (title.includes('주차장')) {
                    itemEmoji = "🅿️"; itemBorder = '#64748b'; itemGlow = 'rgba(100,116,139,0.3)';
                } else if (title.includes('은행') || title.includes('ATM') || title.includes('새마을금고') || title.includes('신협') || title.includes('농협')) {
                    itemEmoji = "🏦"; itemBorder = '#14b8a6'; itemGlow = 'rgba(20,184,166,0.3)';
                } else if (title.includes('공원') || title.includes('수목원') || title.includes('휴양림') || title.includes('유원지')) {
                    itemEmoji = "🌲"; itemBorder = '#22c55e'; itemGlow = 'rgba(34,197,94,0.3)';
                } else if (title.includes('경찰서') || title.includes('지구대') || title.includes('파출소')) {
                    itemEmoji = "🚓"; itemBorder = '#1d4ed8'; itemGlow = 'rgba(29,78,216,0.3)';
                } else if (title.includes('소방서') || title.includes('119')) {
                    itemEmoji = "🚒"; itemBorder = '#b91c1c'; itemGlow = 'rgba(185,28,28,0.3)';
                } else if (title.includes('시청') || title.includes('구청') || title.includes('동주민센터') || title.includes('행정복지센터') || title.includes('도청')) {
                    itemEmoji = "🏛️"; itemBorder = '#475569'; itemGlow = 'rgba(71,85,105,0.3)';
                }

                var opacity = (typeof getMarkerOpacityByRoute === 'function') ? getMarkerOpacityByRoute(lat, lng) : 1.0;

                var badgeHtml = "";
                if (group.children.length > 0) {
                    badgeHtml = `<span style="background:#ef4444; color:white; font-size:9px; border-radius:4px; padding:1px 3px; margin-left:3px; font-weight:900; vertical-align:middle;">+${group.children.length}</span>`;
                }

                var icon = L.divIcon({
                    html: `<div class="glass-capsule-marker" style="--marker-border-color:${itemBorder}; --marker-glow-color:${itemGlow}; opacity:${opacity}; pointer-events: auto;" title="${title}">${itemEmoji} <span style="font-size:10px; font-weight:700; vertical-align:middle;">${title.slice(0, 10)}</span>${badgeHtml}</div>`,
                    className: 'category-marker-icon', 
                    iconSize: [120, 30], 
                    iconAnchor: [60, 15]
                });

                var isPark = title.includes('공원') || title.includes('녹지');
                var zOffset = isPark ? -100 : 100;
                
                var marker = L.marker([lat, lng], { 
                    icon: icon, 
                    opacity: opacity,
                    zIndexOffset: zOffset
                });
                window.categoryMarkers.push(marker);
                
                var popupHtml = `<div style="font-family:'Noto Sans KR',sans-serif; padding:5px; min-width:180px; max-height:200px; overflow-y:auto;">
                    <b style="font-size:13px; color:#1e293b; display:block; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:6px;">📌 장소 목록</b>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="font-size:12px; font-weight:700; color:#1e293b;">
                            1. ${title}
                            <div style="font-size:10px; color:#64748b; font-weight:normal; margin-top:2px;">${addr}</div>
                            <button onclick="window.addFavorite('${title.replace(/'/g, "\\'")}', ${lat}, ${lng}, '${addr.replace(/'/g, "\\'")}'); window.map.closePopup();" style="margin-top:4px; padding:3px 6px; font-size:10px; background:#92400e; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">⭐ 즐겨찾기</button>
                        </div>`;
                
                group.children.forEach((child, cIdx) => {
                    var cTitle = child.name;
                    var cAddr = '';
                    if (child.newAddressList && child.newAddressList.newAddress && child.newAddressList.newAddress[0]) {
                        cAddr = child.newAddressList.newAddress[0].fullAddressRoad;
                    } else {
                        cAddr = (child.upperAddrName || '') + ' ' + (child.middleAddrName || '') + ' ' + (child.lowerAddrName || '');
                    }
                    popupHtml += `
                        <div style="font-size:12px; font-weight:700; color:#1e293b; border-top:1px dashed #e2e8f0; padding-top:6px; margin-top:4px;">
                            ${cIdx + 2}. ${cTitle}
                            <div style="font-size:10px; color:#64748b; font-weight:normal; margin-top:2px;">${cAddr}</div>
                            <button onclick="window.addFavorite('${cTitle.replace(/'/g, "\\'")}', ${lat}, ${lng}, '${cAddr.replace(/'/g, "\\'")}'); window.map.closePopup();" style="margin-top:4px; padding:3px 6px; font-size:10px; background:#92400e; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">⭐ 즐겨찾기</button>
                        </div>`;
                });
                popupHtml += `</div></div>`;
                
                marker.bindPopup(popupHtml);
                window.categoryClusterGroup.addLayer(marker);
                
                createdMarkers.push({ group: group, marker: marker, dist: dist });
            });
            window.map.addLayer(window.categoryClusterGroup);
            
            if (options.openClosest && closestGroup && createdMarkers.length > 0) {
                var closestItem = createdMarkers.find(m => m.group === closestGroup);
                if (closestItem) {
                    setTimeout(function() {
                        closestItem.marker.openPopup();
                    }, 500);
                    if (window.appendChatMessage) {
                        window.appendChatMessage("ai", `🤖 현 위치 기준 가장 가까운 ${category}은(는) **${closestGroup.main.name}** (거리: 약 ${Math.round(closestItem.dist)}m) 입니다. 지도의 풍선창을 확인해 보세요!`);
                    }
                }
            }

            if (infoBar) infoBar.innerHTML = `✅ 내 주변 2km 반경 내 <b>${category} (${items.length}곳)</b>을(를) 찾았습니다!`;
        } else {
            if (infoBar) infoBar.innerHTML = `❌ 반경 2km 내에 <b>${category}</b> 검색 결과가 없습니다.`;
        }
    })
    .catch(err => {
        console.error("TMAP 카테고리 검색 실패:", err);
        var infoBar = document.getElementById('clicked-info');
        if (infoBar) infoBar.innerHTML = `🚨 편의시설 검색 통신에 실패했습니다. (API 키 확인 필요)`;
    });
};

window.clearCategoryMarkers = function() {
    window.currentCategorySearch = null; // Invalidate any pending search
    if (window.categoryClusterGroup) {
        window.categoryClusterGroup.clearLayers();
        window.map.removeLayer(window.categoryClusterGroup);
        window.categoryClusterGroup = null;
    }
    window.categoryMarkers.forEach(m => m.remove());
    window.categoryMarkers = [];
    if (typeof window.clearSearchMarkers === 'function') {
        window.clearSearchMarkers();
    }
    var infoBar = document.getElementById('clicked-info');
    if (infoBar) {
        infoBar.innerHTML = `🧹 편의시설 및 검색 마커를 모두 삭제했습니다.`;
    }
};
