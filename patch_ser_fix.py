with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

# Add to ProfileSerializer
ser_py = re.sub(
    r"'tagline', 'outfit'\n\s*\]",
    r"'tagline', 'outfit', 'birth_date'\n          ]",
    ser_py
)

# Add to UserWriteSerializer
ser_py = re.sub(
    r"class UserWriteSerializer\(serializers\.ModelSerializer\):\n.*?\n\s*profile = ProfileSerializer\(read_only=True\)",
    r"class UserWriteSerializer(serializers.ModelSerializer):\n    \"\"\"\n    Serializador de ESCRITURA\n    \"\"\"\n    profile = ProfileSerializer(read_only=True)\n    birth_date = serializers.DateField(write_only=True, required=False)",
    ser_py,
    flags=re.DOTALL
)

# Fix create method
create_pattern = r"(def create\(self, validated_data\):\s*\n)(\s*# Desactivar usuario)"
ser_py = re.sub(create_pattern, r"\1        birth_date = validated_data.pop('birth_date', None)\n\2", ser_py)

return_pattern = r"(return User\.objects\.create_user\(password=password, \*\*validated_data\))"
return_replacement = '''user = User.objects.create_user(password=password, **validated_data)
        if birth_date and hasattr(user, 'profile'):
            user.profile.birth_date = birth_date
            user.profile.save(update_fields=['birth_date'])
        return user'''
ser_py = re.sub(return_pattern, return_replacement, ser_py)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
print("Patched serializers correctly")
