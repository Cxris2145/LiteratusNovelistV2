with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re
ser_py = re.sub(
    r"fields = \['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'profile'\]",
    r"fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'profile', 'birth_date']",
    ser_py
)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/users/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
print("Patched Meta.fields")
