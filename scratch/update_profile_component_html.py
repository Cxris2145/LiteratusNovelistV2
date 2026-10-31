path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\users\profile\profile.component.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """        <div class="form-group visibility-group">
          <label class="visibility-toggle" for="profile-is-public">
            <input id="profile-is-public" type="checkbox" formControlName="is_public" aria-describedby="profile-is-public-hint">
            <span class="material-symbols-rounded" aria-hidden="true">{{ profileForm.get('is_public')?.value ? 'public' : 'lock' }}</span>
            <span>Perfil público en La Taberna</span>
          </label>
          <p class="field-hint" id="profile-is-public-hint">
            {{ profileForm.get('is_public')?.value
              ? 'Cualquier lector ve tu tarjeta (libros, reseñas, amigos y "Sobre mí") y puedes salir en sus sugerencias de amigos.'
              : 'Privado: solo tus amigos ven tu tarjeta; los demás te encuentran únicamente con tu código de amigo.' }}
          </p>
        </div>"""

replacement = """        <div class="form-group visibility-group">
          <label class="visibility-toggle" for="profile-is-public">
            <input id="profile-is-public" type="checkbox" formControlName="is_public" aria-describedby="profile-is-public-hint">
            <span class="material-symbols-rounded" aria-hidden="true">{{ profileForm.get('is_public')?.value ? 'public' : 'lock' }}</span>
            <span>Perfil público en La Taberna</span>
          </label>
          <p class="field-hint" id="profile-is-public-hint">
            {{ profileForm.get('is_public')?.value
              ? 'Cualquier lector ve tu tarjeta (libros, reseñas, amigos y "Sobre mí") y puedes salir en sus sugerencias de amigos.'
              : 'Privado: solo tus amigos ven tu tarjeta; los demás te encuentran únicamente con tu código de amigo.' }}
          </p>

          <!-- Opciones granulares de visibilidad pública -->
          <div class="privacy-suboptions" *ngIf="profileForm.get('is_public')?.value">
            <span class="privacy-suboptions-title">Elementos visibles en tu perfil público:</span>
            
            <div class="privacy-toggles-grid">
              <label class="visibility-toggle sub-toggle" for="profile-show-books">
                <input id="profile-show-books" type="checkbox" formControlName="show_books">
                <span class="material-symbols-rounded" aria-hidden="true">menu_book</span>
                <span>Libros y lecturas</span>
              </label>

              <label class="visibility-toggle sub-toggle" for="profile-show-reviews">
                <input id="profile-show-reviews" type="checkbox" formControlName="show_reviews">
                <span class="material-symbols-rounded" aria-hidden="true">rate_review</span>
                <span>Reseñas literarias</span>
              </label>

              <label class="visibility-toggle sub-toggle" for="profile-show-friends">
                <input id="profile-show-friends" type="checkbox" formControlName="show_friends">
                <span class="material-symbols-rounded" aria-hidden="true">group</span>
                <span>Amigos de taberna</span>
              </label>
            </div>
          </div>
        </div>"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF in profile.component.html")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF in profile.component.html")
else:
    print("Target not found in profile.component.html")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

