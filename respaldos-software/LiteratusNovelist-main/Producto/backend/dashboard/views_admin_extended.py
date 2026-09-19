"""
Dashboard Admin Extended Views
Proporciona endpoints de gestión administrativa avanzada para Literatus Nexus:
- Curación y aprobación de libros
- Acciones sobre libros (toggle-publish, aprobar, ocultar)
- Acciones sobre usuarios (bloquear/desbloquear, cambiar rol, ajustar tinta)
- Transacciones financieras Webpay
- Economía de Tinta y balance en circulación
- Gamificación (logros, misiones, niveles)
- Auditoría de IA (personajes y asistente)
- Registro de auditoría (LogEntry)
- Ajustes generales del sistema (StoreSettings)
- Gestión completa de Géneros / Categorías
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.db.models import Count, Sum, Q
from django.db import transaction as db_transaction
from django.utils import timezone
from django.contrib.admin.models import LogEntry
from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from catalog.models import Book, Author, Genre, Edition, Chapter
from users.models import User, Profile
from library.models import (
    UserInventory, ReadingProgress, ReadingSession, 
    Achievement, UserAchievement, InkTransaction, Mission, UserMission
)
from finance.models import Transaction
from ai_engine.models import AIAvatar, ChatSession, ChatMessage, AssistantConversation, AssistantMessage
from core.models import StoreSettings


# ─────────────────────────────────────────────────────────────────────────────
# 1. CURACIÓN Y APROBACIÓN DE LIBROS
# ─────────────────────────────────────────────────────────────────────────────

class AdminCurationView(APIView):
    """
    GET /api/dashboard/curation/
    Retorna libros que requieren revisión: borradores o despublicados.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        pending_books = (
            Book.objects.filter(Q(is_published=False) | Q(status=Book.StatusChoices.DRAFT))
            .annotate(
                anno_chapters_count=Count('chapters', distinct=True)
            )
            .prefetch_related('authors', 'genres')
            .order_by('-updated_at')
        )

        data = [
            {
                'id': str(b.pk),
                'title': b.title,
                'slug': b.slug,
                'status': b.status,
                'is_published': b.is_published,
                'difficulty_level': b.difficulty_level,
                'authors': [a.full_name for a in b.authors.all()],
                'genres': [g.name for g in b.genres.all()],
                'cover': request.build_absolute_uri(b.cover_image.url) if b.cover_image else None,
                'chapters_count': b.anno_chapters_count,
                'word_count': b.word_count,
                'created_at': b.created_at,
                'updated_at': b.updated_at,
                'synopsis': b.synopsis[:300] if b.synopsis else '',
            }
            for b in pending_books
        ]
        return Response({
            'total_pending': len(data),
            'books': data
        })


class AdminBookTogglePublishView(APIView):
    """
    POST /api/dashboard/books/<uuid:pk>/toggle-publish/
    Alterna de forma atómica el estado de publicación de un libro.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        book = get_object_or_404(Book, pk=pk)
        book.is_published = not book.is_published
        if book.is_published:
            book.status = Book.StatusChoices.PUBLISHED
        else:
            book.status = Book.StatusChoices.DRAFT
        book.save(update_fields=['is_published', 'status', 'updated_at'])

        return Response({
            'success': True,
            'id': str(book.pk),
            'title': book.title,
            'is_published': book.is_published,
            'status': book.status,
            'message': f'"{book.title}" ahora está {"Publicado" if book.is_published else "Oculto/Borrador"}.'
        })


class AdminBookApproveView(APIView):
    """
    POST /api/dashboard/books/<uuid:pk>/approve/
    Aprueba y publica formalmente un libro.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        book = get_object_or_404(Book, pk=pk)
        book.is_published = True
        book.status = Book.StatusChoices.PUBLISHED
        book.save(update_fields=['is_published', 'status', 'updated_at'])

        return Response({
            'success': True,
            'id': str(book.pk),
            'is_published': True,
            'status': 'published',
            'message': f'Libro "{book.title}" aprobado y publicado exitosamente.'
        })


# ─────────────────────────────────────────────────────────────────────────────
# 2. ACCIONES SOBRE USUARIOS
# ─────────────────────────────────────────────────────────────────────────────

