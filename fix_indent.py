with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re
ser_py = re.sub(r"        if birth_date and hasattr\(user, 'profile'\):\n            user\.profile\.birth_date = birth_date", 
               r"        if birth_date and hasattr(user, 'profile'):\n            user.profile.birth_date = birth_date", 
               ser_py)

# Let's just fix it by replacing the whole thing securely
pattern = r"user = User\.objects\.create_user\(password=password, \*\*validated_data\)\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?"
# wait, I can just use string replacement for the block
block = '''user = User.objects.create_user(password=password, **validated_data)
        if birth_date and hasattr(user, 'profile'):
            user.profile.birth_date = birth_date
            user.profile.save()
        return user'''
# wait, before I replaced:
# user = User.objects.create_user(password=password, **validated_data)
#        if birth_date and hasattr(user, 'profile'):
#            user.profile.birth_date = birth_date
#            user.profile.save()
#        return user

# Let's inspect serializers.py around line 27
