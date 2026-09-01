"""
scraper_elejandria.py
=====================
Script de web scraping para descargar libros ePub de elejandria.com.

Uso:
    pip install selenium webdriver-manager requests beautifulsoup4 lxml
    python scraper_elejandria.py

Autor: Generado para LiteratusNovelist
"""

import os
import re
import json
import time
import random
import logging
import requests
from pathlib import Path
from datetime import datetime
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    WebDriverException,
)
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN GLOBAL
# ─────────────────────────────────────────────────────────────────────────────

SITEMAP_URL     = "https://www.elejandria.com/mapa-del-sitio"
BASE_URL        = "https://www.elejandria.com"
DOWNLOAD_DIR    = Path("epubs_elejandria")       # Carpeta de destino
STATE_FILE      = Path("json_data/scraper_estado.json")    # Progreso guardado
LOG_FILE        = Path("scraper_elejandria.log") # Archivo de log
DELAY_MIN       = 4    # segundos mínimos entre descargas
DELAY_MAX       = 8    # segundos máximos entre descargas
REQUEST_TIMEOUT = 30   # timeout para requests HTTP
MAX_RETRIES     = 3    # reintentos por libro en caso de error transitorio

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-ES,es;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE LOGGING
# ─────────────────────────────────────────────────────────────────────────────

def configurar_logging() -> logging.Logger:
    """
    Configura el logger para escribir tanto en consola como en archivo.
    Nivel INFO → consola, DEBUG+ → archivo de log.
    """
    logger = logging.getLogger("ElejandriaScaper")
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Handler de consola (INFO y superior)
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    # Handler de archivo (DEBUG y superior, rotación manual por fecha)
    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    logger.addHandler(ch)
    logger.addHandler(fh)
    return logger


LOG = configurar_logging()


# ─────────────────────────────────────────────────────────────────────────────
# GESTIÓN DE ESTADO (RESUME CAPABILITY)
# ─────────────────────────────────────────────────────────────────────────────

def cargar_estado() -> dict:
    """
    Carga el estado previo desde STATE_FILE.
    Retorna un dict con claves:
        - 'descargados': set de URLs procesadas exitosamente
        - 'fallidos':    dict {url: razon} de URLs con error permanente
    """
    if STATE_FILE.exists():
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return {
            "descargados": set(raw.get("descargados", [])),
            "fallidos":    raw.get("fallidos", {}),
        }
    return {"descargados": set(), "fallidos": {}}


def guardar_estado(estado: dict) -> None:
    """Persiste el estado actual en STATE_FILE (serializable a JSON)."""
    serializable = {
        "descargados": list(estado["descargados"]),
        "fallidos":    estado["fallidos"],
        "ultima_ejecucion": datetime.now().isoformat(),
    }
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(serializable, f, ensure_ascii=False, indent=2)


def marcar_descargado(estado: dict, url: str) -> None:
    estado["descargados"].add(url)
    guardar_estado(estado)


def marcar_fallido(estado: dict, url: str, razon: str) -> None:
    estado["fallidos"][url] = razon
    guardar_estado(estado)


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DEL DRIVER SELENIUM
# ─────────────────────────────────────────────────────────────────────────────

def crear_driver() -> webdriver.Chrome:
    """
    Crea y retorna un ChromeDriver configurado en modo semi-stealth.
    ChromeDriverManager gestiona la descarga/actualización del binario.
    """
    options = Options()

    # ── Opciones de estabilidad y compatibilidad ──
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1280,900")

    # ── Anti-detección básica ──
    options.add_argument(f"user-agent={HEADERS['User-Agent']}")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    # ── Directorio de descarga automática (para futuros usos) ──
    prefs = {
        "download.default_directory": str(DOWNLOAD_DIR.resolve()),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    }
    options.add_experimental_option("prefs", prefs)

    # ── Modo sin cabeza opcional (descomenta para producción headless) ──
    # options.add_argument("--headless=new")

    service = Service(ChromeDriverManager().install())
    driver  = webdriver.Chrome(service=service, options=options)

    # Eliminar la propiedad 'webdriver' del navegador (stealth básico)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
    )

    driver.set_page_load_timeout(60)
    return driver


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 1: OBTENER URLs DEL MAPA DEL SITIO
# ─────────────────────────────────────────────────────────────────────────────