class AdminUserToggleActiveView(APIView):
    """
    POST /api/dashboard/users/<uuid:pk>/toggle-active/
    Bloquea o desbloquea un usuario (is_active).
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user == request.user:
            return Response({'error': 'No puedes bloquear tu propia cuenta administrativa.'}, status=400)
        
        user.is_active = not user.is_active
        user.save(update_fields=['is_active', 'updated_at'])

        return Response({
            'success': True,
            'id': str(user.pk),
            'username': user.username,
            'is_active': user.is_active,
            'message': f'Usuario {user.username} {"desbloqueado" if user.is_active else "bloqueado"}.'
        })


class AdminUserRoleView(APIView):
    """
    POST /api/dashboard/users/<uuid:pk>/role/
    Cambia el rol del usuario: 'reader', 'author', 'admin'.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        new_role = request.data.get('role')
        if new_role not in [User.RoleChoices.READER, User.RoleChoices.AUTHOR, User.RoleChoices.ADMIN]:
            return Response({'error': f'Rol inválido. Opciones: {[c[0] for c in User.RoleChoices.choices]}'}, status=400)
        
        user.role = new_role
        if new_role == User.RoleChoices.ADMIN:
            user.is_staff = True
        user.save(update_fields=['role', 'is_staff', 'updated_at'])

        return Response({
            'success': True,
            'id': str(user.pk),
            'username': user.username,
            'role': user.role,
            'role_display': user.get_role_display(),
            'message': f'Rol de {user.username} actualizado a {user.get_role_display()}.'
        })


class AdminUserAdjustInkView(APIView):
    """
    POST /api/dashboard/users/<uuid:pk>/adjust-ink/
    Ajusta el saldo de tinta del usuario y crea un registro en InkTransaction.
    Body: { "amount": 100, "reason": "Recarga promocional" }
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        try:
            amount = int(request.data.get('amount', 0))
        except (ValueError, TypeError):
            return Response({'error': 'El monto debe ser un entero.'}, status=400)
        
        if amount == 0:
            return Response({'error': 'El monto no puede ser 0.'}, status=400)
        
        reason = request.data.get('reason', 'Ajuste manual de administrador')

        with db_transaction.atomic():
            profile, _ = Profile.objects.select_for_update().get_or_create(user=user)
            new_balance = max(0, profile.ink_balance + amount)
            actual_diff = new_balance - profile.ink_balance
            profile.ink_balance = new_balance
            profile.save(update_fields=['ink_balance', 'updated_at'])

            InkTransaction.objects.create(
                user=user,
                amount=actual_diff,
                concept=f'admin_adjustment: {reason}',
                reference_id=str(request.user.pk),
                balance_after=new_balance
            )

        return Response({
            'success': True,
            'id': str(user.pk),
            'username': user.username,
            'ink_balance': profile.ink_balance,
            'adjusted': actual_diff,
            'message': f'Saldo de tinta de {user.username} ajustado en {actual_diff:+d}. Nuevo saldo: {new_balance}.'
        })


# ─────────────────────────────────────────────────────────────────────────────
# 3. TRANSACCIONES Y PAGOS WEBPAY
# ─────────────────────────────────────────────────────────────────────────────

class AdminTransactionsView(APIView):
    """
    GET /api/dashboard/transactions/
    Historial completo de transacciones con filtros y búsqueda.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        status_filter = request.query_params.get('status')
        item_filter = request.query_params.get('item_type')
        search_query = request.query_params.get('search')

        qs = Transaction.objects.select_related('user').order_by('-created_at')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if item_filter:
            qs = qs.filter(item_type=item_filter)
        if search_query:
            qs = qs.filter(
                Q(buy_order__icontains=search_query) |
                Q(user__username__icontains=search_query) |
                Q(user__email__icontains=search_query)
            )

        # Totales para indicadores superiores
        all_txns = Transaction.objects.all()
        total_revenue = all_txns.filter(status__in=['exitosa', 'AUTHORIZED']).aggregate(total=Sum('amount'))['total'] or 0
        total_count = all_txns.count()
        successful_count = all_txns.filter(status__in=['exitosa', 'AUTHORIZED']).count()
        failed_count = all_txns.filter(status='fallida').count()

        txns_data = [
            {
                'id': str(t.pk),
                'buy_order': t.buy_order,
                'user_id': str(t.user.pk),
                'username': t.user.username,
                'user_email': t.user.email,
                'amount': float(t.amount),
                'status': t.status,
                'status_display': t.get_status_display(),
                'item_type': t.item_type,
                'item_reference': t.item_reference,
                'response_code': t.response_code,
                'created_at': t.created_at,
            }
            for t in qs[:100]
        ]

        return Response({
            'summary': {
                'total_revenue': float(total_revenue),
                'total_transactions': total_count,
                'successful': successful_count,
                'failed': failed_count,
                'conversion_rate': round((successful_count / total_count * 100), 1) if total_count > 0 else 0.0,
            },
            'transactions': txns_data
        })


# ─────────────────────────────────────────────────────────────────────────────
# 4. ECONOMÍA DE TINTA
# ─────────────────────────────────────────────────────────────────────────────

