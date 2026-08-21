// ============================================================
// 📁 파일명: fallback_stops.js
// 📌 역할: 오프라인 정류장 데이터 (API 장애 대비 폴백 DB)
// ============================================================
//
// [파일 설명]
//   공공데이터포털 버스정류장 API가 응답하지 않거나 서버 점검 중일 때
//   앱이 정상 동작할 수 있도록 구미시 전체 버스 노선의 정류장 좌표를
//   미리 캐싱해 놓은 로컬 데이터베이스입니다. (약 3,900줄, 117KB)
//   - 각 노선 ID(예: GMB1111)별로 정류장 목록을 배열로 보유
//   - 정류장 정보: 노드 ID(nodeid), 정류장명(nodenm), GPS 위경도
//   - station_info.js에서 정류장 ID 역탐색(findStationIdLocally) 시 사용
//   - bus_tracker.js에서 API 실패 시 정류장 좌표 폴백으로 사용
//
// [데이터 출처]
//   - 공공데이터포털 구미시 버스노선별 정류장 API 응답 캐싱
//
// [참고]
//   - 이 파일은 자동 생성된 데이터 파일이므로 직접 수정하지 마세요.
//   - 데이터 갱신이 필요한 경우 API를 재호출하여 덮어쓰세요.
// ============================================================

