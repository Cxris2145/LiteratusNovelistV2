from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
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
    
    class Meta:
        model = Profile
        fields = [
            'id', 'avatar_color', 'bio', 'country', 'preferred_language', 
            'ink_balance', 'theme', 'xp', 'level', 'level_name', 
            'xp_to_next_level', 'streak_current', 'streak_max', 'streak_shields',
            'streak_last_date', 'hearts', 'current_hearts', 'seconds_to_next_heart',
            'equipped_frame', 'equipped_title', 'discount_percent', 
            'level_perks', 'all_levels'
        ]

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
    Serializador de ESCRITURA (Creación/Registro).
    Garantiza que la contraseña nunca se exponga (write_only) y crea el 
    perfil paralelo atado en la misma transacción (Señal en DB / Create Override).
    """
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'role']
        extra_kwargs = {
            'password': {'write_only': True}
        }

    def create(self, validated_data):
        # Desactivar usuario hasta que verifique su email
        validated_data['is_active'] = False
        user = User.objects.create_user(**validated_data) # Hash automático de pass
        
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
