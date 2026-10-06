with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re
birth_date_html = '''
          <div class="form-group">
            <label>Fecha de Nacimiento</label>
            <input type="date" formControlName="birth_date" class="glass-input">
            <p class="field-hint">Requerida para libros restringidos.</p>
          </div>
'''
html = re.sub(
    r"(<div class=\"form-group\">\s*<label>Correo Elect.*?</div>\s*</div>)",
    r"\1\n" + birth_date_html,
    html,
    flags=re.DOTALL
)
with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Patched HTML successfully")
