"""
Dashboard Stats Views
Endpoints de analíticas para el panel administrativo.
Solo accesibles para usuarios is_staff o is_superuser.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from django.db.models import Sum, Count
from django.utils import timezone
from datetime import timedelta


class DashboardStatsView(APIView):
    """
    GET /api/dashboard/stats/
    Retorna métricas generales de la plataforma.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from finance.models import Transaction
        from catalog.models import Book
        from users.models import User
        from library.models import UserInventory

        now = timezone.now()
        last_30_days = now - timedelta(days=30)
        last_7_days = now - timedelta(days=7)

        # --- Ventas ---
        completed_txns = Transaction.objects.filter(status='AUTHORIZED')
        total_revenue = completed_txns.aggregate(total=Sum('amount'))['total'] or 0
        revenue_30d = completed_txns.filter(created_at__gte=last_30_days).aggregate(
            total=Sum('amount')
        )['total'] or 0
        revenue_7d = completed_txns.filter(created_at__gte=last_7_days).aggregate(
            total=Sum('amount')
        )['total'] or 0

        # --- Usuarios ---
        total_users = User.objects.filter(is_active=True).count()
        new_users_30d = User.objects.filter(date_joined__gte=last_30_days).count()

        # --- Contenido ---
        total_books = Book.objects.filter(is_published=True).count()
        total_purchases = UserInventory.objects.count()

        # --- Libros más populares ---
        top_books = (
            UserInventory.objects
            .values('edition__book__title', 'edition__book__slug')
            .annotate(purchases=Count('id'))
            .order_by('-purchases')[:5]
        )

        # --- Ventas por día (últimos 7 días) ---
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

        return Response({
            'revenue': {
                'total': float(total_revenue),
                'last_30_days': float(revenue_30d),
                'last_7_days': float(revenue_7d),
            },
            'users': {
                'total': total_users,
                'new_last_30_days': new_users_30d,
            },
            'content': {
                'total_books': total_books,
                'total_purchases': total_purchases,
            },
            'top_books': list(top_books),
            'sales_chart': sales_chart,
        })


class BookViewsStatsView(APIView):
    """
    GET /api/dashboard/stats/books/
    Estadísticas por libro: vistas y compras.
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
