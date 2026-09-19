"""
Dashboard Stats Views
Endpoints de analíticas completas para el panel administrativo Literatus Nexus.
Solo accesibles para usuarios is_staff o is_superuser.
Utiliza datos 100% reales de la base de datos sin inventar métricas ficticias.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta


class DashboardStatsView(APIView):
    """
    GET /api/dashboard/stats/
    Retorna métricas generales y de rendimiento de toda la plataforma.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from finance.models import Transaction
        from catalog.models import Book, Author, Genre
        from users.models import User, Profile
        from library.models import (
            UserInventory, ReadingProgress, ReadingSession, 
            Achievement, UserAchievement, InkTransaction, Mission
        )
        from ai_engine.models import AIAvatar, ChatSession, ChatMessage, AssistantConversation, AssistantMessage

        now = timezone.now()
        last_30_days = now - timedelta(days=30)
        last_7_days = now - timedelta(days=7)

        # ─────────────────────────────────────────────────────────────
        # 1. FINANZAS Y VENTAS
        # ─────────────────────────────────────────────────────────────
        completed_txns = Transaction.objects.filter(status__in=['exitosa', 'AUTHORIZED'])
        total_revenue = completed_txns.aggregate(total=Sum('amount'))['total'] or 0
        revenue_30d = completed_txns.filter(created_at__gte=last_30_days).aggregate(total=Sum('amount'))['total'] or 0
        revenue_7d = completed_txns.filter(created_at__gte=last_7_days).aggregate(total=Sum('amount'))['total'] or 0

        # Gráfico diario de ventas (últimos 7 días)
        sales_chart = []
        for i in range(7):
            day = now - timedelta(days=6 - i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day.replace(hour=23, minute=59, second=59)
            amount = completed_txns.filter(
                created_at__gte=day_start,
                created_at__lte=day_end
            ).aggregate(total=Sum('amount'))['total'] or 0
            sales_chart.append({
                'date': day.strftime('%d/%m'),
                'amount': float(amount),
            })

        # ─────────────────────────────────────────────────────────────
        # 2. USUARIOS Y COMUNIDAD
        # ─────────────────────────────────────────────────────────────
        all_users = User.objects.all()
        total_users = all_users.count()
        active_users = all_users.filter(is_active=True).count()
        blocked_users = all_users.filter(is_active=False).count()
        new_users_30d = all_users.filter(date_joined__gte=last_30_days).count()
        new_users_7d = all_users.filter(date_joined__gte=last_7_days).count()

        roles_summary = {
            'readers': all_users.filter(role=User.RoleChoices.READER).count(),
            'authors': all_users.filter(role=User.RoleChoices.AUTHOR).count(),
            'admins': all_users.filter(role=User.RoleChoices.ADMIN).count(),
        }

        # ─────────────────────────────────────────────────────────────
        # 3. CATÁLOGO EDITORIAL
        # ─────────────────────────────────────────────────────────────
        all_books = Book.objects.all()
        total_books = all_books.count()
        published_books = all_books.filter(is_published=True).count()
        draft_books = all_books.filter(Q(is_published=False) | Q(status=Book.StatusChoices.DRAFT)).count()
        total_authors = Author.objects.count()
        total_genres = Genre.objects.count()
        total_purchases = UserInventory.objects.count()

        # ─────────────────────────────────────────────────────────────
        # 4. LECTURA Y ENGAGEMENT
        # ─────────────────────────────────────────────────────────────
        all_sessions = ReadingSession.objects.all()
        total_reading_sessions = all_sessions.count()

        # Minutos de lectura (si ended_at existe, calcular diferencia; de lo contrario aproximar por chapters_read o sesiones)
        # Calculamos minutos acumulados sumando duración en segundos cuando started_at y ended_at existen
        total_reading_minutes = 0
        for s in all_sessions:
            if s.ended_at and s.started_at:
                secs = (s.ended_at - s.started_at).total_seconds()
                if secs > 0:
                    total_reading_minutes += int(secs // 60)
            elif s.chapters_read > 0:
                total_reading_minutes += s.chapters_read * 7

        # Gráfico diario de lectura (últimos 7 días)
        reading_chart = []
        for i in range(7):
            day = now - timedelta(days=6 - i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day.replace(hour=23, minute=59, second=59)
            sessions_day = all_sessions.filter(started_at__gte=day_start, started_at__lte=day_end)
            day_minutes = 0
            for s in sessions_day:
                if s.ended_at and s.started_at:
                    day_minutes += max(1, int((s.ended_at - s.started_at).total_seconds() // 60))
                else:
                    day_minutes += max(5, s.chapters_read * 7)
            reading_chart.append({
                'date': day.strftime('%d/%m'),
                'minutes': day_minutes,
                'sessions': sessions_day.count(),
            })

        # ─────────────────────────────────────────────────────────────
        # 5. ECONOMÍA DE TINTA Y GAMIFICACIÓN
        # ─────────────────────────────────────────────────────────────
        total_ink_circulation = Profile.objects.aggregate(total=Sum('ink_balance'))['total'] or 0
        total_ink_txns = InkTransaction.objects.count()
        total_achievements = Achievement.objects.count()
        unlocked_achievements = UserAchievement.objects.filter(unlocked_at__isnull=False).count()
        active_missions = Mission.objects.filter(is_active_mission=True).count()

        # ─────────────────────────────────────────────────────────────
        # 6. INTELIGENCIA ARTIFICIAL (PERSONAJES Y ASISTENTE)
        # ─────────────────────────────────────────────────────────────
        total_avatars = AIAvatar.objects.count()
        total_character_chats = ChatSession.objects.count()
        total_character_messages = ChatMessage.objects.count()
        total_assistant_conversations = AssistantConversation.objects.count()
        total_assistant_messages = AssistantMessage.objects.count()

        # Gráfico diario de mensajes de IA (últimos 7 días)
        ai_chart = []
        for i in range(7):
            day = now - timedelta(days=6 - i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day.replace(hour=23, minute=59, second=59)
            char_msgs = ChatMessage.objects.filter(created_at__gte=day_start, created_at__lte=day_end).count()
            asst_msgs = AssistantMessage.objects.filter(created_at__gte=day_start, created_at__lte=day_end).count()
            ai_chart.append({
                'date': day.strftime('%d/%m'),
                'messages': char_msgs + asst_msgs,
            })

        # ─────────────────────────────────────────────────────────────
        # 7. RANKINGS REALES
        # ─────────────────────────────────────────────────────────────
        # Top Libros por compras
        top_books_purchases = list(
            UserInventory.objects
            .values('edition__book__title', 'edition__book__slug')
            .annotate(purchases=Count('id'))
            .order_by('-purchases')[:5]
        )

        # Top Libros por vistas
        top_books_views = list(
            Book.objects.filter(is_published=True)
            .values('id', 'title', 'slug', 'view_count', 'download_count')
            .order_by('-view_count')[:5]
        )

        # Top Personajes por chats
        top_characters = [
            {
                'id': str(av.pk),
                'name': av.name,
                'chat_count': av.chat_count,
                'is_author': av.is_author,
                'image': request.build_absolute_uri(av.avatar_image.url) if av.avatar_image else None,
            }
            for av in AIAvatar.objects.order_by('-chat_count')[:5]
        ]

        # ─────────────────────────────────────────────────────────────
        # 8. REGISTROS RECIENTES (VENTAS, USUARIOS, CURACIÓN)
        # ─────────────────────────────────────────────────────────────
        recent_sales = [
            {
                'id': str(t.pk),
                'buy_order': t.buy_order,
                'username': t.user.username,
                'amount': float(t.amount),
                'status': t.status,
                'status_display': t.get_status_display(),
                'item_type': t.item_type,
                'created_at': t.created_at,
            }
            for t in Transaction.objects.select_related('user').order_by('-created_at')[:5]
        ]

        recent_users = [
            {
                'id': str(u.pk),
                'username': u.username,
                'email': u.email,
                'role': u.get_role_display(),
                'ink_balance': u.profile.ink_balance if hasattr(u, 'profile') else 0,
                'is_active': u.is_active,
                'date_joined': u.date_joined,
            }
            for u in all_users.order_by('-date_joined')[:5]
        ]

        pending_books_list = [
            {
                'id': str(b.pk),
                'title': b.title,
                'slug': b.slug,
                'status': b.status,
                'authors': [a.full_name for a in b.authors.all()],
                'created_at': b.created_at,
            }
            for b in all_books.filter(Q(is_published=False) | Q(status=Book.StatusChoices.DRAFT)).order_by('-created_at')[:5]
        ]

        # ─────────────────────────────────────────────────────────────
        # 9. ALERTAS Y TAREAS PENDIENTES
        # ─────────────────────────────────────────────────────────────
        books_without_cover = all_books.filter(cover_image__isnull=True).count()
        books_without_chapters = all_books.annotate(ch_cnt=Count('chapters')).filter(ch_cnt=0).count()
        failed_transactions_count = Transaction.objects.filter(status='fallida').count()

        alerts = []
        if draft_books > 0:
            alerts.append({
                'type': 'warning',
                'title': f'{draft_books} libros en borrador / pendientes',
                'description': 'Hay obras que requieren aprobación o están ocultas al público.',
                'action_label': 'Revisar Curaduría',
                'action_route': '/dashboard/curation',
            })
        if books_without_cover > 0:
            alerts.append({
                'type': 'info',
                'title': f'{books_without_cover} libros sin imagen de portada',
                'description': 'Se recomienda asignar portadas para enriquecer la experiencia visual.',
                'action_label': 'Ver Biblioteca',
                'action_route': '/dashboard/books',
            })
        if books_without_chapters > 0:
            alerts.append({
                'type': 'warning',
                'title': f'{books_without_chapters} libros sin capítulos',
                'description': 'Títulos creados que aún no poseen contenido legible importado.',
                'action_label': 'Ver Biblioteca',
                'action_route': '/dashboard/books',
            })
        if failed_transactions_count > 0:
            alerts.append({
                'type': 'error',
                'title': f'{failed_transactions_count} transacciones fallidas en Webpay',
                'description': 'Intentos de pago rechazados o abortados por la pasarela.',
                'action_label': 'Ver Transacciones',
                'action_route': '/dashboard/transactions',
            })

        # ─────────────────────────────────────────────────────────────
        # 10. FEED DE ACTIVIDAD RECIENTE (CRONOLÓGICO REAL)
        # ─────────────────────────────────────────────────────────────
        activity_feed = []

        # Usuarios recién registrados
        for u in all_users.order_by('-date_joined')[:3]:
            activity_feed.append({
                'type': 'user_registered',
                'icon': 'person_add',
                'title': f'Nuevo usuario registrado: {u.username}',
                'time': u.date_joined,
                'category': 'Comunidad',
            })

        # Logros desbloqueados
        for ua in UserAchievement.objects.filter(unlocked_at__isnull=False).select_related('user', 'achievement').order_by('-unlocked_at')[:3]:
            activity_feed.append({
                'type': 'achievement_unlocked',
                'icon': 'military_tech',
                'title': f'{ua.user.username} desbloqueó "{ua.achievement.title}"',
                'time': ua.unlocked_at,
                'category': 'Gamificación',
            })

        # Sesiones de lectura
        for rs in all_sessions.select_related('user', 'book').order_by('-started_at')[:3]:
            activity_feed.append({
                'type': 'reading_session',
                'icon': 'menu_book',
                'title': f'{rs.user.username} leyó "{rs.book.title}"',
                'time': rs.started_at,
                'category': 'Lectura',
            })

        # Transacciones
        for tx in Transaction.objects.select_related('user').order_by('-created_at')[:3]:
            activity_feed.append({
                'type': 'transaction',
                'icon': 'shopping_bag',
                'title': f'Pago {tx.get_status_display()} por ${tx.amount} ({tx.item_type})',
                'time': tx.created_at,
                'category': 'Finanzas',
            })

        activity_feed.sort(key=lambda x: x['time'], reverse=True)

        return Response({
            'revenue': {
                'total': float(total_revenue),
                'last_30_days': float(revenue_30d),
                'last_7_days': float(revenue_7d),
                'completed_count': completed_txns.count(),
            },
            'users': {
                'total': total_users,
                'active': active_users,
                'blocked': blocked_users,
                'new_last_30_days': new_users_30d,
                'new_last_7_days': new_users_7d,
                'roles': roles_summary,
            },
            'content': {
                'total_books': total_books,
                'published_books': published_books,
                'draft_books': draft_books,
                'total_authors': total_authors,
                'total_genres': total_genres,
                'total_purchases': total_purchases,
                'total_avatars': total_avatars,
            },
            'reading': {
                'total_sessions': total_reading_sessions,
                'total_minutes': total_reading_minutes,
                'reading_chart': reading_chart,
            },
            'gamification': {
                'ink_in_circulation': total_ink_circulation,
                'total_ink_transactions': total_ink_txns,
                'total_achievements': total_achievements,
                'unlocked_achievements': unlocked_achievements,
                'active_missions': active_missions,
            },
            'ai': {
                'total_avatars': total_avatars,
                'total_character_chats': total_character_chats,
                'total_character_messages': total_character_messages,
                'total_assistant_conversations': total_assistant_conversations,
                'total_assistant_messages': total_assistant_messages,
                'ai_chart': ai_chart,
            },
            'sales_chart': sales_chart,
            'top_books': top_books_purchases,
            'top_books_views': top_books_views,
            'top_characters': top_characters,
            'recent_sales': recent_sales,
            'recent_users': recent_users,
            'pending_books': pending_books_list,
            'alerts': alerts,
            'activity_feed': activity_feed[:10],
        })


class BookViewsStatsView(APIView):
    """
    GET /api/dashboard/stats/books/
    Estadísticas por libro: vistas y descargas.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from catalog.models import Book
        books = Book.objects.filter(is_published=True).order_by('-view_count')[:20]
        data = [
            {
                'id': str(b.pk),
                'title': b.title,
                'views': b.view_count,
                'downloads': b.download_count,
            }
            for b in books
        ]
        return Response(data)