class AdminInkView(APIView):
    """
    GET /api/dashboard/ink/
    Balance global de tinta y últimos movimientos.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        total_circulation = Profile.objects.aggregate(total=Sum('ink_balance'))['total'] or 0
        total_transactions = InkTransaction.objects.count()
        
        # Consumos vs Recargas
        spent_total = abs(InkTransaction.objects.filter(amount__lt=0).aggregate(total=Sum('amount'))['total'] or 0)
        earned_total = InkTransaction.objects.filter(amount__gt=0).aggregate(total=Sum('amount'))['total'] or 0

        recent_txns = (
            InkTransaction.objects.select_related('user')
            .order_by('-created_at')[:50]
        )

        data = [
            {
                'id': str(tx.pk),
                'username': tx.user.username,
                'user_email': tx.user.email,
                'amount': tx.amount,
                'concept': tx.concept,
                'reference_id': tx.reference_id,
                'balance_after': tx.balance_after,
                'created_at': tx.created_at,
            }
            for tx in recent_txns
        ]

        return Response({
            'circulation': {
                'total_in_circulation': total_circulation,
                'total_transactions': total_transactions,
                'spent_total': spent_total,
                'earned_total': earned_total,
            },
            'transactions': data
        })


# ─────────────────────────────────────────────────────────────────────────────
# 5. GAMIFICACIÓN (LOGROS, MISIONES, NIVELES)
# ─────────────────────────────────────────────────────────────────────────────

class AdminGamificationView(APIView):
    """
    GET /api/dashboard/gamification/
    Gestión y analíticas de logros, misiones y niveles de usuario.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        achievements = Achievement.objects.annotate(
            unlocked_count=Count('user_achievements', filter=Q(user_achievements__unlocked_at__isnull=False))
        ).order_by('sort_order', 'title')

        achievements_data = [
            {
                'id': str(a.pk),
                'code': a.code,
                'title': a.title,
                'description': a.description,
                'category': a.category,
                'icon': a.icon,
                'threshold': a.threshold,
                'ink_reward': a.ink_reward,
                'unlocked_count': a.unlocked_count,
            }
            for a in achievements
        ]

        missions = Mission.objects.annotate(
            completed_count=Count('user_missions', filter=Q(user_missions__is_completed=True))
        ).order_by('title')

        missions_data = [
            {
                'id': str(m.pk),
                'code': m.code,
                'title': m.title,
                'description': m.description,
                'activity_type': m.activity_type,
                'target_count': m.target_count,
                'ink_reward': m.ink_reward,
                'xp_reward': m.xp_reward,
                'reset_type': m.reset_type,
                'is_active': m.is_active_mission,
                'completed_count': m.completed_count,
            }
            for m in missions
        ]

        # Niveles de usuarios
        levels_distribution = (
            Profile.objects.values('level')
            .annotate(user_count=Count('id'))
            .order_by('level')
        )

        return Response({
            'total_achievements': len(achievements_data),
            'total_missions': len(missions_data),
            'achievements': achievements_data,
            'missions': missions_data,
            'levels_distribution': list(levels_distribution),
        })


# ─────────────────────────────────────────────────────────────────────────────
# 6. AUDITORÍA DE IA Y PERSONAJES
# ─────────────────────────────────────────────────────────────────────────────

class AdminAIChatsView(APIView):
    """
    GET /api/dashboard/ai-chats/
    Métricas de sesiones con personajes de IA y asistente global.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        # Sesiones con personajes
        character_sessions = (
            ChatSession.objects.select_related('user', 'avatar')
            .annotate(msg_count=Count('messages'))
            .order_by('-updated_at')[:30]
        )

        # Conversaciones de asistente global
        assistant_convs = (
            AssistantConversation.objects.select_related('user')
            .annotate(msg_count=Count('messages'))
            .order_by('-updated_at')[:30]
        )

        # Top personajes más activos
        top_characters = (
            AIAvatar.objects.order_by('-chat_count')[:10]
        )

        return Response({
            'summary': {
                'total_avatars': AIAvatar.objects.count(),
                'total_character_sessions': ChatSession.objects.count(),
                'total_character_messages': ChatMessage.objects.count(),
                'total_assistant_conversations': AssistantConversation.objects.count(),
                'total_assistant_messages': AssistantMessage.objects.count(),
            },
            'top_characters': [
                {
                    'id': str(av.pk),
                    'name': av.name,
                    'model_name': av.model_name,
                    'chat_count': av.chat_count,
                    'is_author': av.is_author,
                    'image': request.build_absolute_uri(av.avatar_image.url) if av.avatar_image else None,
                }
                for av in top_characters
            ],
            'character_sessions': [
                {
                    'id': str(s.pk),
                    'username': s.user.username if s.user else 'Anónimo',
                    'avatar_name': s.avatar.name if s.avatar else 'Desconocido',
                    'messages_count': s.msg_count,
                    'updated_at': s.updated_at,
                }
                for s in character_sessions
            ],
            'assistant_conversations': [
                {
                    'id': str(c.pk),
                    'username': c.user.username if c.user else 'Anónimo',
                    'messages_count': c.msg_count,
                    'created_at': c.created_at,
                    'updated_at': c.updated_at,
                }
                for c in assistant_convs
            ],
        })


# ─────────────────────────────────────────────────────────────────────────────
# 7. LOGS DE AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

class AdminAuditLogsView(APIView):
    """
    GET /api/dashboard/audit-logs/
    Historial de acciones registradas por administradores (LogEntry).
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        logs = LogEntry.objects.select_related('user', 'content_type').order_by('-action_time')[:50]

        data = [
            {
                'id': log.pk,
                'action_time': log.action_time,
                'username': log.user.username if log.user else 'Sistema',
                'content_type': log.content_type.model if log.content_type else '',
                'object_repr': log.object_repr,
                'action_flag': log.get_action_flag_display() if hasattr(log, 'get_action_flag_display') else log.action_flag,
                'change_message': log.change_message,
            }
            for log in logs
        ]
        return Response({
            'total_logs': LogEntry.objects.count(),
            'logs': data
        })


