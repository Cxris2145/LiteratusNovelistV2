"""
users/urls.py — Enrutador DRF para Sistema IAM de Usuarios 
"""
from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import (
    MyTokenObtainPairView, RegisterUserView, UserMeView, ProfileView, 
    AddInkView, SpendInkView, VerifyEmailView, PasswordResetRequestView, PasswordResetConfirmView
)

urlpatterns = [
    # ---- JWT Authentication ----
    # Token de Acceso general (equivale al Login):
    path('login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    # Token para refrescar sub-sesiones en el frontend:
    path('login/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # ---- Registro y Cuentas ----
    path('register/', RegisterUserView.as_view(), name='register'),
    path('me/', UserMeView.as_view(), name='me'),
    path('me/add_ink/', AddInkView.as_view(), name='add_ink'),
    path('me/spend_ink/', SpendInkView.as_view(), name='spend_ink'),
    path('profile/', ProfileView.as_view(), name='profile'),
    
    # ---- Correos (Verificación y Password Reset) ----
    path('verify-email/', VerifyEmailView.as_view(), name='verify_email'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
]
