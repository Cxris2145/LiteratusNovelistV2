with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

# Add birth_date to ProfileSerializer
ser_py = re.sub(
    r"'tagline', 'outfit'\n\s*\]",
    r"'tagline', 'outfit', 'birth_date'\n          ]",
    ser_py
)

# Add birth_date to UserWriteSerializer
if 'birth_date = serializers.DateField' not in ser_py:
    ser_py = re.sub(
        r"class UserWriteSerializer\(serializers\.ModelSerializer\):\n.*?\n\s*profile = ProfileSerializer\(read_only=True\)",
        r"class UserWriteSerializer(serializers.ModelSerializer):\n    \"\"\"\n    Serializador de ESCRITURA\n    \"\"\"\n    profile = ProfileSerializer(read_only=True)\n    birth_date = serializers.DateField(write_only=True, required=False)",
        ser_py,
        flags=re.DOTALL
    )

if 'def create(self, validated_data):' not in ser_py:
    create_method = '''
    def create(self, validated_data):
        birth_date = validated_data.pop('birth_date', None)
        user = super().create(validated_data)
        if birth_date and hasattr(user, 'profile'):
            user.profile.birth_date = birth_date
            user.profile.save()
        return user
'''
    ser_py = re.sub(
        r"def validate_email\(self, value\):",
        f"{create_method}\n    def validate_email(self, value):",
        ser_py
    )

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
print("Patched users/serializers.py")
