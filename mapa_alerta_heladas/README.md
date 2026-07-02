# Mapa de Alerta por Clima Frío y Heladas

Script de Python (`plot_alerta_heladas.py`) que genera una imagen `.png` con
un mapa de alerta por municipio, replicando el formato visual clásico de los
productos del **NWS / WPC** (por ejemplo, el *"Winter Storm Outlook"*), pero:

- **En español.**
- Enfocado en **clima frío y heladas** (no en nevadas).
- Con el banner superior en el texto exacto:
  **"P.A.M.P.A. -- Alerta por Clima Frío y Heladas -- Válido a las 24hs del día 03/07/26"**.
  (El nombre del proyecto `P.A.M.P.A.` se puede cambiar u ocultar con `--nombre-proyecto`.)
- Con los mismos colores de referencia (blanco / celeste / amarillo / rojo /
  violeta) en la leyenta de niveles.
- Con el basemap (continentes) en color `#f0eceb` y el mar/océano/ríos/lagos
  en color `#dce6f0`, tal como fue solicitado.
- La región del mapa se ajusta automáticamente al área que cubre tu propio
  archivo `.geojson` de municipios (no está fijo a un país o región en
  particular).

## 📁 Contenido de esta carpeta

```
mapa_alerta_heladas/
├── plot_alerta_heladas.py     # Script principal
├── requirements.txt           # Dependencias de Python
├── data/                      # Capas de referencia (países, provincias, agua)
│   ├── ne_110m_admin_0_countries.geojson
│   ├── ne_50m_admin_0_countries.geojson
│   ├── ne_50m_admin_1_states_provinces.geojson
│   ├── ne_110m_lakes.geojson / ne_50m_lakes.geojson
│   └── ne_110m_rivers_lake_centerlines.geojson / ne_50m_rivers_lake_centerlines.geojson
├── ejemplo/
│   └── municipios_ejemplo.geojson   # Geojson de ejemplo para probar el script
└── salida/                     # Carpeta donde se guardan los .png generados
```

