"""Versiones de día, tarde y noche de la pintura del salón (tavern-room-empty.jpg).

Solo cambian el cielo de los ventanales y la luz del interior; los muebles y todo el dibujo quedan
en el mismo lugar, así las máscaras de muebles de app-tavern-crowd siguen calzando.
Uso: python -I make_times.py <pintura.jpg> <carpeta-salida> [--debug]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
debug = '--debug' in sys.argv
out.mkdir(parents=True, exist_ok=True)

base = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32) / 255.0
H, W, _ = base.shape
yy, xx = np.mgrid[0:H, 0:W]
X = xx / W * 100.0  # % de la pintura
Y = yy / H * 100.0


def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1)
    mn = a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rm = nz & (mx == r)
    gm = nz & (mx == g) & ~rm
    bm = nz & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h = h * 60.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hexc(code):
    code = code.lstrip('#')
    return np.array([int(code[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def blur(a, radius):
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


# Ventanales: rectángulo con arco arriba (x0, x1, arranque del arco, tope del arco), en %.
WINDOWS = [
    (45.9, 52.5, 34.0, 28.6),   # arco del fondo
    (55.3, 59.1, 25.0, 20.0),   # ventana angosta del fondo
    (69.0, 79.8, 26.0, 15.6),   # ventanal grande izquierdo
    (84.8, 96.4, 23.0, 11.4),   # ventanal grande derecho
]
WINDOW_BOTTOM = {0: 48.3, 1: 48.3, 2: 51.6, 3: 51.6}

shape = np.zeros((H, W), bool)
t_in = np.zeros((H, W), np.float32)  # 0 arriba de la ventana, 1 abajo
for i, (x0, x1, spring, top) in enumerate(WINDOWS):
    bottom = WINDOW_BOTTOM[i]
    cx, rx, ry = (x0 + x1) / 2, (x1 - x0) / 2, spring - top
    rect = (X >= x0) & (X <= x1) & (Y >= spring) & (Y <= bottom)
    arch = (((X - cx) / rx) ** 2 + ((Y - spring) / max(ry, 1e-3)) ** 2 <= 1) & (Y < spring)
    win = rect | arch
    shape |= win
    t_in = np.where(win, (Y - top) / (bottom - top), t_in)

h, s, v = rgb_to_hsv(base)
# Vidrio: azul, violeta o rosado (o blanco muy claro: estrellas, luna, nubes). Las varillas de plomo
# son oscuras y los marcos de madera, cafés: quedan fuera.
cool = (((h >= 185) | ((h <= 12) & (v > 0.45))) & (s > 0.12))
pale = (s < 0.2) & (v > 0.42)
glass = shape & (v > 0.2) & (cool | pale)
mask = blur(glass.astype(np.float32)[..., None].repeat(3, -1), 0.8)[..., 0]
mask = np.clip(mask * 1.15, 0, 1)

# Detalle propio del cielo pintado (nubes, cerros, estrellas) para no dejar parches planos.
lum = (base * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1)
lum_soft = blur(lum[..., None].repeat(3, -1), 9)[..., 0]
detail = np.clip(lum / np.maximum(lum_soft, 0.04), 0.4, 2.2)

# Cerros (abajo de los ventanales grandes) y árboles (ventanas del fondo): la parte oscura de abajo.
# Los cerros empiezan donde termina el resplandor rosado del horizonte (y ≈ 45 % en los ventanales grandes).
lowness = np.clip((Y - 44.6) / 1.4, 0, 1) * (X > 68)
hills = np.clip((0.76 - v) / 0.12, 0, 1) * lowness
trees = np.clip((0.42 - v) / 0.14, 0, 1) * (X < 60) * (t_in > 0.25)
land = np.clip(np.maximum(hills, trees), 0, 1)
# Estrellas: puntitos claros bien adentro del vidrio (no los brillos del borde de las varillas).
core = blur(glass.astype(np.float32)[..., None].repeat(3, -1), 2.5)[..., 0] > 0.97
stars = np.clip((v - 0.8) / 0.12, 0, 1) * (s < 0.25) * np.clip((lum - lum_soft - 0.12) / 0.1, 0, 1) * core * (Y < 41)

if debug:
    dbg = base.copy()
    dbg[glass] = dbg[glass] * 0.3 + np.array([0, 1, 0]) * 0.7
    dbg[land > 0.5] = np.array([1, 0, 0])
    Image.fromarray((np.clip(dbg, 0, 1) * 255).astype(np.uint8)).save(out / 'debug-mask.png')


def sky_gradient(top, mid, horizon, t):
    t = np.clip(t, 0, 1)[..., None]
    a = np.where(t < 0.55, top + (mid - top) * (t / 0.55), mid + (horizon - mid) * ((t - 0.55) / 0.45))
    return a


def paint_sky(top, mid, horizon, land_dark, land_light, detail_amt, keep_stars):
    # De día y de tarde las estrellas pintadas no se ven: su detalle se aplana.
    # De noche solo brillan las estrellas: el resto del detalle claro (el resplandor del horizonte
    # pintado) se recorta para que no queden manchas blancas sobre los cerros.
    d = np.where(stars > 0.2, detail, np.minimum(detail, 1.2)) if keep_stars else np.where(stars > 0.2, 1.0, detail)
    sky = sky_gradient(hexc(top), hexc(mid), hexc(horizon), t_in / 0.86)
    sky = sky * (d[..., None] ** detail_amt)
    land_col = hexc(land_dark) + (hexc(land_light) - hexc(land_dark)) * np.clip((v - 0.3) / 0.45, 0, 1)[..., None]
    land_col = land_col * (d[..., None] ** 0.5)
    col = sky * (1 - land[..., None]) + land_col * land[..., None]
    if keep_stars:
        col = col + stars[..., None] * 0.8
    return np.clip(col, 0, 1)


def grade_interior(img, exposure, warmth, sat, shadows_lift, cool_light=0.0, blue_shade=1.0):
    """Luz del interior: exposición, tinte cálido/frío y saturación; las llamas casi no cambian.
    `blue_shade` < 1 le quita el azul nocturno a las sombras del techo y las vigas (de día no va)."""
    lum_i = (img * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1, keepdims=True)
    hh, ss, vv = rgb_to_hsv(img)
    bluish = ((hh > 190) & (hh < 290)).astype(np.float32)[..., None]
    pix_sat = sat * (1 - bluish * (1 - blue_shade))
    out = lum_i + (img - lum_i) * pix_sat
    out = out * exposure
    out = out + shadows_lift * (1 - out) * (1 - np.clip(lum_i / 0.5, 0, 1))
    out = out * warmth
    if cool_light:
        # Luz de día que entra desde los ventanales de la derecha.
        side = np.clip((X - 40) / 55, 0, 1)[..., None] * cool_light
        out = out + side * (hexc('#dbe8f2') - out) * 0.25
    # Las llamas (muy claras) se quedan como estaban.
    flame = np.clip((lum_i - 0.78) / 0.15, 0, 1)
    return np.clip(out * (1 - flame) + img * flame, 0, 1)


def save(name, img):
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out / name, quality=86, optimize=True, progressive=True)


m = mask[..., None]

# Día: cielo celeste, cerros verdes azulados con bruma, sala más clara y menos anaranjada.
day_sky = paint_sky('#3f8fdc', '#7db8ec', '#d4ecf7', '#4f7f7a', '#9cc1b8', 0.35, False)
day_room = grade_interior(base, exposure=1.2, warmth=np.array([1.0, 0.99, 0.97], np.float32), sat=0.9, shadows_lift=0.05, cool_light=0.55, blue_shade=0.35)
save('tavern-room-day.jpg', day_room * (1 - m) + day_sky * m)

# Tarde: sol bajo, cielo de celeste a durazno y oro sobre los cerros; sala dorada.
dusk_sky = paint_sky('#5f97cc', '#efae86', '#ffd98c', '#6e4a62', '#b38485', 0.35, False)
dusk_room = grade_interior(base, exposure=1.1, warmth=np.array([1.05, 0.98, 0.88], np.float32), sat=1.0, shadows_lift=0.04, blue_shade=0.6)
save('tavern-room-dusk.jpg', dusk_room * (1 - m) + dusk_sky * m)

# Noche: cielo azul profundo con estrellas, sin el rosado del atardecer; sala en penumbra con velas.
night_sky = paint_sky('#0b1236', '#1a2559', '#343b7e', '#070b20', '#141a3e', 0.6, True)
night_room = grade_interior(base, exposure=0.86, warmth=np.array([1.0, 0.98, 1.0], np.float32), sat=1.02, shadows_lift=0.0)
save('tavern-room-night.jpg', night_room * (1 - m) + night_sky * m)
print('ok', W, H)
