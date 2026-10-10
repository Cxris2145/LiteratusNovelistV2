from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.utils import get_md5_hash_password
from django.utils.crypto import constant_time_compare
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import User, Profile


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetVerifySerializer(PasswordResetRequestSerializer):
    code = serializers.RegexField(r'^[0-9]{6}$', min_length=6, max_length=6,
                                 error_messages={'invalid': 'Ingresa el código de seis dígitos.'})


class PasswordResetConfirmSerializer(PasswordResetRequestSerializer):
    reset_token = serializers.CharField(max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    confirm_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)

class PasswordAwareTokenRefreshSerializer(TokenRefreshSerializer):
    """SimpleJWT comprueba el hash al autenticar, pero también debe hacerlo al refrescar."""

    def validate(self, attrs):
        token = self.token_class(attrs['refresh'])
        user = User.objects.filter(pk=token.get(jwt_settings.USER_ID_CLAIM)).first()
        if (not user or not user.is_active or not constant_time_compare(
                token.get(jwt_settings.REVOKE_TOKEN_CLAIM, ''), get_md5_hash_password(user.password))):
            raise AuthenticationFailed('Tu contraseña ha cambiado. Inicia sesión de nuevo.', code='password_changed')
        return super().validate(attrs)


def level_name_for(level):
    """Nombre del rango lector (settings.READER_LEVELS) para un nivel."""
    from django.conf import settings
    levels = getattr(settings, 'READER_LEVELS', [])
    for lvl in sorted(levels, key=lambda x: x['level'], reverse=True):
        if level >= lvl['level']:
            return lvl['name']
    return "Lector Novato"


def find_user_by_login(identifier):
    """Usuario por correo (sin distinguir mayúsculas) si trae '@', o por nombre exacto."""
    identifier = (identifier or '').strip()
    if not identifier:
        return None
    if '@' in identifier:
        user = User.objects.filter(email__iexact=identifier).first()
        if user is not None:
            return user
    return User.objects.filter(username=identifier).first()


def check_birth_date(value):
    """La fecha de nacimiento se fija una sola vez: no puede ser futura ni absurda."""
    from django.utils import timezone
    today = timezone.localdate()
    if value > today:
        raise serializers.ValidationError('La fecha de nacimiento no puede ser futura.')
    if value.year < today.year - 120:
        raise serializers.ValidationError('Revisa la fecha de nacimiento: el año no es válido.')
    return value


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # Se puede entrar con el nombre de usuario o con el correo.
        user = find_user_by_login(attrs.get(self.username_field))
        if user is not None:
            attrs[self.username_field] = user.username

        try:
            data = super().validate(attrs)
        except AuthenticationFailed:
            # Django rechaza igual una contraseña errónea que una cuenta sin verificar;
            # solo con la contraseña correcta revelamos que falta confirmar el correo.
            if user is not None and not user.is_active and user.check_password(attrs.get('password', '')):
                raise AuthenticationFailed({
                    'code': 'account_not_verified',
                    'detail': 'Tu cuenta aún no está verificada. Revisa tu correo y abre el enlace de activación.',
                })
            raise
        profile = getattr(self.user, 'profile', None)
        has_onboarding = profile.has_completed_onboarding if profile else False
        data['user'] = {
            'id': str(self.user.id),
            'email': self.user.email,
            'username': self.user.username,
            'role': self.user.role,
            'is_staff': self.user.is_staff,
            'is_superuser': self.user.is_superuser,
            'has_completed_onboarding': has_onboarding,
        }
        return data


class OnboardingSerializer(serializers.Serializer):
    """
    Serializador para validar el flujo de onboarding inicial de rol y gustos literarios.
    """
    role = serializers.ChoiceField(
        choices=['reader', 'author'],
        required=True,
        error_messages={
            'invalid_choice': 'Debes seleccionar un rol válido: Lector ("reader") o Autor ("author").'
        }
    )
    favorite_genres = serializers.ListField(
        child=serializers.CharField(),
        min_length=3,
        required=True,
        error_messages={
            'min_length': 'Debes seleccionar al menos 3 géneros literarios preferidos.',
            'required': 'Debes seleccionar tus géneros literarios preferidos.'
        }
    )
    followed_authors = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list
    )


