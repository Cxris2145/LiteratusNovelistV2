from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, Profile


LOGIN_ERROR = 'Correo o contraseña incorrectos.'
USER_NOT_FOUND_ERROR = 'No existe ninguna cuenta registrada con este usuario o correo.'
PASSWORD_INCORRECT_ERROR = 'La contraseña ingresada es incorrecta.'
INACTIVE_ERROR = 'La cuenta no está activa. Revisa tu correo para activarla.'
INVALID_RESET_LINK_ERROR = 'El enlace de recuperación no es válido o ha expirado.'


def normalize_email_value(value: str) -> str:
    return User.objects.normalize_email(value.strip()).lower()


def normalize_username_value(value: str) -> str:
    return value.strip()


def get_user_from_uid(uidb64: str):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        return User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'username'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['username'].label = 'Correo o usuario'
        self.fields['username'].required = False
        self.fields['email'] = serializers.EmailField(required=False, write_only=True)

    def validate(self, attrs):
        raw_identifier = attrs.get('email') or attrs.get('username')
        password = attrs.get('password')

        if not raw_identifier:
            raise serializers.ValidationError({
                'username': 'Ingresa tu correo o nombre de usuario.'
            })

        if not password:
            raise serializers.ValidationError({
                'password': 'Ingresa tu contraseña.'
            })

        identifier = raw_identifier.strip()
        user = self._find_user(identifier)

        if user is None:
            raise AuthenticationFailed(USER_NOT_FOUND_ERROR, code='user_not_found')

        if not user.check_password(password):
            raise AuthenticationFailed(PASSWORD_INCORRECT_ERROR, code='invalid_password')

        if not user.is_active:
            raise PermissionDenied(INACTIVE_ERROR)

        data = super().validate({
            self.username_field: user.get_username(),
            'password': password,
        })
        data['user'] = {
            'id': str(self.user.id),
            'email': self.user.email,
            'username': self.user.username,
            'is_staff': self.user.is_staff,
            'is_superuser': self.user.is_superuser,
        }
        return data

    def _find_user(self, identifier: str):
        if '@' in identifier:
            email = normalize_email_value(identifier)
            return User.objects.filter(email__iexact=email).order_by('id').first()

        username = normalize_username_value(identifier)
        user = User.objects.filter(username__iexact=username).order_by('id').first()
        if user:
            return user

        return User.objects.filter(email__iexact=username).order_by('id').first()


class ProfileSerializer(serializers.ModelSerializer):
    """
    Serializador del perfil del usuario.
    Solo expone datos no-sensibles de visualización como Avatar y Biografía.
    """
    class Meta:
        model = Profile
        fields = ['id', 'avatar_color', 'bio', 'country', 'preferred_language', 'ink_balance', 'theme']

class UserReadSerializer(serializers.ModelSerializer):
    """
    Serializador de LECTURA. 
    Se usa para proveer la información pública de un usuario logueado 
    o de otra cuenta. Excluye estrictamente campos de encriptación y hashes.
    """
    profile = ProfileSerializer(read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'profile', 'created_at']

class UserWriteSerializer(serializers.ModelSerializer):
    """
    Serializador de ESCRITURA (Creación/Registro).
    Garantiza que la contraseña nunca se exponga (write_only) y crea el 
    perfil paralelo atado en la misma transacción (Señal en DB / Create Override).
    """
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name']
        extra_kwargs = {
            'password': {'write_only': True},
            'username': {'validators': []},
            'email': {'validators': []},
        }

    def validate_username(self, value):
        username = normalize_username_value(value)
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError('Este nombre de usuario ya está en uso.')
        return username

    def validate_email(self, value):
        email = normalize_email_value(value)
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('Ya existe una cuenta con este correo.')
        return email

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate(self, attrs):
        for field in ('first_name', 'last_name'):
            if attrs.get(field):
                attrs[field] = attrs[field].strip()
        return attrs

    def create(self, validated_data):
        from django.conf import settings

        # Por defecto el registro deja la cuenta lista para login inmediato.
        # Producción puede exigir verificación con REQUIRE_EMAIL_VERIFICATION=True.
        requires_verification = getattr(settings, 'REQUIRE_EMAIL_VERIFICATION', False)
        validated_data['is_active'] = not requires_verification

        try:
            user = User.objects.create_user(**validated_data) # Hash automático de pass
        except IntegrityError:
            raise serializers.ValidationError({
                'email': 'No se pudo crear la cuenta porque los datos ya existen.'
            })

        if requires_verification:
            from .utils import send_verification_email
            try:
                send_verification_email(user)
            except Exception:
                import logging
                logging.getLogger(__name__).exception(
                    'No se pudo enviar correo de verificación.'
                )

        # Perfil se crea vía señal en users/signals.py para asegurar ink_balance = 150
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name']
        extra_kwargs = {
            'username': {'required': False, 'validators': []},
            'email': {'required': False, 'validators': []},
            'first_name': {'required': False},
            'last_name': {'required': False},
        }

    def validate_username(self, value):
        username = normalize_username_value(value)
        exists = User.objects.filter(username__iexact=username).exclude(pk=self.instance.pk).exists()
        if exists:
            raise serializers.ValidationError('Este nombre de usuario ya está en uso.')
        return username

    def validate_email(self, value):
        email = normalize_email_value(value)
        exists = User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk).exists()
        if exists:
            raise serializers.ValidationError('Ya existe una cuenta con este correo.')
        return email

    def validate(self, attrs):
        forbidden = set(self.initial_data.keys()) & {'password', 'role', 'is_staff', 'is_superuser'}
        if forbidden:
            raise serializers.ValidationError(
                'No puedes actualizar permisos ni contraseña desde este endpoint.'
            )

        for field in ('first_name', 'last_name'):
            if attrs.get(field):
                attrs[field] = attrs[field].strip()
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return normalize_email_value(value)


class PasswordResetTokenSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()

    def validate(self, attrs):
        user = get_user_from_uid(attrs['uid'])
        if (
            user is None
            or not user.is_active
            or not default_token_generator.check_token(user, attrs['token'])
        ):
            raise serializers.ValidationError({'token': INVALID_RESET_LINK_ERROR})
        attrs['user'] = user
        return attrs


class PasswordResetConfirmSerializer(PasswordResetTokenSerializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        confirm_password = attrs.get('confirm_password')

        if confirm_password and attrs['new_password'] != confirm_password:
            raise serializers.ValidationError({'confirm_password': 'Las contraseñas no coinciden.'})

        try:
            validate_password(attrs['new_password'], attrs['user'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)})

        return attrs

    def save(self, **kwargs):
        user = self.validated_data['user']
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user
