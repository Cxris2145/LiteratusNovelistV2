from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import User, Profile

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = {
            'id': str(self.user.id),
            'email': self.user.email,
            'username': self.user.username,
            'is_staff': self.user.is_staff,
            'is_superuser': self.user.is_superuser,
        }
        return data


class ProfileSerializer(serializers.ModelSerializer):
    """
    Serializador del perfil del usuario.
    Solo expone datos no-sensibles de visualización como Avatar y Biografía, además de gamificación.
    """
    level_name = serializers.SerializerMethodField()
    xp_to_next_level = serializers.SerializerMethodField()
    discount_percent = serializers.SerializerMethodField()
    level_perks = serializers.SerializerMethodField()
    all_levels = serializers.SerializerMethodField()
    seconds_to_next_heart = serializers.SerializerMethodField()
    current_hearts = serializers.SerializerMethodField()
    subscription_cosmetics = serializers.SerializerMethodField()
    
    class Meta:
        model = Profile
        fields = [
            'id', 'avatar_color', 'bio', 'country', 'preferred_language', 
            'ink_balance', 'theme', 'xp', 'level', 'level_name', 
            'xp_to_next_level', 'streak_current', 'streak_max', 'streak_shields',
            'streak_last_date', 'hearts', 'current_hearts', 'seconds_to_next_heart',
            'equipped_frame', 'equipped_title', 'discount_percent', 
            'level_perks', 'all_levels', 'subscription_cosmetics'
        ]
        read_only_fields = ['ink_balance', 'xp', 'level', 'streak_current', 'streak_max', 'streak_shields',
            'streak_last_date', 'hearts', 'equipped_frame', 'equipped_title']

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
        from django.conf import settings
        levels = getattr(settings, 'READER_LEVELS', [])
        for lvl in sorted(levels, key=lambda x: x['level'], reverse=True):
            if obj.level >= lvl['level']:
                return lvl['name']
        return "Lector Novato"

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
        # Desactivar usuario hasta que verifique su email
        validated_data['is_active'] = False

        # Blindaje anti-escalamiento de roles: el registro siempre asigna rol LECTOR
        validated_data['role'] = User.RoleChoices.READER

        # Contraseña obligatoria al registrarse
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': ['La contraseña es requerida para el registro.']})

        user = User.objects.create_user(password=password, **validated_data)

        # Enviar correo de verificación
        from .utils import send_verification_email
        try:
            send_verification_email(user)
        except Exception as e:
            # En caso de error de correo (ej. credenciales inválidas en dev),
            # dejamos log para no romper el registro pero poder debuggear.
            print(f"Error enviando correo de verificación: {e}")

        # Perfil se crea vía señal en users/signals.py para asegurar ink_balance = 150
        return user

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