def obtener_urls_sitemap(driver: webdriver.Chrome) -> list[str]:
    """
    Navega al mapa del sitio de Elejandria y extrae todas las URLs de libros.

    Heurística: en elejandria.com los libros siguen el patrón
    /libro/{slug}/{id-autor}  (URL con al menos dos segmentos después de /libro/).

    Retorna lista de URLs únicas y ordenadas.
    """
    LOG.info(f"Cargando mapa del sitio: {SITEMAP_URL}")
    driver.get(SITEMAP_URL)
    time.sleep(3)  # Espera a que cargue el contenido dinámico

    soup = BeautifulSoup(driver.page_source, "lxml")
    urls_libros = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]

        # Normalizar URL relativa → absoluta
        if href.startswith("/"):
            href = urljoin(BASE_URL, href)

        # Filtrar solo URLs de libros
        if re.search(r"elejandria\.com/libro/", href):
            urls_libros.add(href.split("?")[0].rstrip("/"))  # Limpiar query params

    urls_ordenadas = sorted(urls_libros)
    LOG.info(f"Total de URLs de libros encontradas: {len(urls_ordenadas)}")
    return urls_ordenadas


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 2: NAVEGAR AL LIBRO Y ENCONTRAR BOTÓN EPUB
# ─────────────────────────────────────────────────────────────────────────────

