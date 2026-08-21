// ============================================================
// 📁 파일명: js/map/map-utils.js
// 📌 역할: 지도 관련 순수 유틸리티 함수 모음
// ============================================================
//
// [파일 설명]
//   지도 클릭·검색·표시 등 여러 모듈에서 공통으로 사용하는
//   순수 함수(Pure Function)들을 모아 놓은 유틸리티 파일입니다.
//   - getMajorLandmarkFromAddress(): 주소에서 주요 랜드마크 키워드 추출
//   - extractBuildingNameFromAddress(): 주소 괄호 안 건물명 추출
//   - cleanDetailedName(): 줌 레벨에 따른 장소명 정제 및 통폐합
//     (예: 저줌에서 "구미역 화장실" → "구미역"으로 자동 통합)
//   - isClickAllowedForZoom(): 줌 레벨별 클릭 허용 판정
//   - getIconForName(): 장소명 → 카테고리 이모지 자동 매핑
//     (예: "순천향병원" → 🏥, "스타벅스" → ☕)
//
// [의존 관계]
//   - 의존하는 파일: 없음 (순수 함수만 포함)
//   - 이 파일을 참조하는 파일: map-click.js, map-search.js, station_info.js 등
// ============================================================

/**
 * 주소 문자열로부터 주요 랜드마크 키워드를 추출합니다.
 * @param {string} addr - 주소 문자열
 * @returns {string|null} 추출된 주요 랜드마크 명칭 또는 null
 */
window.getMajorLandmarkFromAddress = function(addr) {
    if (!addr) return null;
    var match = addr.match(/([가-힣]*(?:차병원|대학병원|종합병원|의료원|병원|시청|도청|구청|의회|주민센터|행정복지센터|읍사무소|면사무소|경찰서|소방서|보건소|우체국|교육청|교육지원청|법원|세무서|대학교|대학|고등학교|중학교|초등학교|학교|도서관|체육관|예술회관|공원))/);
    if (match) {
        var name = match[1];
        if (name.includes("차병원")) {
            return "구미차병원";
        }
        return name;
    }
    return null;
};

/**
 * 주소 괄호 안에서 행정구역명을 제외한 건물/기관 명칭을 추출합니다.
 * @param {string} addr - 주소 문자열
 * @returns {string|null} 추출된 건물명 또는 null
 */
window.extractBuildingNameFromAddress = function(addr) {
    if (!addr) return null;
    var match = addr.match(/\(([^)]+)\)/);
    if (!match) return null;
    var inner = match[1];
    var parts = inner.split(',');
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        // Ignore administrative names ending with 동, 리, 가, 읍, menu, 시, 군, 구, or apartment block numbers (e.g. 101동)
        if (!/^[가-힣0-9\s]+(동|리|가|읍|면|시|군|구)$/.test(p)) {
            if (p === "대학") {
                if (addr.includes("신평")) {
                    return "금오공과대학교 신평동캠퍼스";
                }
                return "금오공과대학교 양호동캠퍼스";
            }
            return p;
        }
    }
    return null;
};

/**
 * 줌 레벨과 상황에 맞춰 복잡한 건물/장소 명칭을 정제하고 통폐합합니다.
 * @param {string} name - 원본 장소 이름
 * @param {number} [zoom] - 현재 지도의 줌 레벨
 * @param {boolean} [isClick] - 지도 상의 객체 클릭 시 여부 (대표 랜드마크 통합 적용)
 * @param {string} [address] - 장소의 주소 정보
 * @returns {string} 정제된 장소 이름
 */
