"""
library/views.py — Vistas para la Biblioteca del Usuario.
"""
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from core.pagination import StandardResultsSetPagination

from .models import (
    UserFavorite, UserInventory, ReadingProgress, UserBookmark,
    Achievement, UserAchievement, ReadingSession,
)
from .serializers import (
    UserFavoriteSerializer,
    UserInventorySerializer,
    ReadingProgressSerializer,
    UserBookmarkSerializer,
    AchievementSerializer,
    UserAchievementSerializer,
    ReadingSessionSerializer,
)


class UserFavoriteViewSet(viewsets.ModelViewSet):
    """CRUD de favoritos aislado estrictamente por usuario autenticado."""

    serializer_class = UserFavoriteSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        return (
            UserFavorite.objects
            .filter(user=self.request.user)
            .select_related('book')
            .prefetch_related(
                'book__genres',
                'book__tags',
                'book__editions',
                'book__book_authors__author',
            )
        )

    @action(detail=False, methods=['delete'], url_path=r'book/(?P<book_id>[^/.]+)')
    def remove_book(self, request, book_id=None):
        favorite = get_object_or_404(
            UserFavorite.objects,
            user=request.user,
            book_id=book_id,
        )
        favorite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['delete'], url_path='clear')
    def clear(self, request):
        now = timezone.now()
        deleted_count = self.get_queryset().update(
            is_active=False,
            deleted_at=now,
            updated_at=now,
        )
        return Response({'deleted': deleted_count}, status=status.HTTP_200_OK)

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
            'has_premium_narration': inventory_item.has_premium_narration or request.user.is_staff or request.user.is_superuser,
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

        if not inventory_item and (request.user.is_staff or request.user.is_superuser):
            from catalog.models import Book
            book = Book.objects.filter(slug=slug).first()
            if book and book.editions.exists():
                inventory_item, _ = UserInventory.objects.get_or_create(
                    user=request.user,
                    edition=book.editions.first(),
                    defaults={'has_premium_narration': True}
                )
        
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


class AchievementCatalogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Catálogo público de logros disponibles.
    Accesible sin autenticación para mostrar en páginas de marketing.
    GET /api/v1/library/achievements/catalog/
    """
    serializer_class = AchievementSerializer
    queryset = Achievement.objects.all()
    permission_classes = [permissions.AllowAny]
    pagination_class = None


class UserAchievementViewSet(viewsets.GenericViewSet,
                              viewsets.mixins.ListModelMixin,
                              viewsets.mixins.RetrieveModelMixin,
                              viewsets.mixins.UpdateModelMixin):
    """
    Logros del usuario autenticado con su progreso personal.
    GET  /api/v1/library/achievements/me/          — lista todos mis logros
    GET  /api/v1/library/achievements/me/{id}/     — detalle de un logro
    PATCH /api/v1/library/achievements/me/{id}/    — marcar como notificado

    El PATCH solo permite actualizar el campo 'notified' (el usuario ya vio el toast).
    El resto (current_progress, unlocked_at) es gestionado por el motor de logros.
    """
    serializer_class = UserAchievementSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        return (
            UserAchievement.objects
            .filter(user=self.request.user)
            .select_related('achievement')
            .order_by('achievement__sort_order', 'achievement__category')
        )

    @action(detail=False, methods=['get'], url_path='unnotified')
    def unnotified(self, request):
        """
        GET /api/v1/library/achievements/me/unnotified/
        Devuelve logros recién desbloqueados que aún no fueron notificados.
        Usado por el componente toast de celebración en el frontend.
        """
        qs = self.get_queryset().filter(
            unlocked_at__isnull=False,
            notified=False,
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class ReadingSessionViewSet(viewsets.ModelViewSet):
    """
    Registro de sesiones de lectura del usuario.
    POST  /api/v1/library/sessions/        — Abrir sesión (iniciar lectura)
    PATCH /api/v1/library/sessions/{id}/   — Cerrar sesión (ended_at)

    El usuario se inyecta automáticamente desde el token JWT.
    No se expone GET de listado (privacidad de datos de lectura).
    """
    serializer_class = ReadingSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['post', 'patch', 'head', 'options']

    def get_queryset(self):
        return ReadingSession.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class InkHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Historial de transacciones de Tinta del usuario autenticado.
    GET /api/v1/library/ink-history/
    """
    from .serializers import InkTransactionSerializer
    serializer_class = InkTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        from .models import InkTransaction
        return InkTransaction.objects.filter(user=self.request.user).order_by('-created_at')

class UserMissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Misiones activas y progreso del usuario autenticado.
    GET /api/v1/library/missions/
    """
    from .serializers import UserMissionSerializer
    serializer_class = UserMissionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        from .models import UserMission, Mission
        from django.utils import timezone
        from datetime import timedelta
        
        today = timezone.localdate()
        start_of_week = today - timedelta(days=today.weekday())
        start_of_month = today.replace(day=1)
        
        # Ensure missions exist for this week/month by querying active missions
        # We can just fetch them, and if not present, the achievement engine will create them later.
        # But for UI, we might want to auto-create them when the user views the missions page.
        active_missions = Mission.objects.filter(is_active_mission=True, is_active=True)
        for mission in active_missions:
            period_start = start_of_week if mission.reset_type == 'weekly' else start_of_month
            UserMission.objects.get_or_create(
                user=self.request.user,
                mission=mission,
                period_start=period_start
            )
            
        # Return only current period missions
        from django.db.models import Q
        return UserMission.objects.filter(
            user=self.request.user,
            mission__is_active_mission=True
        ).filter(
            Q(mission__reset_type='weekly', period_start=start_of_week) |
            Q(mission__reset_type='monthly', period_start=start_of_month)
        ).select_related('mission').order_by('completed_at', 'mission__title')


class DailyRewardViewSet(viewsets.ViewSet):
    """
    Controlador de la Recompensa Diaria de Tinta.
    - GET /api/v1/library/daily-reward/status/: Comprueba si está disponible para reclamar hoy.
    - POST /api/v1/library/daily-reward/claim/: Reclama la recompensa diaria.
    """
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['GET'], url_path='status')
    def check_status(self, request):
        from .models import InkTransaction
        from django.utils import timezone
        from django.conf import settings
        from library.achievement_engine import get_user_discount

        today = timezone.localdate()
        already_claimed = InkTransaction.objects.filter(
            user=request.user,
            concept='daily_reward',
            created_at__date=today
        ).exists()

        reward_config = getattr(settings, 'GAMIFICATION_REWARDS', {}).get('daily_reward', {'ink': 20, 'xp': 15})
        user_level = request.user.profile.level if hasattr(request.user, 'profile') else 1
        level_bonus_ink = max(0, (user_level - 1) * 5)
        total_ink = reward_config.get('ink', 20) + level_bonus_ink
        total_xp = reward_config.get('xp', 15)

        last_claim = InkTransaction.objects.filter(
            user=request.user,
            concept='daily_reward'
        ).order_by('-created_at').first()

        return Response({
            'can_claim': not already_claimed,
            'ink_reward': total_ink,
            'xp_reward': total_xp,
            'base_ink': reward_config.get('ink', 20),
            'level_bonus_ink': level_bonus_ink,
            'last_claimed_at': last_claim.created_at if last_claim else None
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['POST'], url_path='claim')
    def claim(self, request):
        from .models import InkTransaction
        from django.utils import timezone
        from django.conf import settings
        from library.achievement_engine import reward_activity

        today = timezone.localdate()
        with transaction.atomic():
            already_claimed = InkTransaction.objects.filter(
                user=request.user,
                concept='daily_reward',
                created_at__date=today
            ).exists()

            if already_claimed:
                return Response({
                    'error': 'ALREADY_CLAIMED',
                    'message': 'Ya has reclamado tu recompensa de Tinta el día de hoy. ¡Vuelve mañana!'
                }, status=status.HTTP_400_BAD_REQUEST)

            reward_config = getattr(settings, 'GAMIFICATION_REWARDS', {}).get('daily_reward', {'ink': 20, 'xp': 15})
            user_level = request.user.profile.level if hasattr(request.user, 'profile') else 1
            level_bonus_ink = max(0, (user_level - 1) * 5)
            total_ink = reward_config.get('ink', 20) + level_bonus_ink
            total_xp = reward_config.get('xp', 15)

            # Otorga la Tinta y XP de forma atómica y registra en InkTransaction
            reward_activity(
                user=request.user,
                activity_type='daily_reward',
                custom_ink=total_ink,
                custom_xp=total_xp
            )

            # Refrescar balance actual
            request.user.profile.refresh_from_db()

            return Response({
                'message': f'¡Has recibido +{total_ink} Gotas de Tinta y +{total_xp} XP!',
                'ink_reward': total_ink,
                'xp_reward': total_xp,
                'new_ink_balance': request.user.profile.ink_balance,
                'new_xp': request.user.profile.xp,
                'new_level': request.user.profile.level
            }, status=status.HTTP_200_OK)
