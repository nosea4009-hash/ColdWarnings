#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
plot_alerta_heladas.py
=======================

Genera un mapa de "Alerta por Clima Frío y Heladas" a partir de un archivo
.geojson de municipios/departamentos, replicando el formato visual clásico
de los productos del NWS/WPC (ej. "Winter Storm Outlook"), pero en español
y enfocado en frío / heladas en lugar de nieve.

Estructura del mapa generado (de arriba hacia abajo):
    1. Banner azul superior con el título del aviso y la vigencia.
    2. Mapa con:
         - Basemap (relleno de continentes) en el color #f0eceb
         - Mar / océano / ríos / lagos en el color #dce6f0
         - Municipios pintados según su nivel de alerta (columna configurable
           del .geojson de entrada), con contornos de división política.
         - Nombres de ciudades/localidades de referencia (opcional).
    3. Barra inferior blanca con el título "Probabilidad Máxima de Superar
       el Criterio de Aviso" (o el texto que se configure) + leyenda de
       colores + créditos.

USO BÁSICO (linea de comandos):
    python plot_alerta_heladas.py --geojson mi_archivo.geojson

USO EN VSCODE:
    1. Abrí esta carpeta en VSCode.
    2. Creá un entorno virtual e instalá los requisitos:
           python -m venv .venv
           .venv\\Scripts\\activate      (Windows)
           source .venv/bin/activate     (Linux/Mac)
           pip install -r requirements.txt
    3. Copiá tu archivo .geojson de municipios dentro de esta carpeta
       (o indicá su ruta completa).
    4. Ejecutá (F5 o desde la terminal):
           python plot_alerta_heladas.py --geojson "ruta/a/tu_archivo.geojson"
    5. La imagen se guarda en ./salida/alerta_clima_frio_heladas.png

PERSONALIZACIÓN:
    Todas las opciones configurables (colores, textos, nombre de la columna
    de nivel de alerta dentro del .geojson, etc.) están centralizadas al
    principio de este archivo, en el bloque "CONFIGURACIÓN GENERAL", y
    también se pueden pasar por línea de comandos (ver --help).

Autor: Generado con Kiro para el proyecto ColdWarnings.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # backend sin ventana, ideal para generar PNG en cualquier entorno

import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import Rectangle
from matplotlib.lines import Line2D

import geopandas as gpd
import pandas as pd
from shapely.geometry import box


# =============================================================================
# CONFIGURACIÓN GENERAL
# =============================================================================

# --- Rutas por defecto ------------------------------------------------------
CARPETA_BASE = Path(__file__).resolve().parent
CARPETA_DATA = CARPETA_BASE / "data"
CARPETA_SALIDA = CARPETA_BASE / "salida"

RUTA_PAISES_110M = CARPETA_DATA / "ne_110m_admin_0_countries.geojson"
RUTA_PAISES_50M = CARPETA_DATA / "ne_50m_admin_0_countries.geojson"
RUTA_PROVINCIAS_50M = CARPETA_DATA / "ne_50m_admin_1_states_provinces.geojson"
RUTA_LAGOS_110M = CARPETA_DATA / "ne_110m_lakes.geojson"
RUTA_LAGOS_50M = CARPETA_DATA / "ne_50m_lakes.geojson"
RUTA_RIOS_110M = CARPETA_DATA / "ne_110m_rivers_lake_centerlines.geojson"
RUTA_RIOS_50M = CARPETA_DATA / "ne_50m_rivers_lake_centerlines.geojson"

# --- Textos del banner y del pie --------------------------------------------
TITULO_BANNER = "Alerta por Clima Frío y Heladas"
SUBTITULO_BANNER = "Válido a las 24hs del día 03/07/26"
TITULO_LEYENDA_PIE = "Probabilidad Máxima de Superar el Criterio de Aviso"
CREDITO_LINEA_1 = "Imagen generada por:"
CREDITO_LINEA_2 = "ColdWarnings"
CREDITO_LINEA_3 = ""  # se completa automáticamente con fecha/hora de generación

# --- Colores generales del mapa (pedidos por el usuario) --------------------
COLOR_BASEMAP = "#f0eceb"       # relleno de continentes / tierra
COLOR_AGUA = "#dce6f0"          # mar, océano, ríos, lagos
COLOR_BORDE_PAIS = "#4d4d4d"    # límites internacionales
COLOR_BORDE_PROVINCIA = "#7f7f7f"  # límites provinciales/estatales (referencia)
COLOR_BORDE_MUNICIPIO = "#1a1a1a"  # límites de municipios/departamentos
COLOR_FONDO_FIGURA = "#ffffff"
COLOR_TEXTO_OSCURO = "#1a1a1a"

