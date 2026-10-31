path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\profile-card\profile-card.component.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """  <dl class="pc-stats">
    <div>
      <dt>{{ card.stats.books === 1 ? 'libro' : 'libros' }}</dt>
      <dd>{{ card.stats.books }}</dd>
    </div>
    <div>
      <dt>{{ card.stats.reviews === 1 ? 'reseña' : 'reseñas' }}</dt>
      <dd>{{ card.stats.reviews }}</dd>
    </div>
    <div>
      <dt>{{ card.stats.friends === 1 ? 'amigo' : 'amigos' }}</dt>
      <dd>{{ card.stats.friends }}</dd>
    </div>
  </dl>"""

replacement = """  <dl class="pc-stats" *ngIf="mine || card.show_books !== false || card.show_reviews !== false || card.show_friends !== false">
    <div *ngIf="mine || card.show_books !== false">
      <dt>{{ card.stats.books === 1 ? 'libro' : 'libros' }}</dt>
      <dd>{{ card.stats.books }}</dd>
    </div>
    <div *ngIf="mine || card.show_reviews !== false">
      <dt>{{ card.stats.reviews === 1 ? 'reseña' : 'reseñas' }}</dt>
      <dd>{{ card.stats.reviews }}</dd>
    </div>
    <div *ngIf="mine || card.show_friends !== false">
      <dt>{{ card.stats.friends === 1 ? 'amigo' : 'amigos' }}</dt>
      <dd>{{ card.stats.friends }}</dd>
    </div>
  </dl>"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF in profile-card.component.html")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF in profile-card.component.html")
else:
    print("Target not found in profile-card.component.html")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

