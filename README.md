# ColdWarnings 🌩️🇦🇷

**ColdWarnings** es una aplicación web (HTML + CSS + JavaScript, 100% en el navegador,
sin backend) para redactar y publicar **outlooks y alertas meteorológicas por
municipio/departamento/partido** en Argentina, inspirada en los productos del
**NWS** (Winter Storm Outlook, Watch/Warning) y en los avisos por color del
**SMN** (Amarillo / Naranja / Rojo).

No es un producto oficial del Servicio Meteorológico Nacional. Es una
herramienta para que organismos de Defensa Civil, municipios, medios o
proyectos personales puedan armar y difundir sus propios boletines con una
estética profesional y datos geográficos reales.

## ✨ Características

- **100% en el navegador.** No requiere instalar nada ni tener servidor: se
  abre `index.html` y listo. Todos los datos viven en la sesión del navegador
  (se pueden guardar/recuperar en un archivo `.json` de proyecto).
- **Carga de tus propios límites administrativos** en formato `.geojson` /
  `.json`:
  - Límite de provincia (referencia visual, opcional).
  - Límites de municipios / departamentos / partidos / comunas (la capa
    principal sobre la que se construyen las zonas de alerta).
  - Detección automática del campo de "nombre" en las propiedades del
    GeoJSON (soporta `nombre`, `NAM`, `name`, `departamen`, `partido`,
    `comuna`, etc.), con selector manual si no se detecta.
- **Mapa interactivo** (Leaflet) con 4 mapas base (claro, calles, satélite,
  oscuro), búsqueda de localidades, etiquetas de nombres con zoom alto y
  botones de "ajustar vista" (Argentina completa / provincia / municipios /
  boletín destacado).
- **Constructor de zonas de aviso** con tres modos de selección geográfica:
  1. **Municipios** — tildar uno o varios municipios de una lista filtrable
     (o seleccionar todos los visibles en el mapa).
  2. **Polígono libre** — dibujar a mano zonas que no siguen límites
     administrativos (herramienta de dibujo de Leaflet.draw).
  3. **Círculo con radio** — click en el mapa + control deslizante de radio
     en km (útil para alertas puntuales, ej. radio de una tormenta).
- **Dos tipos de producto:**
  - *Aviso por niveles* (estilo SMN): Vigilancia / Amarillo / Naranja / Rojo.
  - *Outlook probabilístico* (estilo NWS Winter Storm Outlook): `<10%`,
    `10–30%`, `30–50%`, `50–80%`, `>80%` de probabilidad de superar el
    criterio de aviso.
- **Boletines** con título, vigencia (desde/hasta), organismo emisor, resumen
  y una o varias zonas. Se pueden editar, publicar, destacar en el mapa
  principal y eliminar.
- **Exportación a `.geojson`** de cualquier boletín (o de todos los boletines
  emitidos en un solo archivo), con las propiedades de la alerta embebidas en
  cada feature (nivel, fenómeno, detalle, vigencia, emisor, municipio, etc.),
  listo para usarse en QGIS, otros GIS o sistemas de terceros.
- **Importación de `.geojson`** generados por la misma herramienta, para
  retomar boletines exportados previamente.
- **Exportación de imagen (`.png`)** del boletín destacado (encabezado +
  mapa + leyenda), útil para redes sociales o comunicados.
- **Guardar / abrir proyecto completo** (`.json`) con todos los geodatos
  cargados, el borrador y los boletines emitidos, para continuar trabajando
  otro día sin perder nada.
- **Capas de referencia extra**: se pueden sumar `.geojson` decorativos
  (rutas, ríos, cuencas, estaciones, radares) con color propio, sin que
  interfieran con la lógica de alertas.

## 📁 Estructura del proyecto

```
ColdWarnings/
└── index.html   # Archivo único autocontenido: HTML + CSS + JavaScript embebidos.
                   # Las únicas dependencias externas son librerías vía CDN
                   # (Leaflet, Leaflet.draw, Turf.js, html2canvas) que requieren
                   # conexión a internet la primera vez que se abre la página.
```

Todo (estilos y lógica) vive **dentro de `index.html`**. Esto es intencional:
al ser un solo archivo, podés descargarlo, moverlo, adjuntarlo por mail o
abrirlo directamente con doble clic, sin depender de que otras carpetas
(`css/`, `js/`) estén presentes al lado. Si ves la página con el texto
amontonado y sin colores ni mapa, es señal de que estás abriendo una versión
vieja/parcial del archivo — asegurate de usar siempre este `index.html`
completo.

## 🚀 Cómo usarlo

1. **Abrir `index.html`** en un navegador moderno (Chrome, Edge, Firefox),
   con conexión a internet (para las librerías vía CDN y los mapas base).
   No requiere build ni servidor — funciona con doble clic. Si tu navegador
   bloquea la carga de archivos locales por política de seguridad, servilo
   con cualquier servidor estático, por ejemplo `python3 -m http.server`.

