with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# 1. Smaller hero title on mobile
css = re.sub(
    r"font-size: clamp\(40px, 11vw, 52px\);",
    "font-size: clamp(32px, 9vw, 42px);",
    css
)

# 2. Add flex-wrap to hero-stats
css = css.replace(
    ".hero-stats {\\n  display: flex;\\n  gap: 32px;",
    ".hero-stats {\\n  display: flex;\\n  flex-wrap: wrap;\\n  gap: 24px;"
)

# 3. Fix genre-grid for very small screens
mobile_genre = '''  .genre-grid {
      grid-template-columns: 1fr;
      grid-auto-rows: 200px;
    }
'''
if 'grid-template-columns: 1fr;' not in css:
    css = re.sub(
        r"@media \(max-width: 560px\) \{",
        "@media (max-width: 560px) {\\n" + mobile_genre,
        css
    )

# 4. Fix how-stage device width
css = css.replace(
    ".device {\\n      width: 100%;",
    ".device {\\n      width: 100%;\\n      max-width: 100%;\\n      margin: 0 auto;"
)

# 5. Fix hero-lede size on mobile
mobile_lede = '''  .hero-lede {
      font-size: 17px;
    }
'''
css = re.sub(
    r"@media \(max-width: 560px\) \{",
    "@media (max-width: 560px) {\\n" + mobile_lede,
    css
)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/home/home.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
