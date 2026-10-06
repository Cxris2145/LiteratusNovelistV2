with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

is_age_restricted_method = '''
    is_age_restricted = serializers.SerializerMethodField()

    def get_is_age_restricted(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        if obj.min_age > 0:
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                return True
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            return age < obj.min_age
        return False
'''

ser_py = re.sub(
    r"(has_premium_narration = serializers\.SerializerMethodField\(\)\n\s*total_words = serializers\.SerializerMethodField\(\)\n)",
    r"\1" + is_age_restricted_method,
    ser_py
)

ser_py = re.sub(
    r"'tags'\n\s*\]",
    r"'tags', 'is_age_restricted'\n          ]",
    ser_py
)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
print("Patched serializers.py with is_age_restricted")
