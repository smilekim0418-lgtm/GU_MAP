// ============================================================
// 📁 파일명: js/map/map-click.js
// 📌 역할: 지도 클릭 이벤트 처리 및 건물 중력 스냅핑 엔진
// ============================================================
//
// [파일 설명]
//   사용자가 지도를 클릭했을 때 가장 가까운 건물/POI를 자동 감지하여
//   해당 장소의 이름과 주소를 팝업으로 보여주는 핵심 모듈입니다.
//   - 건물 중력 스냅핑: 클릭 좌표 근처의 VWorld 국가건물통합정보를 조회하여
//     줌 레벨과 건물 중요도(대학, 병원, 역 등)에 따라 가중치를 부여하고
//     가장 적합한 건물로 클릭 좌표를 "끌어당기는" 알고리즘
//   - 우클릭: 해당 위치를 즐겨찾기에 추가하는 팝업 표시
//   - POI 상호명 매칭: VWorld 검색 API로 상가/음식점 등 상호명 자동 탐색
//   - 리버스 지오코딩: 좌표 → 도로명/지번 주소 변환
//
// [의존 관계]
//   - config.js → 프록시 서버 URL(PROXY_URL) 참조
//   - map-utils.js → getIconForName(), cleanDetailedName() 등 유틸 함수 호출
//   - favorites.js → addFavorite() 즐겨찾기 추가 연동
//   - reviews.js → getAverageRating() 평점 표시 연동
//
// [사용된 외부 API]
//   - VWorld Data API (국가건물통합정보 조회)
//   - VWorld Geocoder API (리버스 지오코딩)
//   - VWorld Search API (POI 검색)
// ============================================================

window.selectedLocation = null;
window.clickToken = 0;

