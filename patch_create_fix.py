with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

# Replace return User.objects.create_user... with user = User.objects... then profile logic
pattern = r"return User\.objects\.create_user\(password=password, \*\*validated_data\)"
replacement = '''user = User.objects.create_user(password=password, **validated_data)
        if birth_date and hasattr(user, 'profile'):
            user.profile.birth_date = birth_date
            user.profile.save()
        return user'''

ser_py = re.sub(pattern, replacement, ser_py)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
print("Fixed UserWriteSerializer.create return logic")
