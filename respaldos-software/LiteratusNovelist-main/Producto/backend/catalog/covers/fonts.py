"""Resolución de fuentes para el compositor de portadas Literatus.

Orden de resolución por rol tipográfico:
  1. Directorio configurado en ``settings.LITERATUS_FONT_DIR`` / env ``LITERATUS_FONT_DIR``.
  2. Fuentes con serifa de Windows (Georgia / Palatino / Times) — usadas en desarrollo local.
  3. Fuentes con serifa habituales en Linux (DejaVu / Liberation) — para el deploy.
  4. ``PIL.ImageFont.load_default(size=...)`` — fuente escalable incluida en Pillow
     (funciona en cualquier plataforma; evita empaquetar binarios propietarios).

El resultado es siempre un objeto de fuente válido a cualquier tamaño.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from PIL import ImageFont

try:  # settings es opcional (permite usar el módulo sin Django cargado)
    from django.conf import settings as _dj_settings
except Exception:  # pragma: no cover
    _dj_settings = None


# role -> (candidatos_windows, candidatos_linux)
_ROLE_CANDIDATES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "title": (
        ("georgiab.ttf", "constanb.ttf", "palab.ttf", "timesbd.ttf"),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
        ),
    ),
    "author": (
        ("pala.ttf", "georgia.ttf", "times.ttf"),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        ),
    ),
    "author_bold": (
        ("palab.ttf", "georgiab.ttf", "timesbd.ttf"),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        ),
    ),
    "brand": (
        ("timesbd.ttf", "georgiab.ttf", "constanb.ttf"),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        ),
    ),
    "label": (
        ("segoeui.ttf", "arial.ttf", "calibri.ttf"),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ),
    ),
}

_WINDOWS_FONT_DIR = Path("C:/Windows/Fonts")


def _configured_dir() -> Path | None:
    raw = None
    if _dj_settings is not None:
        raw = getattr(_dj_settings, "LITERATUS_FONT_DIR", None)
    raw = raw or os.environ.get("LITERATUS_FONT_DIR")
    if not raw:
        return None
    p = Path(raw)
    return p if p.is_dir() else None


def _first_existing(paths) -> Path | None:
    for candidate in paths:
        try:
            p = Path(candidate)
            if p.is_file():
                return p
        except (OSError, ValueError):
            continue
    return None


@lru_cache(maxsize=256)
def _resolve_path(role: str, font_set: str) -> str | None:
    """Devuelve la ruta de fuente para ``role`` o ``None`` para usar load_default."""
    win_names, linux_paths = _ROLE_CANDIDATES.get(role, _ROLE_CANDIDATES["label"])

    search_dirs: list[Path] = []
    cfg = _configured_dir()
    if cfg is not None:
        search_dirs.append(cfg)

    if font_set != "portable":
        if font_set in ("windows", "auto"):
            search_dirs.append(_WINDOWS_FONT_DIR)

    for d in search_dirs:
        hit = _first_existing(d / name for name in win_names)
        if hit is not None:
            return str(hit)

    if font_set != "portable":
        hit = _first_existing(linux_paths)
        if hit is not None:
            return str(hit)

    return None  # -> load_default(size)


@lru_cache(maxsize=1024)
def get_font(role: str, size: int, font_set: str = "auto"):
    """Fuente para un rol (``title``/``author``/``author_bold``/``brand``/``label``).

    ``font_set``: ``auto`` (config -> Windows -> Linux -> default), ``windows``,
    ``portable`` (fuerza ``load_default``, para que el piloto coincida con producción).
    """
    size = max(6, int(size))
    path = _resolve_path(role, font_set)
    if path:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def active_font_report(font_set: str = "auto") -> dict[str, str]:
    """Diagnóstico: qué archivo real se usa por rol (para el informe del comando)."""
    out: dict[str, str] = {}
    for role in _ROLE_CANDIDATES:
        out[role] = _resolve_path(role, font_set) or "PIL.load_default (Aileron)"
    return out