Las capas de `data/` son del proyecto público **Natural Earth**
(dominio público / CC0, ver https://www.naturalearthdata.com/about/terms-of-use/),
e incluyen los límites de países y provincias, y las capas de lagos y ríos
que se usan como referencia geográfica y para pintar el agua del color
solicitado. Se recortan automáticamente a la región de tu `.geojson`.

## 🖥️ Cómo usarlo en VSCode

1. **Abrí esta carpeta (`mapa_alerta_heladas`) en VSCode.**
   (Podés abrir todo el repo `ColdWarnings` y navegar a esta subcarpeta, o
   abrir directamente `mapa_alerta_heladas` como carpeta de trabajo.)

2. **Creá un entorno virtual** (recomendado, para no mezclar paquetes con
   tu Python global). Abrí una terminal en VSCode (`Ctrl + ñ` / `` Ctrl+` ``)
   parado en esta carpeta y ejecutá:

   **Windows (PowerShell):**
   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

   **Windows (CMD):**
   ```cmd
   python -m venv .venv
   .venv\Scripts\activate.bat
   pip install -r requirements.txt
   ```

   **Linux / Mac:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

   Si VSCode te pregunta si querés usar ese entorno como intérprete de
   Python del proyecto, decile que sí (o seleccionalo manualmente con
   `Ctrl+Shift+P` → "Python: Select Interpreter").

3. **Copiá tu archivo `.geojson`** de municipios/departamentos (el que tenés
   con el nivel de alerta por cada uno) dentro de esta carpeta, o simplemente
   anotá la ruta completa donde lo tenés guardado.

4. **Ejecutá el script** desde la terminal:

   ```bash
   python plot_alerta_heladas.py --geojson "mi_archivo.geojson"
   ```

   La imagen final se guarda por defecto en:
   `salida/alerta_clima_frio_heladas.png`

5. **Abrí la imagen generada** desde el explorador de archivos de VSCode
   (carpeta `salida/`) para verla.

## ⚙️ Cómo tiene que estar armado tu `.geojson`

El script necesita que cada *feature* (cada municipio/departamento) de tu
`.geojson` tenga una propiedad con el **nivel de alerta**. El script intenta
detectar automáticamente la columna, buscando nombres como:
`nivel_alerta`, `nivel`, `alerta`, `nivel_aviso`, `aviso`, `riesgo`, `color`,
`prob`, `probabilidad`, `categoria`, entre otros.

Si tu columna se llama de otra forma, indicásela con `--columna-nivel`:

```bash
python plot_alerta_heladas.py --geojson mis_municipios.geojson --columna-nivel mi_columna_de_nivel
```

### Valores aceptados en la columna de nivel

El script reconoce (sin importar mayúsculas/tildes) estos valores y los
traduce automáticamente a la escala de colores de la leyenda:

| Nivel en tu geojson (ejemplos aceptados)                              | Color en el mapa | Etiqueta en la leyenda |
|------------------------------------------------------------------------|-------------------|-------------------------|
| `sin riesgo`, `ninguno`, `sin alerta`, `bajo`, `<10%`                  | Blanco `#ffffff`  | `<10%`                  |
| `vigilancia`, `leve`, `10-30%`                                        | Celeste `#4fc3c8` | `10-30%`                |
| `amarillo`, `alerta amarilla`, `moderado`, `30-50%`                   | Amarillo `#fff066`| `30-50%`                |
| `rojo`, `naranja`, `alerta roja`, `alerta naranja`, `severo`, `50-80%`| Rojo `#e0342a`    | `50-80%`                |
| `extremo`, `crítico`, `violeta`, `morado`, `>80%`                     | Violeta `#8a2be2` | `>80%`                  |

Si un municipio no tiene nivel asignado o el valor no coincide con ninguno
de la tabla, se pinta en **blanco** (equivalente a "sin dato" / `<10%`).

Podés editar esta tabla directamente en el script (bloque
`NIVELES_ALERTA`, al principio del archivo) si tus propios valores son muy
distintos, o si querés cambiar los colores.

### 🔍 Si los colores salen mezclados o "cruzados"

Si notás que un color aparece donde no corresponde (por ejemplo el rojo en
vez del celeste), lo más probable es que tu columna de nivel tenga valores
que el script no reconoce exactamente. Usá el modo `--debug` para ver, en la
terminal, la lista de **todos los valores únicos** de tu columna y el color
que el script les asignó:

```bash
python plot_alerta_heladas.py --geojson mis_municipios.geojson --debug
```

Vas a ver algo así:

```
==== MODO DEBUG: valores crudos -> nivel asignado -> color ====
valor crudo='Amarillo'          -> nivel=alerta_amarilla  -> color=#fff066
valor crudo='Rojo'              -> nivel=alerta_roja      -> color=#e0342a
valor crudo='Sin dato'          -> nivel=sin_dato         -> color=#ffffff
```

Si ves algún valor que quedó como `sin_dato` (o mapeado al nivel
incorrecto), agregá esa palabra/frase exacta a la lista `valores` del nivel
correspondiente dentro de `NIVELES_ALERTA` en `plot_alerta_heladas.py`.

## 🧪 Probar rápido con el geojson de ejemplo

Este repo incluye un `.geojson` de ejemplo (municipios ficticios en grilla)
para que puedas probar el script sin tener aún tu archivo real:

```bash
python plot_alerta_heladas.py --geojson ejemplo/municipios_ejemplo.geojson --mostrar-nombres
```

## 🎛️ Opciones de línea de comandos

```
--geojson RUTA            (obligatorio) Ruta a tu .geojson de municipios.
--salida RUTA             Ruta del .png de salida (default: salida/alerta_clima_frio_heladas.png)
--columna-nivel NOMBRE    Columna del geojson con el nivel de alerta (autodetectada si no se indica).
--columna-nombre NOMBRE   Columna del geojson con el nombre del municipio (para --mostrar-nombres).
--titulo TEXTO            Título principal del banner azul.
--subtitulo TEXTO         Subtítulo de vigencia del banner azul.
--titulo-leyenda TEXTO    Título de la leyenda inferior.
--nombre-proyecto TEXTO   Nombre del proyecto al inicio del banner azul (default: "P.A.M.P.A.").
                          Usá --nombre-proyecto "" para ocultarlo.
--mostrar-nombres         Muestra el nombre de cada municipio sobre el mapa.
--debug                   Muestra en la terminal el mapeo valor->nivel->color de tu geojson.
--alta-resolucion         Usa capas de referencia de 50m (default).
--baja-resolucion         Usa capas de referencia de 110m (más livianas/rápidas).
--ancho FLOAT             Ancho de la imagen en pulgadas (default 12.8).
--alto FLOAT              Alto de la imagen en pulgadas (default 9.6).
--dpi INT                 Resolución en DPI (default 140).
```

### Ejemplo cambiando la vigencia del banner

```bash
python plot_alerta_heladas.py --geojson mis_municipios.geojson \
    --subtitulo "Válido a las 24hs del día 05/07/26"
```

## 🎨 Personalización de colores

Todos los colores del mapa están centralizados al principio de
`plot_alerta_heladas.py`, en el bloque **CONFIGURACIÓN GENERAL**:

- `COLOR_BASEMAP = "#f0eceb"` → relleno de continentes/tierra.
- `COLOR_AGUA = "#dce6f0"` → mar, océano, ríos y lagos.
- `COLOR_BANNER_AZUL` → color del banner superior.
- `NIVELES_ALERTA` → colores y etiquetas de cada nivel de la leyenda.

## ❓ Preguntas frecuentes

**¿El mapa se adapta a cualquier país/provincia/región?**
Sí. El script calcula automáticamente el área a mostrar en base al
`bounding box` (extensión geográfica) de tu propio `.geojson`, con un margen
del 10%. No hace falta indicar ningún país o región manualmente.

**¿Necesito internet para usarlo?**
No. Las capas de referencia (países, provincias, lagos, ríos) ya están
incluidas en la carpeta `data/`, así que el script funciona sin conexión
una vez instaladas las dependencias de Python.

**¿Puedo usar mi propio archivo con muchísimos municipios (miles)?**
Sí, pero te recomendamos NO usar `--mostrar-nombres` en ese caso (el script
lo desactiva automáticamente si hay más de 120 unidades, para no saturar
el mapa con texto).