window.cleanDetailedName = function(name, zoom, isClick, address) {
    if (name === null || name === undefined) return "";
    name = String(name);
    
    var addrStr = (address || "").replace(/\s+/g, '');
    
    // Map generic "대학" or "양호동캠퍼스 대학"
    if (name === "대학" || name === "양호동캠퍼스 대학") {
        if (addrStr.includes("신평") || addrStr.includes("구미대로")) {
            return "금오공과대학교 신평동캠퍼스";
        }
        return "금오공과대학교 양호동캠퍼스";
    }
    if (name === "신평동캠퍼스 대학" || name === "신평캠퍼스 대학") {
        return "금오공과대학교 신평동캠퍼스";
    }
    
    // 금오공과대학교 캠퍼스 강제 구별 및 조기 반환 (단, 대학 명칭 자체일 경우에만 캠퍼스 통합 및 반환 처리하고 상업시설/주택/일반 건물 등은 유지)
    var normalizedName = name.replace(/\s+/g, "");
    var isSchoolItself = normalizedName === "금오공과대학교" || 
                         normalizedName === "금오공대" || 
                         normalizedName === "금오공과대학" ||
                         normalizedName === "국립금오공과대학교" ||
                         /^(국립)?(금오공과대학교|금오공대|금오공과대학)(양호동|신평동|거의동|양호|신평|거의)캠퍼스$/.test(normalizedName) ||
                         /^(국립)?(금오공과대학교|금오공대|금오공과대학)\((양호동|신평동|거의동|양호|신평|거의)\)$/.test(normalizedName);

    if (isSchoolItself) {
        if (name.includes("신평") || addrStr.includes("신평") || addrStr.includes("구미대로")) {
            return "금오공과대학교 신평동캠퍼스";
        }
        return "금오공과대학교 양호동캠퍼스";
    }

    
    var currentZoom = (zoom !== undefined) ? zoom : (((typeof map !== 'undefined' && map)) ? map.getZoom() : 15);
    
    // ────────────────────────────────────────────────────────────
    // [isClick === true && currentZoom <= 17] 지도 평상시 클릭 시 부속시설을 대표 랜드마크로 통폐합
    // 최대 확대(18 이상) 시에는 통폐합하지 않고 세부 명칭 유지
    // ────────────────────────────────────────────────────────────
    if (isClick && currentZoom <= 17) {
        // 주요 랜드마크 통폐합 매핑 (키워드 → 대표 명칭)
        var consolidationMap = [
            { keywords: ["시청"], result: "구미시청" },
            { keywords: ["구미역"], result: "구미역" },
            { keywords: ["사곡역"], result: "사곡역" },
            { keywords: ["순천향"], result: "순천향대학교구미병원" },
            { keywords: ["차병원"], result: "구미차병원" },
            { keywords: ["구미대학교", "구미대학"], result: "구미대학교" },
            { keywords: ["문화예술회관", "예술회관"], result: "구미시문화예술회관" },
            { keywords: ["시립도서관"], result: "구미시립도서관" },
            { keywords: ["종합버스터미널", "종합터미널"], result: "구미종합버스터미널" }
        ];
        
        for (var ci = 0; ci < consolidationMap.length; ci++) {
            var entry = consolidationMap[ci];
            for (var ki = 0; ki < entry.keywords.length; ki++) {
                if (name.includes(entry.keywords[ki])) {
                    return entry.result;
                }
            }
        }
        
        // 일반 건물의 부속 명칭 접미사 제거 (상가, 주차장, 별관, 장례식장, 의회, 종합민원실, 창고, 사무실, 경비실, 관리실, 부속동 등)
        var suffixPattern = /\s*(주차장|주차타워|별관|신관|장례식장|장례|의회|종합민원실|민원실|창고|사무실|경비실|관리실|부속동|부속|화장실|기계실|전기실|발전기실|경비초소|수위실|매점|식당동|기숙사|연구동|실험동|강의동|체육관동|도서관동|상가|단지내상가|종합상가)$/;
        var suffixCleaned = name.replace(suffixPattern, "").trim();
        if (suffixCleaned.length >= 2 && suffixCleaned !== name) {
            name = suffixCleaned;
        }
    }
    
    // ────────────────────────────────────────────────────────────
    // 줌 레벨별 명칭 간소화 (클릭/검색 공통)
    // ────────────────────────────────────────────────────────────
    if (currentZoom <= 16) {
        // Simplify Soonchunhyang hospital
        if (name.includes("순천향대학교구미병원") || name.includes("순천향대학구미병원") || name.includes("순천향구미병원") || name.includes("순천향병원")) {
            return "순천향대학교구미병원";
        }
        if (name.includes("차병원")) {
            return "구미차병원";
        }
        if (name.includes("구미대학교") || name.includes("구미대")) {
            return "구미대학교";
        }
        
        // Remove suffixes like 본관지하1층, 별관3층, 본관, 별관, 지하1층, 1층, 로비, 주차장
        var clean = name;
        clean = clean.replace(/(?:본관|별관|신관|동관|(?<!도)서관|남관|북관)?(?:지하|지상)?\d+층/g, "");
        clean = clean.replace(/(?:본관|별관|신관|동관|(?<!도)서관|남관|북관)/g, "");
        clean = clean.trim();
        if (clean.length > 3) {
            return clean;
        }
    }
    return name;
};

/**
 * 현재 줌 레벨과 랜드마크의 중요도 가중치를 비교하여 클릭 이벤트를 허용할지 판단합니다.
 * @param {string} name - 장소 이름
 * @param {string} [category] - 장소 카테고리
 * @param {number} [zoom] - 지도의 현재 줌 레벨
 * @returns {boolean} 클릭 허용 여부 (true/false)
 */
