"""Reinos y premios exclusivos de La Senda. No modifica los niveles existentes."""

# (title, code, value, name, icon)
REALMS = (
    ('Bosque de las Primeras Páginas', 'wear_neck_firefly_brooch', 'neck:firefly-brooch',
     'Broche de luciérnaga', 'nest_eco_leaf'),
    ('Lago de la Luna', 'wear_cape_moonlit', 'cape:moonlit', 'Capa lunar', 'dark_mode'),
    ('Biblioteca Flotante', 'wear_head_archivist', 'head:archivist', 'Gorro del archivista', 'local_library'),
    ('Ruinas de los Relatos', 'wear_neck_story_key', 'neck:story-key', 'Llave de los relatos', 'key'),
    ('Cumbres de Aurora', 'wear_cape_aurora', 'cape:aurora', 'Capa de aurora', 'auto_awesome'),
    ('Ciudadela de Tinta', 'wear_head_ink_crown', 'head:ink-crown', 'Corona del Gran Lector', 'crown'),
)


def item_source(code):
    for number, (title, item_code, *_rest) in enumerate(REALMS, start=1):
        if code == item_code:
            return {'kind': 'path_chest', 'code': f'realm-{number}', 'title': title, 'unit_number': number * 5}
    return None


def sync_path_rewards(ShopItem):
    """Solo las seis prendas propias: nunca vende ni altera el inventario del lector."""
    for number, (title, code, value, name, icon) in enumerate(REALMS, start=1):
        ShopItem.objects.update_or_create(code=code, defaults={
            'name': name, 'description': f'Premio exclusivo por completar {title} en La Senda.',
            'item_type': 'maguito_wear', 'value': value, 'icon': icon,
            'cost_ink': 0, 'is_purchasable': False, 'is_active': True, 'sort_order': 200 + number,
        })
