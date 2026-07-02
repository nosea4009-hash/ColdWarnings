/* =========================================================
   ColdWarnings — map.js
   Todo lo relacionado a Leaflet: mapa base, capas de provincia,
   municipios, dibujo libre, círculos y render de zonas/boletines.
   ========================================================= */

(function (global) {
  "use strict";

  const CW = global.CW;
  const { ARGENTINA_BOUNDS } = CW.constants;

  let map = null;
  let basemapLayer = null;
  let currentBasemapId = "carto_light";

  let provinciaLayer = null;
  let municipiosLayer = null;      // capa base gris de todos los municipios
  let municipiosLabelLayer = null; // capa de etiquetas (LayerGroup de marcadores divIcon)
  let selectionHighlightLayer = null; // resalta municipios seleccionados en el editor

  let drawnItems = null;           // FeatureGroup de leaflet-draw
  let drawControl = null;

  let circuloPreviewLayer = null;  // círculo(s) del editor
  let circuloMarker = null;

  const extraLayersById = {};      // id -> L.geoJSON layer

  let zonesRenderLayer = null;     // capa que dibuja las zonas del boletín destacado / borrador preview
  let previewZoneLayer = null;     // preview de la zona que se está armando (antes de agregarla)

  const BASEMAP_DEFS = {
    carto_light: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap',
    },
    osm: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
    },
    esri_sat: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
    },
    carto_dark: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap',
    },
  };

  function initMap() {
    map = L.map("map", {
      center: [-38.4, -63.6],
      zoom: 4,
      minZoom: 3,
      maxZoom: 18,
      zoomControl: true,
      preferCanvas: true,
    });

    setBasemap(currentBasemapId);
    fitToArgentina();

    // FeatureGroup para dibujo libre
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: { allowIntersection: true, showArea: true, shapeOptions: { color: "#1a4380" } },
        polyline: false,
        rectangle: { shapeOptions: { color: "#1a4380" } },
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: drawnItems, remove: true },
    });
    // Sólo se agrega al mapa cuando el modo de selección sea "draw" (ver ui.js)

    map.on(L.Draw.Event.CREATED, function (e) {
      drawnItems.addLayer(e.layer);
      if (CW.ui && CW.ui.onDrawChanged) CW.ui.onDrawChanged();
    });
    map.on(L.Draw.Event.EDITED, function () {
      if (CW.ui && CW.ui.onDrawChanged) CW.ui.onDrawChanged();
    });
    map.on(L.Draw.Event.DELETED, function () {
      if (CW.ui && CW.ui.onDrawChanged) CW.ui.onDrawChanged();
    });

    map.on("click", function (e) {
      if (CW.ui && CW.ui.onMapClick) CW.ui.onMapClick(e.latlng);
    });

    zonesRenderLayer = L.layerGroup().addTo(map);
    previewZoneLayer = L.layerGroup().addTo(map);
    selectionHighlightLayer = L.layerGroup().addTo(map);
    circuloPreviewLayer = L.layerGroup().addTo(map);
    municipiosLabelLayer = L.layerGroup();

    return map;
  }

  function getMap() { return map; }

  function setBasemap(id) {
    const def = BASEMAP_DEFS[id] || BASEMAP_DEFS.carto_light;
    currentBasemapId = id;
    if (basemapLayer) map.removeLayer(basemapLayer);
    basemapLayer = L.tileLayer(def.url, {
      attribution: def.attribution,
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);
    basemapLayer.bringToBack();
  }

  function fitToArgentina() {
    map.fitBounds(ARGENTINA_BOUNDS, { padding: [10, 10] });
  }

  function fitToBounds(bounds) {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [20, 20] });
  }

  // -------------------- Provincia (referencia) --------------------
  function setProvinciaLayer(fc) {
    clearProvinciaLayer();
    if (!fc) return null;
    provinciaLayer = L.geoJSON(fc, {
      style: { color: "#123166", weight: 2.5, fillOpacity: 0.02, dashArray: "6,4" },
      interactive: false,
    }).addTo(map);
    return provinciaLayer;
  }
  function clearProvinciaLayer() {
    if (provinciaLayer) { map.removeLayer(provinciaLayer); provinciaLayer = null; }
  }
  function getProvinciaBounds() {
    return provinciaLayer ? provinciaLayer.getBounds() : null;
  }

  // -------------------- Municipios (base) --------------------
  function setMunicipiosLayer(indexed) {
    clearMunicipiosLayer();
    if (!indexed || !indexed.length) return null;

    const fc = { type: "FeatureCollection", features: indexed.map((m) => m.feature) };
    municipiosLayer = L.geoJSON(fc, {
      style: function () {
        return { color: "#7a8ba3", weight: 1, fillColor: "#c9d4e2", fillOpacity: 0.18 };
      },
      onEachFeature: function (feature, layer) {
        const rec = indexed.find((m) => m.feature === feature);
        if (!rec) return;
        layer._cwId = rec.id;
        layer._cwNombre = rec.nombre;
        layer.bindTooltip(rec.nombre, { sticky: true });
        layer.on("click", function (ev) {
          L.DomEvent.stopPropagation(ev);
          if (CW.ui && CW.ui.onMunicipioClicked) CW.ui.onMunicipioClicked(rec.id);
        });
        layer.on("mouseover", function () { layer.setStyle({ weight: 2, color: "#1a4380" }); });
        layer.on("mouseout", function () {
          if (!layer._cwSelected) layer.setStyle({ color: "#7a8ba3", weight: 1 });
        });

        // Etiqueta (marcador de texto) en el centroide, oculto salvo zoom alto
        try {
          const center = layer.getBounds().getCenter();
          const marker = L.marker(center, {
            icon: L.divIcon({ className: "muni-label", html: rec.nombre, iconSize: null }),
            interactive: false,
          });
          municipiosLabelLayer.addLayer(marker);
        } catch (e) { /* geometría inválida, ignorar etiqueta */ }
      },
    }).addTo(map);

    updateLabelVisibility();
    map.on("zoomend", updateLabelVisibility);

    return municipiosLayer;
  }

  function clearMunicipiosLayer() {
    if (municipiosLayer) { map.removeLayer(municipiosLayer); municipiosLayer = null; }
    if (municipiosLabelLayer) { map.removeLayer(municipiosLabelLayer); municipiosLabelLayer.clearLayers(); }
    clearSelectionHighlight();
  }

  function setLabelsVisible(visible) {
    if (!municipiosLabelLayer) return;
    if (visible) updateLabelVisibility();
    else if (map.hasLayer(municipiosLabelLayer)) map.removeLayer(municipiosLabelLayer);
  }

  let labelsEnabled = true;
  function updateLabelVisibility() {
    if (!municipiosLabelLayer) return;
    const show = labelsEnabled && map.getZoom() >= 8;
    if (show && !map.hasLayer(municipiosLabelLayer)) municipiosLabelLayer.addTo(map);
    if (!show && map.hasLayer(municipiosLabelLayer)) map.removeLayer(municipiosLabelLayer);
  }
  function setLabelsEnabled(enabled) {
    labelsEnabled = enabled;
    updateLabelVisibility();
  }

  function getMunicipiosBounds() {
    return municipiosLayer ? municipiosLayer.getBounds() : null;
  }

  function eachMunicipioLayer(cb) {
    if (!municipiosLayer) return;
    municipiosLayer.eachLayer(cb);
  }

  function getVisibleMunicipioIds() {
    const ids = [];
    const bounds = map.getBounds();
    eachMunicipioLayer((layer) => {
      try {
        if (bounds.intersects(layer.getBounds())) ids.push(layer._cwId);
      } catch (e) { /* noop */ }
    });
    return ids;
  }

  // -------------------- Resaltado de selección (editor) --------------------
  function clearSelectionHighlight() {
    if (selectionHighlightLayer) selectionHighlightLayer.clearLayers();
    eachMunicipioLayer((layer) => {
      layer._cwSelected = false;
      layer.setStyle({ color: "#7a8ba3", weight: 1, fillColor: "#c9d4e2", fillOpacity: 0.18 });
    });
  }

  function setSelectedMunicipios(idSet, color) {
    eachMunicipioLayer((layer) => {
      const sel = idSet.has(layer._cwId);
      layer._cwSelected = sel;
      if (sel) {
        layer.setStyle({ color: color || "#1a4380", weight: 2, fillColor: color || "#2f6fd6", fillOpacity: 0.45 });
        layer.bringToFront();
      } else {
        layer.setStyle({ color: "#7a8ba3", weight: 1, fillColor: "#c9d4e2", fillOpacity: 0.18 });
      }
    });
  }

  // -------------------- Dibujo libre --------------------
  function enableDrawControl(enable) {
    if (!drawControl) return;
    const onMap = !!drawControl._map;
    if (enable && !onMap) map.addControl(drawControl);
    if (!enable && onMap) map.removeControl(drawControl);
  }

  function getDrawnGeometries() {
    const geoms = [];
    drawnItems.eachLayer((layer) => {
      const gj = layer.toGeoJSON();
      if (gj && gj.geometry) geoms.push(gj.geometry);
    });
    return geoms;
  }

  function getDrawnCount() {
    return drawnItems ? drawnItems.getLayers().length : 0;
  }

  function clearDrawnItems() {
    if (drawnItems) drawnItems.clearLayers();
  }

  // -------------------- Círculo --------------------
  function setCirculoPendingMarker(latlng) {
    circuloPreviewLayer.clearLayers();
    if (circuloMarker) circuloMarker = null;
    if (!latlng) return;
    circuloMarker = L.marker(latlng, { draggable: false }).addTo(circuloPreviewLayer);
  }

  function previewCirculo(latlng, radiusKm, color) {
    circuloPreviewLayer.clearLayers();
    if (!latlng) return;
    L.marker(latlng).addTo(circuloPreviewLayer);
    L.circle(latlng, {
      radius: radiusKm * 1000,
      color: color || "#1a4380",
      fillColor: color || "#2f6fd6",
      fillOpacity: 0.25,
      weight: 2,
    }).addTo(circuloPreviewLayer);
  }

  function renderAddedCirculos(circulos, color) {
    (circulos || []).forEach((c) => {
      L.circle([c.lat, c.lng], {
        radius: c.radioKm * 1000,
        color: color || "#1a4380",
        fillColor: color || "#2f6fd6",
        fillOpacity: 0.3,
        weight: 2,
        dashArray: "4,3",
      }).addTo(circuloPreviewLayer);
    });
  }

  function clearCirculoPreview() {
    circuloPreviewLayer.clearLayers();
    circuloMarker = null;
  }

  // -------------------- Render de zonas / boletines --------------------
  function clearZonesRender() {
    zonesRenderLayer.clearLayers();
  }

  function renderZonesOnMap(zonas) {
    clearZonesRender();
    const allBoundsLayers = [];
    (zonas || []).forEach((zona) => {
      const style = {
        color: shadeColor(zona.colorHex, -25),
        weight: 2,
        fillColor: zona.colorHex,
        fillOpacity: 0.55,
      };
      (zona.geometries || []).forEach((geom) => {
        try {
          const layer = L.geoJSON(geom, { style }).addTo(zonesRenderLayer);
          layer.bindPopup(popupHtmlForZone(zona));
          allBoundsLayers.push(layer);
        } catch (e) { /* geometría inválida */ }
      });
    });
    return allBoundsLayers;
  }

  function popupHtmlForZone(zona) {
    const nivelLabel = zona.nivelLabel || "";
    const municipiosTxt = (zona.municipiosNombres || []).slice(0, 12).join(", ");
    const extra = (zona.municipiosNombres || []).length > 12 ? "…" : "";
    return `<b>${escapeHtml(nivelLabel)}</b> — ${escapeHtml(zona.fenomeno || "")}<br>` +
      (municipiosTxt ? `<i>${escapeHtml(municipiosTxt)}${extra}</i><br>` : "") +
      (zona.detalle ? `<div style="margin-top:4px;max-width:240px;">${escapeHtml(zona.detalle)}</div>` : "");
  }

  function renderPreviewZone(geometries, color) {
    previewZoneLayer.clearLayers();
    (geometries || []).forEach((geom) => {
      try {
        L.geoJSON(geom, {
          style: { color: shadeColor(color, -25), weight: 2, fillColor: color, fillOpacity: 0.4, dashArray: "5,5" },
        }).addTo(previewZoneLayer);
      } catch (e) { /* noop */ }
    });
  }

  function clearPreviewZone() { previewZoneLayer.clearLayers(); }

  function fitToZonesBounds(zonas) {
    const group = L.featureGroup();
    (zonas || []).forEach((zona) => {
      (zona.geometries || []).forEach((geom) => {
        try { L.geoJSON(geom).eachLayer((l) => group.addLayer(l)); } catch (e) { /* noop */ }
      });
    });
    if (group.getLayers().length) map.fitBounds(group.getBounds(), { padding: [20, 20] });
  }

  // -------------------- Capas extra --------------------
  function addExtraLayer(id, fc, color) {
    const layer = L.geoJSON(fc, {
      style: { color: color, weight: 2, fillColor: color, fillOpacity: 0.15 },
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, { radius: 5, color: color, fillColor: color, fillOpacity: 0.8 });
      },
    }).addTo(map);
    extraLayersById[id] = layer;
    return layer;
  }
  function removeExtraLayer(id) {
    const layer = extraLayersById[id];
    if (layer) { map.removeLayer(layer); delete extraLayersById[id]; }
  }

  // -------------------- utils --------------------
  function shadeColor(hex, percent) {
    if (!hex) return "#333333";
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const num = parseInt(hex, 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00ff) + percent;
    let b = (num & 0x0000ff) + percent;
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  CW.map = {
    initMap,
    getMap,
    setBasemap,
    fitToArgentina,
    fitToBounds,

    setProvinciaLayer,
    clearProvinciaLayer,
    getProvinciaBounds,

    setMunicipiosLayer,
    clearMunicipiosLayer,
    getMunicipiosBounds,
    eachMunicipioLayer,
    getVisibleMunicipioIds,
    setLabelsEnabled,

    clearSelectionHighlight,
    setSelectedMunicipios,

    enableDrawControl,
    getDrawnGeometries,
    getDrawnCount,
    clearDrawnItems,

    setCirculoPendingMarker,
    previewCirculo,
    renderAddedCirculos,
    clearCirculoPreview,

    renderZonesOnMap,
    renderPreviewZone,
    clearPreviewZone,
    clearZonesRender,
    fitToZonesBounds,

    addExtraLayer,
    removeExtraLayer,

    shadeColor,
    escapeHtml,
  };
})(window);
