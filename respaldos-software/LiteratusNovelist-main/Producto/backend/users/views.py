"""
users/views.py — Vistas para Autenticación (SimpleJWT), Registro y Gestión de Perfil.
"""
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import Profile
from django.db import transaction
from .serializers import MyTokenObtainPairSerializer, UserWriteSerializer, UserReadSerializer, ProfileSerializer

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


class UserMeView(generics.RetrieveUpdateAPIView):
    """
    Endpoint GET/PATCH central en /users/me/
    Retorna y actualiza el usuario autenticado actualmente y su Perfil asociado.
    Usa UserReadSerializer (que encubre campos de escritura) para responder.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return UserWriteSerializer
        return UserReadSerializer

    def get_object(self):
        # Exigimos devolver el objeto del request
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', True)
        instance = self.get_object()
        serializer = UserWriteSerializer(instance, data=request.data, partial=partial, context={'request': request})
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        read_serializer = UserReadSerializer(instance, context={'request': request})
        return Response(read_serializer.data, status=status.HTTP_200_OK)


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
        from finance.subscriptions import cosmetics
        cosmetics(self.request.user)
        profile.refresh_from_db()
        return profile

    def perform_update(self, serializer):
        with transaction.atomic():
            serializer.instance = Profile.objects.select_for_update().get(user=self.request.user)
            serializer.save()

class AddInkView(APIView):
    """
    Endpoint POST /users/me/add_ink/
    Agrega tinta al usuario tras ver un anuncio.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        return Response({'message': 'Obtén recompensas en Logros y La Senda.'}, status=status.HTTP_410_GONE)


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

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        try:
            amount = int(request.data.get('amount', 0))
        except (ValueError, TypeError):
            return Response({'error': 'El monto debe ser un número entero.'}, status=400)
        concept = request.data.get('concept', 'generic')

        if amount <= 0:
            return Response(
                {'error': 'El monto debe ser mayor a 0.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        profile = Profile.objects.select_for_update().get(user=request.user)

        if profile.ink_balance < amount:
            return Response(
                {
                    'error': 'INK_INSUFFICIENT',
                    'message': f'Tinta insuficiente. Tienes {profile.ink_balance} y necesitas {amount}.'
                },
                status=status.HTTP_402_PAYMENT_REQUIRED
            )

        profile.ink_balance -= amount
        profile.save(update_fields=['ink_balance'])
        from library.models import InkTransaction
        InkTransaction.objects.create(user=request.user, amount=-amount, concept='legacy_spend',
            reference_id=str(concept)[:100], balance_after=profile.ink_balance)

        return Response({
            'message': f'✓ {amount} de Tinta descontada por: {concept}.',
            'ink_balance': profile.ink_balance
        }, status=status.HTTP_200_OK)


from django.utils.http import urlsafe_base64_decode
from django.utils.encoding import force_str
from django.contrib.auth.tokens import default_token_generator
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
        email = request.data.get('email')
        if not email:
            return Response({'error': 'Debes proveer un correo electrónico.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            user = User.objects.get(email=email)
            send_password_reset_email(user)
        except User.DoesNotExist:
            # Por seguridad, no revelamos si el correo existe o no, 
            # simplemente decimos que se envió (evita enumeración de usuarios).
            pass
        except Exception as e:
            print(f"Error enviando correo de reset de password: {e}")
            
        return Response({'message': 'Si tu correo está registrado, recibirás un enlace de recuperación pronto.'}, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """
    Endpoint POST /api/v1/users/password-reset-confirm/
    Recibe uid, token y nueva contraseña (new_password) para resetearla.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')
        
        if not all([uidb64, token, new_password]):
            return Response({'error': 'Faltan parámetros requeridos.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None
            
        if user is not None and default_token_generator.check_token(user, token):
            from django.contrib.auth.password_validation import validate_password
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                validate_password(new_password, user=user)
            except DjangoValidationError as e:
                return Response({'error': 'Contraseña débil.', 'details': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

            user.set_password(new_password)
            user.save()
            return Response({'message': 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'El enlace de recuperación es inválido o ha expirado.'}, status=status.HTTP_400_BAD_REQUEST)
