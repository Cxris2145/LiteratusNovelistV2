path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\maguito-customizer\maguito-customizer.component.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    "this.notification.showSuccess('¡La apariencia mágica de tu Maguito ha sido guardada!');",
    "this.notification.success('¡La apariencia mágica de tu Maguito ha sido guardada!', 'Taller de Tintes');"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("Updated maguito-customizer.component.ts with this.notification.success")