# --- Colores del banner azul superior (idénticos a la referencia NWS) ------
COLOR_BANNER_AZUL = "#12225c"       # azul oscuro tipo NOAA/NWS
COLOR_BANNER_BORDE = "#000000"

# --- Niveles de alerta por clima frío / heladas -----------------------------
# Reemplaza la escala de "probabilidad de nieve" del NWS por una escala de
# alerta por frío/heladas. Se mantiene la MISMA paleta de colores de
# referencia (blanco, celeste/turquesa, amarillo, rojo, violeta) para que el
# resultado visual sea idéntico al de la imagen de referencia.
#
# Cada nivel tiene:
#   valores: lista de strings que, si aparecen en la columna de nivel del
#            .geojson (sin importar mayúsculas/acentos), se consideran de
#            este nivel.
#   etiqueta: texto que se muestra en la leyenda inferior.
#   color: color de relleno del municipio en el mapa.
NIVELES_ALERTA = [
    {
        "id": "sin_riesgo",
        "valores": ["sin riesgo", "ninguno", "sin alerta", "s/riesgo", "<10%", "bajo", "0"],
        "etiqueta": "<10%",
        "color": "#ffffff",
    },
    {
        "id": "vigilancia",
        "valores": ["vigilancia", "amarillo claro", "10-30%", "10 - 30%", "leve", "1"],
        "etiqueta": "10-30%",
        "color": "#4fc3c8",
    },
    {
        "id": "alerta_amarilla",
        "valores": ["amarillo", "alerta amarilla", "moderado", "30-50%", "30 - 50%", "2"],
        "etiqueta": "30-50%",
        "color": "#fff066",
    },
    {
        "id": "alerta_roja",
        "valores": ["rojo", "alerta roja", "severo", "50-80%", "50 - 80%", "naranja", "alerta naranja", "3"],
        "etiqueta": "50-80%",
        "color": "#e0342a",
    },
    {
        "id": "alerta_extrema",
        "valores": [">80%", "extremo", "violeta", "morado", "critico", "crítico", "4"],
        "etiqueta": ">80%",
        "color": "#8a2be2",
    },
]

COLOR_SIN_DATO = "#ffffff"  # color para municipios sin nivel de alerta asignado

# --- Localidades de referencia opcionales (idéntico a los puntos con nombre
#     de la imagen del NWS: Seattle, Denver, Chicago, etc.) -----------------
# Podés dejar la lista vacía si no querés marcar ninguna localidad, o cargar
# tu propio archivo .csv/.geojson de localidades con --localidades.
LOCALIDADES_REFERENCIA = []
# Ejemplo de formato: {"nombre": "Ciudad", "lon": -64.18, "lat": -31.42}


# =============================================================================
# UTILIDADES DE TEXTO / NORMALIZACIÓN
# =============================================================================

def normalizar_texto(txt) -> str:
    """Pasa a minúsculas y quita tildes/espacios extra para poder comparar
    valores de nivel de alerta sin importar cómo estén escritos en el geojson."""
    if txt is None:
        return ""
    txt = str(txt).strip().lower()
    reemplazos = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
    }
    for a, b in reemplazos.items():
        txt = txt.replace(a, b)
    return txt


def mapear_nivel_a_color(valor_crudo) -> tuple[str, str]:
    """Dado el valor crudo de la columna de nivel de alerta de un municipio,
    devuelve (id_nivel, color_hex) según la tabla NIVELES_ALERTA.
    Si no coincide con ningún nivel conocido, devuelve ("sin_dato", COLOR_SIN_DATO).
    """
    v = normalizar_texto(valor_crudo)
    if not v:
        return "sin_dato", COLOR_SIN_DATO
    for nivel in NIVELES_ALERTA:
        for candidato in nivel["valores"]:
            if normalizar_texto(candidato) == v:
                return nivel["id"], nivel["color"]
    # Coincidencia parcial (por si el valor viene con texto extra, ej. "Alerta Roja - Heladas")
    for nivel in NIVELES_ALERTA:
        for candidato in nivel["valores"]:
            c = normalizar_texto(candidato)
            if c and (c in v or v in c):
                return nivel["id"], nivel["color"]
    return "sin_dato", COLOR_SIN_DATO