window.isClickAllowedForZoom = function(name, category, zoom) {
    if (name === null || name === undefined) return false;
    var n = String(name).toLowerCase().replace(/\s+/g, '');
    var cat = String(category || "").toLowerCase();
    
    // Determine priority
    var priority = 0; // default: nameless/residential/minor
    
    var isMajorT1 = n.includes("시청") || n.includes("도청") || n.includes("구청") ||
        (n.includes("역") && !n.includes("역삼") && !n.includes("역세권") && (n.endsWith("역") || n.includes("역사") || n.includes("구미역"))) ||
        n.includes("터미널") || n.includes("ktx") || n.includes("itx") ||
        n.includes("종합병원") || n.includes("대학병원") || n.includes("차병원") || n.includes("순천향") || n.includes("의료원") ||
        n.includes("대학교") || n.includes("대학") || n.includes("캠퍼스") ||
        n.includes("도서관") || n.includes("예술회관") || n.includes("문화회관") || n.includes("박물관") || n.includes("미술관") ||
        n.includes("종합운동장") || n.includes("체육관") || n.includes("수목원") || n.includes("공원");
        
    var isMediumT2 = !isMajorT1 && (
        n.includes("의원") || n.includes("치과") || n.includes("한의원") || n.includes("약국") || n.includes("보건소") || n.includes("클리닉") ||
        n.includes("주민센터") || n.includes("행정복지센터") || n.includes("읍사무소") || n.includes("면사무소") ||
        n.includes("경찰서") || n.includes("소방서") || n.includes("우체국") || n.includes("세무서") || n.includes("법원") || n.includes("교육청") || n.includes("교육지원청") ||
        n.includes("초등학교") || n.includes("중학교") || n.includes("고등학교") || n.includes("학교") ||
        n.includes("유원지") || n.includes("체육시설")
    );
    
    var isApartment = !isMajorT1 && !isMediumT2 && (
        n.includes("아파트") || n.includes("푸르지오") || n.includes("자이") || n.includes("힐스테이트") || n.includes("아이파크") || n.includes("e편한세상") || n.includes("더샵") || n.includes("래미안") || n.includes("두산위브") || n.includes("코아루") || n.includes("우미린") || n.includes("부영") || n.includes("영무예다음") || n.includes("주공") || n.includes("sk뷰") || n.includes("롯데캐슬")
    );
    
    var isCommercial = !isMajorT1 && !isMediumT2 && !isApartment && (
        n.includes("마트") || n.includes("백화점") || n.includes("편의점") || n.includes("시장") || n.includes("상가") ||
        n.includes("식당") || n.includes("반점") || n.includes("가든") || n.includes("치킨") || n.includes("피자") || n.includes("푸드") || n.includes("밥") ||
        n.includes("카페") || n.includes("커피") || n.includes("다방") ||
        n.includes("은행") || n.includes("금고") || n.includes("농협") ||
        n.includes("학원") || n.includes("점") || n.includes("스토어") || n.includes("슈퍼") ||
        n.includes("cu") || n.includes("gs25") || n.includes("gs") || n.includes("세븐일레븐") || n.includes("이마트24") || n.includes("미니스톱")
    );
    
    if (isMajorT1) {
        priority = 3;
    } else if (isMediumT2 || isApartment) {
        priority = 2;
    } else if (isCommercial) {
        priority = 1;
    } else {
        priority = 0;
    }
    
    var currentZoom = (zoom !== undefined) ? zoom : (((typeof map !== 'undefined' && map)) ? map.getZoom() : 15);
    
    // Zoom limits for clicking
    if (priority === 3) return currentZoom >= 11;
    if (priority === 2) return currentZoom >= 14;
    if (priority === 1) return currentZoom >= 16;
    return currentZoom >= 17; // priority 0
};

/**
 * 장소 명칭에 알맞은 시각적 카테고리 이모지를 매핑하여 반환합니다.
 * @param {string} name - 장소 이름
 * @returns {string} 카테고리 이모지 (예: 🏥, 🏛️, ☕ 등)
 */
