with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'r', encoding='utf-8') as f:
    cat_py = f.read()

import re

retrieve_override = '''
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.min_age > 0:
            if not request.user.is_authenticated:
                return Response(
                    {'error': 'AGE_RESTRICTED', 'message': 'Debes iniciar sesión y registrar tu edad para ver este libro.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                return Response(
                    {'error': 'AGE_RESTRICTED', 'message': 'Por favor, registra tu fecha de nacimiento en tu perfil para ver este libro.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            
            if age < instance.min_age:
                return Response(
                    {'error': 'AGE_RESTRICTED', 'message': f'Este libro está restringido para mayores de {instance.min_age} años.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        return super().retrieve(request, *args, **kwargs)
'''

if 'def retrieve(self, request, *args, **kwargs):' not in cat_py:
    # insert inside BookViewSet
    cat_py = re.sub(
        r"(class BookViewSet\(viewsets\.ReadOnlyModelViewSet\):.*?def list\(self, request, \*args, \*\*kwargs\):)",
        retrieve_override + r"\n    \1",
        cat_py,
        flags=re.DOTALL
    )
    with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'w', encoding='utf-8') as f:
        f.write(cat_py)
    print("Patched catalog/views.py")