2. **Pestaña "1. Geodatos":**
   - Cargá el `.geojson` de municipios/departamentos de tu provincia (podés
     usar tus propios archivos, por ejemplo exportados desde IGN, INDEC,
     ArcGIS/QGIS, o la API de [Georef Argentina](https://datosgobar.github.io/georef-ar-api/)).
   - Opcionalmente, cargá el límite de la provincia como referencia visual.
   - Si el sistema no reconoce el nombre de cada municipio automáticamente,
     te va a preguntar cuál propiedad usar.

3. **Pestaña "2. Nueva zona":**
   - Elegí el tipo de producto (aviso por nivel u outlook probabilístico) y
     el color/nivel correspondiente.
   - Elegí el fenómeno (tormenta, nieve, viento, calor, frío, etc.) y
     escribí el detalle/discusión meteorológica.
   - Elegí el modo de selección geográfica (municipios, polígono libre o
     círculo) y definí el área en el mapa.
   - Hacé clic en **"Agregar zona al boletín en borrador"**.
   - Podés repetir este paso para agregar varias zonas con distintos niveles
     al mismo boletín (por ejemplo Amarillo en un grupo de municipios y
     Naranja en otro).

4. **Pestaña "3. Borrador":**
   - Completá título, vigencia, organismo emisor y resumen general.
   - Revisá/editá/quitá las zonas agregadas.
   - Hacé clic en **"Publicar boletín"**.

5. **Pestaña "4. Emitidos":**
   - Vas a ver todos los boletines publicados, con su estado (vigente,
     programado o vencido).
   - Podés destacar cualquiera para que se muestre en el mapa principal.

6. **Pestaña "5. Capas extra":** sumá capas de referencia (rutas, ríos, etc.)
   puramente visuales.

7. **Pestaña "6. Exportar / Importar":**
   - Exportá el boletín seleccionado (o todos) como `.geojson`.
   - Exportá una imagen `.png` del boletín destacado.
   - Importá un `.geojson` exportado previamente para recuperar boletines.

8. **Botones "Guardar proyecto" / "Abrir proyecto"** (arriba a la derecha):
   guardan/recuperan absolutamente todo (geodatos + boletines) en un único
   archivo `.json`, para seguir trabajando en otra sesión.

## 🗺️ Formato de los archivos `.geojson` de entrada

Cualquier `FeatureCollection` estándar de GeoJSON funciona. Se recomienda que
cada feature tenga una propiedad con el nombre del municipio/departamento
(por ejemplo `nombre`, `NAM`, `departamento`, `partido`, `comuna`, etc.).
Fuentes públicas típicas para Argentina:

- [Georef Argentina (datos.gob.ar)](https://datosgobar.github.io/georef-ar-api/) —
  API con provincias, departamentos y municipios, exportable en GeoJSON.
- Portales de datos abiertos provinciales/municipales (IDERA, IGN, INDEC).

## 📦 Formato del `.geojson` exportado

Cada boletín exportado es un `FeatureCollection` donde cada `Feature`
representa una geometría de una zona del boletín (un municipio, un polígono
dibujado o un círculo), con estas propiedades:

| Propiedad | Descripción |
|---|---|
| `boletin_id`, `boletin_titulo`, `boletin_emisor` | Identificación del boletín |
| `boletin_valido_desde`, `boletin_valido_hasta` | Vigencia |
| `boletin_publicado_en` | Fecha/hora de publicación |
| `zona_id`, `tipo_producto`, `nivel_id`, `nivel_label`, `color` | Datos del nivel de alerta |
| `fenomeno`, `detalle` | Fenómeno meteorológico y discusión |
| `municipio_id`, `municipio_nombre` | Si la zona fue definida por municipios |

## ⚠️ Notas y limitaciones

- Esta herramienta **no consulta ningún servicio meteorológico real**: todo
  el contenido del boletín (niveles, fenómenos, vigencia) lo define quien la
  usa. La responsabilidad de la precisión de los avisos es de quien emite el
  boletín.
- La exportación a imagen (`.png`) usa `html2canvas`; si el mapa base es de
  un proveedor con políticas CORS estrictas, puede fallar. Se recomienda usar
  "Claro (CARTO)" o "Satélite (Esri)" antes de exportar imagen.
- Todo el estado vive en memoria del navegador: si cerrás la pestaña sin usar
  "Guardar proyecto", vas a perder el trabajo no exportado.

## 🛠️ Tecnologías usadas

- [Leaflet](https://leafletjs.com/) + [Leaflet.draw](https://github.com/Leaflet/Leaflet.draw) — mapa interactivo y dibujo de polígonos.
- [Turf.js](https://turfjs.org/) — utilidades geoespaciales (incluido para futuras extensiones).
- [html2canvas](https://html2canvas.hertzen.com/) — exportación de imagen del boletín.
- HTML, CSS y JavaScript "vanilla" — sin frameworks ni paso de build.