class ProfileSerializer(serializers.ModelSerializer):
    """
    Serializador del perfil del usuario.
    Expone datos de visualización, gamificación y preferencias literarias del onboarding.
    """
    username = serializers.CharField(source='user.username', required=False, max_length=150)
    level_name = serializers.SerializerMethodField()
    xp_to_next_level = serializers.SerializerMethodField()
    discount_percent = serializers.SerializerMethodField()
    level_perks = serializers.SerializerMethodField()
    all_levels = serializers.SerializerMethodField()
    seconds_to_next_heart = serializers.SerializerMethodField()
    current_hearts = serializers.SerializerMethodField()
    subscription_cosmetics = serializers.SerializerMethodField()
    favorite_genres = serializers.SerializerMethodField()
    followed_authors = serializers.SerializerMethodField()
    
    class Meta:
        model = Profile
        fields = [
            'id', 'username', 'avatar', 'avatar_color', 'bio', 'country', 'preferred_language', 
            'ink_balance', 'theme', 'xp', 'level', 'level_name', 
            'xp_to_next_level', 'streak_current', 'streak_max', 'streak_shields',
            'streak_last_date', 'hearts', 'current_hearts', 'seconds_to_next_heart',
            'equipped_frame', 'equipped_title', 'discount_percent', 
            'level_perks', 'all_levels', 'subscription_cosmetics',
            'has_completed_onboarding', 'favorite_genres', 'followed_authors',
            'friend_code', 'tagline', 'outfit', 'birth_date'
        ]
        # outfit solo cambia al equipar en El Bazar; friend_code es inmutable.
        read_only_fields = ['ink_balance', 'xp', 'level', 'streak_current', 'streak_max', 'streak_shields',
            'streak_last_date', 'hearts', 'equipped_frame', 'equipped_title', 'has_completed_onboarding',
            'friend_code', 'outfit']

    def validate_username(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('El nombre de usuario no puede estar vacío.')
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError('El nombre de usuario debe tener al menos 3 caracteres.')
        if '@' in value:
            raise serializers.ValidationError('El nombre de usuario no puede contener "@".')
        users = User.objects.all()
        if self.instance and hasattr(self.instance, 'user'):
            users = users.exclude(pk=self.instance.user.pk)
        if users.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya está en uso.')
        return value

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', None)
        username = None
        if isinstance(user_data, dict):
            username = user_data.get('username')
        elif 'username' in validated_data:
            username = validated_data.pop('username')

        if username and instance.user.username != username:
            instance.user.username = username
            instance.user.save(update_fields=['username'])

        return super().update(instance, validated_data)

    def validate_birth_date(self, value):
        # Las cuentas anteriores al filtro de edad la registran aquí una vez; después queda fija
        # (si hubo un error, la corrige un administrador desde el panel de Django).
        current = self.instance.birth_date if self.instance else None
        if current is not None:
            if value != current:
                raise serializers.ValidationError('Tu fecha de nacimiento ya está registrada y no se puede cambiar.')
            return value
        return check_birth_date(value) if value is not None else value

    def validate_tagline(self, value):
        return ' '.join(value.split())

    def validate_bio(self, value):
        # Los amigos ven la biografía en La Taberna: un límite generoso, pero un límite.
        if len(value) > 1000:
            raise serializers.ValidationError('La biografía admite hasta 1000 caracteres.')
        return value

    def get_favorite_genres(self, obj):
        return [{'id': str(g.id), 'name': g.name, 'slug': g.slug} for g in obj.favorite_genres.all()]

    def get_followed_authors(self, obj):
        return [{'id': str(a.id), 'full_name': a.full_name, 'slug': a.slug} for a in obj.followed_authors.all()]

    def get_subscription_cosmetics(self, obj):
        from finance.subscriptions import cosmetics
        return cosmetics(obj.user)

    def get_current_hearts(self, obj):
        from django.utils import timezone
        if obj.hearts >= 5:
            return 5
        elapsed = (timezone.now() - obj.hearts_last_updated).total_seconds()
        regen = int(elapsed // 1800) # 30 min por vida
        return min(5, obj.hearts + regen)

    def get_seconds_to_next_heart(self, obj):
        from django.utils import timezone
        current = self.get_current_hearts(obj)
        if current >= 5:
            return 0
        elapsed = (timezone.now() - obj.hearts_last_updated).total_seconds()
        remainder = 1800 - (elapsed % 1800)
        return int(max(0, remainder))

    def get_level_name(self, obj):
        return level_name_for(obj.level)

    def get_xp_to_next_level(self, obj):
        from django.conf import settings
        levels = getattr(settings, 'READER_LEVELS', [])
        for lvl in sorted(levels, key=lambda x: x['level']):
            if lvl['level'] == obj.level + 1:
                return lvl['xp_required']
        return obj.xp  # Nivel máximo alcanzado

    def get_discount_percent(self, obj):
        from django.conf import settings
        levels = getattr(settings, 'READER_LEVELS', [])
        for lvl in sorted(levels, key=lambda x: x['level'], reverse=True):
            if obj.level >= lvl['level']:
                return lvl.get('discount_percent', 0)
        return 0

    def get_level_perks(self, obj):
        from django.conf import settings
        levels = getattr(settings, 'READER_LEVELS', [])
        for lvl in sorted(levels, key=lambda x: x['level'], reverse=True):
            if obj.level >= lvl['level']:
                return lvl.get('perks', [])
        return []

    def get_all_levels(self, obj):
        from django.conf import settings
        return getattr(settings, 'READER_LEVELS', [])

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
    Serializador de ESCRITURA (Creación/Registro y Edición segura de usuario).
    - Valida complejidad de contraseñas contra AUTH_PASSWORD_VALIDATORS.
    - Asegura hashing automático mediante set_password tanto en create() como en update().
    - Previene escalamiento de privilegios garantizando que 'role' no sea modificable por el usuario.
    """
    profile = ProfileSerializer(read_only=True)
    birth_date = serializers.DateField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'profile', 'birth_date']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'role': {'read_only': True},
            'id': {'read_only': True}
        }

    def _others(self):
        users = User.objects.all()
        return users.exclude(pk=self.instance.pk) if self.instance else users

    def validate_email(self, value):
        # 'Ana@Correo.com' y 'ana@correo.com' son la misma bandeja: una sola cuenta.
        value = User.objects.normalize_email(value.strip()).lower()
        if self._others().filter(email__iexact=value).exists():
            raise serializers.ValidationError('Ya existe una cuenta con este correo.')
        return value

    def validate_username(self, value):
        value = value.strip()
        if '@' in value:
            raise serializers.ValidationError('El nombre de usuario no puede contener "@".')
        if self._others().filter(username__iexact=value).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya está en uso.')
        return value

    def validate_password(self, value):
        """
        Valida la contraseña utilizando los validadores configurados en AUTH_PASSWORD_VALIDATORS.
        """
        if value:
            try:
                validate_password(value, user=self.instance)
            except DjangoValidationError as e:
                raise serializers.ValidationError(list(e.messages))
        return value

    def validate_birth_date(self, value):
        return check_birth_date(value)

    def validate(self, attrs):
        if self.instance is None and not attrs.get('birth_date'):
            raise serializers.ValidationError({'birth_date': 'La fecha de nacimiento es requerida para el registro.'})
        return attrs

    def create(self, validated_data):
        birth_date = validated_data.pop('birth_date', None)
        # Desactivar usuario hasta que verifique su email (RegisterUserView envía el correo)
        validated_data['is_active'] = False

        # Blindaje anti-escalamiento de roles: el registro siempre asigna rol LECTOR
        validated_data['role'] = User.RoleChoices.READER

        # Contraseña obligatoria al registrarse
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': ['La contraseña es requerida para el registro.']})

        # El perfil (con su Tinta inicial) se crea vía señal en users/signals.py
        user = User.objects.create_user(password=password, **validated_data)
        if birth_date and hasattr(user, 'profile'):
            user.profile.birth_date = birth_date
            user.profile.save(update_fields=['birth_date'])
        return user

    def update(self, instance, validated_data):
        # Blindaje anti-escalamiento: eliminar 'role' por si se enviara en el payload
        validated_data.pop('role', None)
        # La fecha de nacimiento vive en el perfil y se fija una sola vez (ProfileSerializer).
        validated_data.pop('birth_date', None)

        # Hashing seguro de contraseña: si se incluye, se procesa con set_password()
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)

        # Actualizar los campos permitidos restantes
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
