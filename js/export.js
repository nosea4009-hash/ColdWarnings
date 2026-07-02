/* =========================================================
   ColdWarnings — export.js
   Exportación de boletines a .geojson, exportación de imagen
   del boletín (.png) e importación/exportación del proyecto
   completo (.json) para guardar y retomar el trabajo.
   ========================================================= */

(function (global) {
  "use strict";

  const CW = global.CW;
  const S = CW.state;

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime || "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function slugify(str) {
    return (str || "boletin")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "boletin";
  }

  // ------------------------------------------------------------------
  // Boletín -> FeatureCollection GeoJSON
  //   Cada "feature" corresponde a UNA geometría de UNA zona
  //   (para zonas por municipios, se exporta un feature por municipio
  //   para preservar los límites originales).
  // ------------------------------------------------------------------
  function bulletinToFeatureCollection(bulletin) {
    const features = [];
    (bulletin.zonas || []).forEach((zona) => {
      if (zona.modoSeleccion === "municipios" && zona.municipios && zona.municipios.length) {
        zona.geometries.forEach((geom, i) => {
          const muni = zona.municipios[i];
          features.push({
            type: "Feature",
            properties: {
              boletin_id: bulletin.id || null,
              boletin_titulo: bulletin.titulo || null,
              boletin_emisor: bulletin.emisor || null,
              boletin_valido_desde: bulletin.desde || null,
              boletin_valido_hasta: bulletin.hasta || null,
              boletin_publicado_en: bulletin.publicadoEn || null,
              zona_id: zona.id,
              tipo_producto: zona.tipoProducto,
              nivel_id: zona.nivelId,
              nivel_label: zona.nivelLabel,
              color: zona.colorHex,
              fenomeno: zona.fenomeno,
              detalle: zona.detalle || null,
              municipio_id: muni ? muni.id : null,
              municipio_nombre: muni ? muni.nombre : null,
            },
            geometry: geom,
          });
        });
      } else {
        zona.geometries.forEach((geom) => {
          features.push({
            type: "Feature",
            properties: {
              boletin_id: bulletin.id || null,
              boletin_titulo: bulletin.titulo || null,
              boletin_emisor: bulletin.emisor || null,
              boletin_valido_desde: bulletin.desde || null,
              boletin_valido_hasta: bulletin.hasta || null,
              boletin_publicado_en: bulletin.publicadoEn || null,
              zona_id: zona.id,
              tipo_producto: zona.tipoProducto,
              nivel_id: zona.nivelId,
              nivel_label: zona.nivelLabel,
              color: zona.colorHex,
              fenomeno: zona.fenomeno,
              detalle: zona.detalle || null,
              municipio_id: null,
              municipio_nombre: null,
            },
            geometry: geom,
          });
        });
      }
    });
    return {
      type: "FeatureCollection",
      cw_meta: {
        generado_por: "ColdWarnings",
        version: 1,
        exportado_en: new Date().toISOString(),
      },
      features,
    };
  }

  function currentBorradorAsBulletin() {
    return {
      id: "__borrador__",
      titulo: S.borrador.titulo || "Boletín sin título (borrador)",
      desde: S.borrador.desde,
      hasta: S.borrador.hasta,
      emisor: S.borrador.emisor,
      resumen: S.borrador.resumen,
      zonas: S.borrador.zonas,
      publicadoEn: null,
    };
  }

  function exportSelectedBulletin() {
    const sel = document.getElementById("select-bol-export").value;
    let bulletin;
    if (sel === "__borrador__") {
      bulletin = currentBorradorAsBulletin();
      if (!bulletin.zonas.length) { CW.ui.toast("El borrador no tiene zonas para exportar.", "err"); return; }
    } else {
      bulletin = S.bulletins.find((b) => b.id === sel);
      if (!bulletin) { CW.ui.toast("No se encontró el boletín seleccionado.", "err"); return; }
    }
    const fc = bulletinToFeatureCollection(bulletin);
    downloadBlob(JSON.stringify(fc, null, 2), `coldwarnings-${slugify(bulletin.titulo)}.geojson`, "application/geo+json");
    CW.ui.toast("Boletín exportado como .geojson.", "ok");
  }

  function exportAllBulletins() {
    if (!S.bulletins.length) { CW.ui.toast("No hay boletines emitidos para exportar.", "err"); return; }
    const allFeatures = [];
    S.bulletins.forEach((b) => {
      const fc = bulletinToFeatureCollection(b);
      allFeatures.push(...fc.features);
    });
    const out = {
      type: "FeatureCollection",
      cw_meta: { generado_por: "ColdWarnings", version: 1, exportado_en: new Date().toISOString(), boletines: S.bulletins.length },
      features: allFeatures,
    };
    downloadBlob(JSON.stringify(out, null, 2), "coldwarnings-todos-los-boletines.geojson", "application/geo+json");
    CW.ui.toast(`Exportados ${S.bulletins.length} boletín(es) en un solo .geojson.`, "ok");
  }

  // ------------------------------------------------------------------
  // Importar boletines desde un .geojson exportado por ColdWarnings
  // ------------------------------------------------------------------
  function importBulletinsFromGeoJSON(file) {
    CW.ui.readFileAsJSON(file).then((json) => {
      if (!json || !Array.isArray(json.features)) throw new Error("El archivo no tiene el formato esperado (FeatureCollection).");
      const byBoletin = {};
      json.features.forEach((f) => {
        const p = f.properties || {};
        const bid = p.boletin_id || "importado_" + slugify(p.boletin_titulo || "sin-titulo");
        if (!byBoletin[bid]) {
          byBoletin[bid] = {
            id: CW.util.uid("bol"),
            titulo: (p.boletin_titulo || "Boletín importado") + " (importado)",
            desde: p.boletin_valido_desde || "",
            hasta: p.boletin_valido_hasta || "",
            emisor: p.boletin_emisor || "",
            resumen: "",
            zonas: {},
            publicadoEn: p.boletin_publicado_en || new Date().toISOString(),
          };
        }
        const zid = p.zona_id || CW.util.uid("zona");
        if (!byBoletin[bid].zonas[zid]) {
          byBoletin[bid].zonas[zid] = {
            id: zid,
            tipoProducto: p.tipo_producto || "nivel",
            nivelId: p.nivel_id || "amarillo",
            nivelLabel: p.nivel_label || "Alerta",
            colorHex: p.color || "#ffd966",
            fenomeno: p.fenomeno || "Fenómeno sin especificar",
            detalle: p.detalle || "",
            modoSeleccion: p.municipio_nombre ? "municipios" : "draw",
            municipios: [],
            municipiosNombres: [],
            geometries: [],
          };
        }
        byBoletin[bid].zonas[zid].geometries.push(f.geometry);
        if (p.municipio_nombre) {
          byBoletin[bid].zonas[zid].municipios.push({ id: p.municipio_id, nombre: p.municipio_nombre });
          byBoletin[bid].zonas[zid].municipiosNombres.push(p.municipio_nombre);
        }
      });

      let count = 0;
      Object.values(byBoletin).forEach((b) => {
        b.zonas = Object.values(b.zonas);
        S.bulletins.unshift(b);
        count++;
      });

      CW.ui.renderBulletinList();
      CW.ui.renderFeaturedSelect();
      CW.ui.renderExportSelect();
      CW.ui.renderBadges();
      if (count && !S.featuredBulletinId) {
        S.featuredBulletinId = S.bulletins[0].id;
        CW.ui.renderFeaturedSelect();
      }
      CW.ui.renderBulletinPreview();
      CW.ui.toast(`Importado(s) ${count} boletín(es) desde el .geojson.`, "ok");
    }).catch((err) => CW.ui.toast(err.message, "err"));
  }

  // ------------------------------------------------------------------
  // Exportar imagen del boletín (PNG) usando html2canvas
  // ------------------------------------------------------------------
  function exportBulletinPNG() {
    const card = document.getElementById("bulletin-card");
    CW.ui.toast("Generando imagen, puede tardar unos segundos…", "ok");
    html2canvas(card, { useCORS: true, allowTaint: false, scale: 2, backgroundColor: "#ffffff" })
      .then((canvas) => {
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "coldwarnings-boletin.png";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }, "image/png");
      })
      .catch((err) => {
        console.error(err);
        CW.ui.toast("No se pudo generar la imagen. Probá cambiando el mapa base a 'Claro (CARTO)'.", "err");
      });
  }

  // ------------------------------------------------------------------
  // Proyecto completo (guardar/abrir todo: geodatos + boletines)
  // ------------------------------------------------------------------
  function saveProject() {
    const payload = {
      cw_project: true,
      version: 1,
      savedAt: new Date().toISOString(),
      provincia: S.provincia,
      municipios: {
        raw: S.municipios.raw,
        nombreField: S.municipios.nombreField,
        idField: S.municipios.idField,
      },
      extraLayersMeta: S.extraLayers, // sólo metadata visual; los datos de capas extra no se re-serializan por simplicidad
      borrador: S.borrador,
      bulletins: S.bulletins,
      featuredBulletinId: S.featuredBulletinId,
    };
    downloadBlob(JSON.stringify(payload), "coldwarnings-proyecto.json", "application/json");
    CW.ui.toast("Proyecto guardado. Volvé a abrirlo con 'Abrir proyecto'.", "ok");
  }

  function loadProject(file) {
    CW.ui.readFileAsJSON(file).then((json) => {
      if (!json || !json.cw_project) throw new Error("El archivo no es un proyecto válido de ColdWarnings.");

      if (json.provincia && json.provincia.raw) {
        S.provincia.raw = json.provincia.raw;
        CW.map.setProvinciaLayer(S.provincia.raw);
        document.getElementById("status-provincia").textContent = "Cargado desde proyecto guardado";
        document.getElementById("status-provincia").className = "status-line ok";
      }

      if (json.municipios && json.municipios.raw) {
        S.municipios.raw = json.municipios.raw;
        CW.ui.rebuildMunicipiosIndex(json.municipios.nombreField, json.municipios.idField);
        document.getElementById("status-municipios").textContent = "Cargado desde proyecto guardado";
        document.getElementById("status-municipios").className = "status-line ok";
      }

      S.borrador = json.borrador || S.borrador;
      document.getElementById("input-bol-titulo").value = S.borrador.titulo || "";
      document.getElementById("input-bol-desde").value = S.borrador.desde || "";
      document.getElementById("input-bol-hasta").value = S.borrador.hasta || "";
      document.getElementById("input-bol-emisor").value = S.borrador.emisor || "";
      document.getElementById("input-bol-resumen").value = S.borrador.resumen || "";

      S.bulletins = json.bulletins || [];
      S.featuredBulletinId = json.featuredBulletinId || (S.bulletins[0] && S.bulletins[0].id) || null;

      CW.ui.renderZoneList();
      CW.ui.renderBadges();
      CW.ui.renderBulletinList();
      CW.ui.renderFeaturedSelect();
      CW.ui.renderExportSelect();
      CW.ui.renderBulletinPreview();
      CW.ui.toast("Proyecto cargado correctamente.", "ok");
    }).catch((err) => CW.ui.toast(err.message, "err"));
  }

  CW.exportTools = {
    exportSelectedBulletin,
    exportAllBulletins,
    importBulletinsFromGeoJSON,
    exportBulletinPNG,
    saveProject,
    loadProject,
  };
})(window);
