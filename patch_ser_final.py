with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

# 1. ProfileSerializer fields
ser_py = ser_py.replace("'tagline', 'outfit'", "'tagline', 'outfit', 'birth_date'")

# 2. UserWriteSerializer fields
ser_py = ser_py.replace(
    "profile = ProfileSerializer(read_only=True)",
    "profile = ProfileSerializer(read_only=True)\n    birth_date = serializers.DateField(write_only=True, required=False)"
)

# 3. create method
ser_py = ser_py.replace(
    "def create(self, validated_data):",
    "def create(self, validated_data):\n        birth_date = validated_data.pop('birth_date', None)"
)

# 4. return user logic in create method
old_return = "return User.objects.create_user(password=password, **validated_data)"
new_return = '''user = User.objects.create_user(password=password, **validated_data)
        if birth_date and hasattr(user, 'profile'):
            user.profile.birth_date = birth_date
            user.profile.save(update_fields=['birth_date'])
        return user'''
# wait, there's a return User.objects.filter in find_user_by_login... so replace only the exact string!
ser_py = ser_py.replace(old_return, new_return)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
