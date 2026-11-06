(() => {
	window.gumapWebGLMap = null;
	window.isGuMapWebGLActive = false;
	var currentPopup = null;
	var startMarker = null;
	var endMarker = null;

		function getVectorUrl(filename) {
		var isSubDir = window.location.pathname.indexOf("/GUMAP-일반지도/") !== -1;
		var prefix = isSubDir
			? "../GUMAP-데이터/vector_layers/"
			: "GUMAP-데이터/vector_layers/";
		return (
			prefix + encodeURIComponent(filename) + "?v=20261106_v4"
		);
	}

	var startMarker = null;
	var wayMarker = null;
	var endMarker = null;

	function createSleekPinElement(type, name) {
		var el = document.createElement("div");
		var isStart = type === "START";
		var isWay = type === "WAYPOINT";
		var tagColor = isStart ? "#1e40af" : isWay ? "#b45309" : "#b91c1c";
		var tagBg = "rgba(255,255,255,0.96)";
		var borderCol = isStart ? "#2563eb" : isWay ? "#f59e0b" : "#ef4444";
		var gradStart = isStart ? "#3b82f6" : isWay ? "#fbbf24" : "#f87171";
		var gradEnd = isStart ? "#1d4ed8" : isWay ? "#d97706" : "#dc2626";
		var glow = isStart
			? "rgba(37,99,235,0.35)"
			: isWay
				? "rgba(245,158,11,0.35)"
				: "rgba(239,68,68,0.4)";
		var gradId = "pinGrad_" + type + "_" + Math.floor(Math.random() * 10000);

		el.className = "gumap-sleek-pin " + type.toLowerCase() + "-pin";
		el.style.cssText =
			"display:flex; flex-direction:column; align-items:center; cursor:pointer; user-select:none; filter:drop-shadow(0 4px 10px " +
			glow +
			");";
		el.innerHTML =
			'<div class="pin-inner-wrap" style="display:flex; flex-direction:column; align-items:center; transition:transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">' +
			'<div style="background:' +
			tagBg +
			"; backdrop-filter:blur(6px); border:1.5px solid " +
			borderCol +
			"; color:" +
			tagColor +
			'; font-size:11px; font-weight:800; padding:2px 8px; border-radius:12px; margin-bottom:3px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.1);">' +
			(name || (isStart ? "출발" : isWay ? "경유" : "도착")) +
			"</div>" +
			'<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">' +
			"<defs>" +
			'<linearGradient id="' +
			gradId +
			'" x1="14" y1="0" x2="14" y2="36" gradientUnits="userSpaceOnUse">' +
			'<stop stop-color="' +
			gradStart +
			'"/>' +
			'<stop offset="1" stop-color="' +
			gradEnd +
			'"/>' +
			"</linearGradient>" +
			"</defs>" +
			'<path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="url(#' +
			gradId +
			')"/>' +
			'<circle cx="14" cy="14" r="5.5" fill="#ffffff"/>' +
			"</svg>" +
			"</div>";
		var inner = el.querySelector(".pin-inner-wrap");
		el.onmouseenter = () => {
			if (inner) inner.style.transform = "scale(1.15) translateY(-4px)";
		};
		el.onmouseleave = () => {
			if (inner) inner.style.transform = "scale(1)";
		};
		return el;
	}

	window.setGuMapRoutePoint = (type, lat, lng, name) => {
		if (currentPopup) {
			currentPopup.remove();
			currentPopup = null;
		}

		// Leaflet 길찾기 상태와 재귀 없이 동기화
		if (
			!window._settingRoutePoint &&
			typeof window.setRoutingPoint === "function"
		) {
			window._settingRoutePoint = true;
			try {
				window.setRoutingPoint(type, lat, lng, name);
			} finally {
				window._settingRoutePoint = false;
			}
		}

		if (!window.gumapWebGLMap) return;

		if (type === "START") {
			if (startMarker) startMarker.remove();
			var el = createSleekPinElement("START", name);
			startMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
				.setLngLat([lng, lat])
				.addTo(window.gumapWebGLMap);
			window.gumapWebGLMap.flyTo({
				center: [lng, lat],
				zoom: 15.5,
				duration: 800,
			});
			if (window.showToast)
				window.showToast("출발지로 설정되었습니다: " + (name || ""));
		} else if (type === "WAYPOINT") {
			if (wayMarker) wayMarker.remove();
			var elW = createSleekPinElement("WAYPOINT", name);
			wayMarker = new maplibregl.Marker({ element: elW, anchor: "bottom" })
				.setLngLat([lng, lat])
				.addTo(window.gumapWebGLMap);
			window.gumapWebGLMap.flyTo({
				center: [lng, lat],
				zoom: 15.5,
				duration: 800,
			});
			if (window.showToast)
				window.showToast("경유지로 설정되었습니다: " + (name || ""));
		} else if (type === "END") {
			if (endMarker) endMarker.remove();
			var el2 = createSleekPinElement("END", name);
			endMarker = new maplibregl.Marker({ element: el2, anchor: "bottom" })
				.setLngLat([lng, lat])
				.addTo(window.gumapWebGLMap);
			window.gumapWebGLMap.flyTo({
				center: [lng, lat],
				zoom: 15.5,
				duration: 800,
			});
			if (window.showToast)
				window.showToast("도착지로 설정되었습니다: " + (name || ""));
		}
	};

	window.setGuMapStart = (name, coords) => {
		if (Array.isArray(coords)) {
			window.setGuMapRoutePoint("START", coords[0], coords[1], name);
		} else if (typeof coords === "object" && coords.lat) {
			window.setGuMapRoutePoint("START", coords.lat, coords.lng, name);
		}
	};

	window.setGuMapEnd = (name, coords) => {
		if (Array.isArray(coords)) {
			window.setGuMapRoutePoint("END", coords[0], coords[1], name);
		} else if (typeof coords === "object" && coords.lat) {
			window.setGuMapRoutePoint("END", coords.lat, coords.lng, name);
		}
	};

	function loadCustomIcons(map) {
		var icons = [
			{ id: "bus_stop_icon", url: "GUMAP-아이콘/bus_stop.svg" },
			{
				id: "convenience_store_icon",
				url: "GUMAP-아이콘/convenience_store.svg",
			},
			{ id: "gas_station_icon", url: "GUMAP-아이콘/gas_station.svg" },
			{ id: "hospital_icon", url: "GUMAP-아이콘/hospital_general.svg" },
		];
		icons.forEach((item) => {
			var img = new Image();
			img.onload = () => {
				if (!map.hasImage(item.id)) {
					map.addImage(item.id, img);
				}
			};
			img.src = item.url;
		});
	}

	function initMapLibreInstance() {
		if (window.gumapWebGLMap) return;

		var container = document.getElementById("maplibre-container");
		if (!container) {
			container = document.createElement("div");
			container.id = "maplibre-container";
			container.style.cssText =
				"position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; display:block;";
			var parent = document.getElementById("map")
				? document.getElementById("map").parentNode
				: document.body;
			parent.appendChild(container);
		}

		var defaultLat = window.DEFAULT_LAT || 36.119485;
		var defaultLng = window.DEFAULT_LNG || 128.344573;
		var defaultZoom = 13.5;

		var styleObj =
			typeof window.getGuMap2DStyle === "function"
				? window.getGuMap2DStyle(getVectorUrl)
				: { version: 8, sources: {}, layers: [] };

		// ⚡ 메모리 및 타일 병렬 처리 균형: 워커 쓰레드 2개 설정
		if (typeof maplibregl !== "undefined") {
			maplibregl.workerCount = 2;
		}

		window.gumapWebGLMap = new maplibregl.Map({
			container: "maplibre-container",
			style: styleObj,
			center: [defaultLng, defaultLat],
			zoom: defaultZoom,
			maxZoom: 20,
			minZoom: 8,
			preserveDrawingBuffer: false, // ⚡ GPU 백버퍼 복제 방지
			maxTileCacheSize: 10,        // ⚡ 타일 메모리 캐싱 최소화 (10개)
		});

		window.gumapWebGLMap.addControl(
			new maplibregl.NavigationControl(),
			"bottom-right",
		);
		loadCustomIcons(window.gumapWebGLMap);

		// ⚡ [Phase 2 & 4] 비핵심 대용량 GeoJSON 선택적 로딩 (기본 비활성화로 500MB 절감)
		var _lazySourcesLoaded = {};
		function loadDeferredSources() {
			var map = window.gumapWebGLMap;
			if (!map) return;
			// 도로면 폴리곤(31MB)은 gumi_roads 선형 도로망으로 이미 완벽 표출되므로 필요 시에만 로드
			if (false && !_lazySourcesLoaded["gumi-road-surfaces"]) {
				var rsSrc = map.getSource("gumi-road-surfaces");
				if (rsSrc) {
					_lazySourcesLoaded["gumi-road-surfaces"] = true;
					rsSrc.setData(getVectorUrl("gumi_roads_surface_hierarchy.geojson"));
				}
			}
			// 등고선(14MB)은 사용자가 명시적으로 켰을 때만 로드
			if (window.enableContours && !_lazySourcesLoaded["gumi-contours"]) {
				var ctSrc = map.getSource("gumi-contours");
				if (ctSrc) {
					_lazySourcesLoaded["gumi-contours"] = true;
					ctSrc.setData(getVectorUrl("gumi_contours_fast.geojson"));
				}
			}
		}
		window.gumapWebGLMap.once("load", () => {
			setTimeout(loadDeferredSources, 250);
		});
		window.gumapWebGLMap.on("zoomend", loadDeferredSources);

		// 📏 실시간 지도 축척 및 줌 레벨 HUD 연동
		window.gumapWebGLMap.on("zoom", () => {
			if (typeof window.updateMapScaleHud === "function")
				window.updateMapScaleHud();
		});
		window.gumapWebGLMap.on("move", () => {
			if (typeof window.updateMapScaleHud === "function")
				window.updateMapScaleHud();
		});

		window.gumapWebGLMap.on("mouseenter", "buildings-fill", () => {
			window.gumapWebGLMap.getCanvas().style.cursor = "pointer";
		});
		window.gumapWebGLMap.on("mouseleave", "buildings-fill", () => {
			window.gumapWebGLMap.getCanvas().style.cursor = "";
		});

		window.gumapWebGLMap.on("click", "buildings-fill", (e) => {
			if (e.features && e.features.length) {
				var feat = e.features[0];
				var props = feat.properties || {};
				var buildingId = props.id || feat.id || "___UNKNOWN___";
				var name = props.name || "건축물";
				var floors = props.floors
					? '<div style="font-size:12px;color:#64748b;margin-top:2px;">지상 ' +
						props.floors +
						"층</div>"
					: "";

				var selSrc = window.gumapWebGLMap.getSource("selected-building");
				if (selSrc && feat.geometry) {
					selSrc.setData({
						type: "FeatureCollection",
						features: [{ type: "Feature", geometry: feat.geometry, properties: props }],
					});
				}

				// 건물 상세 정보를 좌측 사이드바 (모바일에서는 바텀시트)로 열기
				if (typeof window.showBuildingDetailSidebar === "function") {
					window.showBuildingDetailSidebar(
						name,
						props.floors,
						e.lngLat.lat,
						e.lngLat.lng,
						props,
					);
				}

				var safeName = name.replace(/'/g, "\\'");
				var routeBtns =
					'<div style="display:flex; gap:6px; margin-top:8px;">' +
					"<button onclick=\"window.setGuMapRoutePoint('START', " +
					e.lngLat.lat +
					", " +
					e.lngLat.lng +
					", '" +
					safeName +
					'\');" style="flex:1; padding:7px 0; font-size:11px; font-weight:700; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer;">출발지</button>' +
					"<button onclick=\"window.setGuMapRoutePoint('END', " +
					e.lngLat.lat +
					", " +
					e.lngLat.lng +
					", '" +
					safeName +
					'\');" style="flex:1; padding:7px 0; font-size:11px; font-weight:700; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer;">도착지</button>' +
					"</div>";

				if (currentPopup) currentPopup.remove();
				currentPopup = new maplibregl.Popup({
					closeButton: true,
					closeOnClick: true,
					offset: 12,
					className: "gumap-pure-white-popup",
				})
					.setLngLat(e.lngLat)
					.setHTML(
						'<div style="padding:2px 2px; min-width:170px; font-family:-apple-system,BlinkMacSystemFont,\'Pretendard\',sans-serif; background:#ffffff; color:#0f172a;"><div style="font-weight:800; font-size:13px; color:#0f172a; margin-bottom:2px;">🏢 ' +
							name +
							"</div>" +
							floors +
							routeBtns +
							"</div>",
					)
					.addTo(window.gumapWebGLMap);
			}
		});

		// 건물 상세 정보 좌측 사이드바(#routing-panel) 표시 함수
		window.showBuildingDetailSidebar = (name, floors, lat, lng, extraProps) => {
			// 기존 플로팅 패널(#transit-detail-panel)이 맵 위에 떠 있다면 완전히 숨김
			var floatingPanel = document.getElementById("transit-detail-panel");
			if (floatingPanel) floatingPanel.style.display = "none";

			var sidePanel = document.getElementById("routing-panel");
			if (!sidePanel) return;

			// 사이드바가 닫혀있다면 펼치기
			if (sidePanel.classList.contains("drawer-collapsed")) {
				if (typeof window.toggleSidebarDrawer === "function") {
					window.toggleSidebarDrawer();
				}
			}

			// 기존 길찾기 본문(#collapsible-content) 및 버스보드 숨김
			var collContent = document.getElementById("collapsible-content");
			if (collContent) collContent.style.display = "none";
			var busBoard = document.getElementById("bus-board-panel");
			if (busBoard) busBoard.style.display = "none";

			// 사이드바 내부 건물 상세 카드 컨테이너 확인 및 생성
			var card = document.getElementById("building-sidebar-card");
			if (!card) {
				card = document.createElement("div");
				card.id = "building-sidebar-card";
				card.style.marginTop = "12px";
				var searchContainer = document.getElementById("search-container");
				if (searchContainer && searchContainer.parentNode) {
					searchContainer.parentNode.insertBefore(
						card,
						searchContainer.nextSibling,
					);
				} else {
					sidePanel.appendChild(card);
				}
			}

			var safeName = (name || "건축물").replace(/'/g, "\\'");
			var floorText = floors ? "지상 " + floors + "층" : "일반 규모";
			var cat = extraProps && extraProps.cat ? extraProps.cat : "일반 건축물";
			var coordStr = lat.toFixed(5) + ", " + lng.toFixed(5);

			function generateContextualBuildingIntro(bName, bFloors, bCat) {
				var n = bName || "";
				var f = bFloors ? "지상 " + bFloors + "층 규모의 " : "";

				if (n.indexOf("구미시청") !== -1 || n.indexOf("시청") !== -1) {
					return "구미시의 행정을 총괄하는 대표 청사 시설입니다. 시민 복지, 도시 계획 및 주요 공공 행정 서비스를 관할하며, 도보 및 대중교통 접근성이 뛰어난 구미 도심의 핵심 거점입니다.";
				}
				if (n.indexOf("행정복지센터") !== -1 || n.indexOf("주민센터") !== -1) {
					return "관내 행정동 주민을 위한 전입신고, 복지 상담 및 기초 민원 행정 업무를 처리하는 거점 공공기관입니다.";
				}
				if (
					n.indexOf("경찰서") !== -1 ||
					n.indexOf("파출소") !== -1 ||
					n.indexOf("지구대") !== -1
				) {
					return "구미 시민의 치안 유지와 생활 안전, 교통 지도를 담당하는 경찰 관공서 시설입니다.";
				}
				if (n.indexOf("소방서") !== -1 || n.indexOf("안전센터") !== -1) {
					return "화재 진압, 인명 구조 및 관내 응급 출동 체계를 24시간 가동하는 재난안전 대응 핵심 관공서입니다.";
				}
				if (n.indexOf("보건소") !== -1) {
					return "시민 건강 증진, 예방접종 및 지역 공공 보건 의료 서비스를 제공하는 지자체 보건 기관입니다.";
				}
				if (n.indexOf("우체국") !== -1) {
					return "우편 발송, 택배 물류 접수 및 금융 서비스를 제공하는 국가 기간 물류 거점입니다.";
				}
				if (n.indexOf("구미역") !== -1) {
					return "경부선 철도(ITX-새마을, 무궁화호)와 대경선 광역전철이 정차하는 구미시 최고의 복합 교통 환승역입니다. 역전 광장과 시내버스 정류장이 집결해 있습니다.";
				}
				if (n.indexOf("사곡역") !== -1) {
					return "대경선 광역전철이 정차하는 철도 역사로, 상모사곡동 및 국가산단 방면 철도 교통 접근성을 제공합니다.";
				}
				if (
					n.indexOf("종합터미널") !== -1 ||
					n.indexOf("버스터미널") !== -1 ||
					n.indexOf("구미터미널") !== -1
				) {
					return "서울/수도권 및 전국 주요 도시를 잇는 고속·시외버스 노선망이 집중된 구미 광역 대중교통의 중심 관문입니다.";
				}
				if (
					n.indexOf("금오공") !== -1 ||
					n.indexOf("테크노") !== -1 ||
					n.indexOf("디지털관") !== -1 ||
					n.indexOf("산학협력") !== -1
				) {
					return "국립 금오공과대학교 양호동 캠퍼스 내 연구 및 강의 학술 시설로, 첨단 공학 실습실과 산학협력 연구 인프라가 구축된 지능형 교육 거점입니다.";
				}
				if (
					n.indexOf("초등학교") !== -1 ||
					n.indexOf("중학교") !== -1 ||
					n.indexOf("고등학교") !== -1 ||
					n.indexOf("학교") !== -1
				) {
					return "관내 학생들의 학업과 기초 교육을 전담하는 공교육 시설로, 인근에 어린이 보호구역(스쿨존)이 지정되어 있습니다.";
				}
				if (n.indexOf("도서관") !== -1) {
					return "시민들의 열람, 도서 대출 및 평생학습 프로그램을 지원하는 구미시 지식문화 거점 도서관입니다.";
				}
				if (
					n.indexOf("순천향") !== -1 ||
					n.indexOf("차병원") !== -1 ||
					n.indexOf("종합병원") !== -1 ||
					n.indexOf("병원") !== -1
				) {
					return "구미 및 경북 서남부 권역의 24시간 응급의료 및 전문 진료 체계를 갖춘 종합 의료시설입니다.";
				}
				if (
					n.indexOf("아파트") !== -1 ||
					n.indexOf("맨션") !== -1 ||
					bCat === "residential"
				) {
					return (
						f +
						"공동주택 단지 건축물입니다. 주변 생활 편의시설 및 대중교통 노선이 잘 연계되어 있어 입주민들의 일상생활 중심지로 활용됩니다."
					);
				}
				if (
					bCat === "commercial" ||
					n.indexOf("마트") !== -1 ||
					n.indexOf("타워") !== -1 ||
					n.indexOf("빌딩") !== -1
				) {
					return (
						f +
						"상업 및 업무 지원 복합 시설입니다. 각종 근린생활시설, 상가 또는 오피스가 입주하여 유동인구가 집중되는 장소입니다."
					);
				}
				if (bCat === "public") {
					return (
						f +
						"구미시 관내 공공 행정 또는 복지 기반 시설로, 시민 편의 증진과 공공 목적의 방문이 이루어지는 거점 건물입니다."
					);
				}
				return (
					f +
					"구미시 공간정보 데이터 기반 등록 시설물입니다. 길찾기 출발지 또는 목적지로 설정하여 도보, 버스 및 최적 이동 경로 안내를 확인하실 수 있습니다."
				);
			}

			var introDesc =
				extraProps && extraProps.desc
					? extraProps.desc
					: generateContextualBuildingIntro(name, floors, cat);

			var ratingInfo =
				typeof window.getBuildingRatingInfo === "function"
					? window.getBuildingRatingInfo(name, lat, lng)
					: { avg: "4.0", count: 10 };
			var starsHtml =
				typeof window.getStarString === "function"
					? window.getStarString(ratingInfo.avg)
					: "⭐⭐⭐⭐☆";

			card.innerHTML =
				'<div style="margin-bottom:12px;">' +
				'<button onclick="window.closeBuildingDetailSidebar()" style="display:inline-flex; align-items:center; gap:5px; background:none; border:none; color:#2563eb; font-size:12px; font-weight:700; cursor:pointer; padding:4px 0 10px 0;">' +
				"← 검색 / 길찾기로 돌아가기" +
				"</button>" +
				'<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
				'<span style="display:inline-block; padding:3px 8px; font-size:11px; font-weight:700; background:#eff6ff; color:#2563eb; border-radius:6px;">🏢 ' +
				cat +
				"</span>" +
				"<a href=\"javascript:void(0)\" onclick=\"window.openReviewModal('" +
				safeName +
				"', " +
				lat +
				", " +
				lng +
				')\" style="font-size:11px; color:#2563eb; font-weight:700; text-decoration:none;">⭐ 평점 남기기</a>' +
				"</div>" +
				'<h2 style="margin:0 0 6px 0; font-size:18px; font-weight:800; color:var(--text-main); letter-spacing:-0.5px;">' +
				(name || "건축물") +
				"</h2>" +
				'<div id="sidebar-rating-area" style="font-size:12px; margin-bottom:6px;">' +
				starsHtml +
				' <b style="color:#f59e0b; font-size:13px;">' +
				ratingInfo.avg +
				'</b> <span style="color:var(--text-muted); font-size:11px;">(' +
				ratingInfo.count +
				"건)</span></div>" +
				"</div>" +
				'<div style="background:var(--bg-input); border:1px solid var(--border-panel); border-radius:10px; padding:12px; margin-bottom:12px; display:flex; flex-direction:column; gap:8px; font-size:12px;">' +
				'<div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">층수 규모</span><span style="font-weight:700; color:var(--text-main);">' +
				floorText +
				"</span></div>" +
				'<div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">위치 좌표</span><span style="font-family:monospace; color:var(--text-muted); font-size:11px;">' +
				coordStr +
				"</span></div>" +
				"</div>" +
				'<div style="background:var(--bg-input); border:1px solid var(--border-panel); border-radius:10px; padding:12px; margin-bottom:14px; font-size:12px; line-height:1.6; color:var(--text-main);">' +
				'<div style="font-weight:700; font-size:12px; margin-bottom:4px; color:#2563eb;">건물 소개</div>' +
				'<div style="color:var(--text-muted); font-size:12px; line-height:1.55;">' +
				introDesc +
				"</div>" +
				"</div>" +
				'<div style="display:flex; gap:8px;">' +
				"<button onclick=\"window.setGuMapRoutePoint('START', " +
				lat +
				", " +
				lng +
				", '" +
				safeName +
				'\'); window.closeBuildingDetailSidebar();" style="flex:1; padding:10px 0; border:none; border-radius:8px; background:#2563eb; color:white; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; box-shadow:0 2px 8px rgba(37,99,235,0.2);">출발지로 설정</button>' +
				"<button onclick=\"window.setGuMapRoutePoint('END', " +
				lat +
				", " +
				lng +
				", '" +
				safeName +
				'\'); window.closeBuildingDetailSidebar();" style="flex:1; padding:10px 0; border:none; border-radius:8px; background:#ef4444; color:white; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; box-shadow:0 2px 8px rgba(239,68,68,0.2);">도착지로 설정</button>' +
				"</div>";

			card.style.display = "block";
		};

		window.closeBuildingDetailSidebar = () => {
			var card = document.getElementById("building-sidebar-card");
			if (card) card.style.display = "none";
			var collContent = document.getElementById("collapsible-content");
			if (collContent) collContent.style.display = "block";
		};

		window.gumapWebGLMap.on("mouseenter", "bus-stops-icon", () => {
			window.gumapWebGLMap.getCanvas().style.cursor = "pointer";
		});
		window.gumapWebGLMap.on("mouseleave", "bus-stops-icon", () => {
			window.gumapWebGLMap.getCanvas().style.cursor = "";
		});

		window.gumapWebGLMap.on("click", "bus-stops-icon", (e) => {
			if (e.features && e.features.length) {
				var feat = e.features[0];
				var props = feat.properties || {};
				var name = props.name || props.station_name || "버스정류장";
				var id = props.id || props.nodeid || "";
				var coords = feat.geometry.coordinates;
				var lng = coords[0];
				var lat = coords[1];

				if (currentPopup) {
					currentPopup.remove();
					currentPopup = null;
				}

				// 실시간 버스 도착 정보 및 시간표 팝업 즉시 호출
				if (typeof window.openStopInfo === "function") {
					var preRoutes = null;
					if (props.routes) {
						try {
							preRoutes = typeof props.routes === "string" ? JSON.parse(props.routes) : props.routes;
						} catch(e) {}
					}
					window.openStopInfo(name, lat, lng, id, preRoutes);
				} else {
					var popupHtml =
						"<div style=\"padding:10px 12px; min-width:200px; font-family:-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif;\">" +
						'<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">' +
						'<span style="font-size:16px;">🚏</span>' +
						'<div style="font-size:14px; font-weight:800; color:#1e293b; letter-spacing:-0.3px;">' +
						name +
						"</div>" +
						"</div>" +
						(id
							? '<div style="font-size:11px; color:#64748b; margin-bottom:8px; font-weight:500;">정류소 ID: ' +
								id +
								"</div>"
							: '<div style="margin-bottom:8px;"></div>') +
						'<div style="display:flex; gap:6px; margin-top:6px;">' +
						"<button onclick=\"window.setGuMapRoutePoint('START', " +
						lat +
						", " +
						lng +
						", '" +
						name.replace(/'/g, "\\'") +
						'\');" style="flex:1; padding:5px 0; border:none; border-radius:6px; background:#2563eb; color:white; font-size:11px; font-weight:700; cursor:pointer;">출발</button>' +
						"<button onclick=\"window.setGuMapRoutePoint('END', " +
						lat +
						", " +
						lng +
						", '" +
						name.replace(/'/g, "\\'") +
						'\');" style="flex:1; padding:5px 0; border:none; border-radius:6px; background:#ef4444; color:white; font-size:11px; font-weight:700; cursor:pointer;">도착</button>' +
						"</div>" +
						"</div>";

					currentPopup = new maplibregl.Popup({ offset: 12, closeButton: true })
						.setLngLat([lng, lat])
						.setHTML(popupHtml)
						.addTo(window.gumapWebGLMap);
				}
			}
		});

		window.gumapWebGLMap.on("click", (e) => {
			var features = window.gumapWebGLMap.queryRenderedFeatures(e.point, {
				layers: ["buildings-fill", "bus-stops-icon"],
			});
			if (features.length === 0) {
				var selSrc = window.gumapWebGLMap.getSource("selected-building");
				if (selSrc) {
					selSrc.setData({ type: "FeatureCollection", features: [] });
				}
				if (currentPopup) {
					currentPopup.remove();
					currentPopup = null;
				}
			}
		});
	}

	window.enableGuMapWebGLMap = () => {
		if (!window.gumapWebGLMap) {
			initMapLibreInstance();
		}
		var container = document.getElementById("maplibre-container");
		if (container) {
			container.style.display = "block";
		}
		if (window.gumapWebGLMap) {
			window.gumapWebGLMap.resize();
		}
		window.isGuMapWebGLActive = true;
	};

	window.disableGuMapWebGLMap = () => {
		var container = document.getElementById("maplibre-container");
		if (container) {
			container.style.display = "none";
		}
		window.isGuMapWebGLActive = false;
	};

	function autoInit() {
		initMapLibreInstance();
		window.enableGuMapWebGLMap();
		var tabGumap = document.getElementById("tab-mode-gumap");
		if (tabGumap) {
			tabGumap.classList.add("active");
		}
	}

	window.renderGuMapWebGLRoute = (validPath, mainColor) => {
		if (
			!window.gumapWebGLMap ||
			!Array.isArray(validPath) ||
			validPath.length < 2
		)
			return;

		var lineCoords = validPath.map((p) => {
			return [p[1], p[0]]; // [lng, lat]
		});

		var routeGeoJSON = {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					geometry: {
						type: "LineString",
						coordinates: lineCoords,
					},
					properties: {},
				},
			],
		};

		var map = window.gumapWebGLMap;
		var busColor = mainColor || "#2563eb";

		// 기존 구형 네온/코어 레이어가 남아있다면 정리
		if (map.getLayer("webgl-route-glow")) map.removeLayer("webgl-route-glow");
		if (map.getLayer("webgl-route-core")) map.removeLayer("webgl-route-core");

		// 도로(roads, surfaces, overpasses)보다는 무조건 "위에" 배치하고,
		// 버스정류장 아이콘(bus-stops-icon) 및 POI 텍스트 바로 아래에 얹는 완벽한 Z-Order 설정
		var targetBeforeId = null;
		if (map.getLayer("bus-stops-icon")) {
			targetBeforeId = "bus-stops-icon";
		} else if (map.getLayer("gumap-poi")) {
			targetBeforeId = "gumap-poi";
		} else if (map.getLayer("roads-labels")) {
			targetBeforeId = "roads-labels";
		}

		var source = map.getSource("webgl-route-source");
		if (source) {
			source.setData(routeGeoJSON);
			if (map.getLayer("webgl-route-main")) {
				map.setPaintProperty("webgl-route-main", "line-color", busColor);
			}
			// Z-Order 재정렬 보장 (항상 도로 위로 유지)
			try {
				if (targetBeforeId) {
					if (map.getLayer("webgl-route-casing"))
						map.moveLayer("webgl-route-casing", targetBeforeId);
					if (map.getLayer("webgl-route-main"))
						map.moveLayer("webgl-route-main", targetBeforeId);
				}
			} catch (e) {}
		} else {
			map.addSource("webgl-route-source", {
				type: "geojson",
				data: routeGeoJSON,
			});

			// 1. 도로면 위 선명한 흰색 케이싱 (어떤 도로 색상 위에서도 100% 뚜렷하게 분리)
			map.addLayer(
				{
					id: "webgl-route-casing",
					type: "line",
					source: "webgl-route-source",
					layout: { "line-join": "round", "line-cap": "round" },
					paint: {
						"line-color": "#ffffff",
						"line-opacity": 0.9,
						"line-width": [
							"interpolate",
							["linear"],
							["zoom"],
							10,
							4.5,
							13,
							7.5,
							16,
							11.0,
						],
					},
				},
				targetBeforeId,
			);

			// 2. 메인 버스 노선선 (도로 위에 강렬하고 선명하게 얹어짐)
			map.addLayer(
				{
					id: "webgl-route-main",
					type: "line",
					source: "webgl-route-source",
					layout: { "line-join": "round", "line-cap": "round" },
					paint: {
						"line-color": busColor,
						"line-opacity": 1.0,
						"line-width": [
							"interpolate",
							["linear"],
							["zoom"],
							10,
							3.0,
							13,
							5.5,
							16,
							8.0,
						],
					},
				},
				targetBeforeId,
			);
		}

		try {
			var bounds = new maplibregl.LngLatBounds();
			lineCoords.forEach((c) => {
				bounds.extend(c);
			});
			map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 900 });
		} catch (e) {}
	};

	window.clearGuMapWebGLRoute = () => {
		if (!window.gumapWebGLMap) return;
		var source = window.gumapWebGLMap.getSource("webgl-route-source");
		if (source) {
			source.setData({ type: "FeatureCollection", features: [] });
		}
	};

	window.clearGuMapWebGLMarkers = () => {
		if (startMarker) {
			startMarker.remove();
			startMarker = null;
		}
		if (wayMarker) {
			wayMarker.remove();
			wayMarker = null;
		}
		if (endMarker) {
			endMarker.remove();
			endMarker = null;
		}
	};

	// [과제 9 & 15] 지역 확장 스위치: 구미시 ↔ 김천시 ↔ 칠곡군 동적 벡터 로딩 & 이동
	window.switchMapRegion = (regionKey) => {
		if (!window.gumapWebGLMap) return;
		var regions = {
			gumi: { name: "구미시", center: [128.344573, 36.119485], zoom: 13.5 },
			gimcheon: { name: "김천시", center: [128.1146, 36.1235], zoom: 14.0 },
			chilgok: { name: "칠곡군", center: [128.3989, 35.9947], zoom: 14.0 },
			daegu: {
				name: "대구광역시",
				center: [128.601445, 35.871435],
				zoom: 13.5,
			},
		};
		var target = regions[regionKey];
		if (!target) return;

		// 김천·칠곡은 이미 gumap-tiles(MBTiles)에 건물/도로/하천이 통합 수록되어 있으므로 별도 대용량 GeoJSON 중복 로드 생략
		if (regionKey === "daegu") {
			if (!window.gumapWebGLMap.getSource("daegu-roads")) {
				window.gumapWebGLMap.addSource("daegu-roads", {
					type: "geojson",
					data:
						"GUMAP-데이터/vector_layers/" +
						encodeURIComponent("대구_도로망.geojson"),
					tolerance: 0.375,
				});
				// Casing
				window.gumapWebGLMap.addLayer(
					{
						id: "daegu-roads-casing",
						type: "line",
						source: "daegu-roads",
						minzoom: 7,
						paint: {
							"line-color": "#94a3b8",
							"line-width": [
								"interpolate",
								["linear"],
								["zoom"],
								7,
								1.4,
								10,
								2.8,
								13,
								5.2,
								16,
								8.0,
							],
						},
					},
					"roads-labels",
				);
				// Fill
				window.gumapWebGLMap.addLayer(
					{
						id: "daegu-roads-fill",
						type: "line",
						source: "daegu-roads",
						minzoom: 7,
						paint: {
							"line-color": [
								"match",
								["to-string", ["get", "cls"]],
								"1",
								"#ffa03d",
								"2",
								"#fdd835",
								"#ffffff",
							],
							"line-width": [
								"interpolate",
								["linear"],
								["zoom"],
								7,
								0.8,
								10,
								1.8,
								13,
								3.8,
								16,
								6.0,
							],
						},
					},
					"roads-labels",
				);
				// Road Labels
				window.gumapWebGLMap.addLayer({
					id: "daegu-roads-labels",
					type: "symbol",
					source: "daegu-roads",
					minzoom: 13.5,
					filter: ["all", ["has", "name"], ["!=", ["get", "name"], ""]],
					layout: {
						"symbol-placement": "line",
						"text-field": "{name}",
						"text-font": ["Noto Sans Regular"],
						"text-size": [
							"interpolate",
							["linear"],
							["zoom"],
							13.5,
							9.5,
							16,
							11.5,
							18,
							13,
						],
					},
					paint: {
						"text-color": "#334155",
						"text-halo-color": "#ffffff",
						"text-halo-width": 1.5,
					},
				});
			}
			if (!window.gumapWebGLMap.getSource("daegu-buildings")) {
				window.gumapWebGLMap.addSource("daegu-buildings", {
					type: "geojson",
					data:
						"GUMAP-데이터/vector_layers/" +
						encodeURIComponent("대구_건물.geojson"),
					tolerance: 0.5,
				});
				// 2D building fill (strictly 2D flat, NO 3D)
				window.gumapWebGLMap.addLayer(
					{
						id: "daegu-buildings-fill",
						type: "fill",
						source: "daegu-buildings",
						minzoom: 13.0,
						paint: {
							"fill-color": "#ffffff",
							"fill-opacity": 0.96,
						},
					},
					"daegu-roads-casing",
				);
				// 2D building outline
				window.gumapWebGLMap.addLayer(
					{
						id: "daegu-buildings-outline",
						type: "line",
						source: "daegu-buildings",
						minzoom: 13.0,
						paint: {
							"line-color": "#cbd5e1",
							"line-width": 0.8,
						},
					},
					"daegu-roads-casing",
				);
			}
		}

		window.gumapWebGLMap.flyTo({
			center: target.center,
			zoom: target.zoom,
			duration: 1200,
		});

		var btns = document.querySelectorAll(".region-tab-btn");
		btns.forEach((b) => {
			b.classList.remove("active");
		});
		var activeBtn = document.getElementById("region-btn-" + regionKey);
		if (activeBtn) activeBtn.classList.add("active");
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", autoInit);
	} else {
		autoInit();
	}
})();
