/* =========================================================
   ColdWarnings — state.js
   Modelo de datos central + constantes de dominio.
   No depende de Leaflet ni del DOM: es puro estado + helpers.
   ========================================================= */

(function (global) {
  "use strict";

  // ---------------------------------------------------------
  // Constantes de dominio
  // ---------------------------------------------------------

  // Niveles estilo SMN (avisos por color)
  const NIVELES_AVISO = [
    { id: "vigilancia", label: "Vigilancia",  short: "VIG", color: "#8fd694", ink: "#123" },
    { id: "amarillo",   label: "Alerta Amarilla", short: "AMA", color: "#ffd966", ink: "#1a1a1a" },
    { id: "naranja",    label: "Alerta Naranja",  short: "NAR", color: "#ff8c00", ink: "#1a1a1a" },
    { id: "rojo",       label: "Alerta Roja",     short: "ROJ", color: "#e0342a", ink: "#ffffff" },
  ];

  // Niveles estilo outlook probabilístico NWS (probabilidad de superar criterio)
  const NIVELES_PROB = [
    { id: "p10",  label: "< 10%",   short: "<10%",  color: "#ffffff", ink: "#1a1a1a" },
    { id: "p30",  label: "10 – 30%", short: "10-30", color: "#4fc3c8", ink: "#1a1a1a" },
    { id: "p50",  label: "30 – 50%", short: "30-50", color: "#fff066", ink: "#1a1a1a" },
    { id: "p80",  label: "50 – 80%", short: "50-80", color: "#e0342a", ink: "#ffffff" },
    { id: "pmax", label: "> 80%",    short: ">80",   color: "#8a2be2", ink: "#ffffff" },
  ];

  const FENOMENOS = [
    "Tormentas fuertes",
    "Tormentas severas / granizo",
    "Viento fuerte",
    "Viento Zonda",
    "Nevada",
    "Tormenta invernal (nieve + viento)",
    "Ola de calor",
    "Ola de frío / helada",
    "Lluvias intensas / anegamiento",
    "Crecida / desborde de río",
    "Niebla densa",
    "Riesgo de incendio forestal",
    "Otro (especificar)",
  ];

  const BASEMAPS = [
    { id: "carto_light", label: "Claro (CARTO)" },
    { id: "osm", label: "Calles (OSM)" },
    { id: "esri_sat", label: "Satélite (Esri)" },
    { id: "carto_dark", label: "Oscuro (CARTO)" },
  ];

  // Bounding box aproximado de Argentina continental + insular
  const ARGENTINA_BOUNDS = [
    [-55.3, -73.6],
    [-21.7, -53.5],
  ];

  // ---------------------------------------------------------
  // Estado global de la aplicación
  // ---------------------------------------------------------

  const state = {
    // Geodatos base (cargados por el usuario)
    provincia: {
      raw: null,      // GeoJSON original
      nombreField: null,
    },
    municipios: {
      raw: null,          // GeoJSON original
      nombreField: null,  // campo detectado/elegido para el nombre
      idField: null,
      features: [],       // normalizado: [{id, nombre, feature, bbox, centroid}]
    },

    // Capas extra decorativas
    extraLayers: [], // [{id, name, color, data}]

    // Selección activa en la pestaña "Nueva zona"
    editor: {
      editingZonaId: null,          // si !null, se está editando una zona ya agregada al borrador
      tipoProducto: "nivel",        // "nivel" | "probabilidad"
      nivelId: NIVELES_AVISO[1].id, // por defecto Amarillo
      fenomeno: FENOMENOS[0],
      fenomenoOtro: "",
      detalle: "",
      modoSeleccion: "municipios",  // "municipios" | "draw" | "circulo"
      municipioIdsSel: new Set(),
      circuloPendiente: null,       // {lat,lng}
      circuloRadioKm: 25,
      circulosAgregados: [],        // [{lat,lng,radioKm}]
    },

    // Boletín en construcción
    borrador: {
      titulo: "",
      desde: "",
      hasta: "",
      emisor: "Servicio Meteorológico Nacional",
      resumen: "",
      zonas: [], // [{id, nivelId, tipoProducto, fenomeno, detalle, modoSeleccion, municipios:[{id,nombre}], geometries:[GeoJSON geometry], color}]
    },

    // Boletines publicados
    bulletins: [], // [{id, titulo, desde, hasta, emisor, resumen, zonas:[...], publicadoEn}]
    featuredBulletinId: null,
  };

  // ---------------------------------------------------------
  // Helpers genéricos
  // ---------------------------------------------------------

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function getNivelDef(tipoProducto, nivelId) {
    const list = tipoProducto === "probabilidad" ? NIVELES_PROB : NIVELES_AVISO;
    return list.find((n) => n.id === nivelId) || list[0];
  }

  function nivelRank(tipoProducto, nivelId) {
    const list = tipoProducto === "probabilidad" ? NIVELES_PROB : NIVELES_AVISO;
    const idx = list.findIndex((n) => n.id === nivelId);
    return idx === -1 ? 0 : idx;
  }

  function isBulletinActive(b) {
    const now = Date.now();
    const desde = b.desde ? new Date(b.desde).getTime() : null;
    const hasta = b.hasta ? new Date(b.hasta).getTime() : null;
    if (desde && now < desde) return "scheduled";
    if (hasta && now > hasta) return "expired";
    return "active";
  }

  function resetEditorSelection() {
    state.editor.municipioIdsSel = new Set();
    state.editor.circuloPendiente = null;
    state.editor.circulosAgregados = [];
    state.editor.editingZonaId = null;
  }

  // Namespace expuesto
  global.CW = global.CW || {};
  global.CW.state = state;
  global.CW.constants = {
    NIVELES_AVISO,
    NIVELES_PROB,
    FENOMENOS,
    BASEMAPS,
    ARGENTINA_BOUNDS,
  };
  global.CW.util = global.CW.util || {};
  Object.assign(global.CW.util, {
    uid,
    getNivelDef,
    nivelRank,
    isBulletinActive,
    resetEditorSelection,
  });
})(window);
