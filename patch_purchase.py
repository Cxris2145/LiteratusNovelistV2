with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'r', encoding='utf-8') as f:
    cat_py = f.read()

import re
age_check = '''
        if book.min_age > 0:
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                return Response({'error': 'AGE_RESTRICTED', 'message': 'Por favor, registra tu fecha de nacimiento en tu perfil para adquirir este libro.'}, status=status.HTTP_403_FORBIDDEN)
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            if age < book.min_age:
                return Response({'error': 'AGE_RESTRICTED', 'message': f'Este libro está restringido para mayores de {book.min_age} años.'}, status=status.HTTP_403_FORBIDDEN)
'''

cat_py = re.sub(
    r"(book = self\.get_object\(\)\s*\n)",
    r"\1" + age_check + "\n",
    cat_py
)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'w', encoding='utf-8') as f:
    f.write(cat_py)
print("Patched purchase logic")
