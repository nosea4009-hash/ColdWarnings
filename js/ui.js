/* =========================================================
   ColdWarnings — ui.js
   Toda la lógica de interacción del panel lateral: tabs, carga
   de archivos, editor de zonas, borrador de boletín, listado de
   boletines emitidos, capas extra y modales/toasts.
   ========================================================= */

(function (global) {
  "use strict";

  const CW = global.CW;
  const S = CW.state;
  const U = CW.util;
  const G = CW.geo;
  const C = CW.constants;

  // ------------------------------------------------------------------
  // Toasts
  // ------------------------------------------------------------------
  function toast(msg, type) {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 4200);
  }

  // ------------------------------------------------------------------
  // Modal genérico
  // ------------------------------------------------------------------
  function openModal(html, onMount) {
    document.getElementById("modal-content").innerHTML = html;
    document.getElementById("modal-overlay").classList.remove("hidden");
    if (onMount) onMount(document.getElementById("modal-content"));
  }
  function closeModal() {
    document.getElementById("modal-overlay").classList.add("hidden");
    document.getElementById("modal-content").innerHTML = "";
  }

  // ------------------------------------------------------------------
  // Tabs
  // ------------------------------------------------------------------
  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
  }
  function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tabId));
    // Al salir de la pestaña "zona" desactivamos el control de dibujo si estaba activo
    if (tabId !== "zona") {
      CW.map.enableDrawControl(false);
    } else {
      syncSelectionModeUI();
    }
  }

  // ------------------------------------------------------------------
  // TAB 1 — Geodatos
  // ------------------------------------------------------------------
  function initGeodatos() {
    document.getElementById("file-provincia").addEventListener("change", onProvinciaFile);
    document.getElementById("btn-clear-provincia").addEventListener("click", clearProvincia);
    document.getElementById("file-municipios").addEventListener("change", onMunicipiosFile);
    document.getElementById("btn-clear-municipios").addEventListener("click", clearMunicipios);
    document.getElementById("chk-mostrar-labels").addEventListener("change", (e) => {
      CW.map.setLabelsEnabled(e.target.checked);
    });
    document.getElementById("btn-cambiar-campo-nombre").addEventListener("click", () => {
      if (!S.municipios.raw) return;
      promptNameFieldChoice(S.municipios.raw, (field) => {
        rebuildMunicipiosIndex(field, S.municipios.idField);
      });
    });

    const buscador = document.getElementById("input-buscar");
    buscador.addEventListener("input", onBuscarInput);
  }

  function readFileAsJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); }
        catch (e) { reject(new Error("El archivo no es un JSON/GeoJSON válido.")); }
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.readAsText(file);
    });
  }

  function onProvinciaFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsJSON(file).then((json) => {
      const fc = G.normalizeToFeatureCollection(json);
      if (!fc) throw new Error("Formato GeoJSON no reconocido.");
      S.provincia.raw = fc;
      CW.map.setProvinciaLayer(fc);
      const statusEl = document.getElementById("status-provincia");
      statusEl.textContent = `Cargado: ${fc.features.length} feature(s) — ${file.name}`;
      statusEl.className = "status-line ok";
      const b = CW.map.getProvinciaBounds();
      if (b && b.isValid()) CW.map.fitToBounds(b);
      toast("Límite de provincia cargado correctamente.", "ok");
    }).catch((err) => {
      const statusEl = document.getElementById("status-provincia");
      statusEl.textContent = "Error: " + err.message;
      statusEl.className = "status-line err";
      toast(err.message, "err");
    });
  }

  function clearProvincia() {
    S.provincia.raw = null;
    CW.map.clearProvinciaLayer();
    const statusEl = document.getElementById("status-provincia");
    statusEl.textContent = "Sin cargar";
    statusEl.className = "status-line";
    document.getElementById("file-provincia").value = "";
  }

  function onMunicipiosFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsJSON(file).then((json) => {
      const fc = G.normalizeToFeatureCollection(json);
      if (!fc || !fc.features.length) throw new Error("Formato GeoJSON no reconocido o vacío.");
      S.municipios.raw = fc;
      const detected = G.detectNameField(fc);
      const idField = G.detectIdField(fc);
      S.municipios.idField = idField;

      const statusEl = document.getElementById("status-municipios");
      if (detected) {
        rebuildMunicipiosIndex(detected, idField);
        statusEl.textContent = `Cargado: ${fc.features.length} feature(s) — ${file.name}`;
        statusEl.className = "status-line ok";
        toast(`Municipios cargados (${fc.features.length}). Campo de nombre detectado: "${detected}".`, "ok");
      } else {
        statusEl.textContent = `Cargado ${fc.features.length} feature(s), pero no se detectó el campo de nombre automáticamente.`;
        statusEl.className = "status-line err";
        promptNameFieldChoice(fc, (field) => rebuildMunicipiosIndex(field, idField));
      }
    }).catch((err) => {
      const statusEl = document.getElementById("status-municipios");
      statusEl.textContent = "Error: " + err.message;
      statusEl.className = "status-line err";
      toast(err.message, "err");
    });
  }

  function promptNameFieldChoice(fc, cb) {
    const keys = G.getAllPropertyKeys(fc);
    const options = keys.map((k) => `<option value="${CW.map.escapeHtml(k)}">${CW.map.escapeHtml(k)}</option>`).join("");
    openModal(`
      <h3>Elegí el campo de nombre</h3>
      <p class="hint">No pudimos detectar automáticamente qué propiedad del GeoJSON contiene el nombre de cada municipio/departamento. Elegilo de la lista de propiedades disponibles.</p>
      <div class="field-group">
        <label>Propiedad</label>
        <select id="modal-name-field">${options}</select>
      </div>
      <button class="btn btn-primary btn-block" id="modal-confirm-name-field">Confirmar</button>
    `, () => {
      document.getElementById("modal-confirm-name-field").addEventListener("click", () => {
        const field = document.getElementById("modal-name-field").value;
        closeModal();
        cb(field);
      });
    });
  }

  function rebuildMunicipiosIndex(nombreField, idField) {
    S.municipios.nombreField = nombreField;
    S.municipios.idField = idField;
    S.municipios.features = G.buildMunicipiosIndex(S.municipios.raw, nombreField, idField);

    CW.map.setMunicipiosLayer(S.municipios.features);

    document.getElementById("grupo-buscador").hidden = false;
    document.getElementById("grupo-stats").hidden = false;
    document.getElementById("grupo-labels").hidden = false;
    document.getElementById("grupo-campo-nombre").hidden = false;
    document.getElementById("status-campo-nombre").textContent = `nombre = "${nombreField}"` + (idField ? ` · id = "${idField}"` : " · id = (autogenerado)");

    document.getElementById("stats-municipios").innerHTML =
      `Total de unidades: <b>${S.municipios.features.length}</b><br>` +
      `Campo de nombre: <code>${CW.map.escapeHtml(nombreField)}</code><br>` +
      `Campo de id: <code>${idField ? CW.map.escapeHtml(idField) : "(autogenerado)"}</code>`;

    renderMuniList();
    populateFenomenoSelect(); // no-op safeguard if not yet called
  }

  function clearMunicipios() {
    S.municipios.raw = null;
    S.municipios.nombreField = null;
    S.municipios.idField = null;
    S.municipios.features = [];
    CW.map.clearMunicipiosLayer();
    document.getElementById("file-municipios").value = "";
    document.getElementById("status-municipios").textContent = "Sin cargar";
    document.getElementById("status-municipios").className = "status-line";
    document.getElementById("grupo-buscador").hidden = true;
    document.getElementById("grupo-stats").hidden = true;
    document.getElementById("grupo-labels").hidden = true;
    document.getElementById("grupo-campo-nombre").hidden = true;
    document.getElementById("search-results").innerHTML = "";
    renderMuniList();
  }

  function onBuscarInput(e) {
    const q = e.target.value.trim().toLowerCase();
    const box = document.getElementById("search-results");
    box.innerHTML = "";
    if (!q) return;
    const matches = S.municipios.features.filter((m) => m.nombre.toLowerCase().includes(q)).slice(0, 30);
    matches.forEach((m) => {
      const div = document.createElement("div");
      div.className = "search-result-item";
      div.textContent = m.nombre;
      div.addEventListener("click", () => {
        const bounds = G.computeBBox(m.feature);
        if (bounds) CW.map.fitToBounds(bounds);
      });
      box.appendChild(div);
    });
    if (!matches.length) box.innerHTML = '<div class="search-result-item">Sin resultados</div>';
  }

  // ------------------------------------------------------------------
  // TAB 2 — Nueva zona
  // ------------------------------------------------------------------
  function initZonaTab() {
    document.getElementById("select-tipo-producto").addEventListener("change", (e) => {
      S.editor.tipoProducto = e.target.value;
      S.editor.nivelId = (e.target.value === "probabilidad" ? C.NIVELES_PROB : C.NIVELES_AVISO)[1].id;
      renderNivelSwatches();
      updatePreviewZone();
    });

    populateFenomenoSelect();
    document.getElementById("select-fenomeno").addEventListener("change", (e) => {
      S.editor.fenomeno = e.target.value;
      document.getElementById("input-fenomeno-otro").hidden = e.target.value !== "Otro (especificar)";
    });
    document.getElementById("input-fenomeno-otro").addEventListener("input", (e) => {
      S.editor.fenomenoOtro = e.target.value;
    });
    document.getElementById("input-detalle-zona").addEventListener("input", (e) => {
      S.editor.detalle = e.target.value;
    });

    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => setSelectionMode(btn.dataset.mode));
    });

    document.getElementById("filtro-lista-municipios").addEventListener("input", renderMuniList);
    document.getElementById("btn-select-view").addEventListener("click", () => {
      const ids = CW.map.getVisibleMunicipioIds();
      ids.forEach((id) => S.editor.municipioIdsSel.add(id));
      syncMunicipioSelectionVisual();
      renderMuniList();
    });
    document.getElementById("btn-clear-sel-municipios").addEventListener("click", () => {
      S.editor.municipioIdsSel.clear();
      syncMunicipioSelectionVisual();
      renderMuniList();
    });

    document.getElementById("btn-clear-draw").addEventListener("click", () => {
      CW.map.clearDrawnItems();
      onDrawChanged();
    });

    const radio = document.getElementById("input-radio-km");
    radio.addEventListener("input", (e) => {
      S.editor.circuloRadioKm = Number(e.target.value);
      document.getElementById("label-radio-km").textContent = e.target.value;
      if (S.editor.circuloPendiente) {
        CW.map.previewCirculo(S.editor.circuloPendiente, S.editor.circuloRadioKm, currentColorHex());
      }
    });
    document.getElementById("btn-add-circulo").addEventListener("click", () => {
      if (!S.editor.circuloPendiente) { toast("Primero hacé clic en el mapa para ubicar el centro.", "err"); return; }
      S.editor.circulosAgregados.push({ lat: S.editor.circuloPendiente.lat, lng: S.editor.circuloPendiente.lng, radioKm: S.editor.circuloRadioKm });
      S.editor.circuloPendiente = null;
      CW.map.setCirculoPendingMarker(null);
      renderCirculosState();
      updatePreviewZone();
    });
    document.getElementById("btn-clear-circulos").addEventListener("click", () => {
      S.editor.circulosAgregados = [];
      S.editor.circuloPendiente = null;
      CW.map.clearCirculoPreview();
      renderCirculosState();
      updatePreviewZone();
    });

    document.getElementById("btn-agregar-zona").addEventListener("click", onAgregarZona);
    document.getElementById("btn-cancelar-edicion-zona").addEventListener("click", cancelZonaEdit);

    renderNivelSwatches();
    syncSelectionModeUI();
  }

  function populateFenomenoSelect() {
    const sel = document.getElementById("select-fenomeno");
    if (!sel || sel.options.length) return;
    C.FENOMENOS.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f; opt.textContent = f;
      sel.appendChild(opt);
    });
    S.editor.fenomeno = C.FENOMENOS[0];
  }

  function renderNivelSwatches() {
    const box = document.getElementById("nivel-swatches");
    box.innerHTML = "";
    const list = S.editor.tipoProducto === "probabilidad" ? C.NIVELES_PROB : C.NIVELES_AVISO;
    if (!list.find((n) => n.id === S.editor.nivelId)) S.editor.nivelId = list[0].id;
    list.forEach((n) => {
      const div = document.createElement("div");
      div.className = "swatch" + (n.id === S.editor.nivelId ? " selected" : "");
      div.style.background = n.color;
      div.style.color = n.ink;
      div.innerHTML = `${n.label}<small>${n.short}</small>`;
      div.addEventListener("click", () => {
        S.editor.nivelId = n.id;
        renderNivelSwatches();
        syncMunicipioSelectionVisual();
        updatePreviewZone();
      });
      box.appendChild(div);
    });
  }

  function currentColorHex() {
    return U.getNivelDef(S.editor.tipoProducto, S.editor.nivelId).color;
  }

  function setSelectionMode(mode) {
    S.editor.modoSeleccion = mode;
    syncSelectionModeUI();
  }

  function syncSelectionModeUI() {
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === S.editor.modoSeleccion));
    document.getElementById("panel-mode-municipios").hidden = S.editor.modoSeleccion !== "municipios";
    document.getElementById("panel-mode-draw").hidden = S.editor.modoSeleccion !== "draw";
    document.getElementById("panel-mode-circulo").hidden = S.editor.modoSeleccion !== "circulo";
    CW.map.enableDrawControl(S.editor.modoSeleccion === "draw");
    updatePreviewZone();
  }

  function renderMuniList() {
    const box = document.getElementById("muni-list");
    if (!box) return;
    box.innerHTML = "";
    const filter = (document.getElementById("filtro-lista-municipios").value || "").trim().toLowerCase();
    const items = S.municipios.features.filter((m) => !filter || m.nombre.toLowerCase().includes(filter));
    document.getElementById("count-municipios-sel").textContent = S.editor.municipioIdsSel.size;

    if (!items.length) {
      box.innerHTML = '<div class="muni-item">Sin municipios cargados o sin coincidencias.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    items.slice(0, 400).forEach((m) => {
      const checked = S.editor.municipioIdsSel.has(m.id);
      const div = document.createElement("div");
      div.className = "muni-item" + (checked ? " checked" : "");
      div.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""}> <span>${CW.map.escapeHtml(m.nombre)}</span>`;
      div.addEventListener("click", () => toggleMunicipio(m.id));
      frag.appendChild(div);
    });
    box.appendChild(frag);
  }

  function toggleMunicipio(id) {
    if (S.editor.municipioIdsSel.has(id)) S.editor.municipioIdsSel.delete(id);
    else S.editor.municipioIdsSel.add(id);
    renderMuniList();
    syncMunicipioSelectionVisual();
    updatePreviewZone();
  }

  function onMunicipioClicked(id) {
    if (S.editor.modoSeleccion !== "municipios") return;
    toggleMunicipio(id);
  }

  function syncMunicipioSelectionVisual() {
    CW.map.setSelectedMunicipios(S.editor.municipioIdsSel, currentColorHex());
  }

  function onDrawChanged() {
    document.getElementById("status-draw").textContent = `Polígonos dibujados: ${CW.map.getDrawnCount()}`;
    updatePreviewZone();
  }

  function onMapClick(latlng) {
    if (S.editor.modoSeleccion !== "circulo") return;
    S.editor.circuloPendiente = latlng;
    document.getElementById("status-circulo").textContent = `Centro: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    CW.map.previewCirculo(latlng, S.editor.circuloRadioKm, currentColorHex());
  }

  function renderCirculosState() {
    document.getElementById("status-circulo").textContent = S.editor.circuloPendiente
      ? `Centro: ${S.editor.circuloPendiente.lat.toFixed(4)}, ${S.editor.circuloPendiente.lng.toFixed(4)}`
      : `Centro: sin definir (círculos agregados: ${S.editor.circulosAgregados.length})`;
    CW.map.clearCirculoPreview();
    CW.map.renderAddedCirculos(S.editor.circulosAgregados, currentColorHex());
  }

  function collectCurrentZoneGeometries() {
    const geoms = [];
    if (S.editor.modoSeleccion === "municipios") {
      S.municipios.features.forEach((m) => {
        if (S.editor.municipioIdsSel.has(m.id) && m.feature.geometry) geoms.push(m.feature.geometry);
      });
    } else if (S.editor.modoSeleccion === "draw") {
      geoms.push(...CW.map.getDrawnGeometries());
    } else if (S.editor.modoSeleccion === "circulo") {
      S.editor.circulosAgregados.forEach((c) => geoms.push(G.circleToPolygon(c.lat, c.lng, c.radioKm)));
    }
    return geoms;
  }

  function updatePreviewZone() {
    const geoms = collectCurrentZoneGeometries();
    CW.map.renderPreviewZone(geoms, currentColorHex());
  }

  function onAgregarZona() {
    const geoms = collectCurrentZoneGeometries();
    if (!geoms.length) {
      toast("Definí al menos un área (municipios, polígono o círculo) antes de agregar la zona.", "err");
      return;
    }
    const nivelDef = U.getNivelDef(S.editor.tipoProducto, S.editor.nivelId);
    const fenomenoFinal = S.editor.fenomeno === "Otro (especificar)" ? (S.editor.fenomenoOtro || "Fenómeno sin especificar") : S.editor.fenomeno;

    const municipiosSeleccionados = S.editor.modoSeleccion === "municipios"
      ? S.municipios.features.filter((m) => S.editor.municipioIdsSel.has(m.id)).map((m) => ({ id: m.id, nombre: m.nombre }))
      : [];

    const zona = {
      id: S.editor.editingZonaId || U.uid("zona"),
      tipoProducto: S.editor.tipoProducto,
      nivelId: S.editor.nivelId,
      nivelLabel: nivelDef.label,
      colorHex: nivelDef.color,
      fenomeno: fenomenoFinal,
      detalle: S.editor.detalle,
      modoSeleccion: S.editor.modoSeleccion,
      municipios: municipiosSeleccionados,
      municipiosNombres: municipiosSeleccionados.map((m) => m.nombre),
      geometries: geoms,
    };

    if (S.editor.editingZonaId) {
      const idx = S.borrador.zonas.findIndex((z) => z.id === S.editor.editingZonaId);
      if (idx !== -1) S.borrador.zonas[idx] = zona;
      toast("Zona actualizada en el borrador.", "ok");
    } else {
      S.borrador.zonas.push(zona);
      toast("Zona agregada al boletín en borrador.", "ok");
    }

    resetZonaEditorUI();
    renderZoneList();
    renderBadges();
    renderBulletinPreview();
    switchTab("borrador");
  }

  function resetZonaEditorUI() {
    U.resetEditorSelection();
    CW.map.clearDrawnItems();
    CW.map.clearCirculoPreview();
    CW.map.clearPreviewZone();
    CW.map.clearSelectionHighlight();
    document.getElementById("input-detalle-zona").value = "";
    S.editor.detalle = "";
    document.getElementById("btn-agregar-zona").textContent = "➕ Agregar zona al boletín en borrador";
    document.getElementById("btn-cancelar-edicion-zona").hidden = true;
    document.getElementById("zona-form-title").textContent = "Definir zona de aviso";
    renderMuniList();
    onDrawChanged();
    renderCirculosState();
  }

  function editZona(zonaId) {
    const zona = S.borrador.zonas.find((z) => z.id === zonaId);
    if (!zona) return;
    resetZonaEditorUI();
    S.editor.editingZonaId = zonaId;
    S.editor.tipoProducto = zona.tipoProducto;
    document.getElementById("select-tipo-producto").value = zona.tipoProducto;
    S.editor.nivelId = zona.nivelId;
    S.editor.fenomeno = C.FENOMENOS.includes(zona.fenomeno) ? zona.fenomeno : "Otro (especificar)";
    document.getElementById("select-fenomeno").value = S.editor.fenomeno;
    document.getElementById("input-fenomeno-otro").hidden = S.editor.fenomeno !== "Otro (especificar)";
    if (S.editor.fenomeno === "Otro (especificar)") {
      S.editor.fenomenoOtro = zona.fenomeno;
      document.getElementById("input-fenomeno-otro").value = zona.fenomeno;
    }
    S.editor.detalle = zona.detalle || "";
    document.getElementById("input-detalle-zona").value = S.editor.detalle;
    S.editor.modoSeleccion = zona.modoSeleccion;
    (zona.municipios || []).forEach((m) => S.editor.municipioIdsSel.add(m.id));

    renderNivelSwatches();
    syncSelectionModeUI();
    syncMunicipioSelectionVisual();
    renderMuniList();
    updatePreviewZone();

    document.getElementById("btn-agregar-zona").textContent = "💾 Guardar cambios de la zona";
    document.getElementById("btn-cancelar-edicion-zona").hidden = false;
    document.getElementById("zona-form-title").textContent = "Editando zona existente";
    switchTab("zona");
  }

  function cancelZonaEdit() {
    resetZonaEditorUI();
    switchTab("borrador");
  }

  function deleteZona(zonaId) {
    S.borrador.zonas = S.borrador.zonas.filter((z) => z.id !== zonaId);
    renderZoneList();
    renderBadges();
    renderBulletinPreview();
  }

  // ------------------------------------------------------------------
  // TAB 3 — Borrador
  // ------------------------------------------------------------------
  function initBorradorTab() {
    document.getElementById("input-bol-titulo").addEventListener("input", (e) => { S.borrador.titulo = e.target.value; });
    document.getElementById("input-bol-desde").addEventListener("input", (e) => { S.borrador.desde = e.target.value; });
    document.getElementById("input-bol-hasta").addEventListener("input", (e) => { S.borrador.hasta = e.target.value; });
    document.getElementById("input-bol-emisor").addEventListener("input", (e) => { S.borrador.emisor = e.target.value; });
    document.getElementById("input-bol-resumen").addEventListener("input", (e) => { S.borrador.resumen = e.target.value; });
    document.getElementById("btn-publicar-boletin").addEventListener("click", onPublicarBoletin);
    document.getElementById("btn-vaciar-borrador").addEventListener("click", onVaciarBorrador);
  }

  function renderZoneList() {
    const box = document.getElementById("zone-list");
    box.innerHTML = "";
    document.getElementById("count-zonas-borrador").textContent = S.borrador.zonas.length;
    if (!S.borrador.zonas.length) {
      box.innerHTML = '<p class="hint">Todavía no agregaste ninguna zona. Ir a la pestaña "2. Nueva zona".</p>';
      return;
    }
    S.borrador.zonas.forEach((z) => {
      const card = document.createElement("div");
      card.className = "zone-card";
      card.innerHTML = `
        <div class="zone-card-head">
          <span class="zone-color-dot" style="background:${z.colorHex}"></span>
          <span class="zone-card-title">${CW.map.escapeHtml(z.nivelLabel)} — ${CW.map.escapeHtml(z.fenomeno)}</span>
        </div>
        <div class="zone-card-sub">${z.municipiosNombres.length ? CW.map.escapeHtml(z.municipiosNombres.slice(0,6).join(", ")) + (z.municipiosNombres.length>6?"…":"") : (z.modoSeleccion === "draw" ? "Área dibujada manualmente" : "Área circular")}</div>
        <div class="zone-card-actions">
          <button class="btn btn-sm btn-outline" data-act="edit">✏️ Editar</button>
          <button class="btn btn-sm btn-outline" data-act="del">🗑 Quitar</button>
        </div>
      `;
      card.querySelector('[data-act="edit"]').addEventListener("click", () => editZona(z.id));
      card.querySelector('[data-act="del"]').addEventListener("click", () => deleteZona(z.id));
      box.appendChild(card);
    });
  }

  function onPublicarBoletin() {
    if (!S.borrador.zonas.length) { toast("Agregá al menos una zona antes de publicar.", "err"); return; }
    if (!S.borrador.titulo.trim()) { toast("Ingresá un título para el boletín.", "err"); return; }

    const bulletin = {
      id: U.uid("bol"),
      titulo: S.borrador.titulo,
      desde: S.borrador.desde,
      hasta: S.borrador.hasta,
      emisor: S.borrador.emisor,
      resumen: S.borrador.resumen,
      zonas: S.borrador.zonas,
      publicadoEn: new Date().toISOString(),
    };
    S.bulletins.unshift(bulletin);
    S.featuredBulletinId = bulletin.id;

    // Reset borrador
    S.borrador = { titulo: "", desde: "", hasta: "", emisor: S.borrador.emisor, resumen: "", zonas: [] };
    document.getElementById("input-bol-titulo").value = "";
    document.getElementById("input-bol-desde").value = "";
    document.getElementById("input-bol-hasta").value = "";
    document.getElementById("input-bol-resumen").value = "";

    renderZoneList();
    renderBadges();
    renderBulletinList();
    renderExportSelect();
    renderFeaturedSelect();
    renderBulletinPreview();
    toast("Boletín publicado correctamente.", "ok");
    switchTab("emitidos");
  }

  function onVaciarBorrador() {
    if (!S.borrador.zonas.length && !S.borrador.titulo) return;
    if (!confirm("¿Vaciar todo el boletín en borrador? Esta acción no se puede deshacer.")) return;
    S.borrador.zonas = [];
    S.borrador.titulo = ""; S.borrador.desde = ""; S.borrador.hasta = ""; S.borrador.resumen = "";
    document.getElementById("input-bol-titulo").value = "";
    document.getElementById("input-bol-desde").value = "";
    document.getElementById("input-bol-hasta").value = "";
    document.getElementById("input-bol-resumen").value = "";
    renderZoneList();
    renderBadges();
    renderBulletinPreview();
  }

  // ------------------------------------------------------------------
  // TAB 4 — Emitidos
  // ------------------------------------------------------------------
  function initEmitidosTab() {
    document.getElementById("select-bol-destacado").addEventListener("change", (e) => {
      S.featuredBulletinId = e.target.value || null;
      renderBulletinPreview();
    });
  }

  function renderFeaturedSelect() {
    const sel = document.getElementById("select-bol-destacado");
    sel.innerHTML = '<option value="">— Ninguno —</option>';
    S.bulletins.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id; opt.textContent = b.titulo;
      if (b.id === S.featuredBulletinId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderBulletinList() {
    const box = document.getElementById("bulletin-list");
    box.innerHTML = "";
    if (!S.bulletins.length) {
      box.innerHTML = '<p class="hint">Todavía no publicaste ningún boletín.</p>';
      return;
    }
    S.bulletins.forEach((b) => {
      const status = U.isBulletinActive(b);
      const statusLabel = status === "active" ? '<span class="status-active">● VIGENTE</span>' : status === "expired" ? '<span class="status-expired">● VENCIDO</span>' : '<span class="status-scheduled">● PROGRAMADO</span>';
      const chips = b.zonas.map((z) => `<span class="chip" style="background:${z.colorHex}">${CW.map.escapeHtml(z.nivelLabel)}</span>`).join("");
      const card = document.createElement("div");
      card.className = "bulletin-card-item";
      card.innerHTML = `
        <h3>${CW.map.escapeHtml(b.titulo)}</h3>
        <div class="meta">${statusLabel} · Emisor: ${CW.map.escapeHtml(b.emisor || "—")}<br>
        Vigencia: ${fmtDate(b.desde)} → ${fmtDate(b.hasta)}<br>
        Publicado: ${fmtDate(b.publicadoEn)} · ${b.zonas.length} zona(s)</div>
        <div class="zones-inline">${chips}</div>
        <div class="row-actions">
          <button class="btn btn-sm btn-outline" data-act="feature">📌 Destacar</button>
          <button class="btn btn-sm btn-outline" data-act="del">🗑 Eliminar</button>
        </div>
      `;
      card.querySelector('[data-act="feature"]').addEventListener("click", () => {
        S.featuredBulletinId = b.id;
        renderFeaturedSelect();
        renderBulletinPreview();
        toast("Boletín destacado en el mapa.", "ok");
      });
      card.querySelector('[data-act="del"]').addEventListener("click", () => {
        if (!confirm(`¿Eliminar el boletín "${b.titulo}"?`)) return;
        S.bulletins = S.bulletins.filter((x) => x.id !== b.id);
        if (S.featuredBulletinId === b.id) S.featuredBulletinId = S.bulletins.length ? S.bulletins[0].id : null;
        renderBulletinList();
        renderFeaturedSelect();
        renderExportSelect();
        renderBulletinPreview();
      });
      box.appendChild(card);
    });
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // ------------------------------------------------------------------
  // Render principal del boletín destacado (banner + mapa + leyenda)
  // ------------------------------------------------------------------
  function renderBulletinPreview() {
    const featured = S.bulletins.find((b) => b.id === S.featuredBulletinId);
    const zonasToRender = featured ? featured.zonas : S.borrador.zonas;

    CW.map.renderZonesOnMap(zonasToRender);

    const titleEl = document.getElementById("banner-title");
    const subEl = document.getElementById("banner-subtitle");
    const issuedEl = document.getElementById("footer-issued");

    if (featured) {
      titleEl.textContent = featured.titulo;
      subEl.textContent = `Válido: ${fmtDate(featured.desde)} → ${fmtDate(featured.hasta)} · Emisor: ${featured.emisor || "—"}`;
      issuedEl.textContent = `Emitido: ${fmtDate(featured.publicadoEn)}`;
    } else if (S.borrador.zonas.length) {
      titleEl.textContent = (S.borrador.titulo || "Boletín sin título") + " (BORRADOR — no publicado)";
      subEl.textContent = `${S.borrador.zonas.length} zona(s) en preparación`;
      issuedEl.textContent = "Sin publicar";
    } else {
      titleEl.textContent = "Sin boletín destacado — cargá geodatos y creá una zona para comenzar";
      subEl.textContent = "";
      issuedEl.textContent = "—";
    }

    // Leyenda: niveles usados en las zonas mostradas
    const legend = document.getElementById("footer-legend");
    legend.innerHTML = "";
    const seen = new Set();
    zonasToRender.forEach((z) => {
      if (seen.has(z.nivelId)) return;
      seen.add(z.nivelId);
      const chip = document.createElement("span");
      chip.className = "legend-chip";
      chip.innerHTML = `<span class="sw" style="background:${z.colorHex}"></span>${CW.map.escapeHtml(z.nivelLabel)}`;
      legend.appendChild(chip);
    });
    if (!seen.size) legend.textContent = "Sin niveles activos";
  }

  function renderBadges() {
    document.getElementById("badge-borrador").textContent = S.borrador.zonas.length;
    document.getElementById("badge-emitidos").textContent = S.bulletins.length;
  }

  // ------------------------------------------------------------------
  // TAB 5 — Capas extra
  // ------------------------------------------------------------------
  function initCapasTab() {
    document.getElementById("file-extra").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const color = document.getElementById("color-extra").value;
      readFileAsJSON(file).then((json) => {
        const fc = G.normalizeToFeatureCollection(json);
        if (!fc) throw new Error("Formato GeoJSON no reconocido.");
        const id = U.uid("extra");
        CW.map.addExtraLayer(id, fc, color);
        S.extraLayers.push({ id, name: file.name, color });
        renderExtraLayerList();
        toast(`Capa "${file.name}" agregada.`, "ok");
      }).catch((err) => toast(err.message, "err"));
      e.target.value = "";
    });
  }

  function renderExtraLayerList() {
    const box = document.getElementById("extra-layer-list");
    box.innerHTML = "";
    S.extraLayers.forEach((l) => {
      const div = document.createElement("div");
      div.className = "extra-layer-item";
      div.innerHTML = `<span class="sw" style="background:${l.color}"></span><span>${CW.map.escapeHtml(l.name)}</span><button class="btn btn-xs btn-outline">Quitar</button>`;
      div.querySelector("button").addEventListener("click", () => {
        CW.map.removeExtraLayer(l.id);
        S.extraLayers = S.extraLayers.filter((x) => x.id !== l.id);
        renderExtraLayerList();
      });
      box.appendChild(div);
    });
  }

  // ------------------------------------------------------------------
  // TAB 6 — Exportar / importar (los handlers de exportación viven en export.js)
  // ------------------------------------------------------------------
  function renderExportSelect() {
    const sel = document.getElementById("select-bol-export");
    sel.innerHTML = '<option value="__borrador__">Boletín en borrador (sin publicar)</option>';
    S.bulletins.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id; opt.textContent = b.titulo;
      sel.appendChild(opt);
    });
  }

  // ------------------------------------------------------------------
  // Toolbar del mapa (ajustar vista)
  // ------------------------------------------------------------------
  function initMapToolbar() {
    document.getElementById("btn-fit-argentina").addEventListener("click", () => CW.map.fitToArgentina());
    document.getElementById("btn-fit-provincia").addEventListener("click", () => {
      const b = CW.map.getProvinciaBounds();
      if (b && b.isValid()) CW.map.fitToBounds(b); else toast("No hay límite de provincia cargado.", "err");
    });
    document.getElementById("btn-fit-municipios").addEventListener("click", () => {
      const b = CW.map.getMunicipiosBounds();
      if (b && b.isValid()) CW.map.fitToBounds(b); else toast("No hay municipios cargados.", "err");
    });
    document.getElementById("btn-fit-boletin").addEventListener("click", () => {
      const featured = S.bulletins.find((b) => b.id === S.featuredBulletinId);
      const zonas = featured ? featured.zonas : S.borrador.zonas;
      if (!zonas.length) { toast("No hay un boletín destacado con zonas.", "err"); return; }
      CW.map.fitToZonesBounds(zonas);
    });
  }

  // ------------------------------------------------------------------
  // Reloj de la topbar
  // ------------------------------------------------------------------
  function startClock() {
    function tick() {
      const now = new Date();
      const txt = now.toLocaleString("es-AR", { hour12: false }) + " (ART)";
      document.getElementById("topbar-clock").textContent = txt;
    }
    tick();
    setInterval(tick, 1000);
  }

  CW.ui = {
    toast, openModal, closeModal,
    initTabs, switchTab,
    initGeodatos,
    initZonaTab,
    initBorradorTab,
    initEmitidosTab,
    initCapasTab,
    initMapToolbar,
    startClock,

    onDrawChanged,
    onMapClick,
    onMunicipioClicked,

    renderMuniList,
    renderZoneList,
    renderBadges,
    renderBulletinList,
    renderFeaturedSelect,
    renderExportSelect,
    renderExtraLayerList,
    renderBulletinPreview,

    fmtDate,
    readFileAsJSON,
    rebuildMunicipiosIndex,
  };

  document.getElementById && document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });
  });
})(window);
