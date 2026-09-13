window.getGuMap2DStyle = function(getVectorUrl) {
  if (typeof getVectorUrl !== "function") {
    getVectorUrl = function(name) {
      var isSubDir = typeof window !== "undefined" && window.location.pathname.indexOf("/GUMAP-일반지도/") !== -1;
      return (isSubDir ? "../" : "") + "GUMAP-데이터/vector_layers/" + encodeURIComponent(name);
    };
  }

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "gumi-contours": {
        type: "geojson",
        data: getVectorUrl("구미시_산_등고선.geojson"),
        tolerance: 0.8
      },
      "gumi-water": {
        type: "geojson",
        data: getVectorUrl("gumi_water_polygons.geojson")
      },
      "gumi-parks": {
        type: "geojson",
        data: getVectorUrl("gumi_park_polygons.geojson")
      },
      "gumi-railways": {
        type: "geojson",
        data: getVectorUrl("gumi_railways.geojson"),
        tolerance: 0.5
      },
      "gumi-roads": {
        type: "geojson",
        data: getVectorUrl("gumi_roads_hierarchy.geojson"),
        tolerance: 0.375
      },
      "gumi-buildings": {
        type: "geojson",
        data: getVectorUrl("gumi_buildings_fast.geojson"),
        tolerance: 0.5,
        generateId: true
      },
      "gumi-poi": {
        type: "geojson",
        data: getVectorUrl("gumi_poi_landmarks.geojson")
      }
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#f8f9fa" }
      },
      {
        id: "contours-line",
        type: "line",
        source: "gumi-contours",
        minzoom: 11,
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "elev"], 50],
            25, "#d5e8d4",
            100, "#97d097",
            200, "#d4b373",
            400, "#c27d48",
            650, "#8b4513"
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11, 0.5,
            14, 0.9,
            16, 1.4
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11, 0.45,
            14, 0.75
          ]
        }
      },
      {
        id: "parks-fill",
        type: "fill",
        source: "gumi-parks",
        paint: { "fill-color": "#d9eed6", "fill-opacity": 0.85 }
      },
      {
        id: "parks-outline",
        type: "line",
        source: "gumi-parks",
        paint: { "line-color": "#c0dfbc", "line-width": 0.8 }
      },
      {
        id: "water-fill",
        type: "fill",
        source: "gumi-water",
        paint: { "fill-color": "#cbe3fb", "fill-opacity": 0.95 }
      },
      {
        id: "water-outline",
        type: "line",
        source: "gumi-water",
        paint: { "line-color": "#b1d4f6", "line-width": 1.0 }
      },
      {
        id: "railways-casing",
        type: "line",
        source: "gumi-railways",
        minzoom: 10,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#475569",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 13, 2.5, 16, 4.0]
        }
      },
      {
        id: "railways-dash",
        type: "line",
        source: "gumi-railways",
        minzoom: 11,
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.0, 13, 1.8, 16, 3.0],
          "line-dasharray": [2, 2]
        }
      },
      {
        id: "roads-minor-casing",
        type: "line",
        source: "gumi-roads",
        minzoom: 14,
        filter: ["==", ["to-string", ["get", "cls"]], "8"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#dfdfdf",
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.5, 16, 3.5, 18, 5.0]
        }
      },
      {
        id: "roads-secondary-casing",
        type: "line",
        source: "gumi-roads",
        minzoom: 12,
        filter: ["==", ["to-string", ["get", "cls"]], "4"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#d4d4d8",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 14, 3.0, 16, 5.0, 18, 6.5]
        }
      },
      {
        id: "roads-primary-casing",
        type: "line",
        source: "gumi-roads",
        minzoom: 10,
        filter: ["==", ["to-string", ["get", "cls"]], "2"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#e69a47",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 13, 3.5, 15, 5.5, 18, 7.5]
        }
      },
      {
        id: "roads-highway-casing",
        type: "line",
        source: "gumi-roads",
        minzoom: 8,
        filter: ["==", ["to-string", ["get", "cls"]], "1"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#e8783d",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 10, 2.5, 12, 3, 14, 3.5, 16, 4]
        }
      },
      {
        id: "roads-fill",
        type: "line",
        source: "gumi-roads",
        minzoom: 10,
        filter: ["==", ["to-string", ["get", "cls"]], "2"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 12, 1.5, 14, 2, 16, 2.5, 18, 3]
        }
      },
      
      {
        id: "buildings-fill",
        type: "fill",
        source: "gumi-buildings",
        minzoom: 14,
        paint: {
          "fill-color": "#e2e8f0",
          "fill-opacity": 0.88
        }
      },
      {
        id: "buildings-outline",
        type: "line",
        source: "gumi-buildings",
        minzoom: 14,
        paint: {
          "line-color": "#cbd5e1",
          "line-width": 0.8
        }
      },
      {
        id: "buildings-selected-outline",
        type: "line",
        source: "gumi-buildings",
        minzoom: 14,
        filter: ["==", ["get", "id"], "___NONE___"],
        paint: {
          "line-color": "#2563eb",
          "line-width": 2.5
        }
      },
{
        id: "roads-labels",
        type: "symbol",
        source: "gumi-roads",
        minzoom: 14,
        filter: ["all", ["has", "name"], ["!=", ["get", "name"], ""]],
        layout: {
          "text-field": "{name}",
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 16, 11.5, 18, 13]
        },
        paint: {
          "text-color": "#475569",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5
        }
      },
      {
        id: "poi-labels",
        type: "symbol",
        source: "gumi-poi",
        minzoom: 13,
        filter: ["all", ["has", "name"], ["!=", ["get", "name"], ""]],
        layout: {
          "text-field": "{name}",
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 15, 12, 17, 13.5],
          "text-offset": [0, 1.2],
          "text-anchor": "top"
        },
        paint: {
          "text-color": "#1e293b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2.0
        }
      }
    ]
  };
};