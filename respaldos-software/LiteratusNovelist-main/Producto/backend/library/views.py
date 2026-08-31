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
        qs = UserInventory.objects.filter(user=self.request.user)
        if self.action == 'chapters':
            return qs.select_related('edition__book')
        return (
            qs
            .select_related('edition__book', 'progress')
            .prefetch_related(
                'edition__book__genres',
                'edition__book__tags',
                'edition__book__editions',
                'edition__book__book_authors__author',
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

        Por rendimiento, permite pedir solo el índice liviano de capítulos:
        ?include_content=false

        Y permite pedir un capítulo puntual:
        ?chapter_id=<uuid> o ?order=<numero>
        """
        inventory_item = self.get_object()
        book = inventory_item.edition.book

        chapter_id = request.query_params.get('chapter_id')
        chapter_order = request.query_params.get('order')

        if chapter_id or chapter_order:
            chapter_queryset = book.chapters.all().prefetch_related('audios')
            if chapter_id:
                chapter = get_object_or_404(chapter_queryset, pk=chapter_id)
            else:
                try:
                    chapter_order_value = int(chapter_order)
                except (TypeError, ValueError):
                    return Response({"error": "El parámetro 'order' debe ser numérico."}, status=status.HTTP_400_BAD_REQUEST)
                chapter = get_object_or_404(chapter_queryset, order=chapter_order_value)

            return Response({
                'has_premium_narration': inventory_item.has_premium_narration,
                'chapter': self._serialize_chapter(request, chapter, include_content=True)
            })

        include_content = request.query_params.get('include_content', 'true').lower() not in {'0', 'false', 'no'}
        chapters = book.chapters.all().order_by('order')
        if include_content:
            chapters = chapters.prefetch_related('audios')
        else:
            chapters = chapters.only('id', 'book_id', 'title', 'order')

        data = []
        for c in chapters:
            data.append(self._serialize_chapter(request, c, include_content=include_content))
            
        return Response({
            'has_premium_narration': inventory_item.has_premium_narration,
            'chapters': data
        })

    def _serialize_chapter(self, request, chapter, include_content=False):
        data = {
            'id': chapter.id,
            'title': chapter.title,
            'order': chapter.order,
        }

        if include_content:
            chapter_audios = []
            for audio in chapter.audios.all():
                chapter_audios.append({
                    'id': audio.id,
                    'voice_name': audio.voice_name,
                    'audio_url': request.build_absolute_uri(audio.audio_file.url) if audio.audio_file else None,
                    'alignment_data': audio.alignment_data
                })

            data.update({
                'content_html': chapter.content_html,
                'audios': chapter_audios
            })

        return data

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