window.fallbackRouteStops = {
    "GMB1111": [
        {
            "nodeid": "GMB80",
            "nodenm": "구미역",
            "gpslati": 36.12981186,
            "gpslong": 128.32898084
        },
        {
            "nodeid": "GMB167",
            "nodenm": "농협",
            "gpslati": 36.12799177,
            "gpslong": 128.33336917
        },
        {
            "nodeid": "GMB134",
            "nodenm": "금오산사거리",
            "gpslati": 36.12701797,
            "gpslong": 128.33564714
        },
        {
            "nodeid": "GMB901",
            "nodenm": "원평동 행정복지센터 건너",
            "gpslati": 36.12609076,
            "gpslong": 128.33786179
        },
        {
            "nodeid": "GMB138",
            "nodenm": "금오시장 건너",
            "gpslati": 36.12522621,
            "gpslong": 128.33979186
        },
        {
            "nodeid": "GMB476",
            "nodenm": "송원고가밑(터미널네거리방면)",
            "gpslati": 36.12387024,
            "gpslong": 128.34221963
        },
        {
            "nodeid": "GMB803",
            "nodenm": "터미널네거리(오성예식장앞방면)",
            "gpslati": 36.12221647,
            "gpslong": 128.348001
        },
        {
            "nodeid": "GMB91",
            "nodenm": "구미종합터미널앞",
            "gpslati": 36.12261704,
            "gpslong": 128.35105723
        },
        {
            "nodeid": "GMB1002",
            "nodenm": "농협파머스마켓앞",
            "gpslati": 36.12221261,
            "gpslong": 128.35451796
        },
        {
            "nodeid": "GMB532",
            "nodenm": "구미IC네거리(구미경찰서방면)",
            "gpslati": 36.1192019,
            "gpslong": 128.36023751
        },
        {
            "nodeid": "GMB526",
            "nodenm": "구미경찰서건너",
            "gpslati": 36.11635694,
            "gpslong": 128.36269247
        },
        {
            "nodeid": "GMB259",
            "nodenm": "롯데마트건너",
            "gpslati": 36.11386599,
            "gpslong": 128.36338338
        },
        {
            "nodeid": "GMB796",
            "nodenm": "코오롱",
            "gpslati": 36.11077982,
            "gpslong": 128.36990757
        },
        {
            "nodeid": "GMB47",
            "nodenm": "공단본부건너",
            "gpslati": 36.1108184,
            "gpslong": 128.37699092
        },
        {
            "nodeid": "GMB75",
            "nodenm": "구미세무서건너",
            "gpslati": 36.11081041,
            "gpslong": 128.38319878
        },
        {
            "nodeid": "GMB808",
            "nodenm": "평생교육원앞",
            "gpslati": 36.10597731,
            "gpslong": 128.38523684
        },
        {
            "nodeid": "GMB317",
            "nodenm": "복지상가앞",
            "gpslati": 36.10359282,
            "gpslong": 128.38525653
        },
        {
            "nodeid": "GMB490",
            "nodenm": "순천향병원앞",
            "gpslati": 36.10221962,
            "gpslong": 128.38248635
        },
        {
            "nodeid": "GMB769",
            "nodenm": "직물협업단지(태광산업방면)",
            "gpslati": 36.1021553,
            "gpslong": 128.37803428
        },
        {
            "nodeid": "GMB415",
            "nodenm": "새한단지앞(광평동푸르지오아파트방면)",
            "gpslati": 36.10215111,
            "gpslong": 128.37298763
        },
        {
            "nodeid": "GMB52",
            "nodenm": "광평동푸르지오아파트앞",
            "gpslati": 36.10215374,
            "gpslong": 128.36537335
        },
        {
            "nodeid": "GMB315",
            "nodenm": "보성황실2차아파트정문앞",
            "gpslati": 36.10109819,
            "gpslong": 128.35985496
        },
        {
            "nodeid": "GMB1056",
            "nodenm": "사곡초등학교건너",
            "gpslati": 36.09924049,
            "gpslong": 128.3589394
        },
        {
            "nodeid": "GMB360",
            "nodenm": "사곡동(사곡동새마을방면)",
            "gpslati": 36.09730457,
            "gpslong": 128.35882063
        },
        {
            "nodeid": "GMB362",
            "nodenm": "사곡동새마을(상모초등학교방면)",
            "gpslati": 36.0939735,
            "gpslong": 128.35914164
        },
        {
            "nodeid": "GMB407",
            "nodenm": "상모초등학교",
            "gpslati": 36.0910899,
            "gpslong": 128.35868058
        },
        {
            "nodeid": "GMB398",
            "nodenm": "상모농협앞",
            "gpslati": 36.08859505,
            "gpslong": 128.35850868
        },
        {
            "nodeid": "GMB652",
            "nodenm": "화성파크2단지앞",
            "gpslati": 36.08647096,
            "gpslong": 128.35873502
        },
        {
            "nodeid": "GMB612",
            "nodenm": "오태2동입구건너",
            "gpslati": 36.08285156,
            "gpslong": 128.35735311
        },
        {
            "nodeid": "GMB154",
            "nodenm": "남구미자동차학원건너",
            "gpslati": 36.07928079,
            "gpslong": 128.35353349
        },
        {
            "nodeid": "GMB1099",
            "nodenm": "남구미요양병원건너",
            "gpslati": 36.07799438,
            "gpslong": 128.3521629
        },
        {
            "nodeid": "GMB169",
            "nodenm": "오태늘푸른아파트",
            "gpslati": 36.0717566,
            "gpslong": 128.349346
        },
        {
            "nodeid": "GMB2433",
            "nodenm": "창신아파트건너",
            "gpslati": 36.07044169,
            "gpslong": 128.34787002
        },
        {
            "nodeid": "GMB2211",
            "nodenm": "북삼중학교건너",
            "gpslati": 36.07096461,
            "gpslong": 128.3439547
        },
        {
            "nodeid": "GMB2113",
            "nodenm": "인평공원건너",
            "gpslati": 36.07228293,
            "gpslong": 128.34215259
        },
        {
            "nodeid": "GMB2393",
            "nodenm": "인평초등학교",
            "gpslati": 36.0709105,
            "gpslong": 128.3378041
        },
        {
            "nodeid": "GMB2733",
            "nodenm": "북삼서희스타힐스아파트 건너",
            "gpslati": 36.06749951,
            "gpslong": 128.33730408
        },
        {
            "nodeid": "GMB2215",
            "nodenm": "북삼초등학교앞",
            "gpslati": 36.06447212,
            "gpslong": 128.3433998
        },
        {
            "nodeid": "GMB2209",
            "nodenm": "북삼읍지구대",
            "gpslati": 36.06276614,
            "gpslong": 128.34358845
        },
        {
            "nodeid": "GMB2378",
            "nodenm": "북삼역건너",
            "gpslati": 36.05588049,
            "gpslong": 128.3443908
        },
        {
            "nodeid": "GMB2380",
            "nodenm": "율리",
            "gpslati": 36.05159799,
            "gpslong": 128.34498226
        },
        {
            "nodeid": "GMB2200",
            "nodenm": "복성4리건너",
            "gpslati": 36.04523767,
            "gpslong": 128.34618008
        },
        {
            "nodeid": "GMB2346",
            "nodenm": "오성아파트",
            "gpslati": 36.04052135,
            "gpslong": 128.3591641
        },
        {
            "nodeid": "GMB2600",
            "nodenm": "복성4리(옥만리)",
            "gpslati": 36.03879635,
            "gpslong": 128.36141449
        },
        {
            "nodeid": "GMB2643",
            "nodenm": "약목역건너",
            "gpslati": 36.03687889,
            "gpslong": 128.36349469
        },
        {
            "nodeid": "GMB2327",
            "nodenm": "약목",
            "gpslati": 36.0346419,
            "gpslong": 128.36513256
        },
        {
            "nodeid": "GMB2329",
            "nodenm": "약목주유소",
            "gpslati": 36.03152381,
            "gpslong": 128.36761294
        },
        {
            "nodeid": "GMB2169",
            "nodenm": "약목고등학교입구",
            "gpslati": 36.0261493,
            "gpslong": 128.37705042
        },
        {
            "nodeid": "GMB2171",
            "nodenm": "무림2리건너",
            "gpslati": 36.02448958,
            "gpslong": 128.3802131
        },
        {
            "nodeid": "GMB2036",
            "nodenm": "관호초등학교입구",
            "gpslati": 36.02058579,
            "gpslong": 128.38354012
        },
        {
            "nodeid": "GMB2029",
            "nodenm": "관호1리",
            "gpslati": 36.01787139,
            "gpslong": 128.38639203
        },
        {
            "nodeid": "GMB2031",
            "nodenm": "칠곡경찰서건너",
            "gpslati": 36.00938215,
            "gpslong": 128.38743073
        },
        {
            "nodeid": "GMB2232",
            "nodenm": "삼주아파트",
            "gpslati": 36.00283587,
            "gpslong": 128.38950368
        },
        {
            "nodeid": "GMB2356",
            "nodenm": "왜관북부",
            "gpslati": 35.99710661,
            "gpslong": 128.39888731
        },
        {
            "nodeid": "GMB2719",
            "nodenm": "왜관신협(왜관역)",
            "gpslati": 35.99136515,
            "gpslong": 128.39927041
        },
        {
            "nodeid": "GMB2355",
            "nodenm": "왜관남부",
            "gpslati": 35.98907982,
            "gpslong": 128.39974444
        }
    ],
    "GMB1114": [
        {
            "nodeid": "GMB80",
            "nodenm": "구미역",
            "gpslati": 36.12981186,
            "gpslong": 128.32898084
        },
        {
            "nodeid": "GMB167",
            "nodenm": "농협",
            "gpslati": 36.12799177,
            "gpslong": 128.33336917
        },
        {
            "nodeid": "GMB134",
            "nodenm": "금오산사거리",
            "gpslati": 36.12701797,
            "gpslong": 128.33564714
        },
        {
            "nodeid": "GMB901",
            "nodenm": "원평동 행정복지센터 건너",
            "gpslati": 36.12609076,
            "gpslong": 128.33786179
        },
        {
            "nodeid": "GMB138",
            "nodenm": "금오시장 건너",
            "gpslati": 36.12522621,
            "gpslong": 128.33979186
        },
        {
            "nodeid": "GMB476",
            "nodenm": "송원고가밑(터미널네거리방면)",
            "gpslati": 36.12387024,
            "gpslong": 128.34221963
        },
        {
            "nodeid": "GMB803",
            "nodenm": "터미널네거리(오성예식장앞방면)",
            "gpslati": 36.12221647,
            "gpslong": 128.348001
        },
        {
            "nodeid": "GMB91",
            "nodenm": "구미종합터미널앞",
            "gpslati": 36.12261704,
            "gpslong": 128.35105723
        },
        {
            "nodeid": "GMB1002",
            "nodenm": "농협파머스마켓앞",
            "gpslati": 36.12221261,
            "gpslong": 128.35451796
        },
        {
            "nodeid": "GMB532",
            "nodenm": "구미IC네거리(구미경찰서방면)",
            "gpslati": 36.1192019,
            "gpslong": 128.36023751
        },
        {
            "nodeid": "GMB526",
            "nodenm": "구미경찰서건너",
            "gpslati": 36.11635694,
            "gpslong": 128.36269247
        },
        {
            "nodeid": "GMB259",
            "nodenm": "롯데마트건너",
            "gpslati": 36.11386599,
            "gpslong": 128.36338338
        },
        {
            "nodeid": "GMB796",
            "nodenm": "코오롱",
            "gpslati": 36.11077982,
            "gpslong": 128.36990757
        },
        {
            "nodeid": "GMB47",
            "nodenm": "공단본부건너",
            "gpslati": 36.1108184,
            "gpslong": 128.37699092
        },
        {
            "nodeid": "GMB75",
            "nodenm": "구미세무서건너",
            "gpslati": 36.11081041,
            "gpslong": 128.38319878
        },
        {
            "nodeid": "GMB808",
            "nodenm": "평생교육원앞",
            "gpslati": 36.10597731,
            "gpslong": 128.38523684
        },
        {
            "nodeid": "GMB317",
            "nodenm": "복지상가앞",
            "gpslati": 36.10359282,
            "gpslong": 128.38525653
        },
        {
            "nodeid": "GMB490",
            "nodenm": "순천향병원앞",
            "gpslati": 36.10221962,
            "gpslong": 128.38248635
        },
        {
            "nodeid": "GMB769",
            "nodenm": "직물협업단지(태광산업방면)",
            "gpslati": 36.1021553,
            "gpslong": 128.37803428
        },
        {
            "nodeid": "GMB415",
            "nodenm": "새한단지앞(광평동푸르지오아파트방면)",
            "gpslati": 36.10215111,
            "gpslong": 128.37298763
        },
        {
            "nodeid": "GMB52",
            "nodenm": "광평동푸르지오아파트앞",
            "gpslati": 36.10215374,
            "gpslong": 128.36537335
        },
        {
            "nodeid": "GMB315",
            "nodenm": "보성황실2차아파트정문앞",
            "gpslati": 36.10109819,
            "gpslong": 128.35985496
        },
        {
            "nodeid": "GMB1056",
            "nodenm": "사곡초등학교건너",
            "gpslati": 36.09924049,
            "gpslong": 128.3589394
        },
        {
            "nodeid": "GMB360",
            "nodenm": "사곡동(사곡동새마을방면)",
            "gpslati": 36.09730457,
            "gpslong": 128.35882063
        },
        {
            "nodeid": "GMB362",
            "nodenm": "사곡동새마을(상모초등학교방면)",
            "gpslati": 36.0939735,
            "gpslong": 128.35914164
        },
        {
            "nodeid": "GMB407",
            "nodenm": "상모초등학교",
            "gpslati": 36.0910899,
            "gpslong": 128.35868058
        },
        {
            "nodeid": "GMB398",
            "nodenm": "상모농협앞",
            "gpslati": 36.08859505,
            "gpslong": 128.35850868
        },
        {
            "nodeid": "GMB652",
            "nodenm": "화성파크2단지앞",
            "gpslati": 36.08647096,
            "gpslong": 128.35873502
        },
        {
            "nodeid": "GMB612",
            "nodenm": "오태2동입구건너",
            "gpslati": 36.08285156,
            "gpslong": 128.35735311
        },
        {
            "nodeid": "GMB154",
            "nodenm": "남구미자동차학원건너",
            "gpslati": 36.07928079,
            "gpslong": 128.35353349
        },
        {
            "nodeid": "GMB1099",
            "nodenm": "남구미요양병원건너",
            "gpslati": 36.07799438,
            "gpslong": 128.3521629
        },
        {
            "nodeid": "GMB169",
            "nodenm": "오태늘푸른아파트",
            "gpslati": 36.0717566,
            "gpslong": 128.349346
        },
        {
            "nodeid": "GMB2433",
            "nodenm": "창신아파트건너",
            "gpslati": 36.07044169,
            "gpslong": 128.34787002
        },
        {
            "nodeid": "GMB2213",
            "nodenm": "북삼중학교입구",
            "gpslati": 36.06777697,
            "gpslong": 128.3445837
        },
        {
            "nodeid": "GMB2215",
            "nodenm": "북삼초등학교앞",
            "gpslati": 36.06447212,
            "gpslong": 128.3433998
        },
        {
            "nodeid": "GMB2209",
            "nodenm": "북삼읍지구대",
            "gpslati": 36.06276614,
            "gpslong": 128.34358845
        },
        {
            "nodeid": "GMB2378",
            "nodenm": "북삼역건너",
            "gpslati": 36.05588049,
            "gpslong": 128.3443908
        },
        {
            "nodeid": "GMB2380",
            "nodenm": "율리",
            "gpslati": 36.05159799,
            "gpslong": 128.34498226
        },
        {
            "nodeid": "GMB2200",
            "nodenm": "복성4리건너",
            "gpslati": 36.04523767,
            "gpslong": 128.34618008
        },
        {
            "nodeid": "GMB2346",
            "nodenm": "오성아파트",
            "gpslati": 36.04052135,
            "gpslong": 128.3591641
        },
        {
            "nodeid": "GMB2600",
            "nodenm": "복성4리(옥만리)",
            "gpslati": 36.03879635,
            "gpslong": 128.36141449
        },
        {
            "nodeid": "GMB2643",
            "nodenm": "약목역건너",
            "gpslati": 36.03687889,
            "gpslong": 128.36349469
        },
        {
            "nodeid": "GMB2327",
            "nodenm": "약목",
            "gpslati": 36.0346419,
            "gpslong": 128.36513256
        },
        {
            "nodeid": "GMB2329",
            "nodenm": "약목주유소",
            "gpslati": 36.03152381,
            "gpslong": 128.36761294
        },
        {
            "nodeid": "GMB2169",
            "nodenm": "약목고등학교입구",
            "gpslati": 36.0261493,
            "gpslong": 128.37705042
        },
        {
            "nodeid": "GMB2171",
            "nodenm": "무림2리건너",
            "gpslati": 36.02448958,
            "gpslong": 128.3802131
        },
        {
            "nodeid": "GMB2031",
            "nodenm": "칠곡경찰서건너",
            "gpslati": 36.00938215,
            "gpslong": 128.38743073
        },
        {
            "nodeid": "GMB2232",
            "nodenm": "삼주아파트",
            "gpslati": 36.00283587,
            "gpslong": 128.38950368
        },
        {
            "nodeid": "GMB2356",
            "nodenm": "왜관북부",
            "gpslati": 35.99710661,
            "gpslong": 128.39888731
        },
        {
            "nodeid": "GMB2719",
            "nodenm": "왜관신협(왜관역)",
            "gpslati": 35.99136515,
            "gpslong": 128.39927041
        },
        {
            "nodeid": "GMB2355",
            "nodenm": "왜관남부",
            "gpslati": 35.98907982,
            "gpslong": 128.39974444
        }
    ],
    "GMB1115": [
        {
            "nodeid": "GMB80",
            "nodenm": "구미역",
            "gpslati": 36.12981186,
            "gpslong": 128.32898084
        },
        {
            "nodeid": "GMB167",
            "nodenm": "농협",
            "gpslati": 36.12799177,
            "gpslong": 128.33336917
        },
        {
            "nodeid": "GMB134",
            "nodenm": "금오산사거리",
            "gpslati": 36.12701797,
            "gpslong": 128.33564714
        },
        {
            "nodeid": "GMB901",
            "nodenm": "원평동 행정복지센터 건너",
            "gpslati": 36.12609076,
            "gpslong": 128.33786179
        },
        {
            "nodeid": "GMB138",
            "nodenm": "금오시장 건너",
            "gpslati": 36.12522621,
            "gpslong": 128.33979186
        },
        {
            "nodeid": "GMB476",
            "nodenm": "송원고가밑(터미널네거리방면)",
            "gpslati": 36.12387024,
            "gpslong": 128.34221963
        },
        {
            "nodeid": "GMB803",
            "nodenm": "터미널네거리(오성예식장앞방면)",
            "gpslati": 36.12221647,
            "gpslong": 128.348001
        },
        {
            "nodeid": "GMB91",
            "nodenm": "구미종합터미널앞",
            "gpslati": 36.12261704,
            "gpslong": 128.35105723
        },
        {
            "nodeid": "GMB1002",
            "nodenm": "농협파머스마켓앞",
            "gpslati": 36.12221261,
            "gpslong": 128.35451796
        },
        {
            "nodeid": "GMB532",
            "nodenm": "구미IC네거리(구미경찰서방면)",
            "gpslati": 36.1192019,
            "gpslong": 128.36023751
        },
        {
            "nodeid": "GMB526",
            "nodenm": "구미경찰서건너",
            "gpslati": 36.11635694,
            "gpslong": 128.36269247
        },
        {
            "nodeid": "GMB259",
            "nodenm": "롯데마트건너",
            "gpslati": 36.11386599,
            "gpslong": 128.36338338
        },
        {
            "nodeid": "GMB692",
            "nodenm": "이마트(광평동노인회관방면)",
            "gpslati": 36.10984142,
            "gpslong": 128.36633326
        },
        {
            "nodeid": "GMB49",
            "nodenm": "광평동노인회관",
            "gpslati": 36.10677417,
            "gpslong": 128.36633574
        },
        {
            "nodeid": "GMB50",
            "nodenm": "광평동행정복지센터앞",
            "gpslati": 36.10375733,
            "gpslong": 128.36634827
        },
        {
            "nodeid": "GMB52",
            "nodenm": "광평동푸르지오아파트앞",
            "gpslati": 36.10215374,
            "gpslong": 128.36537335
        },
        {
            "nodeid": "GMB315",
            "nodenm": "보성황실2차아파트정문앞",
            "gpslati": 36.10109819,
            "gpslong": 128.35985496
        },
        {
            "nodeid": "GMB1056",
            "nodenm": "사곡초등학교건너",
            "gpslati": 36.09924049,
            "gpslong": 128.3589394
        },
        {
            "nodeid": "GMB360",
            "nodenm": "사곡동(사곡동새마을방면)",
            "gpslati": 36.09730457,
            "gpslong": 128.35882063
        },
        {
            "nodeid": "GMB362",
            "nodenm": "사곡동새마을(상모초등학교방면)",
            "gpslati": 36.0939735,
            "gpslong": 128.35914164
        },
        {
            "nodeid": "GMB407",
            "nodenm": "상모초등학교",
            "gpslati": 36.0910899,
            "gpslong": 128.35868058
        },
        {
            "nodeid": "GMB398",
            "nodenm": "상모농협앞",
            "gpslati": 36.08859505,
            "gpslong": 128.35850868
        },
        {
            "nodeid": "GMB652",
            "nodenm": "화성파크2단지앞",
            "gpslati": 36.08647096,
            "gpslong": 128.35873502
        },
        {
            "nodeid": "GMB612",
            "nodenm": "오태2동입구건너",
            "gpslati": 36.08285156,
            "gpslong": 128.35735311
        },
        {
            "nodeid": "GMB154",
            "nodenm": "남구미자동차학원건너",
            "gpslati": 36.07928079,
            "gpslong": 128.35353349
        },
        {
            "nodeid": "GMB1099",
            "nodenm": "남구미요양병원건너",
            "gpslati": 36.07799438,
            "gpslong": 128.3521629
        },
        {
            "nodeid": "GMB169",
            "nodenm": "오태늘푸른아파트",
            "gpslati": 36.0717566,
            "gpslong": 128.349346
        },
        {
            "nodeid": "GMB2433",
            "nodenm": "창신아파트건너",
            "gpslati": 36.07044169,
            "gpslong": 128.34787002
        },
        {
            "nodeid": "GMB2213",
            "nodenm": "북삼중학교입구",
            "gpslati": 36.06777697,
            "gpslong": 128.3445837
        },
        {
            "nodeid": "GMB2215",
            "nodenm": "북삼초등학교앞",
            "gpslati": 36.06447212,
            "gpslong": 128.3433998
        },
        {
            "nodeid": "GMB2209",
            "nodenm": "북삼읍지구대",
            "gpslati": 36.06276614,
            "gpslong": 128.34358845
        },
        {
            "nodeid": "GMB2378",
            "nodenm": "북삼역건너",
            "gpslati": 36.05588049,
            "gpslong": 128.3443908
        },
        {
            "nodeid": "GMB2380",
            "nodenm": "율리",
            "gpslati": 36.05159799,
            "gpslong": 128.34498226
        },
        {
            "nodeid": "GMB2200",
            "nodenm": "복성4리건너",
            "gpslati": 36.04523767,
            "gpslong": 128.34618008
        },
        {
            "nodeid": "GMB2346",
            "nodenm": "오성아파트",
            "gpslati": 36.04052135,
            "gpslong": 128.3591641
        },
        {
            "nodeid": "GMB2600",
            "nodenm": "복성4리(옥만리)",
            "gpslati": 36.03879635,
            "gpslong": 128.36141449
        },
        {
            "nodeid": "GMB2643",
            "nodenm": "약목역건너",
            "gpslati": 36.03687889,
            "gpslong": 128.36349469
        },
        {
            "nodeid": "GMB2327",
            "nodenm": "약목",
            "gpslati": 36.0346419,
            "gpslong": 128.36513256
        },
        {
            "nodeid": "GMB2329",
            "nodenm": "약목주유소",
            "gpslati": 36.03152381,
            "gpslong": 128.36761294
        },
        {
            "nodeid": "GMB2169",
            "nodenm": "약목고등학교입구",
            "gpslati": 36.0261493,
            "gpslong": 128.37705042
        },
        {
            "nodeid": "GMB2171",
            "nodenm": "무림2리건너",
            "gpslati": 36.02448958,
            "gpslong": 128.3802131
        },
        {
            "nodeid": "GMB2036",
            "nodenm": "관호초등학교입구",
            "gpslati": 36.02058579,
            "gpslong": 128.38354012
        },
        {
            "nodeid": "GMB2029",
            "nodenm": "관호1리",
            "gpslati": 36.01787139,
            "gpslong": 128.38639203
        },
        {
            "nodeid": "GMB2031",
            "nodenm": "칠곡경찰서건너",
            "gpslati": 36.00938215,
            "gpslong": 128.38743073
        },
        {
            "nodeid": "GMB2232",
            "nodenm": "삼주아파트",
            "gpslati": 36.00283587,
            "gpslong": 128.38950368
        },
        {
            "nodeid": "GMB2356",
            "nodenm": "왜관북부",
            "gpslati": 35.99710661,
            "gpslong": 128.39888731
        },
        {
            "nodeid": "GMB2719",
            "nodenm": "왜관신협(왜관역)",
            "gpslati": 35.99136515,
            "gpslong": 128.39927041
        },
        {
            "nodeid": "GMB2355",
            "nodenm": "왜관남부",
            "gpslati": 35.98907982,
            "gpslong": 128.39974444
        }
    ],
    "GMB1120": [
        {
            "nodeid": "GMB2355",
            "nodenm": "왜관남부",
            "gpslati": 35.98907982,
            "gpslong": 128.39974444
        },
        {
            "nodeid": "GMB2718",
            "nodenm": "왜관역",
            "gpslati": 35.99182563,
            "gpslong": 128.39924408
        },
        {
            "nodeid": "GMB2356",
            "nodenm": "왜관북부",
            "gpslati": 35.99710661,
            "gpslong": 128.39888731
        },
        {
            "nodeid": "GMB2034",
            "nodenm": "관호5거리입구",
            "gpslati": 36.0034848,
            "gpslong": 128.39040009
        },
        {
            "nodeid": "GMB2032",
            "nodenm": "관호3리입구",
            "gpslati": 36.00938215,
            "gpslong": 128.38743073
        },
        {
            "nodeid": "GMB2030",
            "nodenm": "관호2리",
            "gpslati": 36.01803109,
            "gpslong": 128.38707434
        },
        {
            "nodeid": "GMB2035",
            "nodenm": "관호초등학교건너",
            "gpslati": 36.02119296,
            "gpslong": 128.3839761
        },
        {
            "nodeid": "GMB2172",
            "nodenm": "무림2리입구",
            "gpslati": 36.02463823,
            "gpslong": 128.38037057
        },
        {
            "nodeid": "GMB2170",
            "nodenm": "약목고등학교입구건너",
            "gpslati": 36.02700629,
            "gpslong": 128.37653742
        },
        {
            "nodeid": "GMB2330",
            "nodenm": "약목주유소건너",
            "gpslati": 36.03159541,
            "gpslong": 128.36765067
        },
        {
            "nodeid": "GMB2328",
            "nodenm": "약목건너",
            "gpslati": 36.03465341,
            "gpslong": 128.36524049
        },
        {
            "nodeid": "GMB2646",
            "nodenm": "약목역",
            "gpslati": 36.03733212,
            "gpslong": 128.36348496
        },
        {
            "nodeid": "GMB2620",
            "nodenm": "복성4리(옥만이)건너",
            "gpslati": 36.03923314,
            "gpslong": 128.36127762
        },
        {
            "nodeid": "GMB2201",
            "nodenm": "복성4리",
            "gpslati": 36.04520336,
            "gpslong": 128.34695941
        },
        {
            "nodeid": "GMB2381",
            "nodenm": "율리입구",
            "gpslati": 36.05240753,
            "gpslong": 128.34513259
        },
        {
            "nodeid": "GMB2379",
            "nodenm": "북삼역",
            "gpslati": 36.05588704,
            "gpslong": 128.34461938
        },
        {
            "nodeid": "GMB2210",
            "nodenm": "북삼읍지구대건너",
            "gpslati": 36.06241768,
            "gpslong": 128.34371797
        },
        {
            "nodeid": "GMB2216",
            "nodenm": "북삼초등학교맞은편",
            "gpslati": 36.06427861,
            "gpslong": 128.34353094
        },
        {
            "nodeid": "GMB2214",
            "nodenm": "북삼로입구건너",
            "gpslati": 36.06719058,
            "gpslong": 128.34434198
        },
        {
            "nodeid": "GMB2434",
            "nodenm": "창신아파트",
            "gpslati": 36.06979656,
            "gpslong": 128.34750411
        },
        {
            "nodeid": "GMB180",
            "nodenm": "대동아파트",
            "gpslati": 36.07211388,
            "gpslong": 128.35011339
        },
        {
            "nodeid": "GMB1100",
            "nodenm": "남구미요양병원",
            "gpslati": 36.07770357,
            "gpslong": 128.35223011
        },
        {
            "nodeid": "GMB155",
            "nodenm": "남구미자동차학원앞",
            "gpslati": 36.07943601,
            "gpslong": 128.35406787
        },
        {
            "nodeid": "GMB611",
            "nodenm": "오태2동입구",
            "gpslati": 36.08188687,
            "gpslong": 128.35668182
        },
        {
            "nodeid": "GMB653",
            "nodenm": "화성파크2단지건너",
            "gpslati": 36.08656144,
            "gpslong": 128.35882998
        },
        {
            "nodeid": "GMB399",
            "nodenm": "상모농협건너",
            "gpslati": 36.08867669,
            "gpslong": 128.35860412
        },
        {
            "nodeid": "GMB406",
            "nodenm": "상모중학교",
            "gpslati": 36.09104993,
            "gpslong": 128.3588175
        },
        {
            "nodeid": "GMB363",
            "nodenm": "사곡동새마을(사곡동방면)",
            "gpslati": 36.09418973,
            "gpslong": 128.35913786
        },
        {
            "nodeid": "GMB361",
            "nodenm": "사곡동(보성황실2차아파트방면)",
            "gpslati": 36.09687599,
            "gpslong": 128.35889068
        },
        {
            "nodeid": "GMB1055",
            "nodenm": "사곡초등학교",
            "gpslati": 36.09935005,
            "gpslong": 128.35904853
        },
        {
            "nodeid": "GMB314",
            "nodenm": "보성황실2차아파트(홈플러스정문방면)",
            "gpslati": 36.1016221,
            "gpslong": 128.35919888
        },
        {
            "nodeid": "GMB53",
            "nodenm": "광평동푸르지오아파트건너",
            "gpslati": 36.10196731,
            "gpslong": 128.36509755
        },
        {
            "nodeid": "GMB416",
            "nodenm": "새한단지앞(직물협업단지방면)",
            "gpslati": 36.10199831,
            "gpslong": 128.37275493
        },
        {
            "nodeid": "GMB770",
            "nodenm": "직물협업단지(순천향병원방면)",
            "gpslati": 36.10200273,
            "gpslong": 128.37776473
        },
        {
            "nodeid": "GMB489",
            "nodenm": "순천향병원건너",
            "gpslati": 36.10195469,
            "gpslong": 128.38263617
        },
        {
            "nodeid": "GMB316",
            "nodenm": "복지상가건너",
            "gpslati": 36.10315375,
            "gpslong": 128.38543869
        },
        {
            "nodeid": "GMB807",
            "nodenm": "평생교육원건너",
            "gpslati": 36.10629841,
            "gpslong": 128.38541153
        },
        {
            "nodeid": "GMB74",
            "nodenm": "구미세무서앞",
            "gpslati": 36.11102995,
            "gpslong": 128.38342465
        },
        {
            "nodeid": "GMB46",
            "nodenm": "공단본부앞",
            "gpslati": 36.11103985,
            "gpslong": 128.37865195
        },
        {
            "nodeid": "GMB831",
            "nodenm": "LG유니참앞",
            "gpslati": 36.1110117,
            "gpslong": 128.37449979
        },
        {
            "nodeid": "GMB795",
            "nodenm": "KEC정문",
            "gpslati": 36.11099983,
            "gpslong": 128.36984393
        },
        {
            "nodeid": "GMB260",
            "nodenm": "롯데마트앞",
            "gpslati": 36.11347676,
            "gpslong": 128.36390967
        },
        {
            "nodeid": "GMB527",
            "nodenm": "구미경찰서",
            "gpslati": 36.11633944,
            "gpslong": 128.36311796
        },
        {
            "nodeid": "GMB531",
            "nodenm": "구미IC네거리(구미종합터미널건너방면)",
            "gpslati": 36.11954476,
            "gpslong": 128.36040301
        },
        {
            "nodeid": "GMB89",
            "nodenm": "구미종합터미널건너",
            "gpslati": 36.12257533,
            "gpslong": 128.35084245
        },
        {
            "nodeid": "GMB804",
            "nodenm": "터미널네거리(송원고가밑방면)",
            "gpslati": 36.12241555,
            "gpslong": 128.34771196
        },
        {
            "nodeid": "GMB477",
            "nodenm": "송원고가밑(구미역방면)",
            "gpslati": 36.12337863,
            "gpslong": 128.34396054
        },
        {
            "nodeid": "GMB657",
            "nodenm": "금오시장 입구",
            "gpslati": 36.1247954,
            "gpslong": 128.34080857
        },
        {
            "nodeid": "GMB137",
            "nodenm": "원평동 행정복지 센터 앞",
            "gpslati": 36.12575045,
            "gpslong": 128.33897172
        },
        {
            "nodeid": "GMB177",
            "nodenm": "대구은행앞",
            "gpslati": 36.12724834,
            "gpslong": 128.33543344
        },
        {
            "nodeid": "GMB119",
            "nodenm": "구미역 전(국민은행)",
            "gpslati": 36.12862459,
            "gpslong": 128.33216386
        },
        {
            "nodeid": "GMB79",
            "nodenm": "구미역(중앙시장)",
            "gpslati": 36.12962208,
            "gpslong": 128.32973239
        }
    ],
    "GMB1121": [
        {
            "nodeid": "GMB2355",
            "nodenm": "왜관남부",
            "gpslati": 35.98907982,
            "gpslong": 128.39974444
        },
        {
            "nodeid": "GMB2718",
            "nodenm": "왜관역",
            "gpslati": 35.99182563,
            "gpslong": 128.39924408
        },
        {
            "nodeid": "GMB2356",
            "nodenm": "왜관북부",
            "gpslati": 35.99710661,
            "gpslong": 128.39888731
        },
        {
            "nodeid": "GMB2034",
            "nodenm": "관호5거리입구",
            "gpslati": 36.0034848,
            "gpslong": 128.39040009
        },
        {
            "nodeid": "GMB2032",
            "nodenm": "관호3리입구",
            "gpslati": 36.00938215,
            "gpslong": 128.38743073
        },
        {
            "nodeid": "GMB2030",
            "nodenm": "관호2리",
            "gpslati": 36.01803109,
            "gpslong": 128.38707434
        },
        {
            "nodeid": "GMB2035",
            "nodenm": "관호초등학교건너",
            "gpslati": 36.02119296,
            "gpslong": 128.3839761
        },
        {
            "nodeid": "GMB2172",
            "nodenm": "무림2리입구",
            "gpslati": 36.02463823,
            "gpslong": 128.38037057
        },
        {
            "nodeid": "GMB2170",
            "nodenm": "약목고등학교입구건너",
            "gpslati": 36.02700629,
            "gpslong": 128.37653742
        },
        {
            "nodeid": "GMB2330",
            "nodenm": "약목주유소건너",
            "gpslati": 36.03159541,
            "gpslong": 128.36765067
        },
        {
            "nodeid": "GMB2328",
            "nodenm": "약목건너",
            "gpslati": 36.03465341,
            "gpslong": 128.36524049
        },
        {
            "nodeid": "GMB2646",
            "nodenm": "약목역",
            "gpslati": 36.03733212,
            "gpslong": 128.36348496
        },
        {
            "nodeid": "GMB2620",
            "nodenm": "복성4리(옥만이)건너",
            "gpslati": 36.03923314,
            "gpslong": 128.36127762
        },
        {
            "nodeid": "GMB2201",
            "nodenm": "복성4리",
            "gpslati": 36.04520336,
            "gpslong": 128.34695941
        },
        {
            "nodeid": "GMB2381",
            "nodenm": "율리입구",
            "gpslati": 36.05240753,
            "gpslong": 128.34513259
        },
        {
            "nodeid": "GMB2379",
            "nodenm": "북삼역",
            "gpslati": 36.05588704,
            "gpslong": 128.34461938
        },
        {
            "nodeid": "GMB2210",
            "nodenm": "북삼읍지구대건너",
            "gpslati": 36.06241768,
            "gpslong": 128.34371797
        },
        {
            "nodeid": "GMB2216",
            "nodenm": "북삼초등학교맞은편",
            "gpslati": 36.06427861,
            "gpslong": 128.34353094
        },
        {
            "nodeid": "GMB2734",
            "nodenm": "북삼서희스타힐스아파트",
            "gpslati": 36.06767218,
            "gpslong": 128.33728237
        },
        {
            "nodeid": "GMB2095",
            "nodenm": "동부늘푸른타운아파트",
            "gpslati": 36.07053306,
            "gpslong": 128.33756835
        },
        {
            "nodeid": "GMB2114",
            "nodenm": "인평공원 앞",
            "gpslati": 36.07227677,
            "gpslong": 128.34195498
        },
        {
            "nodeid": "GMB2212",
            "nodenm": "북삼중학교",
            "gpslati": 36.07127176,
            "gpslong": 128.34333004
        },
        {
            "nodeid": "GMB2434",
            "nodenm": "창신아파트",
            "gpslati": 36.06979656,
            "gpslong": 128.34750411
        },
        {
            "nodeid": "GMB180",
            "nodenm": "대동아파트",
            "gpslati": 36.07211388,
            "gpslong": 128.35011339
        },
        {
            "nodeid": "GMB1100",
            "nodenm": "남구미요양병원",
            "gpslati": 36.07770357,
            "gpslong": 128.35223011
        },
        {
            "nodeid": "GMB155",
            "nodenm": "남구미자동차학원앞",
            "gpslati": 36.07943601,
            "gpslong": 128.35406787
        },
        {
            "nodeid": "GMB611",
            "nodenm": "오태2동입구",
            "gpslati": 36.08188687,
            "gpslong": 128.35668182
        },
        {
            "nodeid": "GMB653",
            "nodenm": "화성파크2단지건너",
            "gpslati": 36.08656144,
            "gpslong": 128.35882998
        },
        {
            "nodeid": "GMB399",
            "nodenm": "상모농협건너",
            "gpslati": 36.08867669,
            "gpslong": 128.35860412
        },
        {
            "nodeid": "GMB406",
            "nodenm": "상모중학교",
            "gpslati": 36.09104993,
            "gpslong": 128.3588175
        },
        {
            "nodeid": "GMB363",
            "nodenm": "사곡동새마을(사곡동방면)",
            "gpslati": 36.09418973,
            "gpslong": 128.35913786
        },
        {
            "nodeid": "GMB361",
            "nodenm": "사곡동(보성황실2차아파트방면)",
            "gpslati": 36.09687599,
            "gpslong": 128.35889068
        },
        {
            "nodeid": "GMB1055",
            "nodenm": "사곡초등학교",
            "gpslati": 36.09935005,
            "gpslong": 128.35904853
        },
        {
            "nodeid": "GMB314",
            "nodenm": "보성황실2차아파트(홈플러스정문방면)",
            "gpslati": 36.1016221,
            "gpslong": 128.35919888
        },
        {
            "nodeid": "GMB53",
            "nodenm": "광평동푸르지오아파트건너",
            "gpslati": 36.10196731,
            "gpslong": 128.36509755
        },
        {
            "nodeid": "GMB416",
            "nodenm": "새한단지앞(직물협업단지방면)",
            "gpslati": 36.10199831,
            "gpslong": 128.37275493
        },
        {
            "nodeid": "GMB770",
            "nodenm": "직물협업단지(순천향병원방면)",
            "gpslati": 36.10200273,
            "gpslong": 128.37776473
        },
        {
            "nodeid": "GMB489",
            "nodenm": "순천향병원건너",
            "gpslati": 36.10195469,
            "gpslong": 128.38263617
        },
        {
            "nodeid": "GMB316",
            "nodenm": "복지상가건너",
            "gpslati": 36.10315375,
            "gpslong": 128.38543869
        },
        {
            "nodeid": "GMB807",
            "nodenm": "평생교육원건너",
            "gpslati": 36.10629841,
            "gpslong": 128.38541153
        },
        {
            "nodeid": "GMB74",
            "nodenm": "구미세무서앞",
            "gpslati": 36.11102995,
            "gpslong": 128.38342465
        },
        {
            "nodeid": "GMB46",
            "nodenm": "공단본부앞",
            "gpslati": 36.11103985,
            "gpslong": 128.37865195
        },
        {
            "nodeid": "GMB831",
            "nodenm": "LG유니참앞",
            "gpslati": 36.1110117,
            "gpslong": 128.37449979
        },
        {
            "nodeid": "GMB795",
            "nodenm": "KEC정문",
            "gpslati": 36.11099983,
            "gpslong": 128.36984393
        },
        {
            "nodeid": "GMB260",
            "nodenm": "롯데마트앞",
            "gpslati": 36.11347676,
            "gpslong": 128.36390967
        },
        {
            "nodeid": "GMB527",
            "nodenm": "구미경찰서",
            "gpslati": 36.11633944,
            "gpslong": 128.36311796
        },
        {
            "nodeid": "GMB531",
            "nodenm": "구미IC네거리(구미종합터미널건너방면)",
            "gpslati": 36.11954476,
            "gpslong": 128.36040301
        },
        {
            "nodeid": "GMB89",
            "nodenm": "구미종합터미널건너",
            "gpslati": 36.12257533,
            "gpslong": 128.35084245
        },
        {
            "nodeid": "GMB804",
            "nodenm": "터미널네거리(송원고가밑방면)",
            "gpslati": 36.12241555,
            "gpslong": 128.34771196
        },
        {
            "nodeid": "GMB477",
            "nodenm": "송원고가밑(구미역방면)",
            "gpslati": 36.12337863,
            "gpslong": 128.34396054
        },
        {
            "nodeid": "GMB657",
            "nodenm": "금오시장 입구",
            "gpslati": 36.1247954,
            "gpslong": 128.34080857
        },
        {
            "nodeid": "GMB137",
            "nodenm": "원평동 행정복지 센터 앞",
            "gpslati": 36.12575045,
            "gpslong": 128.33897172
        },
        {
            "nodeid": "GMB177",
            "nodenm": "대구은행앞",
            "gpslati": 36.12724834,
            "gpslong": 128.33543344
        },
        {
            "nodeid": "GMB119",
            "nodenm": "구미역 전(국민은행)",
            "gpslati": 36.12862459,
            "gpslong": 128.33216386
        },
        {
            "nodeid": "GMB79",
            "nodenm": "구미역(중앙시장)",
            "gpslati": 36.12962208,
            "gpslong": 128.32973239
        }
    ],
    "GMB11110": [
        {
            "nodeid": "GMB80",
            "nodenm": "구미역",
            "gpslati": 36.12981186,
            "gpslong": 128.32898084
        },
        {
            "nodeid": "GMB167",
            "nodenm": "농협",
            "gpslati": 36.12799177,
            "gpslong": 128.33336917
        },
        {
            "nodeid": "GMB134",
            "nodenm": "금오산사거리",
            "gpslati": 36.12701797,
            "gpslong": 128.33564714
        },
        {
            "nodeid": "GMB901",
            "nodenm": "원평동 행정복지센터 건너",
            "gpslati": 36.12609076,
            "gpslong": 128.33786179
        },
        {
            "nodeid": "GMB138",
            "nodenm": "금오시장 건너",
            "gpslati": 36.12522621,
            "gpslong": 128.33979186
        },
        {
            "nodeid": "GMB476",
            "nodenm": "송원고가밑(터미널네거리방면)",
            "gpslati": 36.12387024,
            "gpslong": 128.34221963
        },
        {
            "nodeid": "GMB803",
            "nodenm": "터미널네거리(오성예식장앞방면)",
            "gpslati": 36.12221647,
            "gpslong": 128.348001
        },
        {
            "nodeid": "GMB91",
            "nodenm": "구미종합터미널앞",
            "gpslati": 36.12261704,
            "gpslong": 128.35105723
        },
        {
            "nodeid": "GMB1002",
            "nodenm": "농협파머스마켓앞",
            "gpslati": 36.12221261,
            "gpslong": 128.35451796
        },
        {
            "nodeid": "GMB532",
            "nodenm": "구미IC네거리(구미경찰서방면)",
            "gpslati": 36.1192019,
            "gpslong": 128.36023751
        },
        {
            "nodeid": "GMB526",
            "nodenm": "구미경찰서건너",
            "gpslati": 36.11635694,
            "gpslong": 128.36269247
        },
        {
            "nodeid": "GMB259",
            "nodenm": "롯데마트건너",
            "gpslati": 36.11386599,
            "gpslong": 128.36338338
        },
        {
            "nodeid": "GMB796",
            "nodenm": "코오롱",
            "gpslati": 36.11077982,
            "gpslong": 128.36990757
        },
        {
            "nodeid": "GMB47",
            "nodenm": "공단본부건너",
            "gpslati": 36.1108184,
            "gpslong": 128.37699092
        },
        {
            "nodeid": "GMB75",
            "nodenm": "구미세무서건너",
            "gpslati": 36.11081041,
            "gpslong": 128.38319878
        },
        {
            "nodeid": "GMB808",
            "nodenm": "평생교육원앞",
            "gpslati": 36.10597731,
            "gpslong": 128.38523684
        },
        {
            "nodeid": "GMB317",
            "nodenm": "복지상가앞",
            "gpslati": 36.10359282,
            "gpslong": 128.38525653
        },
        {
            "nodeid": "GMB490",
            "nodenm": "순천향병원앞",
            "gpslati": 36.10221962,
            "gpslong": 128.38248635
        },
        {
            "nodeid": "GMB769",
            "nodenm": "직물협업단지(태광산업방면)",
            "gpslati": 36.1021553,
            "gpslong": 128.37803428
        },
        {
            "nodeid": "GMB415",
            "nodenm": "새한단지앞(광평동푸르지오아파트방면)",
            "gpslati": 36.10215111,
            "gpslong": 128.37298763
        },
        {
            "nodeid": "GMB52",
            "nodenm": "광평동푸르지오아파트앞",
            "gpslati": 36.10215374,
            "gpslong": 128.36537335
        },
        {
            "nodeid": "GMB315",
            "nodenm": "보성황실2차아파트정문앞",
            "gpslati": 36.10109819,
            "gpslong": 128.35985496
        },
        {
            "nodeid": "GMB1056",
            "nodenm": "사곡초등학교건너",
            "gpslati": 36.09924049,
            "gpslong": 128.3589394
        },
        {
            "nodeid": "GMB360",
            "nodenm": "사곡동(사곡동새마을방면)",
            "gpslati": 36.09730457,
            "gpslong": 128.35882063
        },
        {
            "nodeid": "GMB362",
            "nodenm": "사곡동새마을(상모초등학교방면)",
            "gpslati": 36.0939735,
            "gpslong": 128.35914164
        },
        {
            "nodeid": "GMB407",
            "nodenm": "상모초등학교",
            "gpslati": 36.0910899,
            "gpslong": 128.35868058
        },
        {
            "nodeid": "GMB398",
            "nodenm": "상모농협앞",
            "gpslati": 36.08859505,
            "gpslong": 128.35850868
        },
        {
            "nodeid": "GMB652",
            "nodenm": "화성파크2단지앞",
            "gpslati": 36.08647096,
            "gpslong": 128.35873502
        },
        {
            "nodeid": "GMB612",
            "nodenm": "오태2동입구건너",
            "gpslati": 36.08285156,
            "gpslong": 128.35735311
        },
        {
            "nodeid": "GMB154",
            "nodenm": "남구미자동차학원건너",
            "gpslati": 36.07928079,
            "gpslong": 128.35353349
        },
        {
            "nodeid": "GMB1099",
            "nodenm": "남구미요양병원건너",
            "gpslati": 36.07799438,
            "gpslong": 128.3521629
        },
        {
            "nodeid": "GMB169",
            "nodenm": "오태늘푸른아파트",
            "gpslati": 36.0717566,
            "gpslong": 128.349346
        },
        {
            "nodeid": "GMB2433",
            "nodenm": "창신아파트건너",
            "gpslati": 36.07044169,
            "gpslong": 128.34787002
        },
        {
            "nodeid": "GMB2213",
            "nodenm": "북삼중학교입구",
            "gpslati": 36.06777697,
            "gpslong": 128.3445837
        },
        {
            "nodeid": "GMB2215",
            "nodenm": "북삼초등학교앞",
            "gpslati": 36.06447212,
            "gpslong": 128.3433998
        },
        {
            "nodeid": "GMB2209",
            "nodenm": "북삼읍지구대",
            "gpslati": 36.06276614,
            "gpslong": 128.34358845
        },
        {
            "nodeid": "GMB2378",
            "nodenm": "북삼역건너",
            "gpslati": 36.05588049,
            "gpslong": 128.3443908
        },
        {
            "nodeid": "GMB2380",
            "nodenm": "율리",
            "gpslati": 36.05159799,
            "gpslong": 128.34498226
        },
        {
            "nodeid": "GMB2200",
            "nodenm": "복성4리건너",
            "gpslati": 36.04523767,
            "gpslong": 128.34618008
        },
        {
            "nodeid": "GMB2346",
            "nodenm": "오성아파트",
            "gpslati": 36.04052135,
            "gpslong": 128.3591641
        },
        {
            "nodeid": "GMB2600",
            "nodenm": "복성4리(옥만리)",
            "gpslati": 36.03879635,
            "gpslong": 128.36141449
        },
        {
            "nodeid": "GMB2643",
            "nodenm": "약목역건너",
            "gpslati": 36.03687889,
            "gpslong": 128.36349469
        },
        {
            "nodeid": "GMB2327",
            "nodenm": "약목",
            "gpslati": 36.0346419,
            "gpslong": 128.36513256
        },
        {
            "nodeid": "GMB2329",
            "nodenm": "약목주유소",
            "gpslati": 36.03152381,
            "gpslong": 128.36761294
        },
        {
            "nodeid": "GMB2169",
            "nodenm": "약목고등학교입구",
            "gpslati": 36.0261493,
            "gpslong": 128.37705042
        },
        {
            "nodeid": "GMB2171",
            "nodenm": "무림2리건너",
            "gpslati": 36.02448958,
            "gpslong": 128.3802131
        },
        {
            "nodeid": "GMB2036",
            "nodenm": "관호초등학교입구",
            "gpslati": 36.02058579,
            "gpslong": 128.38354012
        },
        {
            "nodeid": "GMB2029",
            "nodenm": "관호1리",
            "gpslati": 36.01787139,
            "gpslong": 128.38639203
        },
        {
            "nodeid": "GMB2031",
            "nodenm": "칠곡경찰서건너",
            "gpslati": 36.00938215,
            "gpslong": 128.38743073
        },
        {
            "nodeid": "GMB2033",
            "nodenm": "관호5거리",
            "gpslati": 36.00367486,
            "gpslong": 128.38979594
        },
        {
            "nodeid": "GMB2356",
            "nodenm": "왜관북부",
            "gpslati": 35.99710661,
            "gpslong": 128.39888731
        },
        {
            "nodeid": "GMB2719",
            "nodenm": "왜관신협(왜관역)",
            "gpslati": 35.99136515,
            "gpslong": 128.39927041
        },
        {
            "nodeid": "GMB2355",
            "nodenm": "왜관남부",
            "gpslati": 35.98907982,
            "gpslong": 128.39974444
        }
    ],
    "GMB11120": [
        {
            "nodeid": "GMB2355",
            "nodenm": "왜관남부",
            "gpslati": 35.98907982,
            "gpslong": 128.39974444
        },
        {
            "nodeid": "GMB2718",
            "nodenm": "왜관역",
            "gpslati": 35.99182563,
            "gpslong": 128.39924408
        },
        {
            "nodeid": "GMB2356",
            "nodenm": "왜관북부",
            "gpslati": 35.99710661,
            "gpslong": 128.39888731
        },
        {
            "nodeid": "GMB2034",
            "nodenm": "관호5거리입구",
            "gpslati": 36.0034848,
            "gpslong": 128.39040009
        },
        {
            "nodeid": "GMB2032",
            "nodenm": "관호3리입구",
            "gpslati": 36.00938215,
            "gpslong": 128.38743073
        },
        {
            "nodeid": "GMB2030",
            "nodenm": "관호2리",
            "gpslati": 36.01803109,
            "gpslong": 128.38707434
        },
        {
            "nodeid": "GMB2035",
            "nodenm": "관호초등학교건너",
            "gpslati": 36.02119296,
            "gpslong": 128.3839761
        },
        {
            "nodeid": "GMB2172",
            "nodenm": "무림2리입구",
            "gpslati": 36.02463823,
            "gpslong": 128.38037057
        },
        {
            "nodeid": "GMB2170",
            "nodenm": "약목고등학교입구건너",
            "gpslati": 36.02700629,
            "gpslong": 128.37653742
        },
        {
            "nodeid": "GMB2330",
            "nodenm": "약목주유소건너",
            "gpslati": 36.03159541,
            "gpslong": 128.36765067
        },
        {
            "nodeid": "GMB2328",
            "nodenm": "약목건너",
            "gpslati": 36.03465341,
            "gpslong": 128.36524049
        },
        {
            "nodeid": "GMB2646",
            "nodenm": "약목역",
            "gpslati": 36.03733212,
            "gpslong": 128.36348496
        },
        {
            "nodeid": "GMB2620",
            "nodenm": "복성4리(옥만이)건너",
            "gpslati": 36.03923314,
            "gpslong": 128.36127762
        },
        {
            "nodeid": "GMB2201",
            "nodenm": "복성4리",
            "gpslati": 36.04520336,
            "gpslong": 128.34695941
        },
        {
            "nodeid": "GMB2381",
            "nodenm": "율리입구",
            "gpslati": 36.05240753,
            "gpslong": 128.34513259
        },
        {
            "nodeid": "GMB2379",
            "nodenm": "북삼역",
            "gpslati": 36.05588704,
            "gpslong": 128.34461938
        },
        {
            "nodeid": "GMB2210",
            "nodenm": "북삼읍지구대건너",
            "gpslati": 36.06241768,
            "gpslong": 128.34371797
        },
        {
            "nodeid": "GMB2216",
            "nodenm": "북삼초등학교맞은편",
            "gpslati": 36.06427861,
            "gpslong": 128.34353094
        },
        {
            "nodeid": "GMB2214",
            "nodenm": "북삼로입구건너",
            "gpslati": 36.06719058,
            "gpslong": 128.34434198
        },
        {
            "nodeid": "GMB2434",
            "nodenm": "창신아파트",
            "gpslati": 36.06979656,
            "gpslong": 128.34750411
        },
        {
            "nodeid": "GMB180",
            "nodenm": "대동아파트",
            "gpslati": 36.07211388,
            "gpslong": 128.35011339
        },
        {
            "nodeid": "GMB1100",
            "nodenm": "남구미요양병원",
            "gpslati": 36.07770357,
            "gpslong": 128.35223011
        },
        {
            "nodeid": "GMB155",
            "nodenm": "남구미자동차학원앞",
            "gpslati": 36.07943601,
            "gpslong": 128.35406787
        },
        {
            "nodeid": "GMB611",
            "nodenm": "오태2동입구",
            "gpslati": 36.08188687,
            "gpslong": 128.35668182
        },
        {
            "nodeid": "GMB653",
            "nodenm": "화성파크2단지건너",
            "gpslati": 36.08656144,
            "gpslong": 128.35882998
        },
        {
            "nodeid": "GMB399",
            "nodenm": "상모농협건너",
            "gpslati": 36.08867669,
            "gpslong": 128.35860412
        },
        {
            "nodeid": "GMB406",
            "nodenm": "상모중학교",
            "gpslati": 36.09104993,
            "gpslong": 128.3588175
        },
        {
            "nodeid": "GMB363",
            "nodenm": "사곡동새마을(사곡동방면)",
            "gpslati": 36.09418973,
            "gpslong": 128.35913786
        },
        {
            "nodeid": "GMB361",
            "nodenm": "사곡동(보성황실2차아파트방면)",
            "gpslati": 36.09687599,
            "gpslong": 128.35889068
        },
        {
            "nodeid": "GMB1055",
            "nodenm": "사곡초등학교",
            "gpslati": 36.09935005,
            "gpslong": 128.35904853
        },
        {
            "nodeid": "GMB314",
            "nodenm": "보성황실2차아파트(홈플러스정문방면)",
            "gpslati": 36.1016221,
            "gpslong": 128.35919888
        },
        {
            "nodeid": "GMB53",
            "nodenm": "광평동푸르지오아파트건너",
            "gpslati": 36.10196731,
            "gpslong": 128.36509755
        },
        {
            "nodeid": "GMB416",
            "nodenm": "새한단지앞(직물협업단지방면)",
            "gpslati": 36.10199831,
            "gpslong": 128.37275493
        },
        {
            "nodeid": "GMB770",
            "nodenm": "직물협업단지(순천향병원방면)",
            "gpslati": 36.10200273,
            "gpslong": 128.37776473
        },
        {
            "nodeid": "GMB489",
            "nodenm": "순천향병원건너",
            "gpslati": 36.10195469,
            "gpslong": 128.38263617
        },
        {
            "nodeid": "GMB316",
            "nodenm": "복지상가건너",
            "gpslati": 36.10315375,
            "gpslong": 128.38543869
        },
        {
            "nodeid": "GMB807",
            "nodenm": "평생교육원건너",
            "gpslati": 36.10629841,
            "gpslong": 128.38541153
        },
        {
            "nodeid": "GMB74",
            "nodenm": "구미세무서앞",
            "gpslati": 36.11102995,
            "gpslong": 128.38342465
        },
        {
            "nodeid": "GMB46",
            "nodenm": "공단본부앞",
            "gpslati": 36.11103985,
            "gpslong": 128.37865195
        },
        {
            "nodeid": "GMB831",
            "nodenm": "LG유니참앞",
            "gpslati": 36.1110117,
            "gpslong": 128.37449979
        },
        {
            "nodeid": "GMB795",
            "nodenm": "KEC정문",
            "gpslati": 36.11099983,
            "gpslong": 128.36984393
        },
        {
            "nodeid": "GMB260",
            "nodenm": "롯데마트앞",
            "gpslati": 36.11347676,
            "gpslong": 128.36390967
        },
        {
            "nodeid": "GMB527",
            "nodenm": "구미경찰서",
            "gpslati": 36.11633944,
            "gpslong": 128.36311796
        },
        {
            "nodeid": "GMB531",
            "nodenm": "구미IC네거리(구미종합터미널건너방면)",
            "gpslati": 36.11954476,
            "gpslong": 128.36040301
        },
        {
            "nodeid": "GMB89",
            "nodenm": "구미종합터미널건너",
            "gpslati": 36.12257533,
            "gpslong": 128.35084245
        },
        {
            "nodeid": "GMB804",
            "nodenm": "터미널네거리(송원고가밑방면)",
            "gpslati": 36.12241555,
            "gpslong": 128.34771196
        },
        {
            "nodeid": "GMB477",
            "nodenm": "송원고가밑(구미역방면)",
            "gpslati": 36.12337863,
            "gpslong": 128.34396054
        },
        {
            "nodeid": "GMB657",
            "nodenm": "금오시장 입구",
            "gpslati": 36.1247954,
            "gpslong": 128.34080857
        },
        {
            "nodeid": "GMB137",
            "nodenm": "원평동 행정복지 센터 앞",
            "gpslati": 36.12575045,
            "gpslong": 128.33897172
        },
        {
            "nodeid": "GMB177",
            "nodenm": "대구은행앞",
            "gpslati": 36.12724834,
            "gpslong": 128.33543344
        },
        {
            "nodeid": "GMB119",
            "nodenm": "구미역 전(국민은행)",
            "gpslati": 36.12862459,
            "gpslong": 128.33216386
        },
        {
            "nodeid": "GMB79",
            "nodenm": "구미역(중앙시장)",
            "gpslati": 36.12962208,
            "gpslong": 128.32973239
        }
    ],
    "GMB17012": [
        {
            "nodeid": "GMB435",
            "nodenm": "선산터미널종점",
            "gpslati": 36.239564,
            "gpslong": 128.30429
        },
        {
            "nodeid": "GMB36",
            "nodenm": "고아에덴아파트건너",
            "gpslati": 36.22503642,
            "gpslong": 128.31031329
        },
        {
            "nodeid": "GMB596",
            "nodenm": "오로리새마을(오로리방면)",
            "gpslati": 36.21960776,
            "gpslong": 128.31365521
        },
        {
            "nodeid": "GMB594",
            "nodenm": "오로리(오로삼거리방면)",
            "gpslati": 36.21713099,
            "gpslong": 128.31531249
        },
        {
            "nodeid": "GMB544",
            "nodenm": "오로삼거리",
            "gpslati": 36.21443205,
            "gpslong": 128.32033239
        },
        {
            "nodeid": "GMB30",
            "nodenm": "고아농공단지건너",
            "gpslati": 36.21266788,
            "gpslong": 128.32487217
        },
        {
            "nodeid": "GMB38",
            "nodenm": "고아읍행정복지센터건너",
            "gpslati": 36.21133826,
            "gpslong": 128.32680723
        },
        {
            "nodeid": "GMB40",
            "nodenm": "고아정류장",
            "gpslati": 36.20888545,
            "gpslong": 128.32951612
        },
        {
            "nodeid": "GMB575",
            "nodenm": "예강1리(고아119안전센터앞)",
            "gpslati": 36.19973755,
            "gpslong": 128.33976846
        },
        {
            "nodeid": "GMB841",
            "nodenm": "항곡현일중고등학교건너",
            "gpslati": 36.18837296,
            "gpslong": 128.3477717
        },
        {
            "nodeid": "GMB337",
            "nodenm": "봉한2리(봉한1리방면)",
            "gpslati": 36.18121556,
            "gpslong": 128.35082661
        },
        {
            "nodeid": "GMB335",
            "nodenm": "봉한1리(낙동강부대앞방면)",
            "gpslati": 36.17806241,
            "gpslong": 128.35199597
        },
        {
            "nodeid": "GMB32",
            "nodenm": "낙동강부대앞",
            "gpslati": 36.16946911,
            "gpslong": 128.35426103
        },
        {
            "nodeid": "GMB468",
            "nodenm": "송림네거리(문성3리방면)",
            "gpslati": 36.16327269,
            "gpslong": 128.35353105
        },
        {
            "nodeid": "GMB286",
            "nodenm": "문성3리(농산물도매시장방면)",
            "gpslati": 36.16091185,
            "gpslong": 128.35294592
        },
        {
            "nodeid": "GMB163",
            "nodenm": "농산물도매시장앞",
            "gpslati": 36.1563131,
            "gpslong": 128.35186579
        },
        {
            "nodeid": "GMB288",
            "nodenm": "문성새마을(지산2동방면)",
            "gpslati": 36.15016001,
            "gpslong": 128.34967133
        },
        {
            "nodeid": "GMB761",
            "nodenm": "지산2동(지산새마을금고방면)",
            "gpslati": 36.14631747,
            "gpslong": 128.34814781
        },
        {
            "nodeid": "GMB765",
            "nodenm": "지산새마을금고앞",
            "gpslati": 36.14458492,
            "gpslong": 128.34755304
        },
        {
            "nodeid": "GMB139",
            "nodenm": "구미제일고앞",
            "gpslati": 36.1418934,
            "gpslong": 128.34663298
        },
        {
            "nodeid": "GMB763",
            "nodenm": "지산동행정복지센터앞",
            "gpslati": 36.13855508,
            "gpslong": 128.34601895
        },
        {
            "nodeid": "GMB767",
            "nodenm": "지산수우입구(지산1동방면)",
            "gpslati": 36.13543748,
            "gpslong": 128.34529988
        },
        {
            "nodeid": "GMB760",
            "nodenm": "지산1동(원평1동방면)",
            "gpslati": 36.13335978,
            "gpslong": 128.34439442
        },
        {
            "nodeid": "GMB669",
            "nodenm": "원평동(대구은행앞방면)",
            "gpslati": 36.12796287,
            "gpslong": 128.33752912
        },
        {
            "nodeid": "GMB177",
            "nodenm": "대구은행앞",
            "gpslati": 36.12724834,
            "gpslong": 128.33543344
        },
        {
            "nodeid": "GMB119",
            "nodenm": "구미역 전(국민은행)",
            "gpslati": 36.12862459,
            "gpslong": 128.33216386
        },
        {
            "nodeid": "GMB79",
            "nodenm": "구미역(중앙시장)",
            "gpslati": 36.12962208,
            "gpslong": 128.32973239
        }
    ],
    "GMB17022": [
        {
            "nodeid": "GMB82",
            "nodenm": "구미역(선산노선정류장)",
            "gpslati": 36.12958513,
            "gpslong": 128.32952259
        },
        {
            "nodeid": "GMB167",
            "nodenm": "농협",
            "gpslati": 36.12799177,
            "gpslong": 128.33336917
        },
        {
            "nodeid": "GMB670",
            "nodenm": "원평동(지산1동방면)",
            "gpslati": 36.12785903,
            "gpslong": 128.33767914
        },
        {
            "nodeid": "GMB759",
            "nodenm": "지산1동(지산수우입구방면)",
            "gpslati": 36.13292572,
            "gpslong": 128.34498492
        },
        {
            "nodeid": "GMB768",
            "nodenm": "지산수우입구(지산동행정복지센터방면)",
            "gpslati": 36.13615309,
            "gpslong": 128.34576421
        },
        {
            "nodeid": "GMB764",
            "nodenm": "지산동행정복지센터건너",
            "gpslati": 36.13864427,
            "gpslong": 128.34634528
        },
        {
            "nodeid": "GMB140",
            "nodenm": "구미제일고건너",
            "gpslati": 36.14118119,
            "gpslong": 128.34681679
        },
        {
            "nodeid": "GMB766",
            "nodenm": "지산새마을금고건너",
            "gpslati": 36.14388204,
            "gpslong": 128.34759833
        },
        {
            "nodeid": "GMB762",
            "nodenm": "지산2동(문성새마을방면)",
            "gpslati": 36.14578123,
            "gpslong": 128.34826875
        },
        {
            "nodeid": "GMB289",
            "nodenm": "문성새마을(농산물도매시장방면)",
            "gpslati": 36.15003664,
            "gpslong": 128.34992788
        },
        {
            "nodeid": "GMB164",
            "nodenm": "농산물도매시장건너",
            "gpslati": 36.15642388,
            "gpslong": 128.35223246
        },
        {
            "nodeid": "GMB287",
            "nodenm": "문성3리(낙동강부대건너방면)",
            "gpslati": 36.16127021,
            "gpslong": 128.35338553
        },
        {
            "nodeid": "GMB33",
            "nodenm": "낙동강부대건너",
            "gpslati": 36.16929597,
            "gpslong": 128.35463244
        },
        {
            "nodeid": "GMB336",
            "nodenm": "봉한1리(봉한2리방면)",
            "gpslati": 36.17848831,
            "gpslong": 128.35218031
        },
        {
            "nodeid": "GMB338",
            "nodenm": "봉한2리(항곡현일중고등학교앞방면)",
            "gpslati": 36.18257734,
            "gpslong": 128.35054534
        },
        {
            "nodeid": "GMB842",
            "nodenm": "항곡현일중고등학교앞",
            "gpslati": 36.18855141,
            "gpslong": 128.34798396
        },
        {
            "nodeid": "GMB576",
            "nodenm": "예강1리(고아119안전센터건너)",
            "gpslati": 36.20034845,
            "gpslong": 128.33914534
        },
        {
            "nodeid": "GMB41",
            "nodenm": "고아읍행정복지센터앞",
            "gpslati": 36.20990718,
            "gpslong": 128.32917712
        },
        {
            "nodeid": "GMB39",
            "nodenm": "고아초등학교앞",
            "gpslati": 36.21149047,
            "gpslong": 128.3269902
        },
        {
            "nodeid": "GMB31",
            "nodenm": "고아농공단지앞",
            "gpslati": 36.21327273,
            "gpslong": 128.32427327
        },
        {
            "nodeid": "GMB545",
            "nodenm": "오로삼거리",
            "gpslati": 36.21454344,
            "gpslong": 128.32074639
        },
        {
            "nodeid": "GMB595",
            "nodenm": "오로리(오로리새마을방면)",
            "gpslati": 36.21745579,
            "gpslong": 128.31536123
        },
        {
            "nodeid": "GMB597",
            "nodenm": "오로리새마을(고아에덴아파트방면)",
            "gpslati": 36.21969595,
            "gpslong": 128.31386657
        },
        {
            "nodeid": "GMB37",
            "nodenm": "고아에덴아파트앞",
            "gpslati": 36.22493041,
            "gpslong": 128.31078157
        },
        {
            "nodeid": "GMB435",
            "nodenm": "선산터미널종점",
            "gpslati": 36.239564,
            "gpslong": 128.30429
        }
    ],
    "GMB17110": [
        {
            "nodeid": "GMB82",
            "nodenm": "구미역(선산노선정류장)",
            "gpslati": 36.12958513,
            "gpslong": 128.32952259
        },
        {
            "nodeid": "GMB167",
            "nodenm": "농협",
            "gpslati": 36.12799177,
            "gpslong": 128.33336917
        },
        {
            "nodeid": "GMB134",
            "nodenm": "금오산사거리",
            "gpslati": 36.12701797,
            "gpslong": 128.33564714
        },
        {
            "nodeid": "GMB814",
            "nodenm": "푸르지오캐슬B단지",
            "gpslati": 36.12461998,
            "gpslong": 128.33623357
        },
        {
            "nodeid": "GMB794",
            "nodenm": "가톨릭근로자문화센터",
            "gpslati": 36.12317589,
            "gpslong": 128.33802178
        },
        {
            "nodeid": "GMB348",
            "nodenm": "형곡금호어울림앞",
            "gpslati": 36.11942608,
            "gpslong": 128.33845046
        },
        {
            "nodeid": "GMB854",
            "nodenm": "형곡4거리",
            "gpslati": 36.11641799,
            "gpslong": 128.33991856
        },
        {
            "nodeid": "GMB499",
            "nodenm": "시청정문건너",
            "gpslati": 36.11766432,
            "gpslong": 128.34372499
        },
        {
            "nodeid": "GMB251",
            "nodenm": "동아백화점앞",
            "gpslati": 36.12000033,
            "gpslong": 128.34848817
        },
        {
            "nodeid": "GMB91",
            "nodenm": "구미종합터미널앞",
            "gpslati": 36.12261704,
            "gpslong": 128.35105723
        },
        {
            "nodeid": "GMB27",
            "nodenm": "송원고가입구삼거리(지산1동방면)",
            "gpslati": 36.12641889,
            "gpslong": 128.34547327
        },
        {
            "nodeid": "GMB759",
            "nodenm": "지산1동(지산수우입구방면)",
            "gpslati": 36.13292572,
            "gpslong": 128.34498492
        },
        {
            "nodeid": "GMB768",
            "nodenm": "지산수우입구(지산동행정복지센터방면)",
            "gpslati": 36.13615309,
            "gpslong": 128.34576421
        },
        {
            "nodeid": "GMB764",
            "nodenm": "지산동행정복지센터건너",
            "gpslati": 36.13864427,
            "gpslong": 128.34634528
        },
        {
            "nodeid": "GMB140",
            "nodenm": "구미제일고건너",
            "gpslati": 36.14118119,
            "gpslong": 128.34681679
        },
        {
            "nodeid": "GMB766",
            "nodenm": "지산새마을금고건너",
            "gpslati": 36.14388204,
            "gpslong": 128.34759833
        },
        {
            "nodeid": "GMB762",
            "nodenm": "지산2동(문성새마을방면)",
            "gpslati": 36.14578123,
            "gpslong": 128.34826875
        },
        {
            "nodeid": "GMB289",
            "nodenm": "문성새마을(농산물도매시장방면)",
            "gpslati": 36.15003664,
            "gpslong": 128.34992788
        },
        {
            "nodeid": "GMB164",
            "nodenm": "농산물도매시장건너",
            "gpslati": 36.15642388,
            "gpslong": 128.35223246
        },
        {
            "nodeid": "GMB287",
            "nodenm": "문성3리(낙동강부대건너방면)",
            "gpslati": 36.16127021,
            "gpslong": 128.35338553
        },
        {
            "nodeid": "GMB33",
            "nodenm": "낙동강부대건너",
            "gpslati": 36.16929597,
            "gpslong": 128.35463244
        },
        {
            "nodeid": "GMB336",
            "nodenm": "봉한1리(봉한2리방면)",
            "gpslati": 36.17848831,
            "gpslong": 128.35218031
        },
        {
            "nodeid": "GMB338",
            "nodenm": "봉한2리(항곡현일중고등학교앞방면)",
            "gpslati": 36.18257734,
            "gpslong": 128.35054534
        },
        {
            "nodeid": "GMB842",
            "nodenm": "항곡현일중고등학교앞",
            "gpslati": 36.18855141,
            "gpslong": 128.34798396
        },
        {
            "nodeid": "GMB576",
            "nodenm": "예강1리(고아119안전센터건너)",
            "gpslati": 36.20034845,
            "gpslong": 128.33914534
        },
        {
            "nodeid": "GMB41",
            "nodenm": "고아읍행정복지센터앞",
            "gpslati": 36.20990718,
            "gpslong": 128.32917712
        },
        {
            "nodeid": "GMB39",
            "nodenm": "고아초등학교앞",
            "gpslati": 36.21149047,
            "gpslong": 128.3269902
        },
        {
            "nodeid": "GMB31",
            "nodenm": "고아농공단지앞",
            "gpslati": 36.21327273,
            "gpslong": 128.32427327
        },
        {
            "nodeid": "GMB545",
            "nodenm": "오로삼거리",
            "gpslati": 36.21454344,
            "gpslong": 128.32074639
        },
        {
            "nodeid": "GMB595",
            "nodenm": "오로리(오로리새마을방면)",
            "gpslati": 36.21745579,
            "gpslong": 128.31536123
        },
        {
            "nodeid": "GMB597",
            "nodenm": "오로리새마을(고아에덴아파트방면)",
            "gpslati": 36.21969595,
            "gpslong": 128.31386657
        },
        {
            "nodeid": "GMB37",
            "nodenm": "고아에덴아파트앞",
            "gpslati": 36.22493041,
            "gpslong": 128.31078157
        },
        {
            "nodeid": "GMB435",
            "nodenm": "선산터미널종점",
            "gpslati": 36.239564,
            "gpslong": 128.30429
        }
    ],
    "GMB17120": [
        {
            "nodeid": "GMB435",
            "nodenm": "선산터미널종점",
            "gpslati": 36.239564,
            "gpslong": 128.30429
        },
        {
            "nodeid": "GMB36",
            "nodenm": "고아에덴아파트건너",
            "gpslati": 36.22503642,
            "gpslong": 128.31031329
        },
        {
            "nodeid": "GMB596",
            "nodenm": "오로리새마을(오로리방면)",
            "gpslati": 36.21960776,
            "gpslong": 128.31365521
        },
        {
            "nodeid": "GMB594",
            "nodenm": "오로리(오로삼거리방면)",
            "gpslati": 36.21713099,
            "gpslong": 128.31531249
        },
        {
            "nodeid": "GMB544",
            "nodenm": "오로삼거리",
            "gpslati": 36.21443205,
            "gpslong": 128.32033239
        },
        {
            "nodeid": "GMB30",
            "nodenm": "고아농공단지건너",
            "gpslati": 36.21266788,
            "gpslong": 128.32487217
        },
        {
            "nodeid": "GMB38",
            "nodenm": "고아읍행정복지센터건너",
            "gpslati": 36.21133826,
            "gpslong": 128.32680723
        },
        {
            "nodeid": "GMB40",
            "nodenm": "고아정류장",
            "gpslati": 36.20888545,
            "gpslong": 128.32951612
        },
        {
            "nodeid": "GMB575",
            "nodenm": "예강1리(고아119안전센터앞)",
            "gpslati": 36.19973755,
            "gpslong": 128.33976846
        },
        {
            "nodeid": "GMB841",
            "nodenm": "항곡현일중고등학교건너",
            "gpslati": 36.18837296,
            "gpslong": 128.3477717
        },
        {
            "nodeid": "GMB337",
            "nodenm": "봉한2리(봉한1리방면)",
            "gpslati": 36.18121556,
            "gpslong": 128.35082661
        },
        {
            "nodeid": "GMB335",
            "nodenm": "봉한1리(낙동강부대앞방면)",
            "gpslati": 36.17806241,
            "gpslong": 128.35199597
        },
        {
            "nodeid": "GMB32",
            "nodenm": "낙동강부대앞",
            "gpslati": 36.16946911,
            "gpslong": 128.35426103
        },
        {
            "nodeid": "GMB468",
            "nodenm": "송림네거리(문성3리방면)",
            "gpslati": 36.16327269,
            "gpslong": 128.35353105
        },
        {
            "nodeid": "GMB286",
            "nodenm": "문성3리(농산물도매시장방면)",
            "gpslati": 36.16091185,
            "gpslong": 128.35294592
        },
        {
            "nodeid": "GMB163",
            "nodenm": "농산물도매시장앞",
            "gpslati": 36.1563131,
            "gpslong": 128.35186579
        },
        {
            "nodeid": "GMB288",
            "nodenm": "문성새마을(지산2동방면)",
            "gpslati": 36.15016001,
            "gpslong": 128.34967133
        },
        {
            "nodeid": "GMB761",
            "nodenm": "지산2동(지산새마을금고방면)",
            "gpslati": 36.14631747,
            "gpslong": 128.34814781
        },
        {
            "nodeid": "GMB765",
            "nodenm": "지산새마을금고앞",
            "gpslati": 36.14458492,
            "gpslong": 128.34755304
        },
        {
            "nodeid": "GMB139",
            "nodenm": "구미제일고앞",
            "gpslati": 36.1418934,
            "gpslong": 128.34663298
        },
        {
            "nodeid": "GMB763",
            "nodenm": "지산동행정복지센터앞",
            "gpslati": 36.13855508,
            "gpslong": 128.34601895
        },
        {
            "nodeid": "GMB767",
            "nodenm": "지산수우입구(지산1동방면)",
            "gpslati": 36.13543748,
            "gpslong": 128.34529988
        },
        {
            "nodeid": "GMB760",
            "nodenm": "지산1동(원평1동방면)",
            "gpslati": 36.13335978,
            "gpslong": 128.34439442
        },
        {
            "nodeid": "GMB141",
            "nodenm": "원평119안전센터",
            "gpslati": 36.12877408,
            "gpslong": 128.34078357
        },
        {
            "nodeid": "GMB28",
            "nodenm": "송원고가입구삼거리(구미종합터미널방면)",
            "gpslati": 36.1270635,
            "gpslong": 128.34383383
        },
        {
            "nodeid": "GMB89",
            "nodenm": "구미종합터미널건너",
            "gpslati": 36.12257533,
            "gpslong": 128.35084245
        },
        {
            "nodeid": "GMB250",
            "nodenm": "교촌통닭1호점",
            "gpslati": 36.12011386,
            "gpslong": 128.34838091
        },
        {
            "nodeid": "GMB498",
            "nodenm": "시청정문앞",
            "gpslati": 36.11813461,
            "gpslong": 128.34515437
        },
        {
            "nodeid": "GMB480",
            "nodenm": "송정동이구빌라",
            "gpslati": 36.11717075,
            "gpslong": 128.34081235
        },
        {
            "nodeid": "GMB349",
            "nodenm": "형곡금호어울림건너",
            "gpslati": 36.1195303,
            "gpslong": 128.33869235
        },
        {
            "nodeid": "GMB813",
            "nodenm": "푸르지오캐슬A단지",
            "gpslati": 36.12387004,
            "gpslong": 128.33750581
        },
        {
            "nodeid": "GMB177",
            "nodenm": "대구은행앞",
            "gpslati": 36.12724834,
            "gpslong": 128.33543344
        },
        {
            "nodeid": "GMB119",
            "nodenm": "구미역 전(국민은행)",
            "gpslati": 36.12862459,
            "gpslong": 128.33216386
        },
        {
            "nodeid": "GMB79",
            "nodenm": "구미역(중앙시장)",
            "gpslati": 36.12962208,
            "gpslong": 128.32973239
        }
    ],
    "GMB7230": [
        {
            "nodeid": "GMB435",
            "nodenm": "선산터미널종점",
            "gpslati": 36.239564,
            "gpslong": 128.30429
        },
        {
            "nodeid": "GMB427",
            "nodenm": "선산문화회관삼거리(선산행복센터방면)",
            "gpslati": 36.24328201,
            "gpslong": 128.30410326
        },
        {
            "nodeid": "GMB432",
            "nodenm": "선산읍행정복지센터",
            "gpslati": 36.24252165,
            "gpslong": 128.29820431
        },
        {
            "nodeid": "GMB694",
            "nodenm": "이문네거리",
            "gpslati": 36.24051506,
            "gpslong": 128.29606292
        },
        {
            "nodeid": "GMB430",
            "nodenm": "선산중학교앞",
            "gpslati": 36.23992556,
            "gpslong": 128.29358764
        },
        {
            "nodeid": "GMB1142",
            "nodenm": "죽장1리마을회관",
            "gpslati": 36.24057875,
            "gpslong": 128.28179612
        },
        {
            "nodeid": "GMB1141",
            "nodenm": "죽장2리",
            "gpslati": 36.24169004,
            "gpslong": 128.2771181
        },
        {
            "nodeid": "GMB929",
            "nodenm": "죽장리마을회관(죽장2리방면)",
            "gpslati": 36.2424002,
            "gpslong": 128.27226419
        },
        {
            "nodeid": "GMB754",
            "nodenm": "죽장2리(봉곡방면)",
            "gpslati": 36.24419023,
            "gpslong": 128.26885423
        },
        {
            "nodeid": "GMB1145",
            "nodenm": "봉곡",
            "gpslati": 36.2472303,
            "gpslong": 128.26297885
        },
        {
            "nodeid": "GMB319",
            "nodenm": "봉곡(덕촌1리방면)",
            "gpslati": 36.24842293,
            "gpslong": 128.26074758
        },
        {
            "nodeid": "GMB1246",
            "nodenm": "덕촌1리마을회관건너",
            "gpslati": 36.255993,
            "gpslong": 128.251287
        },
        {
            "nodeid": "GMB1206",
            "nodenm": "덕촌2리",
            "gpslati": 36.26439598,
            "gpslong": 128.25319852
        },
        {
            "nodeid": "GMB200",
            "nodenm": "덕촌2리(선산휴게소밑방면)",
            "gpslati": 36.26945107,
            "gpslong": 128.25135876
        },
        {
            "nodeid": "GMB1217",
            "nodenm": "선산휴게소",
            "gpslati": 36.27393132,
            "gpslong": 128.24898865
        },
        {
            "nodeid": "GMB437",
            "nodenm": "선산휴게소밑(대원방면)",
            "gpslati": 36.27545246,
            "gpslong": 128.24749834
        },
        {
            "nodeid": "GMB1202",
            "nodenm": "대원(산호야관광농원 건너)",
            "gpslati": 36.27929794,
            "gpslong": 128.24377505
        },
        {
            "nodeid": "GMB194",
            "nodenm": "대원(태봉1리방면)",
            "gpslati": 36.28343905,
            "gpslong": 128.23546321
        },
        {
            "nodeid": "GMB800",
            "nodenm": "태봉1리(태봉리방면)",
            "gpslati": 36.28491826,
            "gpslong": 128.23298242
        },
        {
            "nodeid": "GMB802",
            "nodenm": "태봉리(산촌마을입구방면)",
            "gpslati": 36.29153802,
            "gpslong": 128.22981403
        },
        {
            "nodeid": "GMB377",
            "nodenm": "산촌마을입구(신오리석거실방면)",
            "gpslati": 36.30415744,
            "gpslong": 128.21741552
        },
        {
            "nodeid": "GMB518",
            "nodenm": "신오리 석거실(산촌리방면)",
            "gpslati": 36.30344355,
            "gpslong": 128.22749489
        },
        {
            "nodeid": "GMB375",
            "nodenm": "산촌리(옥관2리방면)",
            "gpslati": 36.30565362,
            "gpslong": 128.2413337
        },
        {
            "nodeid": "GMB374",
            "nodenm": "산촌리(신오리석거실방면)",
            "gpslati": 36.30573888,
            "gpslong": 128.24140062
        },
        {
            "nodeid": "GMB517",
            "nodenm": "신오리 석거실(산촌마을입구방면)",
            "gpslati": 36.30350822,
            "gpslong": 128.22754901
        },
        {
            "nodeid": "GMB376",
            "nodenm": "산촌마을입구(태봉리방면)",
            "gpslati": 36.30409873,
            "gpslong": 128.21738778
        },
        {
            "nodeid": "GMB801",
            "nodenm": "태봉리(태봉1리방면)",
            "gpslati": 36.29148507,
            "gpslong": 128.22975611
        },
        {
            "nodeid": "GMB799",
            "nodenm": "태봉1리(대원방면)",
            "gpslati": 36.28486854,
            "gpslong": 128.23293868
        },
        {
            "nodeid": "GMB192",
            "nodenm": "대원(선산휴게소밑방면)",
            "gpslati": 36.28321702,
            "gpslong": 128.23574513
        },
        {
            "nodeid": "GMB193",
            "nodenm": "대원(선산휴게소밑방면)",
            "gpslati": 36.28045974,
            "gpslong": 128.24228146
        },
        {
            "nodeid": "GMB1201",
            "nodenm": "대원(산호야관광농원 앞)",
            "gpslati": 36.27933272,
            "gpslong": 128.24363563
        },
        {
            "nodeid": "GMB436",
            "nodenm": "선산휴게소밑(대원2리방면)",
            "gpslati": 36.27553359,
            "gpslong": 128.24739985
        },
        {
            "nodeid": "GMB1205",
            "nodenm": "덕촌초등학교",
            "gpslati": 36.26414306,
            "gpslong": 128.25311614
        },
        {
            "nodeid": "GMB1245",
            "nodenm": "덕촌1리마을회관앞",
            "gpslati": 36.255982,
            "gpslong": 128.251155
        },
        {
            "nodeid": "GMB318",
            "nodenm": "봉곡(죽장2리방면)",
            "gpslati": 36.24798143,
            "gpslong": 128.2610061
        },
        {
            "nodeid": "GMB1139",
            "nodenm": "봉곡",
            "gpslati": 36.2470923,
            "gpslong": 128.26279842
        },
        {
            "nodeid": "GMB753",
            "nodenm": "죽장2리(죽장리마을회관방면)",
            "gpslati": 36.24406426,
            "gpslong": 128.26895865
        },
        {
            "nodeid": "GMB928",
            "nodenm": "죽장리마을회관(선산터미널종점방면)",
            "gpslati": 36.2421202,
            "gpslong": 128.27303542
        },
        {
            "nodeid": "GMB1140",
            "nodenm": "죽장2리",
            "gpslati": 36.24159873,
            "gpslong": 128.27713596
        },
        {
            "nodeid": "GMB1143",
            "nodenm": "죽장1리마을회관건너",
            "gpslati": 36.24036311,
            "gpslong": 128.28188987
        },
        {
            "nodeid": "GMB429",
            "nodenm": "선산중학교건너",
            "gpslati": 36.2398047,
            "gpslong": 128.29317851
        },
        {
            "nodeid": "GMB431",
            "nodenm": "선산읍행정복지센터건너",
            "gpslati": 36.24252172,
            "gpslong": 128.29867165
        },
        {
            "nodeid": "GMB425",
            "nodenm": "선산문화회관삼거리(선산터미널종점방면)",
            "gpslati": 36.24323155,
            "gpslong": 128.30436427
        },
        {
            "nodeid": "GMB435",
            "nodenm": "선산터미널종점",
            "gpslati": 36.239564,
            "gpslong": 128.30429
        }
    ],
    "GMB96010": [
        {
            "nodeid": "GMB80",
            "nodenm": "구미역",
            "gpslati": 36.12981186,
            "gpslong": 128.32898084
        },
        {
            "nodeid": "GMB167",
            "nodenm": "농협",
            "gpslati": 36.12799177,
            "gpslong": 128.33336917
        },
        {
            "nodeid": "GMB134",
            "nodenm": "금오산사거리",
            "gpslati": 36.12701797,
            "gpslong": 128.33564714
        },
        {
            "nodeid": "GMB814",
            "nodenm": "푸르지오캐슬B단지",
            "gpslati": 36.12461998,
            "gpslong": 128.33623357
        },
        {
            "nodeid": "GMB794",
            "nodenm": "가톨릭근로자문화센터",
            "gpslati": 36.12317589,
            "gpslong": 128.33802178
        },
        {
            "nodeid": "GMB348",
            "nodenm": "형곡금호어울림앞",
            "gpslati": 36.11942608,
            "gpslong": 128.33845046
        },
        {
            "nodeid": "GMB1019",
            "nodenm": "형곡네거리",
            "gpslati": 36.1167724,
            "gpslong": 128.338849
        },
        {
            "nodeid": "GMB1236",
            "nodenm": "새마을로입구(사곡방면)",
            "gpslati": 36.11170851,
            "gpslong": 128.3400464
        },
        {
            "nodeid": "GMB414",
            "nodenm": "새마을로(사곡전원리빙필방면)",
            "gpslati": 36.10671164,
            "gpslong": 128.35077819
        },
        {
            "nodeid": "GMB1156",
            "nodenm": "e편한세상 금오파크정문",
            "gpslati": 36.10519488,
            "gpslong": 128.3539641
        },
        {
            "nodeid": "GMB1183",
            "nodenm": "이편한세상 금오파크후문",
            "gpslati": 36.10228177,
            "gpslong": 128.35547807
        },
        {
            "nodeid": "GMB358",
            "nodenm": "사곡고등학교앞",
            "gpslati": 36.09607632,
            "gpslong": 128.35318146
        },
        {
            "nodeid": "GMB1122",
            "nodenm": "새마을운동테마공원",
            "gpslati": 36.09130358,
            "gpslong": 128.35109776
        },
        {
            "nodeid": "GMB302",
            "nodenm": "박정희대통령생가앞",
            "gpslati": 36.0880919,
            "gpslong": 128.35014378
        },
        {
            "nodeid": "GMB395",
            "nodenm": "상모고등학교건너",
            "gpslati": 36.08380366,
            "gpslong": 128.3511033
        },
        {
            "nodeid": "GMB397",
            "nodenm": "상모정수도서관앞",
            "gpslati": 36.08673229,
            "gpslong": 128.35551539
        },
        {
            "nodeid": "GMB405",
            "nodenm": "상모동(상모중학교방면)",
            "gpslati": 36.08826925,
            "gpslong": 128.3553544
        },
        {
            "nodeid": "GMB401",
            "nodenm": "상모동신인터빌앞",
            "gpslati": 36.09159555,
            "gpslong": 128.35544366
        },
        {
            "nodeid": "GMB364",
            "nodenm": "사곡보성1차",
            "gpslati": 36.09382041,
            "gpslong": 128.3556281
        },
        {
            "nodeid": "GMB1229",
            "nodenm": "사곡역",
            "gpslati": 36.09855029,
            "gpslong": 128.35796099
        },
        {
            "nodeid": "GMB1055",
            "nodenm": "사곡초등학교",
            "gpslati": 36.09935005,
            "gpslong": 128.35904853
        },
        {
            "nodeid": "GMB314",
            "nodenm": "보성황실2차아파트(홈플러스정문방면)",
            "gpslati": 36.1016221,
            "gpslong": 128.35919888
        },
        {
            "nodeid": "GMB53",
            "nodenm": "광평동푸르지오아파트건너",
            "gpslati": 36.10196731,
            "gpslong": 128.36509755
        },
        {
            "nodeid": "GMB416",
            "nodenm": "새한단지앞(직물협업단지방면)",
            "gpslati": 36.10199831,
            "gpslong": 128.37275493
        },
        {
            "nodeid": "GMB770",
            "nodenm": "직물협업단지(순천향병원방면)",
            "gpslati": 36.10200273,
            "gpslong": 128.37776473
        },
        {
            "nodeid": "GMB489",
            "nodenm": "순천향병원건너",
            "gpslati": 36.10195469,
            "gpslong": 128.38263617
        },
        {
            "nodeid": "GMB316",
            "nodenm": "복지상가건너",
            "gpslati": 36.10315375,
            "gpslong": 128.38543869
        },
        {
            "nodeid": "GMB807",
            "nodenm": "평생교육원건너",
            "gpslati": 36.10629841,
            "gpslong": 128.38541153
        },
        {
            "nodeid": "GMB1191",
            "nodenm": "세무서네거리",
            "gpslati": 36.112059,
            "gpslong": 128.38550481
        },
        {
            "nodeid": "GMB161",
            "nodenm": "LIG넥스원앞",
            "gpslati": 36.11577892,
            "gpslong": 128.38557116
        },
        {
            "nodeid": "GMB563",
            "nodenm": "엘지연수원건너",
            "gpslati": 36.12109098,
            "gpslong": 128.38566795
        },
        {
            "nodeid": "GMB552",
            "nodenm": "양호동빈수골(금오공대입구방면)",
            "gpslati": 36.12901578,
            "gpslong": 128.39159795
        },
        {
            "nodeid": "GMB130",
            "nodenm": "금오공대입구(금오공대종점방면)",
            "gpslati": 36.13955491,
            "gpslong": 128.39695246
        },
        {
            "nodeid": "GMB132",
            "nodenm": "금오공대종점",
            "gpslati": 36.14313118,
            "gpslong": 128.39444061
        },
        {
            "nodeid": "GMB131",
            "nodenm": "금오공대입구(옥계중학교방면)",
            "gpslati": 36.13949422,
            "gpslong": 128.39671151
        },
        {
            "nodeid": "GMB625",
            "nodenm": "옥계중학교건너",
            "gpslati": 36.13653893,
            "gpslong": 128.41167057
        },
        {
            "nodeid": "GMB619",
            "nodenm": "옥계대우아파트건너",
            "gpslati": 36.13695171,
            "gpslong": 128.41494631
        },
        {
            "nodeid": "GMB5",
            "nodenm": "4공단입구(옥계방면)",
            "gpslati": 36.13784545,
            "gpslong": 128.41772974
        },
        {
            "nodeid": "GMB379",
            "nodenm": "삼구트리니엔건너",
            "gpslati": 36.1383126,
            "gpslong": 128.42099189
        },
        {
            "nodeid": "GMB853",
            "nodenm": "현진아파트건너",
            "gpslati": 36.13811324,
            "gpslong": 128.42573846
        },
        {
            "nodeid": "GMB843",
            "nodenm": "중흥S클래스앞",
            "gpslati": 36.14003058,
            "gpslong": 128.42899088
        },
        {
            "nodeid": "GMB649",
            "nodenm": "우미린아파트",
            "gpslati": 36.14229662,
            "gpslong": 128.42894039
        },
        {
            "nodeid": "GMB979",
            "nodenm": "육일씨엔에스앞",
            "gpslati": 36.14858213,
            "gpslong": 128.4309716
        },
        {
            "nodeid": "GMB510",
            "nodenm": "신당리(신당2리방면)",
            "gpslati": 36.15161971,
            "gpslong": 128.43340431
        },
        {
            "nodeid": "GMB508",
            "nodenm": "골드디움아파트건너",
            "gpslati": 36.15709495,
            "gpslong": 128.4351891
        },
        {
            "nodeid": "GMB1051",
            "nodenm": "우미린센트럴파크건너",
            "gpslati": 36.16029467,
            "gpslong": 128.43478463
        },
        {
            "nodeid": "GMB1052",
            "nodenm": "중흥S클래스에듀포레앞",
            "gpslati": 36.16108189,
            "gpslong": 128.4359829
        },
        {
            "nodeid": "GMB1094",
            "nodenm": "인덕중학교건너",
            "gpslati": 36.16112764,
            "gpslong": 128.43864331
        },
        {
            "nodeid": "GMB1049",
            "nodenm": "인덕중흥S클래스건너",
            "gpslati": 36.16349664,
            "gpslong": 128.44207206
        },
        {
            "nodeid": "GMB1210",
            "nodenm": "인덕리(산동방면)",
            "gpslati": 36.16644307,
            "gpslong": 128.44276823
        },
        {
            "nodeid": "GMB433",
            "nodenm": "선산컨트리클럽(경운대방면)",
            "gpslati": 36.16696436,
            "gpslong": 128.44328694
        },
        {
            "nodeid": "GMB923",
            "nodenm": "송산리츠빌아파트건너(임천리입구방면)",
            "gpslati": 36.16522928,
            "gpslong": 128.45397208
        },
        {
            "nodeid": "GMB732",
            "nodenm": "임천리입구(의우총입구방면)",
            "gpslati": 36.1635006,
            "gpslong": 128.46003294
        },
        {
            "nodeid": "GMB690",
            "nodenm": "의우총입구건너",
            "gpslati": 36.16293236,
            "gpslong": 128.46357035
        },
        {
            "nodeid": "GMB25",
            "nodenm": "경운대학교(구미운전면허센터)입구",
            "gpslati": 36.16239475,
            "gpslong": 128.4666873
        },
        {
            "nodeid": "GMB26",
            "nodenm": "경운대학교(구미운전면허센터)",
            "gpslati": 36.1667957,
            "gpslong": 128.46761744
        }
    ],
    "GMB96020": [
        {
            "nodeid": "GMB26",
            "nodenm": "경운대학교(구미운전면허센터)",
            "gpslati": 36.1667957,
            "gpslong": 128.46761744
        },
        {
            "nodeid": "GMB23",
            "nodenm": "경운대학교(구미운전면허센터)출구",
            "gpslati": 36.16242027,
            "gpslong": 128.46648582
        },
        {
            "nodeid": "GMB691",
            "nodenm": "의우총입구",
            "gpslati": 36.16309085,
            "gpslong": 128.46338498
        },
        {
            "nodeid": "GMB734",
            "nodenm": "임천리입구(송산리츠빌아파트방면)",
            "gpslati": 36.16363384,
            "gpslong": 128.45974407
        },
        {
            "nodeid": "GMB922",
            "nodenm": "송산리츠빌아파트앞(선산컨트리클럽방면)",
            "gpslati": 36.16533538,
            "gpslong": 128.45399747
        },
        {
            "nodeid": "GMB434",
            "nodenm": "선산컨트리클럽(적림리방면)",
            "gpslati": 36.16713008,
            "gpslong": 128.44306933
        },
        {
            "nodeid": "GMB1211",
            "nodenm": "인덕리(확장단지방면)",
            "gpslati": 36.16584463,
            "gpslong": 128.44258628
        },
        {
            "nodeid": "GMB1050",
            "nodenm": "인덕중흥S클래스앞",
            "gpslati": 36.16373638,
            "gpslong": 128.44210137
        },
        {
            "nodeid": "GMB1071",
            "nodenm": "중흥S클래스에코시티",
            "gpslati": 36.16128003,
            "gpslong": 128.43875388
        },
        {
            "nodeid": "GMB1047",
            "nodenm": "우미린풀하우스정문",
            "gpslati": 36.16127232,
            "gpslong": 128.43601843
        },
        {
            "nodeid": "GMB1040",
            "nodenm": "우미린센트럴파크앞",
            "gpslati": 36.16031697,
            "gpslong": 128.43448501
        },
        {
            "nodeid": "GMB507",
            "nodenm": "골드디움아파트",
            "gpslati": 36.15689024,
            "gpslong": 128.43486033
        },
        {
            "nodeid": "GMB509",
            "nodenm": "신당리(옥계우미린아파트건너방면)",
            "gpslati": 36.15180856,
            "gpslong": 128.43317071
        },
        {
            "nodeid": "GMB978",
            "nodenm": "육일씨엔에스건너",
            "gpslati": 36.14870523,
            "gpslong": 128.43067563
        },
        {
            "nodeid": "GMB1159",
            "nodenm": "산동호반베르디움아파트동편",
            "gpslati": 36.14421271,
            "gpslong": 128.42883714
        },
        {
            "nodeid": "GMB1030",
            "nodenm": "중흥S클래스건너",
            "gpslati": 36.13939832,
            "gpslong": 128.42866485
        },
        {
            "nodeid": "GMB852",
            "nodenm": "현진아파트앞",
            "gpslati": 36.13823962,
            "gpslong": 128.42601103
        },
        {
            "nodeid": "GMB378",
            "nodenm": "삼구아파트",
            "gpslati": 36.13844522,
            "gpslong": 128.42078058
        },
        {
            "nodeid": "GMB3",
            "nodenm": "4공단입구건너(인동농협옥계지점)",
            "gpslati": 36.13783282,
            "gpslong": 128.41737268
        },
        {
            "nodeid": "GMB620",
            "nodenm": "옥계대우아파트앞",
            "gpslati": 36.13707774,
            "gpslong": 128.41613278
        },
        {
            "nodeid": "GMB505",
            "nodenm": "신나리아파트",
            "gpslati": 36.13741013,
            "gpslong": 128.41342837
        },
        {
            "nodeid": "GMB626",
            "nodenm": "옥계중학교앞",
            "gpslati": 36.13694748,
            "gpslong": 128.41189134
        },
        {
            "nodeid": "GMB130",
            "nodenm": "금오공대입구(금오공대종점방면)",
            "gpslati": 36.13955491,
            "gpslong": 128.39695246
        },
        {
            "nodeid": "GMB132",
            "nodenm": "금오공대종점",
            "gpslati": 36.14313118,
            "gpslong": 128.39444061
        },
        {
            "nodeid": "GMB131",
            "nodenm": "금오공대입구(옥계중학교방면)",
            "gpslati": 36.13949422,
            "gpslong": 128.39671151
        },
        {
            "nodeid": "GMB1105",
            "nodenm": "일이삼철강 건너",
            "gpslati": 36.13471415,
            "gpslong": 128.39642195
        },
        {
            "nodeid": "GMB553",
            "nodenm": "양호동빈수골(엘지연수원방면)",
            "gpslati": 36.12909225,
            "gpslong": 128.39124472
        },
        {
            "nodeid": "GMB564",
            "nodenm": "엘지연수원앞",
            "gpslati": 36.12118356,
            "gpslong": 128.38549361
        },
        {
            "nodeid": "GMB160",
            "nodenm": "LIG넥스원건너",
            "gpslati": 36.11580114,
            "gpslong": 128.38539542
        },
        {
            "nodeid": "GMB452",
            "nodenm": "세무서4거리",
            "gpslati": 36.11161685,
            "gpslong": 128.3853193
        },
        {
            "nodeid": "GMB808",
            "nodenm": "평생교육원앞",
            "gpslati": 36.10597731,
            "gpslong": 128.38523684
        },
        {
            "nodeid": "GMB317",
            "nodenm": "복지상가앞",
            "gpslati": 36.10359282,
            "gpslong": 128.38525653
        },
        {
            "nodeid": "GMB490",
            "nodenm": "순천향병원앞",
            "gpslati": 36.10221962,
            "gpslong": 128.38248635
        },
        {
            "nodeid": "GMB769",
            "nodenm": "직물협업단지(태광산업방면)",
            "gpslati": 36.1021553,
            "gpslong": 128.37803428
        },
        {
            "nodeid": "GMB415",
            "nodenm": "새한단지앞(광평동푸르지오아파트방면)",
            "gpslati": 36.10215111,
            "gpslong": 128.37298763
        },
        {
            "nodeid": "GMB52",
            "nodenm": "광평동푸르지오아파트앞",
            "gpslati": 36.10215374,
            "gpslong": 128.36537335
        },
        {
            "nodeid": "GMB315",
            "nodenm": "보성황실2차아파트정문앞",
            "gpslati": 36.10109819,
            "gpslong": 128.35985496
        },
        {
            "nodeid": "GMB1056",
            "nodenm": "사곡초등학교건너",
            "gpslati": 36.09924049,
            "gpslong": 128.3589394
        },
        {
            "nodeid": "GMB1231",
            "nodenm": "사곡역",
            "gpslati": 36.09810926,
            "gpslong": 128.35720319
        },
        {
            "nodeid": "GMB403",
            "nodenm": "사곡보성1차건너",
            "gpslati": 36.09379646,
            "gpslong": 128.35547765
        },
        {
            "nodeid": "GMB400",
            "nodenm": "상모동신인터빌건너",
            "gpslati": 36.09159614,
            "gpslong": 128.35529501
        },
        {
            "nodeid": "GMB404",
            "nodenm": "상모동(상모정수도서관건너방면)",
            "gpslati": 36.08897605,
            "gpslong": 128.35512873
        },
        {
            "nodeid": "GMB396",
            "nodenm": "상모정수도서관건너",
            "gpslati": 36.0868706,
            "gpslong": 128.35535283
        },
        {
            "nodeid": "GMB394",
            "nodenm": "상모고등학교앞",
            "gpslati": 36.08388934,
            "gpslong": 128.35135598
        },
        {
            "nodeid": "GMB299",
            "nodenm": "박정희대통령생가건너",
            "gpslati": 36.0879238,
            "gpslong": 128.35038273
        },
        {
            "nodeid": "GMB1158",
            "nodenm": "새마을운동테마공원건너",
            "gpslati": 36.09143623,
            "gpslong": 128.35144203
        },
        {
            "nodeid": "GMB359",
            "nodenm": "사곡고등학교건너",
            "gpslati": 36.09598662,
            "gpslong": 128.35330694
        },
        {
            "nodeid": "GMB1184",
            "nodenm": "이편한세상 금오파크후문건너",
            "gpslati": 36.10221939,
            "gpslong": 128.35574458
        },
        {
            "nodeid": "GMB1157",
            "nodenm": "e편한세상 금오파크정문건너",
            "gpslati": 36.10597023,
            "gpslong": 128.35288708
        },
        {
            "nodeid": "GMB413",
            "nodenm": "새마을로(구미여자상업고방면)",
            "gpslati": 36.10653403,
            "gpslong": 128.35167229
        },
        {
            "nodeid": "GMB1235",
            "nodenm": "새마을로입구(형곡방면)",
            "gpslati": 36.11170877,
            "gpslong": 128.34049235
        },
        {
            "nodeid": "GMB856",
            "nodenm": "형곡4주공네거리(차병원앞방면)",
            "gpslati": 36.11284166,
            "gpslong": 128.33945401
        },
        {
            "nodeid": "GMB349",
            "nodenm": "형곡금호어울림건너",
            "gpslati": 36.1195303,
            "gpslong": 128.33869235
        },
        {
            "nodeid": "GMB813",
            "nodenm": "푸르지오캐슬A단지",
            "gpslati": 36.12387004,
            "gpslong": 128.33750581
        },
        {
            "nodeid": "GMB177",
            "nodenm": "대구은행앞",
            "gpslati": 36.12724834,
            "gpslong": 128.33543344
        },
        {
            "nodeid": "GMB119",
            "nodenm": "구미역 전(국민은행)",
            "gpslati": 36.12862459,
            "gpslong": 128.33216386
        },
        {
            "nodeid": "GMB79",
            "nodenm": "구미역(중앙시장)",
            "gpslati": 36.12962208,
            "gpslong": 128.32973239
        }
    ]
};
