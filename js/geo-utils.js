/* =========================================================
   ColdWarnings — geo-utils.js
   Utilidades de geoprocesamiento: parseo de GeoJSON, detección
   de campos de nombre/id, cálculo de bbox/centroides, generación
   de círculos, y armado de features para exportación.
   ========================================================= */

(function (global) {
  "use strict";

  const NAME_FIELD_CANDIDATES = [
    "nombre", "NOMBRE", "Nombre",
    "nam", "NAM",
    "name", "NAME", "Name",
    "nombre_completo", "NOMBRE_COMPLETO",
    "municipio", "MUNICIPIO", "Municipio",
    "departamen", "departamento", "DEPARTAMENTO", "Departamento",
    "partido", "PARTIDO", "Partido",
    "comuna", "COMUNA", "Comuna",
    "nomdepto", "NOMDEPTO", "NOM_DEPTO",
    "fna", "FNA",
    "gna", "GNA",
    "label", "LABEL", "etiqueta",
  ];

  const ID_FIELD_CANDIDATES = [
    "id", "ID", "Id",
    "in1", "IN1",
    "cod", "COD", "codigo", "CODIGO",
    "coddepto", "COD_DEPTO", "coddpto",
    "objectid", "OBJECTID",
    "fid", "FID",
  ];

  function isFeatureCollection(obj) {
    return obj && obj.type === "FeatureCollection" && Array.isArray(obj.features);
  }

  // Acepta FeatureCollection, Feature suelto, GeometryCollection o array de features
  function normalizeToFeatureCollection(obj) {
    if (!obj) return null;
    if (isFeatureCollection(obj)) return obj;
    if (obj.type === "Feature") return { type: "FeatureCollection", features: [obj] };
    if (Array.isArray(obj.features)) return { type: "FeatureCollection", features: obj.features };
    if (obj.type && obj.coordinates) {
      // Geometry suelta
      return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: obj }] };
    }
    if (Array.isArray(obj)) {
      return { type: "FeatureCollection", features: obj };
    }
    return null;
  }

  function detectField(featureProps, candidates) {
    for (const c of candidates) {
      if (Object.prototype.hasOwnProperty.call(featureProps, c) && featureProps[c] !== null && featureProps[c] !== "") {
        return c;
      }
    }
    return null;
  }

  function detectNameField(fc) {
    if (!fc || !fc.features || !fc.features.length) return null;
    // Buscar en las primeras N features un campo consistente
    const sample = fc.features.slice(0, 25);
    const counts = {};
    for (const f of sample) {
      const props = f.properties || {};
      const found = detectField(props, NAME_FIELD_CANDIDATES);
      if (found) counts[found] = (counts[found] || 0) + 1;
    }
    let best = null, bestCount = 0;
    for (const k in counts) {
      if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
    }
    if (best) return best;

    // Fallback: cualquier propiedad de tipo string, corta, presente en todas
    const propsKeys = Object.keys(sample[0].properties || {});
    for (const k of propsKeys) {
      const allStrings = sample.every((f) => typeof (f.properties || {})[k] === "string");
      if (allStrings) return k;
    }
    return null;
  }

  function detectIdField(fc) {
    if (!fc || !fc.features || !fc.features.length) return null;
    const sample = fc.features.slice(0, 25);
    const counts = {};
    for (const f of sample) {
      const props = f.properties || {};
      const found = detectField(props, ID_FIELD_CANDIDATES);
      if (found) counts[found] = (counts[found] || 0) + 1;
    }
    let best = null, bestCount = 0;
    for (const k in counts) {
      if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
    }
    return best;
  }

  function getAllPropertyKeys(fc) {
    const keys = new Set();
    (fc.features || []).forEach((f) => {
      Object.keys(f.properties || {}).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }

  // Construye índice normalizado: [{id, nombre, feature, properties}]
  function buildMunicipiosIndex(fc, nombreField, idField) {
    const out = [];
    (fc.features || []).forEach((f, i) => {
      const props = f.properties || {};
      const nombre = nombreField ? String(props[nombreField] ?? ("Sin nombre #" + i)) : ("Sin nombre #" + i);
      const idRaw = idField ? props[idField] : null;
      const id = idRaw !== null && idRaw !== undefined && idRaw !== "" ? String(idRaw) : ("gen_" + i);
      out.push({
        id,
        nombre,
        feature: f,
        properties: props,
      });
    });
    return out;
  }

  // Bounding box de un GeoJSON genérico (Feature, FeatureCollection o Geometry)
  function computeBBox(geojson) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walk(coords, depth) {
      if (depth === 0) {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach((c) => walk(c, depth - 1));
      }
    }
    function depthForType(type) {
      switch (type) {
        case "Point": return 0;
        case "MultiPoint":
        case "LineString": return 1;
        case "MultiLineString":
        case "Polygon": return 2;
        case "MultiPolygon": return 3;
        default: return 2;
      }
    }
    function visitGeometry(geom) {
      if (!geom) return;
      if (geom.type === "GeometryCollection") {
        (geom.geometries || []).forEach(visitGeometry);
        return;
      }
      walk(geom.coordinates, depthForType(geom.type));
    }
    function visit(obj) {
      if (!obj) return;
      if (obj.type === "FeatureCollection") {
        (obj.features || []).forEach(visit);
      } else if (obj.type === "Feature") {
        visitGeometry(obj.geometry);
      } else if (obj.type) {
        visitGeometry(obj);
      }
    }
    visit(geojson);
    if (!isFinite(minX)) return null;
    return [[minY, minX], [maxY, maxX]]; // [[south,west],[north,east]] estilo Leaflet
  }

  // Genera un polígono circular aproximado (GeoJSON) dado centro (lat,lng) y radio en km
  function circleToPolygon(lat, lng, radiusKm, points) {
    points = points || 64;
    const coords = [];
    const earthRadiusKm = 6371;
    const latRad = (lat * Math.PI) / 180;
    for (let i = 0; i <= points; i++) {
      const angle = (i * 2 * Math.PI) / points;
      const dx = radiusKm * Math.cos(angle);
      const dy = radiusKm * Math.sin(angle);
      const dLat = dy / earthRadiusKm;
      const dLng = dx / (earthRadiusKm * Math.cos(latRad));
      const ptLat = lat + (dLat * 180) / Math.PI;
      const ptLng = lng + (dLng * 180) / Math.PI;
      coords.push([ptLng, ptLat]);
    }
    return { type: "Polygon", coordinates: [coords] };
  }

  // Une geometrías de un array de features en una sola FeatureCollection (para exportar zona)
  function featuresToGeometryArray(features) {
    return features.map((f) => f.geometry).filter(Boolean);
  }

  global.CW = global.CW || {};
  global.CW.geo = {
    isFeatureCollection,
    normalizeToFeatureCollection,
    detectNameField,
    detectIdField,
    getAllPropertyKeys,
    buildMunicipiosIndex,
    computeBBox,
    circleToPolygon,
    featuresToGeometryArray,
  };
})(window);
