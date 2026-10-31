path = r'respaldos-software\LiteratusNovelist-main\Producto\backend\users\models.py'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """    is_public = models.BooleanField(
        default=True, db_default=True,
        help_text="Perfil público: cualquiera ve la tarjeta completa y aparece en las sugerencias de amigos. "
                  "Privado: solo sus amigos la ven y solo se le encuentra por su código."
    )"""

replacement = """    is_public = models.BooleanField(
        default=True, db_default=True,
        help_text="Perfil público: cualquiera ve la tarjeta completa y aparece en las sugerencias de amigos. "
                  "Privado: solo sus amigos la ven y solo se le encuentra por su código."
    )
    show_friends = models.BooleanField(
        default=True, db_default=True,
        help_text="Visible en el perfil público: lista o contador de amigos."
    )
    show_books = models.BooleanField(
        default=True, db_default=True,
        help_text="Visible en el perfil público: libros leídos o biblioteca."
    )
    show_reviews = models.BooleanField(
        default=True, db_default=True,
        help_text="Visible en el perfil público: reseñas y valoraciones del lector."
    )"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF")
else:
    print("Target not found")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("users/models.py updated!")