window.initMapClickEvents = function() {
    if (!window.map) return;

    // ── 마우스 우클릭: 즐겨찾기 추가 팝업 ──
    window.map.on('contextmenu', function(e) {
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        
        fetch(`${window.PROXY_URL}/vworld-address?service=address&request=getAddress&version=2.0&crs=EPSG:4326&point=${lng},${lat}&format=json&type=both&zipcode=true&simple=false`)
        .then(res => res.json())
        .then(data => {
            var addr = '주소 정보 없음';
            if (data.response && data.response.status === "OK" && data.response.result.length > 0) {
                addr = data.response.result[0].text;
            }
            var popupHtml = `<div style="font-family:'Noto Sans KR',sans-serif; text-align:center; padding:5px;">
                <b style="font-size:14px; color:var(--text-main);">이 위치를 즐겨찾기에 추가</b><br>
                <span style="font-size:11px; color:var(--text-muted);">${addr}</span><br>
                <button onclick="window.addFavorite('사용자 지정 위치', ${lat}, ${lng}, '${addr.replace(/'/g, "\\'")}'); window.map.closePopup();" style="margin-top:8px; padding:6px 12px; background:#92400e; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:700; font-size:12px;">⭐ 즐겨찾기 추가</button>
            </div>`;
            L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(window.map);
        })
        .catch(() => {
            var popupHtml = `<div style="font-family:'Noto Sans KR',sans-serif; text-align:center; padding:5px;">
                <b style="font-size:14px; color:var(--text-main);">이 위치를 즐겨찾기에 추가</b><br>
                <button onclick="window.addFavorite('사용자 지정 위치', ${lat}, ${lng}, ''); window.map.closePopup();" style="margin-top:8px; padding:6px 12px; background:#92400e; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:700; font-size:12px;">⭐ 즐겨찾기 추가</button>
            </div>`;
            L.popup().setLatLng(e.latlng).setContent(popupHtml).openOn(window.map);
        });
    });

    // ── 지도 일반 클릭: 건물 중력 스냅핑 및 POI 조회 ──
    window.map.on('click', function(e) {
        window.clickToken++;
        var currentToken = window.clickToken;
        window.infoWindow = window.infoWindow || L.popup();
        if (window.map.getZoom() < 11) {
            return;
        }
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;

        // 1. 즉각적인 로딩 팝업 표시
        var loadingContent = `
        <div id="click-popup" style="padding:5px; font-size:13px; min-width:200px; font-family:'Noto Sans KR',sans-serif; line-height:1.4;">
            <b id="popup-title" style="font-size:15px; color:var(--text-main); display:block; margin-bottom:4px;">로딩 중...</b>
            <div id="popup-addr" style="font-size:11px; color:var(--text-muted);">위치를 조회하고 있습니다.</div>
        </div>`;
        window.infoWindow.setLatLng([lat, lng]).setContent(loadingContent).openOn(window.map);

        // 2. VWorld 국가건물통합정보(Data API) 조회 (랜드마크 중력 스냅)
        var zoom = window.map.getZoom();
        var buffer = 0.0025; // 약 250m 반경 BOX
        var minLng = lng - buffer;
        var maxLng = lng + buffer;
        var minLat = lat - buffer;
        var maxLat = lat + buffer;

        var vworldDataUrl = `${window.PROXY_URL}/vworld-data?service=data&request=GetFeature&format=json&crs=EPSG:4326&geomFilter=BOX(${minLng},${minLat},${maxLng},${maxLat})&data=lt_c_spbd&domain=${window.location.host}`;

        fetch(vworldDataUrl)
            .then(res => res.json())
            .then(data => {
                if (currentToken !== window.clickToken) return;
                if (data.response && data.response.status === "OK" && data.response.result && data.response.result.featureCollection && data.response.result.featureCollection.features && data.response.result.featureCollection.features.length > 0) {
                    var features = data.response.result.featureCollection.features;
                    
                    var featuresWithDist = [];
                    features.forEach(f => {
                        var center = null;
                        if (f.geometry && f.geometry.coordinates) {
                            var coords = f.geometry.coordinates;
                            var type = f.geometry.type;
                            var sumLat = 0, sumLng = 0, count = 0;
                            
                            if (type === "Point") {
                                sumLng = coords[0];
                                sumLat = coords[1];
                                count = 1;
                            } else if (type === "MultiPoint") {
                                coords.forEach(pt => {
                                    sumLng += pt[0]; sumLat += pt[1]; count++;
                                });
                            } else if (type === "LineString") {
                                coords.forEach(pt => {
                                    sumLng += pt[0]; sumLat += pt[1]; count++;
                                });
                            } else if (type === "MultiLineString") {
                                coords.forEach(line => {
                                    line.forEach(pt => {
                                        sumLng += pt[0]; sumLat += pt[1]; count++;
                                    });
                                });
                            } else if (type === "Polygon") {
                                if (coords[0]) {
                                    coords[0].forEach(pt => {
                                        sumLng += pt[0]; sumLat += pt[1]; count++;
                                    });
                                }
                            } else if (type === "MultiPolygon") {
                                coords.forEach(poly => {
                                    if (poly[0]) {
                                        poly[0].forEach(pt => {
                                            sumLng += pt[0]; sumLat += pt[1]; count++;
                                        });
                                    }
                                });
                            }
                            if (count > 0) {
                                center = { lat: sumLat / count, lng: sumLng / count };
                            }
                        }
                        
                        var dist = center ? Math.sqrt((center.lat - lat) * (center.lat - lat) + (center.lng - lng) * (center.lng - lng)) : Infinity;
                        
                        var bldName = f.properties.buld_nm || "";
                        var bldDong = f.properties.buld_nm_dc || "";
                        
                        if (!bldName) {
                            for (var j = 0; j < features.length; j++) {
                                var otherProps = features[j].properties;
                                if (otherProps.buld_nm && otherProps.rd_nm === f.properties.rd_nm && otherProps.buld_no === f.properties.buld_no) {
                                    bldName = otherProps.buld_nm;
                                    break;
                                }
                            }
                            if (!bldName) {
                                for (var j = 0; j < features.length; j++) {
                                    var otherProps = features[j].properties;
                                    if (otherProps.buld_nm && otherProps.rd_nm === f.properties.rd_nm) {
                                        var isComplex = otherProps.buld_nm.includes("아파트") || otherProps.buld_nm.includes("빌라") || otherProps.buld_nm.includes("맨션") || otherProps.buld_nm.includes("타운") || otherProps.buld_nm.includes("캐슬");
                                        if (isComplex) {
                                            bldName = otherProps.buld_nm;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        var icon = window.getIconForName(bldName || bldDong);
                        
                        var limit = 0.0008; // 기본 일반건물 중력 (80m)
                        var weight = 1.0;
                        
                        var isMajorT1 = bldName.includes("시청") || bldName.includes("도청") || bldName.includes("구청") ||
                            (bldName.includes("역") && !bldName.includes("역삼") && !bldName.includes("역세권") && (bldName.endsWith("역") || bldName.includes("역사") || bldName.includes("구미역"))) ||
                            bldName.includes("터미널") || bldName.includes("KTX") ||
                            bldName.includes("종합병원") || bldName.includes("대학병원") || bldName.includes("차병원") || bldName.includes("순천향") || bldName.includes("의료원") ||
                            bldName.includes("대학교") || bldName.includes("대학") || bldName.includes("캠퍼스") ||
                            bldName.includes("도서관") || bldName.includes("예술회관") || bldName.includes("문화회관") || bldName.includes("박물관") || bldName.includes("미술관") ||
                            bldName.includes("종합운동장") || bldName.includes("체육관") || bldName.includes("수목원") ||
                            bldName.includes("공원");
                        
                        var isMediumT2 = !isMajorT1 && (
                            bldName.includes("의원") || bldName.includes("치과") || bldName.includes("한의원") || bldName.includes("약국") || bldName.includes("보건소") || bldName.includes("클리닉") ||
                            bldName.includes("주민센터") || bldName.includes("행정복지센터") || bldName.includes("읍사무소") || bldName.includes("면사무소") ||
                            bldName.includes("경찰서") || bldName.includes("소방서") || bldName.includes("우체국") || bldName.includes("세무서") || bldName.includes("법원") || bldName.includes("교육청") || bldName.includes("교육지원청") ||
                            bldName.includes("초등학교") || bldName.includes("중학교") || bldName.includes("고등학교") || bldName.includes("학교") ||
                            bldName.includes("유원지") || bldName.includes("체육시설") ||
                            icon === "🏥" || icon === "🏛️" || icon === "🚉" || icon === "🏫" || icon === "🌳" || icon === "🌲"
                        );
                        
                        var isApartment = bldName.includes("아파트") || bldName.includes("푸르지오") || bldName.includes("자이") || bldName.includes("힐스테이트") || bldName.includes("아이파크") || bldName.includes("e편한세상") || bldName.includes("더샵") || bldName.includes("래미안") || bldName.includes("두산위브") || bldName.includes("코아루") || bldName.includes("우미린") || bldName.includes("부영") || bldName.includes("영무예다음") || bldName.includes("주공") || bldName.includes("SK뷰") || bldName.includes("롯데캐슬");
                        
                        var isMinorOrResidential = !isMajorT1 && !isMediumT2 && !isApartment && (bldName.includes("빌라") || bldName.includes("맨션") || bldName.includes("원룸") || bldName.includes("투룸") || bldName.includes("주택") || bldName.includes("연립") || bldName.includes("다세대") || bldName.includes("오피스텔") || bldName.includes("빌딩") || bldName.includes("상가") || !bldName || bldName === "이름 없는 장소" || bldName === "이름 없는 건물");

                        if (zoom <= 14) {
                            if (isMajorT1) { limit = 0.0035; weight = 30.0; }
                            else if (isMediumT2) { limit = 0.0015; weight = 3.0; }
                            else if (isApartment) { limit = 0.0018; weight = 5.0; }
                            else if (isMinorOrResidential) { limit = 0.0003; weight = 0.05; }
                            else if (bldName) { limit = 0.0004; weight = 0.2; }
                            else { limit = 0.0002; weight = 0.01; }
                        } else if (zoom <= 16) {
                            if (isMajorT1) { limit = 0.0025; weight = 15.0; }
                            else if (isMediumT2) { limit = 0.001; weight = 2.0; }
                            else if (isApartment) { limit = 0.0015; weight = 4.0; }
                            else if (isMinorOrResidential) { limit = 0.0003; weight = 0.1; }
                            else if (bldName) { limit = 0.0005; weight = 0.5; }
                            else { limit = 0.0004; weight = 0.1; }
                        } else { // zoom >= 17
                            if (isMajorT1) { limit = 0.0012; weight = 2.5; }
                            else if (isMediumT2) { limit = 0.0005; weight = 1.2; }
                            else if (isApartment) { limit = 0.0006; weight = 1.5; }
                            else if (isMinorOrResidential) { limit = 0.0002; weight = 0.5; }
                            else if (bldName) { limit = 0.0003; weight = 1.0; }
                            else { limit = 0.0003; weight = 1.0; }
                        }
                        
                        var weightedDist = dist / weight;
                        
                        featuresWithDist.push({ 
                            feature: f, 
                            dist: dist, 
                            weightedDist: weightedDist, 
                            center: center,
                            bldName: bldName,
                            bldDong: bldDong,
                            icon: icon,
                            limit: limit
                        });
                    });

                    var featuresSortedByPhysical = [...featuresWithDist].sort((a, b) => a.dist - b.dist);
                    var closestPhysical = featuresSortedByPhysical[0];

                    var selectedItem = null;
                    
                    if (zoom >= 17 && closestPhysical && closestPhysical.dist <= 0.0003) {
                        selectedItem = closestPhysical;
                    } else {
                        var featuresSortedByWeight = [...featuresWithDist].sort((a, b) => a.weightedDist - b.weightedDist);
                        for (var i = 0; i < featuresSortedByWeight.length; i++) {
                            var item = featuresSortedByWeight[i];
                            if (item.dist <= item.limit) {
                                selectedItem = item;
                                break;
                            }
                        }
                    }

                    if (selectedItem) {
                        var props = selectedItem.feature.properties;
                        var bldName = selectedItem.bldName || "";
                        bldName = window.cleanDetailedName(bldName, zoom, true);
                        var bldDong = selectedItem.bldDong || "";
                        var displayTitle = "";
                        var icon = selectedItem.icon;

                        if (bldName && bldDong) {
                            var cleanDong = bldDong.trim();
                            if (zoom <= 17) {
                                displayTitle = icon ? `${icon} ${bldName}` : bldName;
                            } else {
                                if (bldName.indexOf(cleanDong) !== -1) {
                                    displayTitle = icon ? `${icon} ${bldName}` : bldName;
                                } else {
                                    displayTitle = icon ? `${icon} ${bldName} ${cleanDong}` : `${bldName} ${cleanDong}`;
                                }
                            }
                        } else {
                            var baseName = bldName || bldDong || "이름 없는 장소";
                            displayTitle = icon ? `${icon} ${baseName}` : baseName;
                        }

                        var sido = props.sido || "";
                        var sigungu = props.sigungu || "";
                        var rd_nm = props.rd_nm || "";
                        var buld_no = props.buld_no || "";
                        
                        var displayAddr = `${sido} ${sigungu} ${rd_nm} ${buld_no}`.trim();
                        if (!displayAddr) {
                            displayAddr = "상세 주소 정보 없음";
                        }

                        var snapLat = selectedItem.center ? selectedItem.center.lat : lat;
                        var snapLng = selectedItem.center ? selectedItem.center.lng : lng;

                        var addrLandmark = window.getMajorLandmarkFromAddress(displayAddr);
                        var isGenericTitle = false;
                        if (addrLandmark) {
                            var landmarkIcon = window.getIconForName(addrLandmark);
                            displayTitle = `${landmarkIcon} ${addrLandmark}`;
                        } else {
                            var cleanTitleText = displayTitle.replace(/[^\w\sㄱ-힣]/g, '').trim();
                            isGenericTitle = /^\d+$/.test(cleanTitleText) || 
                                             cleanTitleText === "이름 없는 장소" || 
                                             cleanTitleText === "이름 없는 건물" || 
                                             cleanTitleText === "선택된 위치" ||
                                             cleanTitleText.endsWith("길") || 
                                             cleanTitleText.endsWith("로") ||
                                             (rd_nm && cleanTitleText.includes(rd_nm)) ||
                                             (buld_no && cleanTitleText.includes(buld_no)) ||
                                             /빌라|맨션|원룸|투룸|주택|연립|다세대|오피스텔|상가|빌딩/.test(cleanTitleText);
                        }

                        if (isGenericTitle) {
                            fetchPoiForCoord(snapLat, snapLng, displayTitle, displayAddr, rd_nm, buld_no);
                        } else {
                            window.selectedLocation = { lat: snapLat, lng: snapLng, name: displayTitle, addr: displayAddr };
                            window.infoWindow.setLatLng([snapLat, snapLng]);
                            updatePopupContent(displayTitle, displayAddr);
                        }
                    } else {
                        fallbackPoiOnlySearch(lat, lng);
                    }
                } else {
                    fallbackPoiOnlySearch(lat, lng);
                }
            })
            .catch(err => {
                console.warn("VWorld 건물 레이어 조회 실패, POI 검색으로 대체합니다.", err);
                fallbackPoiOnlySearch(lat, lng);
            });
    });
};

// ── 빈 공간 클릭 시 POI 상호명 검출 폴백 ──
function fallbackPoiOnlySearch(lat, lng) {
    window.infoWindow = window.infoWindow || L.popup();
    var vworldGeoUrl = `${window.PROXY_URL}/vworld-address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&type=both&domain=${window.location.host}`;
    
    fetch(vworldGeoUrl)
        .then(res => res.json())
        .then(geoData => {
            var queryStr = "";
            var finalAddr = "주소 정보 없음";
            
            if (geoData.response && geoData.response.status === "OK" && geoData.response.result) {
                var results = geoData.response.result;
                var roadResult = results.find(r => r.type === "road");
                var parcelResult = results.find(r => r.type === "parcel");
                
                if (roadResult) finalAddr = roadResult.text;
                else if (parcelResult) finalAddr = parcelResult.text;
                
                var addrLandmark = window.getMajorLandmarkFromAddress(finalAddr);
                if (addrLandmark) {
                    var landmarkIcon = window.getIconForName(addrLandmark);
                    var finalTitle = `${landmarkIcon} ${addrLandmark}`;
                    window.selectedLocation = { lat: lat, lng: lng, name: finalTitle, addr: finalAddr };
                    window.infoWindow.setLatLng([lat, lng]);
                    updatePopupContent(finalTitle, finalAddr);
                    return;
                }
                
                var extractedName = window.extractBuildingNameFromAddress(finalAddr);
                if (extractedName && extractedName !== "이름 없는 장소") {
                    extractedName = window.cleanDetailedName(extractedName, window.map.getZoom(), true);
                    var icon = window.getIconForName(extractedName);
                    if (icon === "" || icon === "📍") icon = "🏢";
                    var finalTitle = icon ? `${icon} ${extractedName}` : extractedName;
                    window.selectedLocation = { lat: lat, lng: lng, name: finalTitle, addr: finalAddr };
                    window.infoWindow.setLatLng([lat, lng]);
                    updatePopupContent(finalTitle, finalAddr);
                    return;
                }
                
                if (parcelResult && parcelResult.text) {
                    var parts = parcelResult.text.split(" ");
                    if (parts.length >= 2) {
                        queryStr = `${parts[parts.length-2]} ${parts[parts.length-1]}`;
                    }
                }
            }
            
            if (!queryStr) {
                window.map.closePopup(window.infoWindow);
                return;
            }
            
            var poiSearchUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=15&page=1&query=${encodeURIComponent(queryStr)}&type=place&format=json&domain=${window.location.host}`;
            
            fetch(poiSearchUrl)
                .then(res => res.json())
                .then(poiData => {
                    if (poiData.response && poiData.response.status === "OK" && poiData.response.result && poiData.response.result.items) {
                        var items = poiData.response.result.items;
                        
                        var validItems = items.filter(item => {
                            if (!item.point || !item.point.x || !item.point.y) return false;
                            var itemLng = parseFloat(item.point.x);
                            var itemLat = parseFloat(item.point.y);
                            var dLat = itemLat - lat;
                            var dLng = itemLng - lng;
                            var dist = Math.sqrt(dLat * dLat + dLng * dLng);
                            return dist <= 0.0006;
                        });
                        
                        if (validItems.length > 0) {
                            validItems.sort(function(a, b) {
                                return getPoiScore(b.title, b.category) - getPoiScore(a.title, a.category);
                            });
                            var bestItem = validItems[0];
                            var foundTitle = window.cleanDetailedName(bestItem.title, window.map.getZoom(), true);
                            var shopIcon = window.getIconForName(foundTitle);
                            var finalTitle = `${shopIcon} ${foundTitle}`;
                            var poiAddr = finalAddr;
                            if (bestItem.address && (bestItem.address.road || bestItem.address.parcel)) {
                                poiAddr = bestItem.address.road || bestItem.address.parcel;
                            }
                            window.selectedLocation = { lat: lat, lng: lng, name: finalTitle, addr: poiAddr };
                            window.infoWindow.setLatLng([lat, lng]);
                            updatePopupContent(finalTitle, poiAddr);
                        } else {
                            window.map.closePopup(window.infoWindow);
                        }
                    } else {
                        window.map.closePopup(window.infoWindow);
                    }
                })
                .catch(err => {
                    console.warn("POI 검색 실패:", err);
                    window.map.closePopup(window.infoWindow);
                });
        })
        .catch(err => {
            console.warn("역지오코딩 실패:", err);
            window.map.closePopup(window.infoWindow);
        });
}

// ── 지번 주소 기반 정밀 POI 상호 매핑 ──
function fetchPoiForCoord(snapLat, snapLng, fallbackTitle, bldAddr, rd_nm, buld_no) {
    window.infoWindow = window.infoWindow || L.popup();
    var vworldGeoUrl = `${window.PROXY_URL}/vworld-address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${snapLng},${snapLat}&type=both&domain=${window.location.host}`;
    
    fetch(vworldGeoUrl)
        .then(res => res.json())
        .then(geoData => {
            var queryStr = "";
            var finalAddr = bldAddr || "주소 정보 없음";
            
            if (geoData.response && geoData.response.status === "OK" && geoData.response.result) {
                var results = geoData.response.result;
                var roadResult = results.find(r => r.type === "road");
                var parcelResult = results.find(r => r.type === "parcel");
                
                if (roadResult) {
                    finalAddr = roadResult.text;
                } else if (parcelResult) {
                    finalAddr = parcelResult.text;
                }
                
                if (parcelResult && parcelResult.text) {
                    var parts = parcelResult.text.split(" ");
                    if (parts.length >= 2) {
                        queryStr = `${parts[parts.length-2]} ${parts[parts.length-1]}`;
                    }
                }
            }
            
            if (!queryStr) {
                if (rd_nm && buld_no) {
                    queryStr = `${rd_nm} ${buld_no}`.trim();
                } else if (bldAddr) {
                    var parts = bldAddr.split(" ");
                    if (parts.length >= 2) {
                        queryStr = `${parts[parts.length-2]} ${parts[parts.length-1]}`;
                    }
                }
            }
            
            if (!queryStr) {
                fallbackToGeocodeExtraction(snapLat, snapLng, fallbackTitle, finalAddr);
                return;
            }
            
            var poiSearchUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=15&page=1&query=${encodeURIComponent(queryStr)}&type=place&format=json&domain=${window.location.host}`;
            
            fetch(poiSearchUrl)
                .then(res => res.json())
                .then(poiData => {
                    var foundTitle = "";
                    var bestItem = null;
                    if (poiData.response && poiData.response.status === "OK" && poiData.response.result && poiData.response.result.items) {
                        var items = poiData.response.result.items;
                        
                        var validItems = items.filter(item => {
                            if (!item.point || !item.point.x || !item.point.y) return false;
                            var itemLng = parseFloat(item.point.x);
                            var itemLat = parseFloat(item.point.y);
                            var dLat = itemLat - snapLat;
                            var dLng = itemLng - snapLng;
                            var dist = Math.sqrt(dLat * dLat + dLng * dLng);
                            return dist <= 0.0006;
                        });
                        
                        if (validItems.length > 0) {
                            validItems.sort(function(a, b) {
                                return getPoiScore(b.title, b.category) - getPoiScore(a.title, a.category);
                            });
                            bestItem = validItems[0];
                            foundTitle = bestItem.title;
                        }
                    }
                    
                    if (foundTitle) {
                        foundTitle = window.cleanDetailedName(foundTitle, window.map.getZoom(), true);
                        var shopIcon = window.getIconForName(foundTitle);
                        var finalTitle = `${shopIcon} ${foundTitle}`;
                        window.selectedLocation = { lat: snapLat, lng: snapLng, name: finalTitle, addr: finalAddr };
                        window.infoWindow.setLatLng([snapLat, snapLng]);
                        updatePopupContent(finalTitle, finalAddr);
                    } else {
                        fallbackToGeocodeExtraction(snapLat, snapLng, fallbackTitle, finalAddr);
                    }
                })
                .catch(err => {
                    console.warn("POI 상호명 조회 실패, 리버스 지오코딩 추출 시도:", err);
                    fallbackToGeocodeExtraction(snapLat, snapLng, fallbackTitle, finalAddr);
                });
        })
        .catch(err => {
            console.warn("역지오코딩 조회 실패, 기존 정보로 진행:", err);
            fallbackToGeocodeExtraction(snapLat, snapLng, fallbackTitle, bldAddr);
        });
}

function getPoiScore(title, category) {
    if (!title) return 0;
    var lt = title.toLowerCase();
    var lc = (category || "").toLowerCase();
    
    if (lt.includes("대학교") || lt.includes("대학") || lc.includes("대학") || lc.includes("대학교")) return 100;
    if (lt.endsWith("역") || lt.includes("역 ") || lt.includes("ktx") || lt.includes("터미널") || lt.includes("종합터미널") || lc.includes("철도") || lc.includes("역사") || lc.includes("터미널")) return 100;
    
    if (lt.includes("시청") || lt.includes("도청") || lt.includes("구청") || lt.includes("의회") || lt.includes("교육지원청") || lt.includes("교육청")) return 98;
    
    if (lt.includes("종합병원") || lt.includes("대학병원") || lt.includes("차병원") || lt.includes("의료원") || lt.includes("순천향")) return 95;
    if (lt.includes("고등학교") || lt.includes("중학교") || lt.includes("초등학교") || lc.includes("학교")) return 95;
    if (lt.includes("공원") || lc.includes("공원") || lt.includes("체육관") || lt.includes("종합운동장") || lt.includes("운동장") || lt.includes("수목원")) return 95;
    if (lt.includes("예술회관") || lt.includes("도서관") || lt.includes("박물관") || lt.includes("미술관") || lt.includes("문화원")) return 95;
    
    if (lt.includes("의원") || lt.includes("치과") || lt.includes("한의원") || lt.includes("약국") || lc.includes("의료") || lc.includes("약국")) return 90;
    
    if (lt.includes("경찰서") || lt.includes("소방서") || lt.includes("경찰") || lt.includes("소방")) return 80;
    
    if (lt.includes("주민센터") || lt.includes("행정복지센터") || lt.includes("읍사무소") || lt.includes("면사무소") || lt.includes("우체국") || lt.includes("세무서") || lt.includes("법원")) return 78;
    
    if (
        lt.includes("식당") || lt.includes("카페") || lt.includes("커피") || 
        lt.includes("마트") || lt.includes("편의점") || lt.includes("치킨") || lt.includes("피자") || 
        lt.includes("헤어") || lt.includes("미용") || lt.includes("학원") ||
        lc.includes("음식") || lc.includes("카페") || 
        lc.includes("쇼핑") || lc.includes("생활") || lc.includes("서비스")
    ) {
        return 50;
    }
    
    if (lt.includes("아파트") || lt.includes("빌라") || lt.includes("맨션") || lt.includes("타운") || lt.includes("오피스텔") || lt.includes("빌딩") || lt.includes("원룸")) {
        return 30;
    }
    
    if (/^[가-힣0-9\s]+(동|리|읍|면|로|길)$/.test(lt)) {
        return 1;
    }
    
    return 10;
}

function fallbackToGeocodeExtraction(snapLat, snapLng, fallbackTitle, fallbackAddr) {
    window.infoWindow = window.infoWindow || L.popup();
    var vworldGeoUrl = `${window.PROXY_URL}/vworld-address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${snapLng},${snapLat}&type=both&domain=${window.location.host}`;

    fetch(vworldGeoUrl)
        .then(res => res.json())
        .then(data => {
            var finalTitle = fallbackTitle;
            var finalAddr = fallbackAddr;

            if (data.response && data.response.status === "OK" && data.response.result) {
                var results = data.response.result;
                var roadResult = results.find(r => r.type === "road");
                var parcelResult = results.find(r => r.type === "parcel");
                var addressName = roadResult ? roadResult.text : (parcelResult ? parcelResult.text : "");

                if (addressName) {
                    finalAddr = addressName;
                    var extractedName = window.extractBuildingNameFromAddress(addressName);
                    if (extractedName) {
                        extractedName = window.cleanDetailedName(extractedName, window.map.getZoom(), true);
                        var icon = window.getIconForName(extractedName);
                        if (icon === "" || icon === "📍") icon = "🏢";
                        finalTitle = icon ? `${icon} ${extractedName}` : extractedName;
                    } else {
                        var addressLandmark = window.getMajorLandmarkFromAddress(addressName);
                        if (addressLandmark) {
                            addressLandmark = window.cleanDetailedName(addressLandmark, window.map.getZoom(), true);
                            var icon = window.getIconForName(addressLandmark);
                            finalTitle = icon ? `${icon} ${addressLandmark}` : addressLandmark;
                        }
                    }
                }
            }

            window.selectedLocation = { lat: snapLat, lng: snapLng, name: finalTitle, addr: finalAddr };
            window.infoWindow.setLatLng([snapLat, snapLng]);
            updatePopupContent(finalTitle, finalAddr);
        })
        .catch(err => {
            console.warn("추출용 리버스 지오코딩 실패, 기본값 사용:", err);
            window.selectedLocation = { lat: snapLat, lng: snapLng, name: fallbackTitle, addr: fallbackAddr };
            window.infoWindow.setLatLng([snapLat, snapLng]);
            updatePopupContent(fallbackTitle, fallbackAddr);
        });
}

window.fallbackToReverseGeocode = function(lat, lng) {
    window.infoWindow = window.infoWindow || L.popup();
    var vworldGeoUrl = `${window.PROXY_URL}/vworld-address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&type=both&domain=${window.location.host}`;

    fetch(vworldGeoUrl)
        .then(res => res.json())
        .then(data => {
            var displayTitle = `선택된 위치`;
            var displayAddr = `주소 정보 없음`;

            if (data.response && data.response.status === "OK" && data.response.result) {
                var results = data.response.result;
                var roadResult = results.find(r => r.type === "road");
                var parcelResult = results.find(r => r.type === "parcel");
                
                var buildingName = "";
                var addressName = "";
                
                if (roadResult) {
                    addressName = roadResult.text;
                    if (roadResult.structure && roadResult.structure.level5) {
                        buildingName = roadResult.structure.level5;
                    }
                } else if (parcelResult) {
                    addressName = parcelResult.text;
                }
                
                var addressLandmark = window.getMajorLandmarkFromAddress(addressName);
                if (addressLandmark) {
                    buildingName = addressLandmark;
                } else {
                    var extractedName = window.extractBuildingNameFromAddress(addressName);
                    if (extractedName) {
                        buildingName = extractedName;
                    }
                }
                
                buildingName = window.cleanDetailedName(buildingName, window.map.getZoom(), true);
                
                var icon = window.getIconForName(buildingName || addressName);
                if ((icon === "" || icon === "📍") && buildingName) {
                    icon = "🏢";
                } else if ((icon === "" || icon === "📍") && (addressName.includes("아파트") || buildingName.includes("아파트"))) {
                    icon = "🏢";
                }
                
                var isMountain = /\b산\s*\d+/.test(addressName) || (parcelResult && /\b산\s*\d+/.test(parcelResult.text));
                
                if (isMountain) {
                    var mountainSearchUrl = `${window.PROXY_URL}/vworld-search?service=search&request=search&version=2.0&crs=EPSG:4326&size=5&page=1&query=${encodeURIComponent("산")}&type=place&format=json&domain=${window.location.host}`;
                    
                    fetch(mountainSearchUrl)
                        .then(r => r.json())
                        .then(searchData => {
                            var mountainName = "";
                            if (searchData.response && searchData.response.status === "OK" && searchData.response.result && searchData.response.result.items) {
                                var items = searchData.response.result.items;
                                
                                var validItems = items.filter(item => {
                                    if (!item.point || !item.point.x || !item.point.y) return false;
                                    var itemLng = parseFloat(item.point.x);
                                    var itemLat = parseFloat(item.point.y);
                                    var dLat = itemLat - lat;
                                    var dLng = itemLng - lng;
                                    var dist = Math.sqrt(dLat * dLat + dLng * dLng);
                                    return dist <= 0.015;
                                });

                                var matchedItem = validItems.find(item => item.title && item.title.endsWith("산") && !item.title.includes("산단") && !item.title.includes("산업"));
                                if (matchedItem) {
                                    mountainName = matchedItem.title;
                                }
                            }
                            
                            displayTitle = mountainName ? `🌲 ${mountainName} (산림 지대)` : `🌲 산림 지대`;
                            displayAddr = addressName || `주소 정보 없음`;
                            
                            window.selectedLocation = { lat: lat, lng: lng, name: displayTitle, addr: displayAddr };
                            updatePopupContent(displayTitle, displayAddr);
                        })
                        .catch(err => {
                            console.warn("산 POI 검색 실패, 일반 주소 매핑", err);
                            displayTitle = `🌲 산림 지대`;
                            displayAddr = addressName || `주소 정보 없음`;
                            window.selectedLocation = { lat: lat, lng: lng, name: displayTitle, addr: displayAddr };
                            updatePopupContent(displayTitle, displayAddr);
                        });
                    return;
                }

                var cleanTitleText = (buildingName || "").replace(/[^\w\sㄱ-힣]/g, '').trim();
                var isGenericTitle = /^\d+$/.test(cleanTitleText) || 
                                     !cleanTitleText || 
                                     cleanTitleText === "이름 없는 장소" || 
                                     cleanTitleText === "선택된 위치" ||
                                     cleanTitleText.endsWith("길") || 
                                     cleanTitleText.endsWith("로") ||
                                     /빌라|맨션|원룸|투룸|주택|연립|다세대|오피스텔|상가|빌딩/.test(cleanTitleText);

                if (isGenericTitle) {
                    var fallbackLabel = buildingName ? (icon ? `${icon} ${buildingName}` : buildingName) : (icon ? `${icon} 선택된 위치` : `선택된 위치`);
                    fetchPoiForCoord(lat, lng, fallbackLabel, addressName || `주소 정보 없음`, roadResult ? roadResult.structure.level4 : "", roadResult ? roadResult.structure.level5 : "");
                    return;
                }

                displayTitle = buildingName ? (icon ? `${icon} ${buildingName}` : buildingName) : (icon ? `${icon} 선택된 위치` : `선택된 위치`);
                displayAddr = addressName || `주소 정보 없음`;
            }

            window.selectedLocation = { lat: lat, lng: lng, name: displayTitle, addr: displayAddr };
            updatePopupContent(displayTitle, displayAddr);
        })
        .catch(err => {
            console.warn("VWorld 주소변환 에러:", err);
            updatePopupContent(`선택된 위치`, `주소 정보 없음 (통신 에러)`);
        });
};


function updatePopupContent(title, addr) {
    window.infoWindow = window.infoWindow || L.popup();
    // 사용자가 명시적으로 클릭한 위치 정보 팝업은 줌 레벨 제약과 관계없이 항상 상세 정보를 노출시킵니다.
    // var cleanTitle = (title || "").replace(/^[^\s]+\s+/, "").trim();
    // if (!window.isClickAllowedForZoom(cleanTitle, "", window.map.getZoom())) {
    //     window.map.closePopup(window.infoWindow);
    //     return;
    // }

    var loc = window.selectedLocation || {};
    var lat = loc.lat || 0;
    var lng = loc.lng || 0;
    
    var ratingInfo = window.getAverageRating(title);
    var starsHtml = window.renderStars(parseFloat(ratingInfo.avg));
    
    var zipHash = Math.abs(Math.floor(lat * 100000 + lng * 100000)) % 90000 + 10000;
    var zipCode = String(zipHash).substring(0, 5);
    
    var parcelPart = "";
    var matchParen = addr ? addr.match(/\(([^)]+)\)/) : null;
    if (matchParen) {
        parcelPart = matchParen[1];
    }
    
    var safeTitle = title.replace(/'/g, "\\'");
    var safeAddr = addr ? addr.replace(/'/g, "\\'") : "";
    
    var popupHtml = `
    <div id="click-popup" style="padding:8px; font-size:13px; min-width:260px; max-width:320px; font-family:'Noto Sans KR',sans-serif; line-height:1.5;">
        <b id="popup-title" style="font-size:15px; color:var(--text-main); display:block; margin-bottom:2px;">${title}</b>
        
        <div id="popup-rating-area" style="margin-bottom:4px;">
            ${starsHtml} <b style="color:#f59e0b; font-size:13px;">${ratingInfo.avg}</b>
            <span style="color:var(--text-muted); font-size:11px;">(${ratingInfo.count}건)</span>
        </div>
        
        <div id="popup-addr" style="font-size:11px; color:var(--text-muted); margin-bottom:2px;">${addr || '주소 정보 없음'}</div>
        
        <div style="font-size:10px; color:var(--text-muted); margin-bottom:6px; cursor:pointer; user-select:none;" onclick="document.getElementById('popup-route-menu').style.display = document.getElementById('popup-route-menu').style.display === 'flex' ? 'none' : 'flex';">
            (우) ${zipCode}${parcelPart ? ` (지번) ${parcelPart}` : ''} <span style="color:#3b82f6;">▼</span>
        </div>
        
        <div id="popup-route-menu" style="display:none; gap:4px; margin-bottom:6px; flex-wrap:wrap;">
            <button onclick="setRoutingPoint('START', ${lat}, ${lng}, '${safeTitle}'); window.map.closePopup();" style="flex:1; padding:4px 6px; font-size:10px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">🛫 출발지</button>
            <button onclick="setRoutingPoint('WAYPOINT', ${lat}, ${lng}, '${safeTitle}'); window.map.closePopup();" style="flex:1; padding:4px 6px; font-size:10px; background:#f59e0b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">🔄 경유지</button>
            <button onclick="setRoutingPoint('END', ${lat}, ${lng}, '${safeTitle}'); window.map.closePopup();" style="flex:1; padding:4px 6px; font-size:10px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:700;">🛬 도착지</button>
        </div>
        
        <div style="display:flex; justify-content:flex-end; gap:6px;">
            <a href="javascript:void(0)" onclick="window.addFavorite('${safeTitle}', ${lat}, ${lng}, '${safeAddr}')" style="font-size:11px; color:#92400e; text-decoration:underline; font-weight:600; cursor:pointer;">⭐ 즐겨찾기</a>
            <a href="javascript:void(0)" onclick="window.openReviewModal('${safeTitle}', ${lat}, ${lng})" style="font-size:11px; color:#3b82f6; text-decoration:underline; font-weight:600; cursor:pointer;">⭐ 평점남기기</a>
        </div>
    </div>`;
    
    window.infoWindow.setContent(popupHtml);
}

window.setRoutingPoint = function(type, lat, lng, name) {
    var cleanName = name.replace(/'/g, "");
    if (type === 'START') {
        window.startCoord = { lat: lat, lng: lng, addr: cleanName };
        var el = document.getElementById('start-addr');
        if (el) el.textContent = cleanName;
        if (window.startMarker) window.startMarker.remove();
        
        var startIcon = L.divIcon({
            html: `<div class="routing-pin-container start-pin"><div class="pin-tag">출발</div><div class="pin-dot"></div><div class="pin-pulse"></div></div>`,
            className: 'custom-routing-marker',
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
        window.startMarker = L.marker([lat, lng], { icon: startIcon }).addTo(window.map);
    } else if (type === 'WAYPOINT') {
        window.wayCoord = { lat: lat, lng: lng, addr: cleanName };
        var wayAddrEl = document.getElementById('way-addr');
        if (wayAddrEl) wayAddrEl.textContent = cleanName;
        
        var wayRow = document.getElementById('waypoint-row');
        if (wayRow) wayRow.style.display = 'flex';
        if (window.wayMarker) window.wayMarker.remove();
        
        var wayIcon = L.divIcon({
            html: `<div class="routing-pin-container way-pin"><div class="pin-tag">경유</div><div class="pin-dot"></div><div class="pin-pulse"></div></div>`,
            className: 'custom-routing-marker',
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
        window.wayMarker = L.marker([lat, lng], { icon: wayIcon }).addTo(window.map);
    } else {
        window.endCoord = { lat: lat, lng: lng, addr: cleanName };
        var el = document.getElementById('end-addr');
        if (el) el.textContent = cleanName;
        if (window.endMarker) window.endMarker.remove();
        
        var endIcon = L.divIcon({
            html: `<div class="routing-pin-container end-pin"><div class="pin-tag">도착</div><div class="pin-dot"></div><div class="pin-pulse"></div></div>`,
            className: 'custom-routing-marker',
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
        window.endMarker = L.marker([lat, lng], { icon: endIcon }).addTo(window.map);
    }
    
    window.map.closePopup(window.infoWindow);

    if (window.startCoord && window.endCoord) {
        var selectors = document.getElementById('mode-selectors');
        if (selectors) selectors.style.display = 'flex';
    }

};

window.clearWaypoint = function() {
    window.wayCoord = null;
    if (window.wayMarker) {
        window.wayMarker.remove();
        window.wayMarker = null;
    }
    var wayRow = document.getElementById('waypoint-row');
    if (wayRow) wayRow.style.display = 'none';
    var wayAddrEl = document.getElementById('way-addr');
    if (wayAddrEl) wayAddrEl.textContent = '경유지 없음';
};

// [신규 기능] 검색 결과에서 건물 클릭 시 지도 이동 및 상세주소 팝업 띄우기
window.showPlacePopup = function(title, lat, lng, addr) {
    if (!window.map) return;
    window.map.setView([lat, lng], 17);
    
    // 현재 선택 위치 업데이트
    window.selectedLocation = { lat: lat, lng: lng, name: title, addr: addr };
    window.infoWindow = window.infoWindow || L.popup();

    var content = `
    <div style="padding:5px; font-size:13px; min-width:200px; font-family:'Noto Sans KR',sans-serif; line-height:1.4;">
        <b style="font-size:15px; color:var(--text-main); display:block; margin-bottom:4px;">🏢 ${title}</b>
        <div style="font-size:11px; color:var(--text-muted);">${addr}</div>
    </div>`;
    
    window.infoWindow.setLatLng([lat, lng])
              .setContent(content)
              .openOn(window.map);
};

// [신규 기능] 주소의 위경도 변환(Geocoding) 헬퍼 함수
window.geocodeAddress = function(address, callback) {
    var cleanAddr = address.split(' (')[0].trim(); // 괄호 참고 주소 제거하여 정확도 향상
    var url = `${window.PROXY_URL}/vworld-address?service=address&request=getcoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(cleanAddr)}&type=road&domain=${window.location.host}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.response && data.response.status === "OK" && data.response.result && data.response.result.point) {
                var lat = parseFloat(data.response.result.point.y);
                var lng = parseFloat(data.response.result.point.x);
                callback(lat, lng);
            } else {
                // 도로명으로 좌표 획득 실패 시 지번(parcel) 타입으로 2차 시도
                var url2 = `${window.PROXY_URL}/vworld-address?service=address&request=getcoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(cleanAddr)}&type=parcel&domain=${window.location.host}`;
                fetch(url2)
                    .then(res2 => res2.json())
                    .then(data2 => {
                        if (data2.response && data2.response.status === "OK" && data2.response.result && data2.response.result.point) {
                            var lat = parseFloat(data2.response.result.point.y);
                            var lng = parseFloat(data2.response.result.point.x);
                            callback(lat, lng);
                        } else {
                            alert("📍 주소의 위경도 좌표를 변환할 수 없습니다.\n[상세주소]: " + cleanAddr);
                        }
                    })
                    .catch(err => {
                        console.error("지번 지오코딩 실패:", err);
                        alert("📍 좌표 변환 네트워크 에러가 발생했습니다.");
                    });
            }
        })
        .catch(err => {
            console.error("도로명 지오코딩 실패:", err);
            alert("📍 좌표 변환 중 오류가 발생했습니다.");
        });
};

