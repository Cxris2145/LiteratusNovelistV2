path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\profile-card\profile-card.component.css'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """.pc-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}"""

replacement = """.pc-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 8px;
}"""

text = text.replace(target, replacement)
text = text.replace(target.replace('\n', '\r\n'), replacement.replace('\n', '\r\n'))

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("profile-card.component.css updated!")

