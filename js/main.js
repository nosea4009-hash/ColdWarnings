/* =========================================================
   ColdWarnings — main.js
   Punto de entrada: inicializa mapa, UI y conecta los botones
   de exportación / importación / guardado de proyecto.
   ========================================================= */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const CW = window.CW;

    // 1. Mapa
    CW.map.initMap();

    // 2. Selector de mapa base
    const basemapSel = document.getElementById("select-basemap");
    CW.constants.BASEMAPS.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id; opt.textContent = b.label;
      basemapSel.appendChild(opt);
    });
    basemapSel.value = "carto_light";
    basemapSel.addEventListener("change", (e) => CW.map.setBasemap(e.target.value));

    // 3. UI: tabs y paneles
    CW.ui.initTabs();
    CW.ui.initGeodatos();
    CW.ui.initZonaTab();
    CW.ui.initBorradorTab();
    CW.ui.initEmitidosTab();
    CW.ui.initCapasTab();
    CW.ui.initMapToolbar();
    CW.ui.startClock();

    // Estado inicial de listados
    CW.ui.renderMuniList();
    CW.ui.renderZoneList();
    CW.ui.renderBadges();
    CW.ui.renderBulletinList();
    CW.ui.renderFeaturedSelect();
    CW.ui.renderExportSelect();
    CW.ui.renderBulletinPreview();

    // 4. Exportación
    document.getElementById("btn-export-geojson").addEventListener("click", CW.exportTools.exportSelectedBulletin);
    document.getElementById("btn-export-all-geojson").addEventListener("click", CW.exportTools.exportAllBulletins);
    document.getElementById("btn-export-png").addEventListener("click", CW.exportTools.exportBulletinPNG);

    document.getElementById("file-import-geojson").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) CW.exportTools.importBulletinsFromGeoJSON(file);
      e.target.value = "";
    });

    // 5. Proyecto (guardar / abrir todo)
    document.getElementById("btn-save-project").addEventListener("click", CW.exportTools.saveProject);
    document.getElementById("btn-load-project").addEventListener("click", () => document.getElementById("file-project").click());
    document.getElementById("file-project").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) CW.exportTools.loadProject(file);
      e.target.value = "";
    });

    // Ajuste responsive: invalidar tamaño del mapa cuando cambia el layout
    window.addEventListener("resize", () => CW.map.getMap().invalidateSize());
    setTimeout(() => CW.map.getMap().invalidateSize(), 250);

    CW.ui.toast("Bienvenido a ColdWarnings. Cargá tus geodatos en la pestaña 1 para comenzar.", "ok");
  });
})();