def encontrar_link_descarga_epub(driver: webdriver.Chrome, url_libro: str) -> str | None:
    """
    Navega a la página del libro y localiza el enlace de descarga ePub.

    Estrategia:
        1. Busca <a> cuyo texto contenga "Descargar en ePub" (case-insensitive).
        2. Hace click y espera la redirección a la página de descarga final.
        3. Extrae el href del elemento con class 'download-link'.

    Retorna el URL de descarga directo o None si no se encuentra.
    """
    wait = WebDriverWait(driver, 15)

    LOG.debug(f"Cargando página del libro: {url_libro}")
    driver.get(url_libro)
    time.sleep(2)

    # ── Paso 1: Localizar el botón de descarga ePub ──
    try:
        boton_epub = wait.until(
            EC.element_to_be_clickable(
                (By.XPATH, "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'descargar en epub')]")
            )
        )
        href_boton = boton_epub.get_attribute("href")
        LOG.debug(f"  Botón ePub encontrado → {href_boton}")
    except TimeoutException:
        LOG.warning(f"  ⚠ No se encontró botón ePub en: {url_libro}")
        return None

    # ── Paso 2: Navegar a la página intermedia de descarga ──
    try:
        driver.get(href_boton)
        time.sleep(2)
    except WebDriverException as e:
        LOG.warning(f"  ⚠ Error al navegar al enlace del botón: {e}")
        return None

    # ── Paso 3: Extraer href del elemento .download-link ──
    try:
        download_element = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".download-link, a.download-link, [class*='download-link']"))
        )
        href_final = download_element.get_attribute("href")
        if href_final:
            LOG.debug(f"  Enlace de descarga directo: {href_final}")
            return href_final
        else:
            LOG.warning(f"  ⚠ Elemento .download-link sin href en: {url_libro}")
            return None
    except TimeoutException:
        # Plan B: parsear el HTML directamente con BeautifulSoup
        LOG.debug("  Intentando plan B: parsing directo del DOM...")
        soup = BeautifulSoup(driver.page_source, "lxml")
        elem = soup.select_one(".download-link, [class*='download-link']")
        if elem and elem.get("href"):
            return elem["href"]
        LOG.warning(f"  ⚠ No se encontró .download-link en página final de: {url_libro}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 3: DESCARGAR EL ARCHIVO EPUB
# ─────────────────────────────────────────────────────────────────────────────

def descargar_archivo(url_descarga: str, carpeta_destino: Path) -> Path | None:
    """
    Descarga el archivo ePub usando requests (más confiable que esperar
    la descarga del browser).

    Estrategia:
        - Streaming para no cargar el archivo entero en memoria.
        - Nombre de archivo extraído del header Content-Disposition o de la URL.
        - Verifica que el archivo descargado no esté vacío.

    Retorna el Path del archivo guardado o None si falla.
    """
    try:
        session = requests.Session()
        session.headers.update(HEADERS)

        LOG.debug(f"  Descargando desde: {url_descarga}")
        response = session.get(url_descarga, stream=True, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()

        # ── Determinar nombre del archivo ──
        nombre_archivo = _extraer_nombre_archivo(response, url_descarga)
        ruta_destino = carpeta_destino / nombre_archivo

        # Si ya existe y no está vacío, no volver a descargar
        if ruta_destino.exists() and ruta_destino.stat().st_size > 1024:
            LOG.debug(f"  Archivo ya existe localmente: {nombre_archivo}")
            return ruta_destino

        # ── Escribir en disco con streaming ──
        with open(ruta_destino, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        tamaño = ruta_destino.stat().st_size
        if tamaño < 500:  # Archivo sospechosamente pequeño (probablemente error HTML)
            LOG.warning(f"  ⚠ Archivo descargado muy pequeño ({tamaño} bytes): {nombre_archivo}")
            ruta_destino.unlink(missing_ok=True)
            return None

        LOG.info(f"  ✅ Guardado: {nombre_archivo} ({tamaño / 1024:.1f} KB)")
        return ruta_destino

    except requests.exceptions.HTTPError as e:
        LOG.error(f"  ✖ HTTP Error al descargar {url_descarga}: {e}")
    except requests.exceptions.ConnectionError as e:
        LOG.error(f"  ✖ Conexión fallida para {url_descarga}: {e}")
    except requests.exceptions.Timeout:
        LOG.error(f"  ✖ Timeout al descargar: {url_descarga}")
    except Exception as e:
        LOG.error(f"  ✖ Error inesperado en descarga: {e}")

    return None


def _extraer_nombre_archivo(response: requests.Response, url_fallback: str) -> str:
    """
    Extrae el nombre del archivo del header Content-Disposition.
    Si no está disponible, lo infiere de la URL.
    """
    content_disp = response.headers.get("Content-Disposition", "")
    if content_disp:
        match = re.search(r'filename[^;=\n]*=([^;\n]*)', content_disp, re.IGNORECASE)
        if match:
            nombre = match.group(1).strip().strip('"').strip("'")
            # Sanitizar caracteres problemáticos en sistemas de archivos
            nombre = re.sub(r'[<>:"/\\|?*]', '_', nombre)
            if nombre:
                return nombre

    # Fallback: extraer de la URL
    path = urlparse(url_fallback).path
    nombre_url = Path(path).name
    if nombre_url and nombre_url.endswith(".epub"):
        return re.sub(r'[<>:"/\\|?*]', '_', nombre_url)

    # Último recurso: timestamp único
    return f"libro_{int(time.time())}.epub"


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 4: PROCESAR UN LIBRO (ORQUESTADOR POR URL)
# ─────────────────────────────────────────────────────────────────────────────

def procesar_libro(driver: webdriver.Chrome, url_libro: str, carpeta_destino: Path) -> tuple[bool, str]:
    """
    Orquesta el proceso completo para un libro:
        1. Navegar a la página del libro.
        2. Encontrar y seguir el enlace ePub.
        3. Descargar el archivo.

    Retorna (éxito: bool, mensaje: str).
    """
    for intento in range(1, MAX_RETRIES + 1):
        try:
            if intento > 1:
                LOG.info(f"  Reintento {intento}/{MAX_RETRIES} para: {url_libro}")
                time.sleep(random.uniform(5, 10))

            url_descarga = encontrar_link_descarga_epub(driver, url_libro)

            if not url_descarga:
                return False, "No se encontró enlace de descarga ePub"

            archivo = descargar_archivo(url_descarga, carpeta_destino)

            if archivo:
                return True, f"Descargado: {archivo.name}"
            else:
                if intento == MAX_RETRIES:
                    return False, "Fallo en la descarga del archivo (todos los intentos agotados)"
                continue

        except WebDriverException as e:
            error_msg = f"WebDriver error (intento {intento}): {str(e)[:200]}"
            LOG.warning(f"  ⚠ {error_msg}")
            if intento == MAX_RETRIES:
                return False, error_msg
            # Esperar más en caso de error de driver
            time.sleep(random.uniform(8, 15))

        except Exception as e:
            error_msg = f"Error inesperado (intento {intento}): {str(e)[:200]}"
            LOG.error(f"  ✖ {error_msg}")
            if intento == MAX_RETRIES:
                return False, error_msg

    return False, "Máximo de reintentos alcanzado"


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 5: REPORTE FINAL
# ─────────────────────────────────────────────────────────────────────────────

def imprimir_resumen(estado: dict, total_urls: int) -> None:
    """Imprime un resumen detallado al finalizar."""
    exitosos = len(estado["descargados"])
    fallidos  = len(estado["fallidos"])
    LOG.info("=" * 60)
    LOG.info("RESUMEN FINAL DEL SCRAPING")
    LOG.info("=" * 60)
    LOG.info(f"  Total de libros en el sitio:    {total_urls}")
    LOG.info(f"  ✅ Descargados exitosamente:     {exitosos}")
    LOG.info(f"  ✖  Con errores (saltados):       {fallidos}")
    LOG.info(f"  ⏩ Pendientes (no procesados):   {total_urls - exitosos - fallidos}")
    LOG.info(f"  Archivos guardados en:           {DOWNLOAD_DIR.resolve()}")
    LOG.info(f"  Estado guardado en:              {STATE_FILE.resolve()}")
    LOG.info(f"  Log completo en:                 {LOG_FILE.resolve()}")

    if estado["fallidos"]:
        LOG.info("\n  URLs con errores permanentes:")
        for url, razon in list(estado["fallidos"].items())[:10]:
            LOG.info(f"    - {url[:60]}...  →  {razon}")
        if fallidos > 10:
            LOG.info(f"    ... y {fallidos - 10} más (ver {STATE_FILE})")
    LOG.info("=" * 60)


# ─────────────────────────────────────────────────────────────────────────────
# FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def main():
    LOG.info("=" * 60)
    LOG.info("  ELEJANDRIA EPUB SCRAPER — Inicio")
    LOG.info(f"  Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    LOG.info("=" * 60)

    # ── Preparar carpeta de destino ──
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    LOG.info(f"Carpeta de descarga: {DOWNLOAD_DIR.resolve()}")

    # ── Cargar estado previo (resume capability) ──
    estado = cargar_estado()
    ya_descargados = len(estado["descargados"])
    ya_fallidos    = len(estado["fallidos"])
    if ya_descargados or ya_fallidos:
        LOG.info(f"▶ Reanudando: {ya_descargados} ya descargados, {ya_fallidos} fallidos previamente.")

    driver = None
    try:
        # ── Inicializar driver ──
        LOG.info("Inicializando ChromeDriver...")
        driver = crear_driver()

        # ── Obtener lista de URLs del sitemap ──
        todas_las_urls = obtener_urls_sitemap(driver)

        if not todas_las_urls:
            LOG.error("No se encontraron URLs de libros. Verifica el sitemap manualmente.")
            return

        # ── Filtrar URLs ya procesadas ──
        urls_pendientes = [
            u for u in todas_las_urls
            if u not in estado["descargados"] and u not in estado["fallidos"]
        ]

        total = len(todas_las_urls)
        pendientes = len(urls_pendientes)
        LOG.info(f"URLs pendientes de procesar: {pendientes}/{total}")

        if not urls_pendientes:
            LOG.info("¡Todo el sitemap ya ha sido procesado! Nada que hacer.")
            imprimir_resumen(estado, total)
            return

        # ── Bucle principal de scraping ──
        for i, url_libro in enumerate(urls_pendientes, start=1):
            progreso = f"[{i}/{pendientes}]"
            LOG.info(f"\n{progreso} Procesando: {url_libro}")

            exito, mensaje = procesar_libro(driver, url_libro, DOWNLOAD_DIR)

            if exito:
                marcar_descargado(estado, url_libro)
                LOG.info(f"{progreso} ✅ {mensaje}")
            else:
                marcar_fallido(estado, url_libro, mensaje)
                LOG.warning(f"{progreso} ✖ Saltando libro → {mensaje}")

            # ── Pausa de cortesía anti-ban ──
            if i < pendientes:  # No esperar después del último
                delay = random.uniform(DELAY_MIN, DELAY_MAX)
                LOG.debug(f"  Esperando {delay:.1f}s antes del siguiente libro...")
                time.sleep(delay)

        # ── Resumen final ──
        imprimir_resumen(estado, total)

    except KeyboardInterrupt:
        LOG.info("\n⚠ Scraping interrumpido por el usuario (Ctrl+C).")
        LOG.info("El progreso ha sido guardado. Re-ejecuta el script para continuar.")

    except Exception as e:
        LOG.critical(f"Error crítico no manejado: {e}", exc_info=True)

    finally:
        if driver:
            LOG.info("Cerrando ChromeDriver...")
            driver.quit()


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
