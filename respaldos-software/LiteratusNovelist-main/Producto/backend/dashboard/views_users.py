from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from django.contrib.auth import get_user_model
from django.db.models import Count

User = get_user_model()

class UserListAdminView(APIView):
    """
    GET /api/dashboard/users/
    Lista todos los usuarios para la pestaña de monitoreo, ordenados por último acceso.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        # We assume users have a profile with ink_balance
        users = User.objects.select_related('profile').annotate(
            chats_count=Count('chat_sessions')
        ).order_by('-last_login', '-date_joined')
        
        data = []
        for u in users:
            try:
                profile = u.profile
            except Exception:
                profile = None
                
            data.append({
                'id': str(u.pk),
                'username': u.username,
                'email': u.email,
                'role': u.get_role_display() if hasattr(u, 'get_role_display') else getattr(u, 'role', 'Unknown'),
                'last_login': u.last_login,
                'date_joined': u.date_joined,
                'ink_balance': profile.ink_balance if profile else 0,
                'country': profile.country if profile else '',
                'chats_count': getattr(u, 'chats_count', 0),
            })
        return Response(data)