def detectar_columna_nivel(gdf: gpd.GeoDataFrame, columna_sugerida: str | None) -> str | None:
    """Intenta detectar automáticamente la columna que contiene el nivel de
    alerta de cada municipio, si el usuario no la especificó."""
    if columna_sugerida and columna_sugerida in gdf.columns:
        return columna_sugerida

    candidatos = [
        "nivel_alerta", "nivel", "alerta", "nivel_aviso", "aviso",
        "nivel_riesgo", "riesgo", "color", "nivel_helada", "helada",
        "prob", "probabilidad", "categoria", "clase",
    ]
    columnas_norm = {normalizar_texto(c): c for c in gdf.columns}
    for c in candidatos:
        if c in columnas_norm:
            return columnas_norm[c]
    return None


def detectar_columna_nombre(gdf: gpd.GeoDataFrame, columna_sugerida: str | None) -> str | None:
    """Intenta detectar automáticamente la columna con el nombre del municipio."""
    if columna_sugerida and columna_sugerida in gdf.columns:
        return columna_sugerida
    candidatos = [
        "nombre", "nam", "name", "municipio", "departamen", "departamento",
        "partido", "comuna", "nomdepto", "nom_depto", "fna", "gna", "label",
        "etiqueta", "nombre_completo",
    ]
    columnas_norm = {normalizar_texto(c): c for c in gdf.columns}
    for c in candidatos:
        if c in columnas_norm:
            return columnas_norm[c]
    return None


# =============================================================================
# CARGA DE DATOS
# =============================================================================

def cargar_geojson_alertas(ruta: str) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(ruta)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    elif gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs("EPSG:4326")
    return gdf


def cargar_capa_referencia(ruta_alta_res: Path, ruta_baja_res: Path, bounds, usar_alta_res: bool) -> gpd.GeoDataFrame | None:
    """Carga una capa de referencia (países, provincias, lagos, ríos) y la
    recorta a la región del bounding box del .geojson de entrada (con margen),
    para no procesar de más y para que el resultado se ajuste a la región
    cubierta por los datos del usuario."""
    ruta = ruta_alta_res if usar_alta_res and ruta_alta_res.exists() else ruta_baja_res
    if not ruta.exists():
        return None
    try:
        gdf = gpd.read_file(ruta)
    except Exception:
        return None
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    if bounds is not None:
        minx, miny, maxx, maxy = bounds
        recorte = box(minx, miny, maxx, maxy)
        try:
            gdf = gdf[gdf.geometry.intersects(recorte)]
        except Exception:
            pass
    return gdf


# =============================================================================
# CONSTRUCCIÓN DE LA FIGURA
# =============================================================================

def calcular_margen(bounds, factor=0.08):
    minx, miny, maxx, maxy = bounds
    ancho = maxx - minx
    alto = maxy - miny
    # Evita márgenes nulos en geometrías muy chicas o puntuales
    ancho = max(ancho, 0.5)
    alto = max(alto, 0.5)
    mx = ancho * factor
    my = alto * factor
    return (minx - mx, miny - my, maxx + mx, maxy + my)


def construir_leyenda_pie(ax_leyenda, niveles_usados: list[dict]):
    """Dibuja la barra de leyenda inferior, con swatches de color + etiqueta,
    replicando el estilo de la barra inferior de la imagen de referencia del
    NWS ("Maximum Probability of Exceeding Warning Criteria"): título en la
    fila superior y swatches con su etiqueta debajo, en la fila inferior."""
    ax_leyenda.set_xlim(0, 1)
    ax_leyenda.set_ylim(0, 1)
    ax_leyenda.axis("off")

    n = len(niveles_usados)
    if n == 0:
        return

    ancho_total = 0.62
    x0 = 0.03
    ancho_swatch = ancho_total / n
    y0, alto_swatch = 0.06, 0.40

    for i, nivel in enumerate(niveles_usados):
        x = x0 + i * ancho_swatch
        ax_leyenda.add_patch(
            Rectangle(
                (x, y0), ancho_swatch * 0.94, alto_swatch,
                facecolor=nivel["color"], edgecolor="#4a4a4a", linewidth=0.8,
                transform=ax_leyenda.transAxes,
            )
        )
        ax_leyenda.text(
            x + (ancho_swatch * 0.94) / 2, y0 - 0.05, nivel["etiqueta"],
            ha="center", va="top", fontsize=9.5, fontweight="bold",
            color=COLOR_TEXTO_OSCURO, transform=ax_leyenda.transAxes,
        )


