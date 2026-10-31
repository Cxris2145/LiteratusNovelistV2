path = r'respaldos-software\LiteratusNovelist-main\Producto\backend\community\services.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """        'is_public': profile.is_public,
        'relation': relation,
        'request_id': request_id,
    }"""

replacement = """        'is_public': profile.is_public,
        'show_friends': getattr(profile, 'show_friends', True),
        'show_books': getattr(profile, 'show_books', True),
        'show_reviews': getattr(profile, 'show_reviews', True),
        'relation': relation,
        'request_id': request_id,
    }"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF in services.py")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF in services.py")
else:
    print("Target not found in services.py")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

