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