def generar_mapa(
    ruta_geojson: str,
    ruta_salida: str,
    columna_nivel: str | None,
    columna_nombre: str | None,
    titulo_banner: str,
    subtitulo_banner: str,
    titulo_leyenda: str,
    mostrar_nombres_municipios: bool,
    usar_alta_res: bool,
    ancho_pulgadas: float,
    alto_pulgadas: float,
    dpi: int,
):
    print(f"[1/6] Leyendo geojson de alertas: {ruta_geojson}")
    gdf = cargar_geojson_alertas(ruta_geojson)
    if gdf.empty:
        raise ValueError("El archivo .geojson no contiene geometrías (FeatureCollection vacío).")

    col_nivel = detectar_columna_nivel(gdf, columna_nivel)
    col_nombre = detectar_columna_nombre(gdf, columna_nombre)

    print(f"      Columna de nivel de alerta detectada: {col_nivel!r}")
    print(f"      Columna de nombre de municipio detectada: {col_nombre!r}")

    if col_nivel is None:
        print(
            "      ADVERTENCIA: no se detectó una columna de nivel de alerta. "
            "Todos los municipios se pintarán en blanco (sin dato).\n"
            "      Usá --columna-nivel <nombre_de_columna> para indicarla manualmente."
        )
        gdf["_nivel_id"] = "sin_dato"
        gdf["_color"] = COLOR_SIN_DATO
    else:
        resultado = gdf[col_nivel].apply(mapear_nivel_a_color)
        gdf["_nivel_id"] = resultado.apply(lambda t: t[0])
        gdf["_color"] = resultado.apply(lambda t: t[1])

    bounds = gdf.total_bounds  # minx, miny, maxx, maxy
    bounds_margen = calcular_margen(bounds, factor=0.10)

    print("[2/6] Cargando capas de referencia (países / provincias / agua)...")
    paises = cargar_capa_referencia(RUTA_PAISES_50M, RUTA_PAISES_110M, bounds_margen, usar_alta_res)
    provincias = cargar_capa_referencia(RUTA_PROVINCIAS_50M, RUTA_PROVINCIAS_50M, bounds_margen, usar_alta_res)
    lagos = cargar_capa_referencia(RUTA_LAGOS_50M, RUTA_LAGOS_110M, bounds_margen, usar_alta_res)
    rios = cargar_capa_referencia(RUTA_RIOS_50M, RUTA_RIOS_110M, bounds_margen, usar_alta_res)

    print("[3/6] Construyendo la figura...")
    fig = plt.figure(figsize=(ancho_pulgadas, alto_pulgadas), dpi=dpi, facecolor=COLOR_FONDO_FIGURA)

    # Grilla vertical: banner (fijo, alto chico) / mapa (flexible) / pie (fijo, alto chico)
    gs = fig.add_gridspec(
        nrows=3, ncols=1,
        height_ratios=[0.055, 0.86, 0.085],
        hspace=0.0,
    )

    ax_banner = fig.add_subplot(gs[0, 0])
    ax_mapa = fig.add_subplot(gs[1, 0])
    ax_pie = fig.add_subplot(gs[2, 0])

    # ---------------- BANNER SUPERIOR ----------------
    ax_banner.set_xlim(0, 1)
    ax_banner.set_ylim(0, 1)
    ax_banner.axis("off")
    ax_banner.add_patch(
        Rectangle((0, 0), 1, 1, facecolor=COLOR_BANNER_AZUL, edgecolor=COLOR_BANNER_BORDE,
                   linewidth=1.2, transform=ax_banner.transAxes, zorder=1)
    )
    texto_banner = f"{titulo_banner} -- {subtitulo_banner}"
    ax_banner.text(
        0.015, 0.5, texto_banner, ha="left", va="center",
        fontsize=15, fontweight="bold", color="white",
        transform=ax_banner.transAxes, zorder=2,
    )

    # ---------------- MAPA PRINCIPAL ----------------
    minx, miny, maxx, maxy = bounds_margen

    # Fondo de "agua" para toda la región (mar/océano de base)
    ax_mapa.add_patch(
        Rectangle((minx, miny), maxx - minx, maxy - miny, facecolor=COLOR_AGUA,
                   edgecolor="none", zorder=0)
    )

    # Continentes / países (basemap)
    if paises is not None and not paises.empty:
        paises.plot(ax=ax_mapa, facecolor=COLOR_BASEMAP, edgecolor=COLOR_BORDE_PAIS,
                    linewidth=0.9, zorder=1)

    # Límites provinciales/estatales de referencia (línea fina)
    if provincias is not None and not provincias.empty:
        provincias.boundary.plot(ax=ax_mapa, color=COLOR_BORDE_PROVINCIA, linewidth=0.6, zorder=2)

    # Lagos y ríos (agua interior)
    if lagos is not None and not lagos.empty:
        lagos.plot(ax=ax_mapa, facecolor=COLOR_AGUA, edgecolor=COLOR_AGUA, linewidth=0, zorder=2)
    if rios is not None and not rios.empty:
        rios.plot(ax=ax_mapa, color=COLOR_AGUA, linewidth=1.1, zorder=2)

    # Municipios coloreados por nivel de alerta (capa principal)
    gdf.plot(
        ax=ax_mapa, facecolor=gdf["_color"], edgecolor=COLOR_BORDE_MUNICIPIO,
        linewidth=0.5, zorder=3,
    )

    # Nombres de municipios (opcional, para regiones con pocas unidades)
    if mostrar_nombres_municipios and col_nombre is not None and len(gdf) <= 120:
        for _, fila in gdf.iterrows():
            try:
                centro = fila.geometry.representative_point()
            except Exception:
                continue
            nombre = str(fila[col_nombre])
            ax_mapa.annotate(
                nombre, xy=(centro.x, centro.y), ha="center", va="center",
                fontsize=5.6, color="#111111", zorder=5,
                bbox=dict(boxstyle="round,pad=0.08", fc="white", ec="none", alpha=0.65),
            )

    # Localidades de referencia (puntos + nombre), estilo NWS
    for loc in LOCALIDADES_REFERENCIA:
        ax_mapa.plot(loc["lon"], loc["lat"], marker="o", markersize=3.2,
                     markerfacecolor="white", markeredgecolor="black", markeredgewidth=0.8, zorder=6)
        ax_mapa.annotate(
            loc["nombre"], xy=(loc["lon"], loc["lat"]), xytext=(4, 3),
            textcoords="offset points", fontsize=7, fontweight="bold",
            color=COLOR_TEXTO_OSCURO, zorder=6,
        )

    ax_mapa.set_xlim(minx, maxx)
    ax_mapa.set_ylim(miny, maxy)
    ax_mapa.set_aspect("equal", adjustable="box")
    ax_mapa.set_xticks([])
    ax_mapa.set_yticks([])
    for spine in ax_mapa.spines.values():
        spine.set_visible(True)
        spine.set_color("#000000")
        spine.set_linewidth(1.0)

    # ---------------- PIE / LEYENDA INFERIOR ----------------
    ax_pie.set_xlim(0, 1)
    ax_pie.set_ylim(0, 1)
    ax_pie.axis("off")
    ax_pie.add_patch(
        Rectangle((0, 0), 1, 1, facecolor="#ffffff", edgecolor="#000000",
                   linewidth=1.0, transform=ax_pie.transAxes, zorder=1)
    )
    ax_pie.text(
        0.015, 0.80, titulo_leyenda, ha="left", va="center",
        fontsize=12, fontweight="bold", color=COLOR_TEXTO_OSCURO,
        transform=ax_pie.transAxes,
    )

    construir_leyenda_pie(ax_pie, NIVELES_ALERTA)

    fecha_gen = pd.Timestamp.now().strftime("%d/%m/%Y %H:%M")
    ax_pie.text(
        0.99, 0.86, CREDITO_LINEA_1, ha="right", va="center", fontsize=8.5,
        color=COLOR_TEXTO_OSCURO, transform=ax_pie.transAxes,
    )
    ax_pie.text(
        0.99, 0.58, CREDITO_LINEA_2, ha="right", va="center", fontsize=9.5,
        fontweight="bold", color=COLOR_TEXTO_OSCURO, transform=ax_pie.transAxes,
    )
    ax_pie.text(
        0.99, 0.30, f"Generado el {fecha_gen}", ha="right", va="center", fontsize=7.5,
        color="#555555", transform=ax_pie.transAxes,
    )

    print(f"[4/6] Municipios procesados: {len(gdf)}")
    conteo = gdf["_nivel_id"].value_counts()
    for nivel_id, cantidad in conteo.items():
        print(f"      - {nivel_id}: {cantidad}")

    print(f"[5/6] Guardando imagen en: {ruta_salida}")
    os.makedirs(os.path.dirname(ruta_salida) or ".", exist_ok=True)
    fig.savefig(ruta_salida, dpi=dpi, facecolor=COLOR_FONDO_FIGURA, bbox_inches="tight")
    plt.close(fig)
    print("[6/6] ¡Listo!")


