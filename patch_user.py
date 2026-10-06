with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/models.py', 'r', encoding='utf-8') as f:
    models_py = f.read()

import re

# Add birth_date to Profile
if 'birth_date = ' not in models_py:
    models_py = re.sub(
        r"(preferred_language = models.CharField\(.*?\))",
        r"\1\n    birth_date = models.DateField(null=True, blank=True, help_text='Fecha de nacimiento del usuario. Requerido para acceder a contenido restringido por edad.')",
        models_py
    )
    with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/models.py', 'w', encoding='utf-8') as f:
        f.write(models_py)
    print("Added birth_date to Profile")
else:
    print("birth_date already exists in Profile")