# ─────────────────────────────────────────────────────────────────────────────
# 8. AJUSTES GENERALES DEL SISTEMA
# ─────────────────────────────────────────────────────────────────────────────

class AdminSettingsView(APIView):
    """
    GET /api/dashboard/settings/  → Leer configuración
    POST /api/dashboard/settings/ → Actualizar configuración
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        settings_obj = StoreSettings.load()
        return Response({
            'theme': settings_obj.theme,
            'themes_available': [
                {'code': 'default', 'name': 'Classic Dark (Obsidian Teal)'},
                {'code': 'neon', 'name': 'Cyber Neon'},
                {'code': 'light-gallery', 'name': 'Light Gallery (Pergamino)'},
            ],
            'platform_info': {
                'app_name': 'Literatus Novelist',
                'version': '2.0 Nexus',
                'environment': 'Producción / Desarrollo Local',
                'python_version': '3.12+',
                'framework': 'Django REST Framework & Angular 17',
            }
        })

    def post(self, request):
        settings_obj = StoreSettings.load()
        theme = request.data.get('theme')
        if theme:
            settings_obj.theme = theme
            settings_obj.save()
        return Response({
            'success': True,
            'theme': settings_obj.theme,
            'message': 'Configuración guardada correctamente.'
        })


# ─────────────────────────────────────────────────────────────────────────────
# 9. GESTIÓN COMPLETA DE CATEGORÍAS / GÉNEROS
# ─────────────────────────────────────────────────────────────────────────────

class AdminGenreView(APIView):
    """
    GET  /api/dashboard/genres/       → Lista todos los géneros con conteo de libros
    POST /api/dashboard/genres/       → Crear nuevo género
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        genres = Genre.objects.annotate(books_count=Count('books')).order_by('name')
        data = [
            {
                'id': str(g.pk),
                'name': g.name,
                'slug': g.slug,
                'description': g.description,
                'cover_image': request.build_absolute_uri(g.cover_image.url) if g.cover_image else None,
                'books_count': g.books_count,
            }
            for g in genres
        ]
        return Response(data)

    def post(self, request):
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'error': 'El nombre de la categoría es requerido.'}, status=400)
        
        description = request.data.get('description', '')
        slug = slugify(name)
        
        genre, created = Genre.objects.get_or_create(
            slug=slug,
            defaults={'name': name, 'description': description}
        )

        cover_file = request.FILES.get('cover_image')
        if cover_file:
            genre.cover_image.save(f'genre_{genre.pk}.jpg', cover_file, save=True)

        return Response({
            'id': str(genre.pk),
            'name': genre.name,
            'slug': genre.slug,
            'created': created,
            'message': f'Categoría "{genre.name}" creada exitosamente.'
        }, status=201 if created else 200)


class AdminGenreDetailView(APIView):
    """
    PUT /api/dashboard/genres/<uuid:pk>/    → Editar género
    DELETE /api/dashboard/genres/<uuid:pk>/ → Eliminar género
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def put(self, request, pk):
        genre = get_object_or_404(Genre, pk=pk)
        name = request.data.get('name')
        if name:
            genre.name = name.strip()
        if 'description' in request.data:
            genre.description = request.data['description']
        
        cover_file = request.FILES.get('cover_image')
        if cover_file:
            genre.cover_image.save(f'genre_{genre.pk}.jpg', cover_file, save=True)

        genre.save()
        return Response({
            'success': True,
            'id': str(genre.pk),
            'name': genre.name,
            'slug': genre.slug,
            'message': f'Categoría "{genre.name}" actualizada.'
        })

    def delete(self, request, pk):
        genre = get_object_or_404(Genre, pk=pk)
        name = genre.name
        genre.delete()
        return Response({
            'success': True,
            'message': f'Categoría "{name}" eliminada.'
        })
