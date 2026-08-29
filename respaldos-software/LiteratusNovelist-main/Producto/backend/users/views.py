"""
users/views.py — Vistas para Autenticación (SimpleJWT), Registro y Gestión de Perfil.
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import Profile
from .serializers import (
    MyTokenObtainPairSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetTokenSerializer,
    ProfileSerializer,
    UserReadSerializer,
    UserUpdateSerializer,
    UserWriteSerializer,
)


logger = logging.getLogger(__name__)

class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer


User = get_user_model()

class RegisterUserView(generics.CreateAPIView):
    """
    Endpoint POST para registrar usuarios públicos.
    No requiere autenticación. Responde con 201 Created.
    Devuelve los datos vía UserWriteSerializer (limpiando password).
    """
    queryset = User.objects.all()
    serializer_class = UserWriteSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        requires_verification = getattr(settings, 'REQUIRE_EMAIL_VERIFICATION', False)
        message = (
            'Cuenta creada con éxito. Revisa tu correo para activarla.'
            if requires_verification
            else 'Cuenta creada con éxito. Ya puedes iniciar sesión.'
        )

        return Response(
            {
                'message': message,
                'requires_email_verification': requires_verification,
                'user': {
                    'id': str(user.id),
                    'username': user.username,
                    'email': user.email,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class UserMeView(generics.RetrieveUpdateAPIView):
    """
    Endpoint GET/PATCH central en /users/me/
    Retorna y actualiza el usuario autenticado actualmente y su Perfil asociado.
    Usa UserReadSerializer (que encubre campos de escritura) para responder.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return UserUpdateSerializer
        return UserReadSerializer

    def get_object(self):
        # Exigimos devolver el objeto del request
        return self.request.user


class ProfileView(generics.RetrieveUpdateAPIView):
    """
    Endpoint GET/PATCH en /users/profile/
    Retorna los datos del perfil (incluyendo ink_balance) del usuario actual.
    """
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # Asegura que siempre devolvemos el perfil del usuario logueado
        profile, _ = Profile.objects.get_or_create(user=self.request.user)
        return profile

class AddInkView(APIView):
    """
    Endpoint POST /users/me/add_ink/
    Agrega tinta al usuario tras ver un anuncio.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        # En una app real aquí se validaría un token de recompensa del anuncio
        amount = int(request.data.get('amount', 10))
        
        profile = request.user.profile
        profile.ink_balance += amount
        profile.save()
        
        return Response({
            'message': f'¡Has ganado {amount} de Tinta!',
            'ink_balance': profile.ink_balance
        }, status=status.HTTP_200_OK)


class SpendInkView(APIView):
    """
    Endpoint POST /users/me/spend_ink/
    Descuenta tinta del perfil del usuario para desbloqueos permanentes.

    Body:
        amount  (int)  — Cantidad de Tinta a gastar.
        concept (str)  — Motivo del gasto (ej. 'premium_voice'). Opcional.

    Responde 400 si el balance es insuficiente.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        amount = int(request.data.get('amount', 0))
        concept = request.data.get('concept', 'generic')

        if amount <= 0:
            return Response(
                {'error': 'El monto debe ser mayor a 0.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        profile = request.user.profile

        if profile.ink_balance < amount:
            return Response(
                {
                    'error': 'INK_INSUFFICIENT',
                    'message': f'Tinta insuficiente. Tienes {profile.ink_balance} y necesitas {amount}.'
                },
                status=status.HTTP_402_PAYMENT_REQUIRED
            )

        profile.ink_balance -= amount
        profile.save()

        return Response({
            'message': f'✓ {amount} de Tinta descontada por: {concept}.',
            'ink_balance': profile.ink_balance
        }, status=status.HTTP_200_OK)


from .utils import send_password_reset_email, email_verification_token

class VerifyEmailView(APIView):
    """
    Endpoint POST /api/v1/users/verify-email/
    Recibe uid y token para activar la cuenta del usuario.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        
        if not uidb64 or not token:
            return Response({'error': 'Faltan parámetros.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None
            
        if user is not None:
            if user.is_active:
                return Response({'message': 'Tu cuenta ya estaba verificada. Puedes iniciar sesión.'}, status=status.HTTP_200_OK)
            if email_verification_token.check_token(user, token):
                user.is_active = True
                user.save()
                return Response({'message': 'Cuenta verificada exitosamente.'}, status=status.HTTP_200_OK)
                
        return Response({'error': 'El enlace de verificación es inválido o ha expirado.'}, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetRequestView(APIView):
    """
    Endpoint POST /api/v1/users/password-reset/
    Recibe un email y, si existe el usuario, le envía un enlace de recuperación.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        user = User.objects.filter(email__iexact=email, is_active=True).first()

        if user is not None:
            try:
                send_password_reset_email(user)
            except Exception:
                logger.exception('No se pudo enviar correo de recuperación.')

        return Response(
            {'message': 'Si existe una cuenta asociada a ese correo, recibirás instrucciones.'},
            status=status.HTTP_200_OK,
        )


class PasswordResetValidateView(APIView):
    """
    Endpoint POST /api/v1/users/password-reset-validate/
    Valida uid/token antes de mostrar el formulario de nueva contraseña.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({'message': 'El enlace de recuperación es válido.'}, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """
    Endpoint POST /api/v1/users/password-reset-confirm/
    Recibe uid, token y nueva contraseña (new_password) para resetearla.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            {'message': 'Contraseña actualizada con éxito. Ya puedes iniciar sesión.'},
            status=status.HTTP_200_OK,
        )
