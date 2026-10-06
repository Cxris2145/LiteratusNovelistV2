with open('respaldos-software/LiteratusNovelist-main/Producto/backend/library/views.py', 'r', encoding='utf-8') as f:
    lib_py = f.read()

import re

retrieve_override = '''
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        book = instance.edition.book
        if book.min_age > 0:
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                return Response(
                    {'error': 'AGE_RESTRICTED', 'message': 'Por favor, registra tu fecha de nacimiento en tu perfil para leer este libro.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            
            if age < book.min_age:
                return Response(
                    {'error': 'AGE_RESTRICTED', 'message': f'Este libro está restringido para mayores de {book.min_age} años.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        return super().retrieve(request, *args, **kwargs)
'''

if 'def retrieve(self, request, *args, **kwargs):' not in lib_py:
    # insert inside UserInventoryViewSet
    lib_py = re.sub(
        r"(class UserInventoryViewSet\(viewsets\.ReadOnlyModelViewSet\):.*?def get_queryset\(self\):.*?return \([^)]+\))",
        r"\1" + retrieve_override,
        lib_py,
        flags=re.DOTALL
    )
    with open('respaldos-software/LiteratusNovelist-main/Producto/backend/library/views.py', 'w', encoding='utf-8') as f:
        f.write(lib_py)
    print("Patched library/views.py")
