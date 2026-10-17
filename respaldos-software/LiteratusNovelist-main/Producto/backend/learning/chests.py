"""Cofres retroactivos con entrega atómica, serializados por el perfil del lector."""
from django.db import transaction

from users.models import Profile
from library.achievement_engine import reward_activity
from .models import LearningUnit, PathChestClaim, ShopItem, UserInventoryItem, UserLevelProgress
from .path_catalog import REALMS


def path_chests(user, units=None, progress_map=None, claimed_codes=None):
    if units is None:
        units = LearningUnit.objects.prefetch_related('levels').order_by('unit_number')
    if progress_map is None:
        progress_map = {p.level_id: p for p in UserLevelProgress.objects.filter(user=user)}
    if claimed_codes is None:
        claimed_codes = set(PathChestClaim.objects.filter(user=user).values_list('code', flat=True))
    passed = set()
    for unit in units:
        for level in unit.levels.all():
            progress = progress_map.get(level.id)
            if progress and progress.is_completed and progress.stars > 0:
                passed.add((unit.unit_number, level.level_number))

    result = []
    for unit_number in range(1, 31):
        realm_number = (unit_number - 1) // 5 + 1
        realm_title, item_code, value, name, _icon = REALMS[realm_number - 1]
        code = f'unit-{unit_number}'
        result.append({
            'code': code, 'kind': 'unit', 'unit_number': unit_number, 'realm_number': realm_number,
            'title': f'Cofre de la unidad {unit_number}',
            'state': 'claimed' if code in claimed_codes else 'available' if (unit_number, 3) in passed else 'locked',
            'ink_reward': 10, 'item': None,
            'requirement': f'Completa con estrellas la sala de minijuegos de la unidad {unit_number}.',
        })
        if unit_number % 5 == 0:
            code = f'realm-{realm_number}'
            requirements = {(u, level) for u in range(unit_number - 4, unit_number + 1) for level in range(1, 6)}
            result.append({
                'code': code, 'kind': 'realm', 'unit_number': unit_number, 'realm_number': realm_number,
                'title': f'Tesoro de {realm_title}',
                'state': 'claimed' if code in claimed_codes else 'available' if requirements <= passed else 'locked',
                'ink_reward': 30, 'item': {'code': item_code, 'name': name, 'value': value},
                'requirement': f'Completa con estrellas los 25 niveles de {realm_title}.',
            })
    return result


@transaction.atomic
def claim_path_chest(user, code):
    # El mismo bloqueo se usa al gastar Tinta y corregir niveles. Debe preceder
    # al ledger: dos peticiones concurrentes no pueden ver ambas "sin reclamar".
    profile = Profile.objects.select_for_update().get(user=user)
    chest = next((entry for entry in path_chests(user) if entry['code'] == code), None)
    if chest is None:
        return {'success': False, 'error': 'CHEST_NOT_FOUND', 'message': 'Este cofre no existe.'}
    if chest['state'] == 'claimed':
        return {'success': True, 'already_claimed': True, 'ink_earned': 0,
                'ink_balance': profile.ink_balance, 'item_granted': None, 'chest': chest}
    if chest['state'] != 'available':
        return {'success': False, 'error': 'CHEST_LOCKED', 'message': chest['requirement']}

    item = None
    if chest['item']:
        # Si faltara la siembra, fallar antes del pago y conservar el cofre.
        item = ShopItem.objects.filter(code=chest['item']['code'], is_active=True, is_purchasable=False).first()
        if item is None:
            return {'success': False, 'error': 'CHEST_REWARD_UNAVAILABLE',
                    'message': 'El premio no está disponible. Intenta abrir el cofre más tarde.'}
        inventory, created = UserInventoryItem.objects.get_or_create(user=user, item=item, defaults={'quantity': 1})
        if not created and inventory.quantity == 0:
            inventory.quantity = 1
            inventory.save(update_fields=['quantity'])
    reward_activity(user, 'path_chest_claim', reference_id=code, custom_xp=0, custom_ink=chest['ink_reward'])
    PathChestClaim.objects.create(user=user, code=code, ink_earned=chest['ink_reward'], item=item)
    profile.refresh_from_db(fields=['ink_balance'])
    chest['state'] = 'claimed'
    return {'success': True, 'already_claimed': False, 'ink_earned': chest['ink_reward'],
            'ink_balance': profile.ink_balance, 'item_granted': chest['item'], 'chest': chest}
