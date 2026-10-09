with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'r', encoding='utf-8') as f:
    views_py = f.read()

autocomplete_view = '''
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q

class AutocompleteView(APIView):
    \"\"\"
    GET /api/v1/catalog/autocomplete/?search=...
    Devuelve hasta 3 coincidencias para libros, autores, géneros y sagas.
    \"\"\"
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        query = request.query_params.get('search', '').strip()
        if not query:
            return Response({'books': [], 'authors': [], 'genres': [], 'sagas': []})

        # Libros
        books = Book.objects.filter(status='published').filter(
            Q(title__icontains=query) | Q(synopsis__icontains=query)
        ).prefetch_related('genres', 'book_authors__author')[:3]
        
        books_data = []
        for b in books:
            author_names = ", ".join([ba.author.full_name for ba in b.book_authors.all()])
            books_data.append({
                'id': str(b.id),
                'slug': b.slug,
                'title': b.title,
                'author_name': author_names,
                'cover': b.get_cover_url() if hasattr(b, 'get_cover_url') else None,
                'type': 'book'
            })

        # Autores
        authors = Author.objects.filter(
            Q(full_name__icontains=query)
        )[:3]
        
        authors_data = []
        for a in authors:
            authors_data.append({
                'id': str(a.id),
                'slug': a.slug,
                'title': a.full_name,
                'type': 'author'
            })

        # Géneros
        genres = Genre.objects.filter(
            Q(name__icontains=query)
        )[:3]
        
        genres_data = []
        for g in genres:
            genres_data.append({
                'id': str(g.id),
                'slug': g.slug,
                'title': g.name,
                'type': 'genre'
            })

        return Response({
            'books': books_data,
            'authors': authors_data,
            'genres': genres_data,
            'sagas': []
        })
'''

if 'class AutocompleteView' not in views_py:
    views_py += '\n' + autocomplete_view

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/views.py', 'w', encoding='utf-8') as f:
    f.write(views_py)
