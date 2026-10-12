// ============================================================
// 📁 파일명: ai_assistant.js
// 📌 역할: AI 챗봇 비서 모듈 (Google Gemini API 연동)
// ============================================================
//
// [파일 설명]
//   사용자의 자연어 질문을 Google Gemini 생성형 AI에 전달하여
//   구미시 교통·관광·시설 안내 등의 답변을 생성하는 챗봇 모듈입니다.
//   - 주요 랜드마크 좌표 사전(LANDMARKS)으로 "구미역까지 어떻게 가?" 등 해석
//   - 시스템 프롬프트는 서버(server.py AI_SYSTEM_PROMPT)에 있다
//   - 대화 기록(chatHistory)과 앱 상태(출발·도착지, 내 위치)를 서버 /ai-assistant 로 보내 문맥 연속 대화 지원
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

    // 실내 길찾기를 지원하는 건물. 방 목록은 IMDF(window.IMDF_TECHNO_DATA)에서 찾는다.
    var INDOOR_BUILDING_PATTERN = /테크노\s*관|61\s*(?:동|번\s*건물)/;

    // Gemini 시스템 프롬프트는 서버(server.py 의 AI_SYSTEM_PROMPT)가 들고 있다.
    // 브라우저가 프롬프트를 보내면 누구나 우리 키로 아무 프롬프트나 돌릴 수 있었다.

    /* ───────────── 실내 호실 찾기 (테크노관) ─────────────
     * Gemini 는 사용자가 말한 방 이름만 넘기고, 실제 방은 여기서 도면
     * 데이터로 확인한다. 모델이 없는 호실을 지어내도 경로가 엉뚱한 곳으로
     * 가지 않게 하려는 것이다. */
    var technoRoomIndex = null;

    function compact(text) {
        return String(text || '').replace(/\s+/g, '').toLowerCase();
    }

    // IMDF 유닛(이름·호실 번호) 가운데 길찾기 그래프에 있는 방만 모은다.
    function getTechnoRoomIndex() {
        if (technoRoomIndex) return technoRoomIndex;
        var bundle = window.IMDF_TECHNO_DATA;
        var nav = window.TECHNO_NAV_DATA;
        if (!bundle || !bundle.units || !nav || !nav.rooms) return null;
        var routable = {};
        nav.rooms.forEach(function (row) { routable[row.floor + '|' + row.room_id] = true; });
        var floorOfLevel = {};
        (bundle.levels.features || []).forEach(function (level) {
            var name = level.properties.short_name;
            floorOfLevel[level.id] = name ? (name['ko-KR'] || name.en) : null;
        });
        technoRoomIndex = [];
        (bundle.units.features || []).forEach(function (unit) {
            var props = unit.properties || {};
            var floor = floorOfLevel[props.level_id];
            var label = props.label && props.label['ko-KR'];
            if (!floor || !label || !routable[floor + '|' + label]) return;
            var name = (props.name && props.name['ko-KR']) || label;
            technoRoomIndex.push({ floor: floor, room_id: label, name: name,
                                   department: props.department || '', unitId: unit.id });
        });
        return technoRoomIndex;
    }

    // "3층" → "3F", "지하 1층"/"지하" → "B1F"
    function parseFloor(text) {
        if (!text) return null;
        var value = String(text).trim();
        if (/^B?\d+F$/i.test(value)) return value.toUpperCase();
        if (/지하/.test(value)) return 'B1F';
        var match = value.match(/(\d+)\s*층/);
        return match ? match[1] + 'F' : null;
    }

    // 여러 방이 같은 이름을 쓰면 모두 돌려준다(예: 1F·2F 대강의실).
    function findTechnoRooms(query, floorHint) {
        var index = getTechnoRoomIndex();
        if (!index) return null;
        var text = String(query || '').replace(INDOOR_BUILDING_PATTERN, ' ');
        var floor = parseFloor(floorHint) || parseFloor(text);
        var pool = floor ? index.filter(function (room) { return room.floor === floor; }) : index;

        // 1) 호실 번호: "301호", "B104", "지하 104호"
        var number = text.match(/(?:^|[^0-9A-Za-z])([Bb]?\d{3,4})(?![0-9])/);
        if (number) {
            var label = number[1].toUpperCase();
            if (/지하/.test(text) && label.charAt(0) !== 'B') label = 'B' + label;
            var byNumber = pool.filter(function (room) { return room.room_id === label; });
            if (byNumber.length) return byNumber;
        }

        // 2) 방 이름·교수 이름. 흔한 꼬리말은 떼고 비교한다.
        var needle = compact(text.replace(/\d+\s*층|지하/g, ' '))
            .replace(/(?:으로|로|까지|에|가는길|가는|길|호실|호|교수님|교수|방)+$/g, '')
            .replace(/(?:교수님|교수)(?:의)?(?:연구실|방)?$/, '');
        if (needle.length < 2) return [];
        var exact = pool.filter(function (room) { return compact(room.name) === needle; });
        if (exact.length) return exact;
        return pool.filter(function (room) {
            var name = compact(room.name);
            return name.length >= 2 && (name.indexOf(needle) >= 0 || needle.indexOf(name) >= 0);
        });
    }

    // 금오공대 탭 검색 결과도 같은 방식으로 도면의 방을 찾는다.
    window.lookupTechnoRooms = findTechnoRooms;

    function describeRoom(room) {
        return '테크노관 ' + room.floor + ' ' + room.room_id +
            (room.name && room.name !== room.room_id ? ' ' + room.name : '');
    }

    // 텍스트 매칭 규칙 분석기.
    // confident:true 인 결과는 Gemini 를 부르지 않고 바로 실행한다(빠르고 호출 한도를 아낀다).
    // 나머지는 Gemini 가 실패했을 때의 대체 답으로만 쓴다.
    // (예전에는 Math.random() > 0.95 조건이라 규칙으로 답할 수 있어도 95% 는 Gemini 로 갔다.)
    var FILLER_WORDS = /주변|근처|가까운|가장|제일|내|여기|찾아줘|찾아|알려줘|알려|어디|있어|있나|있니|있는|보여줘|보여|좀|줘|요|의|은|는|이|가|을|를|에|곳|데|\?|!|\.|,/g;
    var CURRENT_PLACE = /내\s*위치|현\s*위치|현재\s*위치|여기/;

    function onlyFillerLeft(text, keyword) {
        return text.replace(keyword, ' ').replace(FILLER_WORDS, ' ').trim() === '';
    }

    function startActionFor(placeText) {
        if (CURRENT_PLACE.test(placeText)) return { type: "set_start", current_location: true, name: "내 위치" };
        var info = findLandmark(placeText);
        return info ? { type: "set_start", lat: info.lat, lng: info.lng, name: info.name } : null;
    }

    function pickMode(text) {
        if (/자가용|운전|택시|자동차|차로/.test(text)) return "car";
        if (/킥보드|PM|공유/.test(text)) return "shared";
        if (/자전거/.test(text)) return "bike";
        if (/걷기|걸어|도보/.test(text)) return "walk";
        return "transit";
    }

    // "…(으)로 가는 길 안내해줘", "…까지 가려면?" 같은 꼬리와 학교 이름을 떼고 목적지 말만 남긴다.
    var ROUTE_TAIL = /\s*(?:으로|로|까지|에)?\s*(?:가는|가려면|가고|갈|가줘|가야|가기|어떻게|길\s*찾|길\s*안내|안내|경로)[\s\S]*$/;
    var CAMPUS_WORDS = /금오\s*공(?:과)?\s*대(?:학교)?/g;
    // "테크노관"을 말하지 않아도 이런 말이 붙은 목적지는 도면에서 찾아본다.
    // 전에는 건물 이름이 없으면 Gemini 로 넘어가, 같은 교수님 연구실을 물어도 어떤 때는
    // 실내 길찾기를, 어떤 때는 학교 정문까지만 경로를 그렸다.
    var ROOM_CUE = /교수|연구실|실험실/;

    function indoorTargetFrom(text) {
        return text.replace(ROUTE_TAIL, '').replace(CAMPUS_WORDS, ' ').replace(/\s+/g, ' ').trim();
    }

    // 실내 길찾기는 수단을 말하지 않으면 출발지 거리로 정한다(pickIndoorTravelMode).
    function spokenTravelMode(text) {
        if (/버스|대중교통/.test(text)) return "transit";
        if (/자가용|운전|택시|자동차|차로/.test(text)) return "car";
        if (/킥보드|공유/.test(text)) return "shared";
        if (/자전거/.test(text)) return "bike";
        if (/걸어|도보|걷기/.test(text)) return "walk";
        return undefined;
    }

    function planIndoorRoute(text) {
        var destText = text, startAction = null;
        var fromMatch = text.match(/(.+?)에서\s*(.+)/);
        if (fromMatch) {
            destText = fromMatch[2];
            if (!INDOOR_BUILDING_PATTERN.test(fromMatch[1])) startAction = startActionFor(fromMatch[1]);
        }
        var target = indoorTargetFrom(destText);
        var namedBuilding = INDOOR_BUILDING_PATTERN.test(target);
        if (!namedBuilding && !ROOM_CUE.test(target)) return null;

        var rooms = findTechnoRooms(target);
        var actions = startAction ? [startAction] : [];
        var mode = spokenTravelMode(text);
        var chips = ["버스로 가면?", "초기화"];

        // 건물·층만 말했다("테크노관 1층으로 가는 길은요?"). 문 앞까지는 호실을 알아야 하므로 출입구까지 간다.
        var rest = target.replace(INDOOR_BUILDING_PATTERN, ' ')
            .replace(/지하\s*\d*\s*층?|\d+\s*층/g, ' ').replace(/[\s?!.,]/g, '');
        if (namedBuilding && !rest) {
            var floor = parseFloor(target);
            actions.push({ type: "route_building", floor: floor, mode: mode });
            return { reply: "🏫 테크노관" + (floor ? " " + floor : "") + "(으)로 가는 길을 찾습니다.",
                     actions: actions, suggested_replies: chips, confident: true };
        }
        if (namedBuilding || (rooms && rooms.length)) {
            actions.push({ type: "route_indoor", building: "테크노관", room: target, mode: mode });
            var where = rooms && rooms.length === 1 ? describeRoom(rooms[0]) : "테크노관 안 목적지";
            return { reply: "🏫 " + where + "까지 길을 찾습니다.", actions: actions,
                     suggested_replies: chips, confident: true };
        }
        if (!rooms) return null;   // 도면을 아직 못 읽었으면 Gemini 에 맡긴다

        // 교수님·연구실을 말했지만 테크노관 도면에는 없다(다른 건물). 말한 장소까지만 가고 그렇다고 밝힌다.
        var note = "'" + target + "'은(는) 실내 도면이 있는 테크노관에서 찾지 못했습니다.";
        var place = findLandmark(destText);
        if (!place) {
            return { reply: "❓ " + note + " 어느 건물인지 알려 주시면 그 건물까지 안내해 드립니다.",
                     actions: [], suggested_replies: ["금오공대 가는 길"], confident: true };
        }
        var routeMode = pickMode(text);
        actions.push({ type: "set_end", lat: place.lat, lng: place.lng, name: place.name });
        actions.push({ type: "route", mode: routeMode });
        return { reply: "📍 " + note + " " + place.name + "까지 " + getModeName(routeMode) + " 경로를 찾아드립니다.",
                 actions: actions, suggested_replies: ["자가용으로는?", "걸어가면?"], confident: true };
    }

    function runRuleBasedHeuristic(text) {
        var reply = "자연어 명령을 감지하여 지도를 제어합니다.";
        var actions = [];

        var isClosestQuery = /(가장|제일)\s*가까/.test(text);
        var isPriceCompareQuery = text.includes("가격") || text.includes("최저가") || text.includes("가장 싼") || text.includes("싼 주유소") || text.includes("저렴한");

        // CCTV 제어
        if (text.includes("CCTV") || text.includes("cctv") || text.includes("폐쇄회로")) {
            var active = !text.includes("끄") && !text.includes("제거") && !text.includes("안볼");
            actions.push({ type: "toggle_cctv", active: active });
            reply = active ? "📹 실시간 CCTV 카메라 레이어를 활성화합니다." : "📹 CCTV 카메라 마커를 숨깁니다.";
            return { reply: reply, actions: actions, suggested_replies: ["CCTV 꺼줘", "초기화"], confident: true };
        }

        // 돌발상황 제어 ("사고 다발지역"은 다른 레이어라 Gemini 에 맡긴다)
        if (text.includes("사고") || text.includes("돌발") || text.includes("통제") || text.includes("공사")) {
            var active = !text.includes("끄") && !text.includes("제거") && !text.includes("안볼");
            actions.push({ type: "toggle_event", active: active });
            reply = active ? "⚠️ 실시간 도로 돌발상황 및 통제/공사 레이어를 활성화합니다." : "⚠️ 도로 공사 및 사고 마커를 숨깁니다.";
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "초기화"],
                     confident: !/다발|지역/.test(text) };
        }

        // 지도 초기화
        if (text.includes("초기화") || text.includes("지워") || text.includes("깨끗") || text.includes("리셋")) {
            actions.push({ type: "clear_map" });
            reply = "🧹 지도 상의 모든 경로선과 편의점, 버스 마커를 초기화합니다.";
            return { reply: reply, actions: actions, suggested_replies: ["주변 편의점 찾아줘"], confident: true };
        }

        // 시뮬레이터 구동
        if (text.includes("택시 호출") || text.includes("택시불러") || text.includes("가상 택시") || text.includes("택시 시뮬")) {
            actions.push({ type: "run_taxi_sim" });
            return { reply: "🚕 가상 택시 호출 시뮬레이터를 구동합니다.", actions: actions,
                     suggested_replies: ["알겠습니다"], confident: true };
        }
        if (text.includes("요금 계산") || text.includes("킥보드 계산") || text.includes("킥보드 요금") || text.includes("공유모빌리티")) {
            actions.push({ type: "run_fare_calc" });
            return { reply: "🛴 공유모빌리티 실시간 요금제 계산기를 구동합니다.", actions: actions,
                     suggested_replies: ["알겠습니다"], confident: true };
        }
        if (text.includes("예타") || text.includes("타당성") || text.includes("시뮬레이션") || text.includes("노선 평가")) {
            actions.push({ type: "run_drt_calc" });
            return { reply: "📊 가상 노선 예비타당성평가 시뮬레이션을 구동합니다.", actions: actions,
                     suggested_replies: ["알겠습니다"], confident: true };
        }

        // 즐겨찾기 목록
        if (/즐겨찾기/.test(text) && /보여|목록|열어|어디/.test(text) && !/추가|저장|등록/.test(text)) {
            return { reply: "⭐ 저장한 즐겨찾기 목록을 보여 드립니다.", actions: [{ type: "show_favorites" }],
                     suggested_replies: ["주변 편의점 찾아줘"], confident: true };
        }

        // 0. 건물 안 호실까지 길찾기 ("구미역에서 테크노관 301호 가는 길", "조금원 교수님 연구실로 가려면?")
        var indoor = /가는|가고|갈|가줘|가야|가려면|까지|길|안내|경로|어떻게/.test(text) ? planIndoorRoute(text) : null;
        if (indoor) return indoor;

        // 1. 길찾기 패턴 검출 (A에서 B로) - 둘 다 아는 장소(또는 내 위치)일 때만 확실하다
        var pathMatch = text.match(/(.+)(?:에서|출발|시작)\s+(.+)(?:으로|도착|행|가기|가는|까지)/);
        if (pathMatch) {
            var startAction = startActionFor(pathMatch[1].trim());
            var endInfo = findLandmark(pathMatch[2].trim());
            if (startAction && endInfo) {
                var mode = pickMode(text);
                actions.push(startAction);
                actions.push({ type: "set_end", lat: endInfo.lat, lng: endInfo.lng, name: endInfo.name });
                actions.push({ type: "route", mode: mode });
                reply = `📍 ${startAction.name}에서 ${endInfo.name}까지 ${getModeName(mode)} 경로를 찾아드립니다.`;
                return { reply: reply, actions: actions, suggested_replies: ["자가용으로는?", "걸어가면?"], confident: true };
            }
        }

        // 1-2. 단일 목적지 길찾기 패턴 - 목적지 이름 해석은 Gemini 가 낫다
        var singlePathMatch = text.match(/(.+?)(?:으로|도착|행|가기|가는|까지)\s*(?:길찾|안내|경로|어떻게|가고|갈|가야|가려면)/);
        if (singlePathMatch) {
            var destName = singlePathMatch[1].trim();
            var mode = pickMode(text);
            var destInfo = findLandmark(destName);
            if (destInfo && destName.length <= destInfo.name.length + 2) {
                actions.push({ type: "set_end", lat: destInfo.lat, lng: destInfo.lng, name: destInfo.name });
                actions.push({ type: "route", mode: mode });
                return { reply: `📍 ${destInfo.name}까지 ${getModeName(mode)} 경로를 찾아드립니다.`, actions: actions,
                         suggested_replies: ["자가용으로는?", "걸어가면?"], confident: true };
            }
            actions.push({ type: "search_and_route", keyword: destName, mode: mode });
            reply = `📍 '${destName}'(으)로 가는 ${getModeName(mode)} 경로를 찾아드립니다.`;
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "다른 검색"], confident: false };
        }

        // 2. 버스 검색 패턴 ("170번 버스") - '버스'·'노선'이 붙어야 확실하다(3번 출구 등과 구분)
        var busMatch = text.match(/(\d+)\s*번\s*(버스|노선)?/);
        if (busMatch) {
            var routeNo = busMatch[1];
            actions.push({ type: "search_bus", routeNo: routeNo });
            reply = `🚌 ${routeNo}번 버스의 실시간 노선도를 불러옵니다.`;
            return { reply: reply, actions: actions, suggested_replies: ["초기화", "다른 검색"], confident: !!busMatch[2] };
        }

        // 3. 편의시설 검색 패턴 - "주변 약국 찾아줘"처럼 다른 지명이 없을 때만 확실하다
        var categories = ["약국", "음식점", "편의점", "경로당", "주유소", "대형마트", "이마트", "카페", "스타벅스", "주차장", "은행", "학교", "공원", "공공기관", "경찰서", "소방서"];
        for (var c of categories) {
            if (text.includes(c)) {
                var action = { type: "search_poi", category: c };
                if (isClosestQuery) action.open_closest = true;
                if (isPriceCompareQuery && c === "주유소") action.price_compare = true;
                actions.push(action);

                var actionTypeReply = isClosestQuery ? "가장 가까운 " : (isPriceCompareQuery && c === "주유소" ? "최저가 " : "주변의 ");
                reply = `🏪 ${actionTypeReply}"${c}"(을)를 찾아서 지도에 표시해 드립니다.`;
                return { reply: reply, actions: actions, suggested_replies: ["가장 가까운 곳으로 안내해줘", "초기화"],
                         confident: onlyFillerLeft(text.replace(/가격|최저가|비교|싼|저렴한/g, ' '), c) };
            }
        }

        // 3-2. 일반 검색 패턴
        var searchMatch = text.match(/(.+?)(?:검색|찾아|어디|어딨|알려)/);
        if (searchMatch) {
            var searchName = searchMatch[1].trim();
            actions.push({ type: "search_poi", category: searchName });
            reply = `🔍 '${searchName}' 위치를 지도에서 검색합니다.`;
            return { reply: reply, actions: actions, suggested_replies: ["알겠습니다", "다른 검색"], confident: false };
        }

        // 4. 연구 모드 패턴 ("연구실"은 교수님 방이지 연구 탭이 아니다)
        if (/연구(?!실)/.test(text) || text.includes("시장님") || text.includes("수요")) {
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
            return { reply: reply, actions: actions, suggested_replies: ["수요 리포트 보여줘", "다른 검색"], confident: false };
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

    // 대화 기록. 서버(/ai-assistant)가 시스템 프롬프트를 들고 있고, 여기서는 사용자 문장·
    // 이전 대화·앱 상태만 보낸다. "버스로는?", "네" 같은 짧은 후속 질문을 이어서 이해하게 한다.
    var chatHistory = [];
    var MAX_HISTORY = 10;

    function rememberTurn(role, text) {
        chatHistory.push({ role: role, text: String(text).slice(0, 1500) });
        if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    function contextPlace(coord, name) {
        if (!coord || typeof coord.lat !== 'number' || typeof coord.lng !== 'number') return null;
        return { lat: coord.lat, lng: coord.lng, name: name || coord.addr || coord.name || '' };
    }

    function buildAiContext() {
        var here = window.userLocation;
        var center = (window.map && window.map.getCenter) ? window.map.getCenter() : null;
        return {
            start: contextPlace(window.startCoord),
            end: contextPlace(window.endCoord),
            user_location: here ? { lat: here.lat, lng: here.lng, accuracy: here.accuracy } : null,
            map_center: center ? { lat: center.lat, lng: center.lng } : null
        };
    }

    function askGemini(query) {
        return fetch(`${window.PROXY_URL}/ai-assistant`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: query, history: chatHistory, context: buildAiContext() })
        })
        .then(res => {
            if (res.status === 429) throw new Error("Gemini API Rate Limit");
            return res.json();
        })
        .then(data => {
            var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
            if (!parts || !parts[0]) throw new Error(data.error && data.error.message || data.error || "Invalid Gemini response format");
            var rawText = parts[0].text.trim();
            var start = rawText.indexOf('{'), end = rawText.lastIndexOf('}');
            if (start >= 0 && end > start) rawText = rawText.slice(start, end + 1);
            var result = JSON.parse(rawText);
            if (!result || typeof result.reply !== 'string') throw new Error("Invalid assistant JSON");
            if (!Array.isArray(result.actions)) result.actions = [];
            return result;
        });
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

        // 규칙으로 확실히 처리되는 명령은 바로 실행하고, 나머지만 Gemini 에 묻는다.
        var localResult = runRuleBasedHeuristic(query);
        var resultPromise = (localResult && localResult.confident)
            ? Promise.resolve(localResult)
            : askGemini(query).catch(err => {
                console.warn("AI API 오류로 규칙 기반 결과로 대체:", err);
                if (localResult) return localResult;
                return {
                    reply: "죄송합니다. 지금은 AI 비서가 답하지 못했습니다. 잠시 후 다시 시도하거나 검색어를 짧게 바꿔 주세요.",
                    actions: []
                };
            });

        // 결과 반영 및 UI 제어 실행
        resultPromise.then(result => {
            removeLoadingMessage(loadingId);
            appendChatMessage("ai", result.reply);
            rememberTurn('user', query);
            rememberTurn('model', JSON.stringify({ reply: result.reply, actions: result.actions || [] }));

            // 예상 답변 칩 렌더링. 액션(예: 호실 후보 고르기)이 칩을 바꿀 수 있으므로 먼저 그린다.
            renderSuggestedReplies(result.suggested_replies || ["다른 것도 찾아주세요"]);

            // UI 액션 실행
            if (result.actions && result.actions.length > 0) {
                executeAiActions(result.actions);
            }
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

    function escText(text) {
        return DOMPurify.sanitize(String(text == null ? '' : text), { ALLOWED_TAGS: [] });
    }

    // 출발지가 비어 있으면 내 위치를 출발지로 쓴다(처음이면 위치 권한을 묻는다).
    async function ensureStart() {
        if (window.startCoord) return true;
        if (!window.getUserLocation || !window.setRoutingPoint) return false;
        try {
            var here = await window.getUserLocation(10000);
            window.setRoutingPoint('START', here.lat, here.lng, '내 위치');
            await new Promise(r => setTimeout(r, 300));
            return true;
        } catch (error) {
            appendChatMessage("ai", "📍 출발지를 정하지 못했습니다. " + escText(error.message) +
                " 지도를 눌러 출발지를 지정한 뒤 다시 말씀해 주세요.");
            return false;
        }
    }

    // AI 제어 명령어들 순차적 실행
    async function executeAiActions(actions) {
        console.log("[AI Assistant] Executing actions:", actions);
        var infoBar = document.getElementById('clicked-info');
        
        for (var action of actions) {
            try {
                if (action.type === 'set_start') {
                    if (window.showRoutingPanel) window.showRoutingPanel();
                    if (action.current_location) {
                        if (window.useMyLocationAsStart) {
                            try {
                                await window.useMyLocationAsStart();
                                if (infoBar) infoBar.innerHTML = '🏁 [AI 연동] 출발지가 설정되었습니다: <b>내 위치</b>';
                            } catch (error) {
                                appendChatMessage("ai", "📍 " + escText(error.message));
                            }
                        }
                    } else if (window.setRoutingPoint && isFinite(action.lat) && isFinite(action.lng)) {
                        window.setRoutingPoint('START', action.lat, action.lng, action.name);
                        if (infoBar) infoBar.innerHTML = `🏁 [AI 연동] 출발지가 설정되었습니다: <b>${escText(action.name)}</b>`;
                    }
                }
                else if (action.type === 'set_end') {
                    if (window.showRoutingPanel) window.showRoutingPanel();
                    if (window.setRoutingPoint && isFinite(action.lat) && isFinite(action.lng)) {
                        window.setRoutingPoint('END', action.lat, action.lng, action.name);
                        if (infoBar) infoBar.innerHTML = `🏁 [AI 연동] 도착지가 설정되었습니다: <b>${escText(action.name)}</b>`;
                    }
                }
                else if (action.type === 'route') {
                    if (window.calcRoute) {
                        // 출발/도착 완료 대기용 약간의 지연
                        await new Promise(r => setTimeout(r, 400));
                        if (!window.endCoord) {
                            appendChatMessage("ai", "📍 도착지를 먼저 알려 주세요.");
                        } else if (await ensureStart()) {
                            window.calcRoute(action.mode);
                            if (infoBar) infoBar.innerHTML = `🧭 [AI 연동] ${getModeName(action.mode)} 경로 탐색을 시작합니다...`;
                        }
                    }
                }
                else if (action.type === 'route_indoor') {
                    await runIndoorRoute(action, infoBar);
                }
                else if (action.type === 'route_building') {
                    await runBuildingRoute(action, infoBar);
                }
                else if (action.type === 'search_bus') {
                    if (window.selectRoute) {
                        window.selectRoute(action.routeNo);
                    }
                }
                else if (action.type === 'search_poi') {
                    // "가장 가까운 ○○"은 지도 중심이 아니라 내 위치 기준이어야 한다.
                    if (action.open_closest && window.getUserLocation) {
                        await window.getUserLocation(8000).catch(() => null);
                    }
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
                    if (infoBar) infoBar.innerHTML = `🔍 [AI 연동] '${escText(searchKey)}' 위치를 검색 중입니다...`;
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
                                if (infoBar) infoBar.innerHTML = `🏁 [AI 연동] 도착지가 설정되었습니다: <b>${escText(poi.name)}</b>`;
                                await new Promise(r => setTimeout(r, 400));
                                if (window.calcRoute && await ensureStart()) window.calcRoute(action.mode || 'transit');
                            }
                        } else {
                            if (infoBar) infoBar.innerHTML = `❌ '${escText(searchKey)}' 위치를 찾지 못했습니다.`;
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
                else if (action.type === 'toggle_layer') {
                    var layerActive = action.active !== false;
                    var layerName = action.map_layer || action.layer;
                    if (layerName === 'traffic') {
                        if (window.toggleTrafficLayer) window.toggleTrafficLayer(layerActive);
                    } else if (layerName === 'pm') {
                        if (window.toggleSharedPmLayer) window.toggleSharedPmLayer(layerActive);
                    } else {
                        var wmsLayer = { wms_accident: window.wmsTrafficAccident,
                                         wms_pedestrian: window.wmsPedestrianHazard,
                                         wms_safety: window.wmsSafetyInfo }[layerName];
                        if (wmsLayer && window.map) {
                            if (layerActive) window.map.addLayer(wmsLayer); else window.map.removeLayer(wmsLayer);
                        }
                    }
                }
                else if (action.type === 'show_favorites') {
                    if (window.expandPanel) window.expandPanel();
                    setTimeout(() => {
                        var favList = document.getElementById('favorites-list');
                        if (favList) favList.scrollIntoView({ behavior: 'smooth' });
                    }, 500);
                }
                else if (action.type === 'open_report') {
                    if (window.openPopulationReport) window.openPopulationReport();
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

    // 이보다 멀리서 출발하면 따로 말이 없어도 건물까지는 대중교통으로 안내한다.
    var TECHNO_CENTER = [36.146643, 128.394348];
    var INDOOR_WALK_LIMIT_M = 1500;

    function pickIndoorTravelMode(requested, origin) {
        if (requested === 'walk' || !origin || origin.where !== 'outdoor') return 'walk';
        if (requested && requested !== 'walk') return requested;
        var meters = L.latLng(origin.lat, origin.lng).distanceTo(L.latLng(TECHNO_CENTER));
        return meters > INDOOR_WALK_LIMIT_M ? 'transit' : 'walk';
    }

    // 건물 안 호실까지. 호실을 도면에서 확인한 뒤 실내 길찾기 모듈에 넘긴다.
    async function runIndoorRoute(action, infoBar) {
        var building = action.building || '';
        var query = action.room || action.name || action.keyword || '';
        if (building && !INDOOR_BUILDING_PATTERN.test(building)) {
            // 실내 도면이 없는 건물은 건물 입구까지만 안내한다.
            appendChatMessage("ai", "🚧 " + building + "은(는) 아직 실내 도면이 없어 건물까지만 안내합니다.");
            return executeAiActions([{ type: 'search_and_route', keyword: building, mode: 'walk' }]);
        }
        if (typeof window.routeToTechnoRoom !== 'function') {
            appendChatMessage("ai", "🚧 실내 길찾기 모듈이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
            return;
        }
        var rooms = findTechnoRooms(query, action.floor);
        if (!rooms) {
            appendChatMessage("ai", "🚧 테크노관 도면 데이터를 불러오지 못했습니다.");
            return;
        }
        if (!rooms.length) {
            appendChatMessage("ai", "❓ 테크노관에서 '" + query + "'을(를) 찾지 못했습니다. 호실 번호(예: 301호)로 다시 말씀해 주세요.");
            renderSuggestedReplies(["테크노관 101호 가는 길", "테크노관 대강의실 가는 길"]);
            return;
        }
        if (rooms.length > 1) {
            // 같은 이름이 여러 층에 있으면 고르게 한다.
            appendChatMessage("ai", "🏫 '" + query + "'이(가) " + rooms.length + "곳 있습니다. 어디로 갈까요?");
            renderSuggestedReplies(rooms.slice(0, 6).map(function (room) {
                return '테크노관 ' + room.room_id + '호 가는 길';
            }));
            return;
        }

        var room = rooms[0];
        // 출발지 설정(set_start)이 실내 모듈에 전달될 시간을 둔다.
        await new Promise(function (resolve) { setTimeout(resolve, 400); });
        var origin = window.getTechnoRouteStart ? window.getTechnoRouteStart() : null;
        if (!origin && window.getUserLocation && window.setRoutingPoint) {
            try {
                var here = await window.getUserLocation(10000);
                window.setRoutingPoint('START', here.lat, here.lng, '내 위치');
                await new Promise(function (resolve) { setTimeout(resolve, 400); });
                origin = window.getTechnoRouteStart ? window.getTechnoRouteStart() : null;
            } catch (error) { /* 위치를 못 받으면 지도에서 출발지를 고르게 둔다 */ }
        }
        var mode = pickIndoorTravelMode(action.mode, origin);

        // 멀리서 오면 건물 출입구까지는 대중교통(또는 차), 그 뒤는 실내 도보.
        if (mode !== 'walk' && window.routeTechnoFromArrival && window.calcRoute && window.setRoutingPoint) {
            var entrance = window.routeTechnoFromArrival(room.room_id, room.floor);
            if (entrance && entrance.latlng) {
                // 지도는 전체 이동 경로를 보여 주고, 실내지도는 확대하면 뜨게만 해 둔다.
                window.technoIndoorOpen = true;
                window.setRoutingPoint('END', entrance.latlng[0], entrance.latlng[1],
                                       describeRoom(room));
                await new Promise(function (resolve) { setTimeout(resolve, 400); });
                window.calcRoute(mode);
                if (infoBar) infoBar.innerHTML = '🏫 [AI 연동] 도착지: <b>' + DOMPurify.sanitize(describeRoom(room)) + '</b>';
                var modeIcon = { car: "🚗 ", bike: "🚲 ", shared: "🛴 " }[mode] || "🚌 ";
                appendChatMessage("ai", modeIcon + DOMPurify.sanitize(entrance.name) +
                    "까지 " + getModeName(mode) + " 경로를 찾고, 거기서 " + describeRoom(room) +
                    " 문 앞까지 실내 경로를 표시합니다. 테크노관을 확대하면 층별 경로가 보입니다.");
                return;
            }
        }

        if (window.openTechnoIndoorMap) window.openTechnoIndoorMap(room.floor);
        window.routeToTechnoRoom(room.room_id, room.unitId);
        if (infoBar) infoBar.innerHTML = '🏫 [AI 연동] 도착지: <b>' + DOMPurify.sanitize(describeRoom(room)) + '</b>';
        appendChatMessage("ai", origin
            ? "🧭 " + describeRoom(room) + " 문 앞까지 경로를 표시합니다."
            : "📍 도착지를 " + describeRoom(room) + "(으)로 정했습니다. 출발 위치를 지도에서 눌러 주세요.");
    }

    // 건물·층만 말한 경우("테크노관 3층 가는 길"). 그 층에 출입구가 있으면 그중, 없으면 전체 가운데
    // 출발지에서 가장 가까운 출입구까지 안내한다. 문 앞까지 가려면 호실을 알아야 한다.
    async function runBuildingRoute(action, infoBar) {
        var nav = window.TECHNO_NAV_DATA;
        var entrances = (nav && nav.entrances) || [];
        if (!entrances.length || !window.setRoutingPoint || !window.calcRoute) {
            appendChatMessage("ai", "🚧 테크노관 출입구 정보를 불러오지 못했습니다.");
            return;
        }
        var floor = parseFloor(action.floor);
        var onFloor = entrances.filter(function (entrance) { return entrance.floor === floor; });
        var pool = onFloor.length ? onFloor : entrances;
        var from = window.startCoord;
        var entrance = pool[0];
        if (from) {
            var bestMeters = Infinity;
            pool.forEach(function (candidate) {
                var meters = L.latLng(from.lat, from.lng).distanceTo([candidate.lat, candidate.lon]);
                if (meters < bestMeters) { bestMeters = meters; entrance = candidate; }
            });
        }
        var mode = pickIndoorTravelMode(action.mode, from ? { where: 'outdoor', lat: from.lat, lng: from.lng } : null);

        // 테크노관을 확대하면 말한 층의 실내지도가 뜨게 해 둔다.
        if (floor) window.technoActiveFloor = floor;
        window.technoIndoorOpen = true;
        window.setRoutingPoint('END', entrance.lat, entrance.lon, '테크노관 ' + entrance.name);
        await executeAiActions([{ type: 'route', mode: mode }]);
        if (infoBar) infoBar.innerHTML = '🏫 [AI 연동] 도착지: <b>테크노관 ' + escText(entrance.name) + '</b>';
        appendChatMessage("ai", "🚪 " + escText(entrance.name) + "까지 " + getModeName(mode) + " 경로를 찾습니다. " +
            (floor ? "테크노관을 확대하면 " + floor + " 실내지도가 보입니다. " : "") +
            "호실이나 교수님 이름을 알려 주시면 문 앞까지 안내해 드립니다.");
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