window.getIconForName = function(name) {
    if (name === null || name === undefined) return "";
    var n = String(name).toLowerCase().replace(/\s+/g, '');
    
    // 정류장/방면 (버스정류장 표기)
    if (n.includes("방면") || n.includes("정류장") || n.includes("승강장")) return "🚏";

    // 병원/의료
    if (n.includes("병원") || n.includes("의원") || n.includes("약국") || n.includes("보건소") || n.includes("클리닉") || n.includes("치과") || n.includes("한의원")) return "🏥";
    
    // 자연/산
    if (n.endsWith("산") || n.includes("자연휴양림") || n.includes("휴양림") || n.includes("계곡")) return "🌲";
    if (n.includes("공원") || n.includes("수목원") || n.includes("숲") || n.includes("유원지") || n.includes("체육시설") || n.includes("식물원")) return "🌳";
    
    // 학교/학원
    if (n.includes("학교") || n.includes("대학") || n.includes("유치원") || n.includes("학원") || n.includes("교육관") || n.includes("금오공대")) {
        var isCommercialOrResidential = 
            n.includes("점") || n.includes("마트") || n.includes("편의점") || n.includes("식당") || 
            n.includes("카페") || n.includes("빌라") || n.includes("원룸") || n.includes("복사") || 
            n.includes("인쇄") || n.includes("치킨") || n.includes("피자") || n.includes("스톱") || 
            n.includes("cu") || n.includes("gs25") || n.includes("gs") || n.includes("세븐일레븐") || 
            n.includes("이마트24") || n.includes("emart") || n.includes("슈퍼") || n.includes("상회") ||
            n.includes("원") || n.includes("룸") || n.includes("고기") || n.includes("구이") || 
            n.includes("분식") || n.includes("제과") || n.includes("베이커리") || n.includes("빵") ||
            n.includes("호프") || n.includes("포차") || n.includes("안경") || n.includes("노래") ||
            n.includes("헤어") || n.includes("뷰티") || n.includes("미용") || n.includes("원룸") || 
            n.includes("투룸") || n.includes("리빙") || n.includes("하우스");
        if (!isCommercialOrResidential) {
            return "🏫";
        }
    }
    
    // 교통
    if (n.endsWith("역") || n.includes("터미널") || n.includes("선착장") || n.includes("ktx") || n.includes("itx")) return "🚉";
    
    // 노인/경로당
    if (n.includes("노인") || n.includes("경로당") || n.includes("마을회관")) return "👴";

    // 공공기관/관공서
    if (n.includes("시청") || n.includes("주민센터") || n.includes("행정복지센터") || n.includes("경찰서") || n.includes("소방서") || n.includes("우체국") || n.includes("구청") || n.includes("시민회관") || n.includes("미술관") || n.includes("박물관") || n.includes("도서관") || n.includes("체육관") || n.includes("아트센터") || n.includes("세무서") || n.includes("법원") || n.includes("예술회관")) return "🏛️";
    
    // 아파트/빌라/주거시설
    if (n.includes("아파트") || n.includes("빌라") || n.includes("오피스텔") || n.includes("캐슬") || n.includes("센트럴") || n.includes("원룸") || n.includes("투룸") || n.includes("주택") || n.includes("맨션") || n.includes("하우스") || n.includes("리빙") || n.includes("스위트") || n.includes("빌딩")) return "🏢";
    
    // 대형마트
    if (n.includes("이마트24") || n.includes("emart24")) return "🏪";
    if (n.includes("이마트") || n.includes("홈플러스") || n.includes("롯데마트") || n.includes("대형마트") || n.includes("하나로마트") || n.includes("emart")) return "🛒";

    // 마트/편의점
    if (n.includes("편의점") || n.includes("시장") || n.includes("상가") || n.includes("cu") || n.includes("gs25") || n.includes("세븐일레븐") || n.includes("미니스톱") || n.includes("슈퍼") || n.includes("상회") || n.includes("마트") || n.includes("백화점")) return "🏪";
    
    // 은행/금융
    if (n.includes("은행") || n.includes("금고") || n.includes("농협") || n.includes("새마을금고") || n.includes("신협") || n.includes("국민은행") || n.includes("신한은행") || n.includes("우리은행") || n.includes("하나은행")) return "🏦";
    
    // 카페/디저트
    if (n.includes("스타벅스") || n.includes("starbucks")) return "☕";
    if (n.includes("카페") || n.includes("커피") || n.includes("다방") || n.includes("제과") || n.includes("베이커리") || n.includes("빵") || n.includes("설빙") || n.includes("투썸") || n.includes("빽다방") || n.includes("메가커피")) return "🧋";
    
    // 식당/음식점
    if (n.includes("식당") || n.includes("반점") || n.includes("가든") || n.includes("치킨") || n.includes("피자") || n.includes("푸드") || n.includes("밥") || n.includes("갈비") || n.includes("삼겹살") || n.includes("구이") || n.includes("포차") || n.includes("분식") || n.includes("국수") || n.includes("칼국수") || n.includes("돈까스") || n.includes("스시") || n.includes("초밥") || n.includes("한식") || n.includes("중식") || n.includes("일식") || n.includes("양식") || n.includes("버거") || n.includes("리아") || n.includes("국밥") || n.includes("찌개") || n.includes("탕")) return "🍕";
    
    // 숙박
    if (n.includes("호텔") || n.includes("모텔") || n.includes("여관") || n.includes("펜션") || n.includes("게스트하우스")) return "🏨";
    
    return "";
};
