"""
library/views.py — Vistas para la Biblioteca del Usuario.
"""
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from core.pagination import StandardResultsSetPagination

from .models import UserInventory, ReadingProgress, UserBookmark
from .serializers import UserInventorySerializer, ReadingProgressSerializer, UserBookmarkSerializer

class UserInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Gestiona la biblioteca personal del usuario autenticado.
    - select_related: edition → book (FK directa, 1 JOIN).
    - prefetch_related: cover_image, genres, tags y progreso de lectura (evita N+1).
    - Paginado a 12 por página con búsqueda por título de libro.
    """
    serializer_class = UserInventorySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['edition__book__title', 'edition__book__synopsis']
    ordering_fields = ['acquired_at', 'edition__book__title']
    ordering = ['-acquired_at']

    def get_queryset(self):
        """Restringe el queryset estrictamente al dueño de la petición."""
        return (
            UserInventory.objects
            .filter(user=self.request.user)
            .select_related('edition__book', 'progress')
            .prefetch_related(
                'edition__book__genres',
                'edition__book__tags',
                'edition__avatars',
            )
        )

    @action(detail=True, methods=['GET'], url_path='download')
    def download_edition(self, request, pk=None):
        """
        SERVICIO DE DESCARGAS SEGURAS.
        Prioriza el PDF del libro (pdf_file) sobre el archivo de la edición (EPUB).
        """
        inventory_item = self.get_object()
        edition = inventory_item.edition
        book = edition.book

        target_file = book.pdf_file if book.pdf_file else edition.file

        if not target_file:
            return Response({"error": "No hay un archivo digital adjunto para descargar."}, status=status.HTTP_404_NOT_FOUND)

        # Incrementar contador de descargas de forma atómica
        from django.db.models import F
        from catalog.models import Book
        Book.objects.filter(pk=book.pk).update(download_count=F('download_count') + 1)

        try:
            response = FileResponse(target_file.open('rb'))
            filename = target_file.name.split("/")[-1]
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except FileNotFoundError:
            raise Http404("El archivo físico no fue localizado en el servidor privado.")

    @action(detail=True, methods=['GET'], url_path='chapters')
    def chapters(self, request, pk=None):
        """
        SERVICIO DE LECTURA HTML BROWSER-NATIVE.
        Devuelve el contenido en HTML de los capítulos y sus audios asociados.
        """
        inventory_item = self.get_object()
        book = inventory_item.edition.book
        chapters = book.chapters.all().order_by('order').prefetch_related('audios')
        
        data = []
        for c in chapters:
            chapter_audios = []
            for audio in c.audios.all():
                chapter_audios.append({
                    'id': audio.id,
                    'voice_name': audio.voice_name,
                    'audio_url': request.build_absolute_uri(audio.audio_file.url) if audio.audio_file else None,
                    'alignment_data': audio.alignment_data
                })
                
            data.append({
                'id': c.id, 
                'title': c.title, 
                'order': c.order, 
                'content_html': c.content_html,
                'audios': chapter_audios
            })
            
        return Response({
            'has_premium_narration': inventory_item.has_premium_narration,
            'chapters': data
        })

    @action(detail=False, methods=['GET'], url_path='check')
    def check_ownership(self, request):
        """
        Verifica si el usuario posee un libro por su slug.
        GET /api/v1/library/inventory/check/?slug=el-principito
        """
        slug = request.query_params.get('slug')
        if not slug:
            return Response({"error": "Falta parámetro 'slug'"}, status=400)
        
        inventory_item = UserInventory.objects.filter(
            user=request.user, 
            edition__book__slug=slug
        ).first()
        
        if inventory_item:
            return Response({
                "owned": True,
                "inventory_id": inventory_item.id
            })
        return Response({"owned": False})



class ReadingProgressViewSet(viewsets.ModelViewSet):
    """
    Control de Progreso.
    Se limitan los métodos a Recuperar (GET) y Actualización Parcial Asíncrona (PATCH).
    """
    serializer_class = ReadingProgressSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'patch'] # Bloqueamos POST, DELETE, PUT

    def get_queryset(self):
        # Filtramos por el usuario dueño a través del inventario
        return ReadingProgress.objects.filter(inventory__user=self.request.user)

class UserBookmarkViewSet(viewsets.ModelViewSet):
    """
    Control de Notas (Bookmarks).
    Permite CRUD completo. Restringido a que pertenezca al usuario.
    """
    serializer_class = UserBookmarkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserBookmark.objects.filter(inventory__user=self.request.user)

    def perform_create(self, serializer):
        """
        Almacenar la nota. Validación extra: debemos confirmar que el `inventory` 
        que entra en la validación del Serializer de verdad es propiedad del `request.user`.
        """
        inventory = serializer.validated_data['inventory']
        if inventory.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("No puedes añadir marcadores a una librería que no te pertenece.")
        serializer.save()


# ── SERVICIO DE DICCIONARIO EN ESPAÑOL (Wiktionary + Wikipedia) ───────
import urllib.request
import urllib.parse
import json
import re
from rest_framework.views import APIView

# Cache en memoria para respuestas rápidas
_DICT_CACHE = {}

class DictionaryView(APIView):
    """
    Endpoint para consulta de definiciones en español.
    Utiliza Wikcionario (Wiktionary) con fallback a Wikipedia Summary API.
    GET /api/v1/library/dictionary/?word=palabra
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        raw_word = request.query_params.get('word', '').strip()
        # Limpiar puntuación inicial y final (¿, ¡, ., ,, -, ", etc.)
        clean_word = re.sub(r'^[^\wáéíóúÁÉÍÓÚñÑüÜ]+|[^\wáéíóúÁÉÍÓÚñÑüÜ]+$', '', raw_word)
        if not clean_word:
            return Response({"error": "Indica una palabra válida."}, status=status.HTTP_400_BAD_REQUEST)

        cache_key = clean_word.lower()
        if cache_key in _DICT_CACHE:
            return Response(_DICT_CACHE[cache_key])

        result = self._lookup_word(clean_word)
        if result:
            _DICT_CACHE[cache_key] = result
            return Response(result)

        return Response(
            {"error": f"No se encontró una definición exacta para «{clean_word}»."},
            status=status.HTTP_404_NOT_FOUND
        )

    def _lookup_word(self, word):
        w_lower = word.lower()
        headers = {
            'User-Agent': 'LiteratusNovelist/2.0 (educational app; contact@literatus.app)'
        }

        # 1. Consultar Wikcionario oficial (Action API con multi-títulos y redirecciones)
        try:
            titles_param = f"{urllib.parse.quote(w_lower)}|{urllib.parse.quote(word)}"
            url_wikt = (
                f"https://es.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1"
                f"&redirects=1&titles={titles_param}&format=json"
            )
            req = urllib.request.Request(url_wikt, headers=headers)
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                pages = data.get('query', {}).get('pages', {})
                for pid, page in pages.items():
                    if pid != '-1' and page.get('extract'):
                        pos, defs = self._clean_extract(page.get('extract', ''))
                        if defs:
                            return {
                                "word": page.get('title', word).capitalize(),
                                "phonetic": "",
                                "meanings": [
                                    {
                                        "partOfSpeech": pos,
                                        "definitions": [{"definition": d} for d in defs]
                                    }
                                ],
                                "source": "Wikcionario"
                            }
        except Exception as e:
            pass

        # 2. Fallback: Wikipedia Summary API (conceptos, personas, lugares, títulos)
        try:
            url_wiki = f"https://es.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(word)}"
            req_wiki = urllib.request.Request(url_wiki, headers=headers)
            with urllib.request.urlopen(req_wiki, timeout=4) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                extract = data.get('extract', '').strip()
                if extract:
                    desc = data.get('description', 'Enciclopedia')
                    return {
                        "word": data.get('title', word),
                        "phonetic": desc,
                        "meanings": [
                            {
                                "partOfSpeech": desc if desc else "Enciclopedia",
                                "definitions": [{"definition": extract}]
                            }
                        ],
                        "source": "Wikipedia"
                    }
        except Exception:
            pass

        return None

    def _clean_extract(self, extract):
        lines = [l.strip() for l in extract.split('\n') if l.strip()]
        definitions = []
        part_of_speech = 'Definición'

        pos_keywords = [
            'sustantivo', 'verbo', 'adjetivo', 'adverbio', 'forma verbal',
            'forma adjetiva', 'forma sustantiva', 'pronombre', 'interjección',
            'locución', 'artículo', 'preposición', 'conjunción'
        ]

        for i, line in enumerate(lines):
            lower_line = line.lower()
            if any(kw in lower_line for kw in pos_keywords) and ('=' in line or line.startswith('forma')):
                clean_pos = re.sub(r'[=]', '', line).strip()
                if clean_pos:
                    part_of_speech = clean_pos.capitalize()

            # Detectar líneas como "1 Vivienda" o "1\nEdificación..."
            num_match = re.match(r'^(\d+)\s*(.*)$', line)
            if num_match:
                rest = num_match.group(2).strip()
                if rest and len(rest) > 10 and not rest.startswith(('Sinónimo', 'Antónimo', 'Ejemplo', 'Relacionado', 'Uso:')):
                    definitions.append(rest)
                elif i + 1 < len(lines):
                    next_l = lines[i + 1]
                    if not next_l.startswith('=') and len(next_l) > 10 and not next_l.startswith(('Sinónimo', 'Antónimo', 'Ejemplo')):
                        definitions.append(next_l)

        if not definitions:
            for line in lines:
                if not line.startswith('=') and len(line) > 15 and not line.startswith(('Sinónimo', 'Antónimo', 'Ejemplo', 'Uso:')):
                    definitions.append(line)
                    if len(definitions) >= 3:
                        break

        return part_of_speech, definitions[:3]

