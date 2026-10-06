with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/auth/register/register.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re
birth_date_html = '''
      <div class="form-group">
        <label>Fecha de Nacimiento</label>
        <input type="date" 
               class="glass-input" 
               [ngClass]="{'is-invalid': f['birth_date'].touched && f['birth_date'].invalid}"
               formControlName="birth_date">
        <div class="validation-error" *ngIf="f['birth_date'].touched && f['birth_date'].invalid">La fecha de nacimiento es requerida.</div>
      </div>
'''
html = re.sub(
    r"(formControlName=\"email\".*?</div>\s*</div>)",
    r"\1\n" + birth_date_html,
    html,
    flags=re.DOTALL
)
with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/auth/register/register.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Patched HTML successfully")
