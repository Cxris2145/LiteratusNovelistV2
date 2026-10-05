from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import User, Profile


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
            'id', 'avatar', 'avatar_color', 'bio', 'country', 'preferred_language', 
            'ink_balance', 'theme', 'xp', 'level', 'level_name', 
            'xp_to_next_level', 'streak_current', 'streak_max', 'streak_shields',
            'streak_last_date', 'hearts', 'current_hearts', 'seconds_to_next_heart',
            'equipped_frame', 'equipped_title', 'discount_percent', 
            'level_perks', 'all_levels', 'subscription_cosmetics',
            'has_completed_onboarding', 'favorite_genres', 'followed_authors',
            'friend_code', 'tagline', 'outfit'
        ]
        # outfit solo cambia al equipar en El Bazar; friend_code es inmutable.
        read_only_fields = ['ink_balance', 'xp', 'level', 'streak_current', 'streak_max', 'streak_shields',
            'streak_last_date', 'hearts', 'equipped_frame', 'equipped_title', 'has_completed_onboarding',
            'friend_code', 'outfit']

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

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'profile']
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

    def create(self, validated_data):
        # Desactivar usuario hasta que verifique su email (RegisterUserView envía el correo)
        validated_data['is_active'] = False

        # Blindaje anti-escalamiento de roles: el registro siempre asigna rol LECTOR
        validated_data['role'] = User.RoleChoices.READER

        # Contraseña obligatoria al registrarse
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': ['La contraseña es requerida para el registro.']})

        # El perfil (con su Tinta inicial) se crea vía señal en users/signals.py
        return User.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        # Blindaje anti-escalamiento: eliminar 'role' por si se enviara en el payload
        validated_data.pop('role', None)

        # Hashing seguro de contraseña: si se incluye, se procesa con set_password()
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)

        # Actualizar los campos permitidos restantes
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
