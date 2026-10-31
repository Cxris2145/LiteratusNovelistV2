path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\profile-card\profile-card.component.css'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """.pc-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
}"""

replacement = """.pc-stats {
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
}"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF in profile-card.component.css")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF in profile-card.component.css")
else:
    print("Target not found in profile-card.component.css")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

