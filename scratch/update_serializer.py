path = r'respaldos-software\LiteratusNovelist-main\Producto\backend\users\serializers.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = "'friend_code', 'tagline', 'outfit', 'birth_date', 'is_public'"
replacement = "'friend_code', 'tagline', 'outfit', 'birth_date', 'is_public', 'show_friends', 'show_books', 'show_reviews'"

if target in text:
    text = text.replace(target, replacement)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("ProfileSerializer updated successfully!")
else:
    print("Target not found in serializers.py")

