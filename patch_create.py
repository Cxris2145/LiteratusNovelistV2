with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

# We need to insert birth_date logic into UserWriteSerializer.create()
# Find def create(self, validated_data):
create_def_pattern = r"(def create\(self, validated_data\):\s*\n)(\s*# Desactivar usuario)"

if 'birth_date = validated_data.pop' not in ser_py:
    ser_py = re.sub(
        create_def_pattern,
        r"\1        birth_date = validated_data.pop('birth_date', None)\n\2",
        ser_py
    )
    
    # Now find where the user is returned and save the profile
    return_user_pattern = r"(return user)"
    
    profile_save_logic = '''if birth_date and hasattr(user, 'profile'):
            user.profile.birth_date = birth_date
            user.profile.save()
        return user'''
    
    ser_py = re.sub(
        return_user_pattern,
        profile_save_logic,
        ser_py,
        count=1
    )
    
    with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'w', encoding='utf-8') as f:
        f.write(ser_py)
    print("Patched UserWriteSerializer.create()")