# =============================================================================
# CLI
# =============================================================================

def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Genera un mapa de Alerta por Clima Frío y Heladas por municipio, "
            "en el mismo formato visual que los productos NWS/WPC, a partir de "
            "un archivo .geojson con un nivel de alerta por feature."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(
            """
            Ejemplos:
              python plot_alerta_heladas.py --geojson ejemplo/municipios_ejemplo.geojson

              python plot_alerta_heladas.py --geojson mis_municipios.geojson \\
                  --columna-nivel nivel_alerta --columna-nombre partido \\
                  --salida salida/mi_alerta.png

              python plot_alerta_heladas.py --geojson mis_municipios.geojson \\
                  --subtitulo "Válido a las 24hs del día 05/07/26"
            """
        ),
    )
    parser.add_argument(
        "--geojson", required=True,
        help="Ruta al archivo .geojson de municipios con el nivel de alerta por feature.",
    )
    parser.add_argument(
        "--salida", default=str(CARPETA_SALIDA / "alerta_clima_frio_heladas.png"),
        help="Ruta del archivo .png de salida (default: ./salida/alerta_clima_frio_heladas.png).",
    )
    parser.add_argument(
        "--columna-nivel", default=None,
        help="Nombre de la columna del .geojson que contiene el nivel de alerta "
             "(ej. 'nivel_alerta'). Si no se indica, se intenta detectar automáticamente.",
    )
    parser.add_argument(
        "--columna-nombre", default=None,
        help="Nombre de la columna del .geojson que contiene el nombre del municipio "
             "(usado sólo si se pasa --mostrar-nombres).",
    )
    parser.add_argument(
        "--titulo", default=TITULO_BANNER,
        help=f"Título principal del banner azul (default: {TITULO_BANNER!r}).",
    )
    parser.add_argument(
        "--subtitulo", default=SUBTITULO_BANNER,
        help=f"Subtítulo de vigencia del banner azul (default: {SUBTITULO_BANNER!r}).",
    )
    parser.add_argument(
        "--titulo-leyenda", default=TITULO_LEYENDA_PIE,
        help=f"Título de la leyenda del pie (default: {TITULO_LEYENDA_PIE!r}).",
    )
    parser.add_argument(
        "--mostrar-nombres", action="store_true",
        help="Muestra el nombre de cada municipio sobre el mapa (recomendado solo si "
             "hay pocas unidades geográficas, para no saturar el mapa).",
    )
    parser.add_argument(
        "--alta-resolucion", action="store_true", default=True,
        help="Usa las capas de referencia de mayor resolución (50m) en lugar de 110m. Activado por defecto.",
    )
    parser.add_argument(
        "--baja-resolucion", dest="alta_resolucion", action="store_false",
        help="Usa las capas de referencia de menor resolución (110m), más livianas.",
    )
    parser.add_argument("--ancho", type=float, default=12.8, help="Ancho de la figura en pulgadas (default: 12.8).")
    parser.add_argument("--alto", type=float, default=9.6, help="Alto de la figura en pulgadas (default: 9.6).")
    parser.add_argument("--dpi", type=int, default=140, help="Resolución de salida en DPI (default: 140).")
    return parser


def main():
    parser = construir_parser()
    args = parser.parse_args()

    if not Path(args.geojson).exists():
        print(f"ERROR: no se encontró el archivo .geojson indicado: {args.geojson}", file=sys.stderr)
        sys.exit(1)

    try:
        generar_mapa(
            ruta_geojson=args.geojson,
            ruta_salida=args.salida,
            columna_nivel=args.columna_nivel,
            columna_nombre=args.columna_nombre,
            titulo_banner=args.titulo,
            subtitulo_banner=args.subtitulo,
            titulo_leyenda=args.titulo_leyenda,
            mostrar_nombres_municipios=args.mostrar_nombres,
            usar_alta_res=args.alta_resolucion,
            ancho_pulgadas=args.ancho,
            alto_pulgadas=args.alto,
            dpi=args.dpi,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
