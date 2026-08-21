// ============================================================
// 📁 파일명: ai_assistant.js
// 📌 역할: AI 챗봇 비서 모듈 (Google Gemini API 연동)
// ============================================================
//
// [파일 설명]
//   사용자의 자연어 질문을 Google Gemini 생성형 AI에 전달하여
//   구미시 교통·관광·시설 안내 등의 답변을 생성하는 챗봇 모듈입니다.
//   - 주요 랜드마크 좌표 사전(LANDMARKS)으로 "구미역까지 어떻게 가?" 등 해석
//   - 시스템 프롬프트에 구미시 교통 맥락(노선, 요금, 운행시간 등)을 주입
//   - 대화 기록(conversationHistory)을 유지하여 문맥 연속 대화 지원
//   - 질문에 좌표 키워드가 포함되면 지도 이동 및 마커 자동 생성
//
// [의존 관계]
//   - config.js → Gemini API 키, 기본 좌표 참조
//   - map-init.js → window.map 객체를 통한 지도 제어
//
// [사용된 외부 API]
//   - Google Gemini API (generativelanguage.googleapis.com)
// ============================================================

(function() {
    // 주요 랜드마크 좌표 정보 (질의에 포함된 경우 활용)
    var LANDMARKS = {
        "구미역": { lat: 36.128432, lng: 128.330232, name: "구미역" },
        "금오공대": { lat: 36.143211, lng: 128.396112, name: "금오공과대학교" },
        "금오공과대학교": { lat: 36.143211, lng: 128.396112, name: "금오공과대학교" },
        "구미종합터미널": { lat: 36.122675, lng: 128.350848, name: "구미종합터미널" },
        "구미터미널": { lat: 36.122675, lng: 128.350848, name: "구미종합터미널" },
        "인동네거리": { lat: 36.103112, lng: 128.418123, name: "인동네거리" },
        "인동광장": { lat: 36.103112, lng: 128.418123, name: "인동네거리" },
        "옥계": { lat: 36.1372, lng: 128.4295, name: "옥계동" },
        "사곡역": { lat: 36.0967, lng: 128.3564, name: "사곡역" },
        "선산터미널": { lat: 36.248679, lng: 128.304332, name: "선산터미널" },
        "선산": { lat: 36.248679, lng: 128.304332, name: "선산읍" },
        "구미시청": { lat: 36.119485, lng: 128.344573, name: "구미시청" }
    };

    var SYSTEM_PROMPT = `
You are the G-map AI Assistant, a helper for the Gumi City Mobility Map.
Your goal is to parse user intents, provide helpful answers in Korean, and generate structured control commands for the map UI.

Respond ONLY with a valid JSON object matching the schema below. Do NOT wrap it in markdown code blocks or add any additional text.

JSON Schema:
{
  "reply": "Korean explanation of the response",
  "suggested_replies": ["Korean reply option 1", "Korean reply option 2"],
  "actions": [
    {
      "type": "set_start" | "set_end" | "route" | "search_bus" | "search_poi" | "search_and_route" | "switch_mode" | "toggle_research_layer" | "toggle_cctv" | "toggle_event" | "clear_map" | "run_drt_calc" | "run_taxi_sim" | "run_fare_calc" | "show_dev_menu" | "add_favorite",
      "lat": 36.12345, // Required for set_start, set_end, add_favorite
      "lng": 128.12345, // Required for set_start, set_end, add_favorite
      "name": "Landmark Name", // Required for set_start, set_end, add_favorite
      "mode": "transit" | "car" | "shared" | "bike" | "walk", // Required for route, search_and_route
      "routeNo": "11", // Required for search_bus (e.g. "11", "170", "960")
      "category": "string", // Required for search_poi (e.g. "구미시청", "대형마트", "이마트", "스타벅스", "카페", "경로당", "편의점", "공원", "공공기관", "경찰서", "소방서")
      "open_closest": true, // Optional: Set to true if the user asks for the "closest" (가장 가까운) POI
      "price_compare": true, // Optional: Set to true if the user asks to compare prices (가격 비교, 최저가) for gas stations
      "layer": "drt" | "heatmap" | "railway" | "od" | "moef", // Required for toggle_research_layer
      "active": true // Required for toggle_research_layer, toggle_cctv, toggle_event
    }
  ]
}

Available Landmarks & Coordinates (prefer using these if the user mentions them):
- 구미역 (Gumi Station): 36.128432, 128.330232
- 금오공과대학교 / 금오공대: 36.143211, 128.396112
- 구미종합터미널 / 구미터미널: 36.122675, 128.350848
- 인동네거리 / 인동광장: 36.103112, 128.418123
- 옥계동 / 옥계: 36.1372, 128.4295
- 사곡역: 36.0967, 128.3564
- 선산터미널 / 선산: 36.248679, 128.304332

Guidelines:
1. If the user asks for directions (e.g. "금오공대에서 구미역 가는 길 알려줘"), create "set_start", "set_end" actions first, then add a "route" action.
2. If the user asks to find facilities or a specific place (e.g. "주변 약국 찾아줘", "가장 가까운 편의점 알려줘"), add a "search_poi" action. If they asked for the closest, set "open_closest": true. If they asked to compare gas station prices, set category to "주유소" and "price_compare": true.
3. If the user asks to see a bus route (e.g. "170번 버스 어디 있어?"), add a "search_bus" action.
4. If the user asks about MaaS research, demand, or policy, use "switch_mode" (mode: "research") and "toggle_research_layer".
5. If the user asks to show CCTV or events, use "toggle_cctv" or "toggle_event" (active: true/false).
6. If the user asks to clear the map, reset, or delete markers, use "clear_map".
7. If the user asks to run simulators (taxi, fare, feasibility), use "run_taxi_sim", "run_fare_calc", or "run_drt_calc".
8. If the user asks to open developer settings or keys, use "show_dev_menu".
9. If the user asks to add a landmark to favorites, use "add_favorite" with name, lat, and lng.
10. CRITICAL: If the user asks for a route to a place you don't know the exact coordinates of, use "search_and_route".
`;

    // 텍스트 매칭 기반의 예비(Fallback) 규칙 분석기 (API 한도 초과 또는 에러 대비)
    function runRuleBasedHeuristic(text) {
        var cleanText = text.replace(/\s+/g, '');
        var reply = "자연어 명령을 감지하여 지도를 제어합니다.";
        var actions = [];

        var isClosestQuery = text.includes("가장 가까운") || text.includes("가장가까운") || text.includes("제일 가까운") || text.includes("제일가까운") || text.includes("가장 가까이");
        var isPriceCompareQuery = text.includes("가격") || text.includes("최저가") || text.includes("가장 싼") || text.includes("싼 주유소") || text.includes("저렴한");

        // CCTV 제어
        if (text.includes("CCTV") || text.includes("cctv") || text.includes("폐쇄회로")) {
            var active = !text.includes("끄") && !text.includes("제거") && !text.includes("안볼");
            actions.push({ type: "toggle_cctv", active: active });
            reply = active ? "📹 실시간 CCTV 카메라 레이어를 활성화합니다." : "📹 CCTV 카메라 마커를 숨깁니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "초기화"] };
        }

        // 돌발상황 제어
        if (text.includes("사고") || text.includes("돌발") || text.includes("통제") || text.includes("공사")) {
            var active = !text.includes("끄") && !text.includes("제거") && !text.includes("안볼");
            actions.push({ type: "toggle_event", active: active });
            reply = active ? "⚠️ 실시간 도로 돌발상황 및 통제/공사 레이어를 활성화합니다." : "⚠️ 도로 공사 및 사고 마커를 숨깁니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "초기화"] };
        }

        // 지도 초기화
        if (text.includes("초기화") || text.includes("지워") || text.includes("깨끗") || text.includes("리셋")) {
            actions.push({ type: "clear_map" });
            reply = "🧹 지도 상의 모든 경로선과 편의점, 버스 마커를 초기화합니다.";
            return { reply: reply, actions: actions, suggested_replies: ["검색하기", "AI 비서"] };
        }

        // 시뮬레이터 구동
        if (text.includes("택시 호출") || text.includes("택시불러") || text.includes("가상 택시") || text.includes("택시 시뮬")) {
            actions.push({ type: "run_taxi_sim" });
            reply = "🚕 가상 택시 호출 시뮬레이터를 구동합니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다"] };
        }
        if (text.includes("요금 계산") || text.includes("킥보드 계산") || text.includes("킥보드 요금") || text.includes("공유모빌리티")) {
            actions.push({ type: "run_fare_calc" });
            reply = "🛴 공유모빌리티 실시간 요금제 계산기를 구동합니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다"] };
        }
        if (text.includes("예타") || text.includes("타당성") || text.includes("시뮬레이션") || text.includes("노선 평가")) {
            actions.push({ type: "run_drt_calc" });
            reply = "📊 가상 노선 예비타당성평가 시뮬레이션을 구동합니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다"] };
        }

        // 설정창 / 개발자 모드
        if (text.includes("설정") || text.includes("개발자") || text.includes("API") || text.includes("키 등록")) {
            actions.push({ type: "show_dev_menu" });
            reply = "⚙️ G-map 개발자 모드 설정창을 오픈합니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다"] };
        }

        // 1. 길찾기 패턴 검출 (A에서 B로)
        var pathMatch = text.match(/(.+)(?:에서|출발|시작)\s+(.+)(?:으로|도착|행|가기|가는|까지)/);
        if (pathMatch) {
            var startName = pathMatch[1].trim();
            var endName = pathMatch[2].trim();
            var startInfo = findLandmark(startName);
            var endInfo = findLandmark(endName);
            
            if (startInfo && endInfo) {
                actions.push({ type: "set_start", lat: startInfo.lat, lng: startInfo.lng, name: startInfo.name });
                actions.push({ type: "set_end", lat: endInfo.lat, lng: endInfo.lng, name: endInfo.name });
                
                var mode = "transit";
                if (text.includes("자가용") || text.includes("운전") || text.includes("택시")) mode = "car";
                else if (text.includes("킥보드") || text.includes("자전거") || text.includes("PM")) mode = "shared";
                else if (text.includes("걷기") || text.includes("도보")) mode = "walk";
                
                actions.push({ type: "route", mode: mode });
                reply = `📍 ${startInfo.name}에서 ${endInfo.name}까지 ${getModeName(mode)} 경로를 찾아드립니다.`;
                return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "취소", "다른 검색"] };
            }
        }

        // 1-2. 단일 목적지 길찾기 패턴
        var singlePathMatch = text.match(/(.+?)(?:으로|도착|행|가기|가는|까지)\s*(?:길찾|안내|경로|어떻게|가고|갈|가야|가려면)/);
        if (singlePathMatch) {
            var destName = singlePathMatch[1].trim();
            var mode = "transit";
            if (text.includes("자가용") || text.includes("운전") || text.includes("택시")) mode = "car";
            else if (text.includes("킥보드") || text.includes("자전거") || text.includes("PM")) mode = "shared";
            else if (text.includes("걷기") || text.includes("도보")) mode = "walk";
            
            actions.push({ type: "search_and_route", keyword: destName, mode: mode });
            reply = `📍 '${destName}'(으)로 가는 ${getModeName(mode)} 경로를 즉시 찾아드립니다.`;
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "취소", "다른 검색"] };
        }

        // 2. 버스 검색 패턴
        var busMatch = text.match(/(\d+)\s*번\s*(?:버스|노선)?/);
        if (busMatch) {
            var routeNo = busMatch[1];
            actions.push({ type: "search_bus", routeNo: routeNo });
            reply = `🚌 ${routeNo}번 버스의 실시간 노선도를 불러옵니다.`;
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "취소", "다른 검색"] };
        }

        // 3. 편의시설 검색 패턴
        var categories = ["약국", "음식점", "편의점", "경로당", "주유소", "대형마트", "이마트", "카페", "스타벅스", "주차장", "은행", "학교", "공원", "공공기관", "경찰서", "소방서"];
        for (var c of categories) {
            if (text.includes(c)) {
                var action = { type: "search_poi", category: c };
                if (isClosestQuery) action.open_closest = true;
                if (isPriceCompareQuery && c === "주유소") action.price_compare = true;
                actions.push(action);
                
                var actionTypeReply = isClosestQuery ? "가장 가까운 " : (isPriceCompareQuery && c === "주유소" ? "최저가 " : "주변의 ");
                reply = `🏪 ${actionTypeReply}"${c}"(을)를 찾아서 지도에 표시해 드립니다.`;
                return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "취소", "다른 검색"] };
            }
        }

        // 3-2. 일반 검색 패턴
        var searchMatch = text.match(/(.+?)(?:검색|찾아|어디|어딨|알려)/);
        if (searchMatch) {
            var searchName = searchMatch[1].trim();
            actions.push({ type: "search_poi", category: searchName });
            reply = `🔍 '${searchName}' 위치를 지도에서 검색합니다.`;
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "취소", "다른 검색"] };
        }

        // 4. 연구 모드 패턴
        if (text.includes("연구") || text.includes("시장님") || text.includes("수요")) {
            actions.push({ type: "switch_mode", mode: "research" });
            if (text.includes("인구") || text.includes("밀도") || text.includes("히트맵")) {
                actions.push({ type: "toggle_research_layer", layer: "heatmap", active: true });
            }
            if (text.includes("행복버스") || text.includes("DRT")) {
                actions.push({ type: "toggle_research_layer", layer: "drt", active: true });
            }
            if (text.includes("대경선") || text.includes("광역철도")) {
                actions.push({ type: "toggle_research_layer", layer: "railway", active: true });
            }
            reply = "📊 MaaS 정책 연구소 탭으로 전환하여 특화 데이터를 시각화합니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "취소", "다른 검색"] };
        }

        return null;
    }

    function findLandmark(name) {
        for (var k in LANDMARKS) {
            if (name.includes(k)) return LANDMARKS[k];
        }
        return null;
    }

    function getModeName(mode) {
        var names = { transit: "대중교통", car: "자가용", shared: "공유PM", bike: "자전거", walk: "도보" };
        return names[mode] || "대중교통";
    }

    // AI 어시스턴트 메시지 전송 및 처리 함수
    window.sendAiMessage = function(passedQuery) {
        var query = "";
        if (passedQuery) {
            query = passedQuery.trim();
        } else {
            var inputEl = document.getElementById('search-input');
            if (inputEl) {
                query = inputEl.value.trim();
                inputEl.value = "";
            }
        }
        if (!query) return;

        // Show AI Chat Container
        var containerEl = document.getElementById('ai-chat-container');
        if (containerEl) containerEl.style.display = 'block';
        
        // 채팅 창에 유저 메시지 렌더링
        appendChatMessage("user", query);
        
        // 로딩 표시 추가
        var loadingId = appendChatMessage("ai", "⚡ 생각 중...", true);

        // API 호출 전 Heuristics 선행 검증 (무과금/고속 동작 유도)
        var localResult = runRuleBasedHeuristic(query);
        
        // Gemini API 호출 payload 정의
        var payload = {
            contents: [
                {
                    parts: [
                        { text: query }
                    ]
                }
            ],
            systemInstruction: {
                parts: [
                    { text: SYSTEM_PROMPT }
                ]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        // 호출 개시
        var fetchPromise;
        if (localResult && Math.random() > 0.95) { // 룰 기반 결과가 우수하면 간헐적으로 바로 수행 (API 제한 예방)
            fetchPromise = Promise.resolve(localResult);
        } else {
            fetchPromise = fetch(`${window.PROXY_URL}/gemini-api`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            })
            .then(res => {
                if (res.status === 429) {
                    throw new Error("Gemini API Rate Limit");
                }
                return res.json();
            })
            .then(data => {
                // 응답 처리
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                    var rawText = data.candidates[0].content.parts[0].text;
                    try {
                        return JSON.parse(rawText.trim());
                    } catch (e) {
                        console.warn("JSON 파싱 에러:", rawText);
                        throw e;
                    }
                }
                throw new Error("Invalid Gemini response format");
            })
            .catch(err => {
                console.warn("AI API 오류로 인한 룰 기반 로컬 모델 대체 작동:", err);
                if (localResult) return localResult;
                return {
                    reply: "죄송합니다. AI 비서 서비스 호출 한도가 초과되어 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
                    actions: []
                };
            });
        }

        // 결과 반영 및 UI 제어 실행
        fetchPromise.then(result => {
            removeLoadingMessage(loadingId);
            appendChatMessage("ai", result.reply);
            
            // UI 액션 실행
            if (result.actions && result.actions.length > 0) {
                executeAiActions(result.actions);
            }
            
            // 예상 답변 칩 렌더링
            renderSuggestedReplies(result.suggested_replies || ["네", "아니요", "다른 것도 찾아주세요"]);
        });
    };

    function appendChatMessage(sender, text, isLoading = false) {
        var historyEl = document.getElementById('ai-chat-history');
        if (!historyEl) return null;

        // "금오공대에서 구미역..." 안내 문구 숨기기
        if (historyEl.children.length === 1 && historyEl.children[0].style.textAlign === 'center') {
            historyEl.innerHTML = "";
        }

        var messageId = "msg-" + Date.now() + "-" + Math.floor(Math.random()*1000);
        var msgDiv = document.createElement('div');
        msgDiv.id = messageId;
        msgDiv.style.marginBottom = '6px';
        msgDiv.style.padding = '6px 10px';
        msgDiv.style.borderRadius = '8px';
        msgDiv.style.fontSize = '11px';
        msgDiv.style.lineHeight = '1.4';
        msgDiv.style.maxWidth = '85%';
        msgDiv.style.wordBreak = 'break-all';

        if (sender === 'user') {
            msgDiv.style.background = 'var(--primary-grad)';
            msgDiv.style.color = 'white';
            msgDiv.style.alignSelf = 'flex-end';
            msgDiv.style.marginLeft = 'auto';
            msgDiv.innerHTML = DOMPurify.sanitize(text);
        } else {
            msgDiv.style.background = 'rgba(255,255,255,0.1)';
            msgDiv.style.color = 'var(--text-main)';
            msgDiv.style.alignSelf = 'flex-start';
            msgDiv.style.marginRight = 'auto';
            msgDiv.style.border = '1px solid var(--border-panel)';
            if (isLoading) {
                msgDiv.className = 'skeleton';
                msgDiv.style.width = '80px';
            }
            msgDiv.innerHTML = DOMPurify.sanitize(text);
        }

        historyEl.appendChild(msgDiv);
        historyEl.scrollTop = historyEl.scrollHeight;
    window.appendChatMessage = appendChatMessage;
        return messageId;
    }

    function removeLoadingMessage(id) {
        if (!id) return;
        var el = document.getElementById(id);
        if (el) el.remove();
    }

    // AI 제어 명령어들 순차적 실행
    async function executeAiActions(actions) {
        console.log("[AI Assistant] Executing actions:", actions);
        var infoBar = document.getElementById('clicked-info');
        
        for (var action of actions) {
            try {
                if (action.type === 'set_start') {
                    if (window.showRoutingPanel) window.showRoutingPanel();
                    if (window.setRoutingPoint) {
                        window.setRoutingPoint('START', action.lat, action.lng, action.name);
                        if (infoBar) infoBar.innerHTML = `🏁 [AI 연동] 출발지가 설정되었습니다: <b>${action.name}</b>`;
                    }
                }
                else if (action.type === 'set_end') {
                    if (window.showRoutingPanel) window.showRoutingPanel();
                    if (window.setRoutingPoint) {
                        window.setRoutingPoint('END', action.lat, action.lng, action.name);
                        if (infoBar) infoBar.innerHTML = `🏁 [AI 연동] 도착지가 설정되었습니다: <b>${action.name}</b>`;
                    }
                }
                else if (action.type === 'route') {
                    if (window.calcRoute) {
                        // 출발/도착 완료 대기용 약간의 지연
                        await new Promise(r => setTimeout(r, 400));
                        window.calcRoute(action.mode);
                        if (infoBar) infoBar.innerHTML = `🧭 [AI 연동] ${getModeName(action.mode)} 경로 탐색을 시작합니다...`;
                    }
                }
                else if (action.type === 'search_bus') {
                    if (window.selectRoute) {
                        window.selectRoute(action.routeNo);
                    }
                }
                else if (action.type === 'search_poi') {
                    if (window.searchCategory) {
                        window.searchCategory(action.category, {
                            openClosest: action.open_closest || false,
                            priceCompare: action.price_compare || false
                        });
                    }
                }
                else if (action.type === 'search_and_route') {
                    if (window.showRoutingPanel) window.showRoutingPanel();
                    var searchKey = action.keyword || action.name || '';
                    if (infoBar) infoBar.innerHTML = `🔍 [AI 연동] '${searchKey}' 위치를 검색 중입니다...`;
                    var center = (typeof map !== 'undefined' && map.getCenter) ? map.getCenter() : {
                        lat: (typeof DEFAULT_LAT !== 'undefined' ? DEFAULT_LAT : 36.119485),
                        lng: (typeof DEFAULT_LNG !== 'undefined' ? DEFAULT_LNG : 128.344573)
                    };
                    try {
                        var res = await fetch(`${window.PROXY_URL}/tmap-pois?version=1&searchKeyword=${encodeURIComponent(searchKey)}&centerLat=${center.lat}&centerLon=${center.lng}&reqCoordType=WGS84GEO&resCoordType=WGS84GEO&radius=2&count=1`);
                        if (!res.ok) {
                            throw new Error(`HTTP ${res.status} ${res.statusText}`);
                        }
                        var data = null;
                        if (res.status !== 204) {
                            var text = await res.text();
                            if (text) {
                                data = JSON.parse(text);
                            }
                        }
                        var items = null;
                        if (data && data.searchPoiInfo && data.searchPoiInfo.pois && data.searchPoiInfo.pois.poi) {
                            items = data.searchPoiInfo.pois.poi;
                        }
                        if (items) {
                            var poi = Array.isArray(items) ? items[0] : items;
                            if (window.setRoutingPoint) {
                                window.setRoutingPoint('END', parseFloat(poi.noorLat), parseFloat(poi.noorLon), poi.name);
                                if (infoBar) infoBar.innerHTML = `🏁 [AI 연동] 도착지가 설정되었습니다: <b>${poi.name}</b>`;
                                await new Promise(r => setTimeout(r, 400));
                                if (window.calcRoute) window.calcRoute(action.mode || 'transit');
                            }
                        } else {
                            if (infoBar) infoBar.innerHTML = `❌ '${searchKey}' 위치를 찾지 못했습니다.`;
                        }
                    } catch(e) {
                        console.error("search_and_route error:", e);
                        if (infoBar) infoBar.innerHTML = `❌ 검색 중 오류가 발생했습니다.`;
                    }
                }
                else if (action.type === 'switch_mode') {
                    if (window.switchMapMode) {
                        window.switchMapMode(action.mode);
                    }
                }
                else if (action.type === 'toggle_research_layer') {
                    var toggleId = "";
                    if (action.layer === 'drt') {
                        toggleId = 'research-drt-toggle';
                        if (window.toggleResearchDrt) window.toggleResearchDrt(action.active);
                    } else if (action.layer === 'heatmap') {
                        toggleId = 'research-heatmap-toggle';
                        if (window.toggleResearchHeatmap) window.toggleResearchHeatmap(action.active);
                    } else if (action.layer === 'railway') {
                        toggleId = 'research-railway-toggle';
                        if (window.toggleRailwayLayer) window.toggleRailwayLayer(action.active);
                    } else if (action.layer === 'od') {
                        toggleId = 'research-od-toggle';
                        if (window.toggleOdFlowLayer) window.toggleOdFlowLayer(action.active);
                    } else if (action.layer === 'moef') {
                        toggleId = 'research-moef-toggle';
                        if (window.toggleMoefLayer) window.toggleMoefLayer(action.active);
                    }
                    
                    var toggleEl = document.getElementById(toggleId);
                    if (toggleEl) toggleEl.checked = action.active;
                }
                else if (action.type === 'toggle_cctv') {
                    if (window.toggleCctvLayer) {
                        window.toggleCctvLayer(action.active);
                        var checkEl = document.getElementById('research-cctv-toggle');
                        if (checkEl) checkEl.checked = action.active;
                    }
                }
                else if (action.type === 'toggle_event') {
                    if (window.toggleEventLayer) {
                        window.toggleEventLayer(action.active);
                        var checkEl = document.getElementById('research-cctv-toggle'); // Share state for Beta
                    }
                }
                else if (action.type === 'clear_map') {
                    if (window.clearRouting) window.clearRouting();
                    if (window.clearCategoryMarkers) window.clearCategoryMarkers();
                    if (window.clearBusRoute) window.clearBusRoute();
                }
                else if (action.type === 'run_drt_calc') {
                    if (window.runResearchEtaEvaluation) {
                        window.runResearchEtaEvaluation();
                    }
                }
                else if (action.type === 'run_taxi_sim') {
                    if (window.triggerResearchTaxiCall) {
                        window.triggerResearchTaxiCall();
                    }
                }
                else if (action.type === 'run_fare_calc') {
                    if (window.triggerResearchSharedCalculator) {
                        window.triggerResearchSharedCalculator();
                    }
                }
                else if (action.type === 'show_dev_menu') {
                    if (window.showDevModal) {
                        window.showDevModal();
                    }
                }
                else if (action.type === 'add_favorite') {
                    if (window.addFavorite) {
                        window.addFavorite(action.name, action.lat, action.lng, action.address || '');
                    }
                }
            } catch (err) {
                console.error("[AI Assistant] Action execution failed:", action, err);
            }
            // 액션 간의 매끄러운 갭을 위한 미세한 시간 차이 부여
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // AI 예상 답변(칩) 및 + 버튼 렌더링
    window.renderSuggestedReplies = function(replies) {
        var container = document.getElementById('ai-suggested-replies');
        var manualContainer = document.getElementById('ai-manual-input-container');
        if (!container) return;
        
        container.innerHTML = "";
        if (manualContainer) manualContainer.style.display = 'none';

        if (replies && replies.length > 0) {
            replies.forEach(function(rText) {
                var btn = document.createElement('button');
                btn.className = 'ai-suggested-chip';
                btn.style.cssText = 'background:var(--bg-panel); border:1px solid var(--border-panel); color:var(--text-main); font-size:11px; padding:4px 10px; border-radius:12px; cursor:pointer; white-space:nowrap; transition:all 0.2s ease;';
                btn.innerText = rText;
                btn.onclick = function() {
                    window.sendAiMessage(rText);
                };
                btn.onmouseover = function() { this.style.background = 'rgba(99, 102, 241, 0.1)'; this.style.borderColor = 'var(--primary-color)'; };
                btn.onmouseout = function() { this.style.background = 'var(--bg-panel)'; this.style.borderColor = 'var(--border-panel)'; };
                container.appendChild(btn);
            });
        }
        
        // + 버튼 추가 (직접 입력창 토글)
        var plusBtn = document.createElement('button');
        plusBtn.style.cssText = 'background:var(--bg-panel); border:1px solid var(--border-panel); color:var(--text-muted); font-size:12px; font-weight:bold; padding:2px 8px; border-radius:12px; cursor:pointer; transition:all 0.2s ease;';
        plusBtn.innerText = '+';
        plusBtn.title = 'AI 비서에게 직접 말하기';
        plusBtn.onclick = function() {
            if (manualContainer) {
                manualContainer.style.display = manualContainer.style.display === 'none' ? 'flex' : 'none';
                if (manualContainer.style.display === 'flex') {
                    var inputEl = document.getElementById('ai-manual-input');
                    if (inputEl) inputEl.focus();
                }
            }
        };
        plusBtn.onmouseover = function() { this.style.color = 'var(--text-main)'; };
        plusBtn.onmouseout = function() { this.style.color = 'var(--text-muted)'; };
        container.appendChild(plusBtn);
    };
    
    // 수동 직접 입력 메시지 전송
    window.sendManualAiMessage = function() {
        var inputEl = document.getElementById('ai-manual-input');
        if (!inputEl) return;
        var text = inputEl.value.trim();
        if (text) {
            inputEl.value = "";
            document.getElementById('ai-manual-input-container').style.display = 'none';
            window.sendAiMessage(text);
        }
    };
})();
