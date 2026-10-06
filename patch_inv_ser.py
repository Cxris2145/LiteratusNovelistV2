with open('respaldos-software/LiteratusNovelist-main/Producto/backend/library/serializers.py', 'r', encoding='utf-8') as f:
    ser_py = f.read()

import re

# Add min_age to UserInventorySerializer
ser_py = re.sub(
    r"word_count = serializers\.IntegerField\(source='edition\.book\.word_count', read_only=True\)",
    r"word_count = serializers.IntegerField(source='edition.book.word_count', read_only=True)\n    min_age = serializers.IntegerField(source='edition.book.min_age', read_only=True)",
    ser_py
)

ser_py = re.sub(
    r"'edition', 'acquired_at', 'progress'\]",
    r"'edition', 'acquired_at', 'progress', 'min_age']",
    ser_py
)

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/library/serializers.py', 'w', encoding='utf-8') as f:
    f.write(ser_py)
