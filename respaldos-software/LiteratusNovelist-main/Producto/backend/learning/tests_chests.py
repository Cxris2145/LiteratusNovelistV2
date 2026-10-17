from concurrent.futures import ThreadPoolExecutor
from importlib import import_module
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.db import IntegrityError, close_old_connections, transaction
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APITestCase

from learning.chests import claim_path_chest
from learning.models import (
    DailyActivityLog, LearningLevel, LearningUnit, PathChestClaim, ShopItem,
    UserInventoryItem, UserLevelProgress,
)
from learning.path_catalog import REALMS, sync_path_rewards
from learning.tests import _solve
from library.models import InkTransaction
from users.models import Profile

User = get_user_model()


class PathChestAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_learning_path', verbosity=0)

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='viajero', email='viajero@example.com', password='test-pass-123')
        self.client.force_authenticate(self.user)

    def level(self, unit=1, number=3):
        return LearningLevel.objects.get(unit__unit_number=unit, level_number=number)

    def complete(self, level=None, stars=1):
        return UserLevelProgress.objects.create(
            user=self.user, level=level or self.level(), stars=stars, best_score=80 if stars else 0, is_completed=True)

    def complete_realm(self, realm=1):
        for level in LearningLevel.objects.filter(unit__unit_number__gt=(realm - 1) * 5,
                                                  unit__unit_number__lte=realm * 5):
            UserLevelProgress.objects.update_or_create(user=self.user, level=level,
                defaults={'stars': 1, 'best_score': 80, 'is_completed': True})

    def claim(self, code='unit-1'):
        return self.client.post(f'/api/v1/learning/chests/{code}/claim/', {}, format='json')

    def chests(self):
        return {c['code']: c for c in self.client.get('/api/v1/learning/path/').data['chests']}

    def test_map_contains_36_deterministic_rewards_without_new_levels(self):
        chests = self.chests()
        self.assertEqual(len(chests), 36)
        self.assertEqual(LearningLevel.objects.count(), 150)
        self.assertEqual(sum(c['kind'] == 'unit' for c in chests.values()), 30)
        self.assertTrue(all(c['state'] == 'locked' for c in chests.values()))
        for realm, (_title, code, value, name, _icon) in enumerate(REALMS, start=1):
            self.assertEqual(chests[f'realm-{realm}']['item'], {'code': code, 'name': name, 'value': value})
            self.assertEqual(chests[f'realm-{realm}']['unit_number'], realm * 5)
            self.assertEqual(chests[f'realm-{realm}']['ink_reward'], 30)
        self.assertEqual(chests['unit-1']['ink_reward'], 10)

    def test_locked_unknown_and_unauthenticated_cannot_claim(self):
        self.assertEqual(self.claim().status_code, 403)
        self.assertEqual(self.claim().data['error'], 'CHEST_LOCKED')
        self.assertEqual(self.claim('realm-999').status_code, 404)
        self.client.force_authenticate(user=None)
        self.assertIn(self.claim().status_code, (401, 403))
        self.assertFalse(PathChestClaim.objects.exists())
        self.assertFalse(InkTransaction.objects.filter(concept='path_chest_claim').exists())

    def test_previous_progress_unlocks_small_chest_without_replaying(self):
        self.complete(self.level(12, 3), stars=2)
        self.assertEqual(self.chests()['unit-12']['state'], 'available')
        self.assertEqual(self.chests()['unit-11']['state'], 'locked')
        response = self.claim('unit-12')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['ink_earned'], 10)
        self.assertEqual(response.data['chest']['state'], 'claimed')

    def test_skipped_zero_star_and_incomplete_progress_do_not_unlock(self):
        progress = self.complete(stars=0)
        self.assertEqual(self.claim().status_code, 403)
        progress.stars, progress.is_completed = 1, False
        progress.save()
        self.assertEqual(self.claim().status_code, 403)
        progress.is_completed = True
        progress.save()
        self.assertEqual(self.claim().status_code, 200)

    def test_small_chest_is_once_only_without_xp_streak_or_hearts(self):
        self.complete()
        before = Profile.objects.get(user=self.user)
        response = self.claim()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['already_claimed'])
        self.assertEqual(response.data['ink_balance'], before.ink_balance + 10)
        self.assertIsNone(response.data['item_granted'])
        repeat = self.claim()
        self.assertEqual(repeat.status_code, 200)
        self.assertTrue(repeat.data['already_claimed'])
        self.assertEqual(repeat.data['ink_earned'], 0)
        self.assertIsNone(repeat.data['item_granted'])
        after = Profile.objects.get(user=self.user)
        for field in ('xp', 'level', 'hearts', 'hearts_last_updated', 'streak_current', 'streak_max', 'streak_last_date', 'outfit'):
            self.assertEqual(getattr(after, field), getattr(before, field), field)
        self.assertEqual(after.ink_balance, before.ink_balance + 10)
        self.assertEqual(PathChestClaim.objects.filter(user=self.user, code='unit-1').count(), 1)
        self.assertEqual(InkTransaction.objects.filter(user=self.user, concept='path_chest_claim', amount=10).count(), 1)
        log = DailyActivityLog.objects.get(user=self.user)
        self.assertEqual((log.xp_earned, log.levels_completed, log.ink_earned), (0, 0, 10))

    def test_claim_stays_claimed_even_if_progress_is_later_removed(self):
        self.complete()
        self.claim()
        UserLevelProgress.objects.filter(user=self.user).delete()
        self.assertEqual(self.chests()['unit-1']['state'], 'claimed')
        self.assertTrue(self.claim().data['already_claimed'])

    def test_realm_requires_all_25_actual_levels_not_only_final_exam(self):
        self.complete_realm()
        skipped = UserLevelProgress.objects.get(user=self.user, level=self.level(2, 4))
        skipped.stars = 0
        skipped.save()
        self.assertEqual(self.claim('realm-1').status_code, 403)
        skipped.stars = 1
        skipped.save()
        self.assertEqual(self.claim('realm-1').status_code, 200)
        self.assertEqual(self.chests()['realm-2']['state'], 'locked')

    def test_all_six_realm_items_are_exclusive_owned_and_equippable(self):
        before = Profile.objects.get(user=self.user)
        for number, (_title, code, value, name, _icon) in enumerate(REALMS, start=1):
            self.complete_realm(number)
            response = self.claim(f'realm-{number}')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['ink_earned'], 30)
            self.assertEqual(response.data['item_granted'], {'code': code, 'value': value, 'name': name})
            self.assertEqual(UserInventoryItem.objects.get(user=self.user, item__code=code).quantity, 1)
            repeat = self.claim(f'realm-{number}')
            self.assertTrue(repeat.data['already_claimed'])
            self.assertIsNone(repeat.data['item_granted'])
        after = Profile.objects.get(user=self.user)
        self.assertEqual((after.xp, after.hearts, after.streak_current, after.outfit),
                         (before.xp, before.hearts, before.streak_current, before.outfit))
        self.assertEqual(after.ink_balance, before.ink_balance + 180)
        for _title, code, value, _name, _icon in REALMS:
            denied = self.client.post('/api/v1/learning/shop/buy/', {'item_code': code}, format='json')
            self.assertEqual(denied.data['error'], 'NOT_FOR_SALE')
            equipped = self.client.post('/api/v1/learning/shop/equip/', {'item_code': code}, format='json')
            self.assertEqual(equipped.status_code, 200)
            slot, variant = value.split(':')
            self.assertEqual(equipped.data['outfit'][slot], variant)

    def test_collection_displays_sources_without_overwriting_achievement_source(self):
        regular = {s['code'] for s in self.client.get('/api/v1/learning/shop/').data}
        collection = {s['code']: s for s in self.client.get('/api/v1/learning/shop/?scope=collection').data}
        for number, (title, code, _value, _name, _icon) in enumerate(REALMS, start=1):
            self.assertNotIn(code, regular)
            self.assertEqual(collection[code]['earned_from'], {
                'kind': 'path_chest', 'code': f'realm-{number}', 'title': title, 'unit_number': number * 5})
            self.assertIsNone(collection[code]['earned_by'])
            self.assertFalse(collection[code]['is_purchasable'])
        self.assertIsNotNone(collection['wear_head_laurel']['earned_by'])
        self.assertIsNone(collection['wear_head_laurel']['earned_from'])
        self.complete_realm()
        self.claim('realm-1')
        owned = {s['code']: s for s in self.client.get('/api/v1/learning/shop/').data}
        self.assertTrue(owned[REALMS[0][1]]['is_owned'])

    def test_failed_reward_rolls_back_inventory_and_claim(self):
        self.complete_realm()
        before = Profile.objects.get(user=self.user).ink_balance
        with patch('learning.chests.reward_activity', side_effect=RuntimeError('pago interrumpido')):
            with self.assertRaises(RuntimeError):
                claim_path_chest(self.user, 'realm-1')
        self.assertFalse(UserInventoryItem.objects.filter(user=self.user, item__code=REALMS[0][1]).exists())
        self.assertFalse(PathChestClaim.objects.filter(user=self.user).exists())
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, before)
        self.assertEqual(self.claim('realm-1').status_code, 200)

    def test_missing_reward_returns_retryable_error_without_paying(self):
        self.complete_realm()
        ShopItem.objects.filter(code=REALMS[0][1]).update(is_active=False)
        before = Profile.objects.get(user=self.user).ink_balance
        response = self.claim('realm-1')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['error'], 'CHEST_REWARD_UNAVAILABLE')
        self.assertFalse(PathChestClaim.objects.filter(user=self.user).exists())
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, before)

    def test_existing_inventory_is_not_duplicated_or_equipped(self):
        self.complete_realm()
        item = ShopItem.objects.get(code=REALMS[0][1])
        UserInventoryItem.objects.create(user=self.user, item=item, quantity=1)
        self.assertEqual(self.claim('realm-1').status_code, 200)
        self.assertEqual(UserInventoryItem.objects.get(user=self.user, item=item).quantity, 1)
        self.assertEqual(Profile.objects.get(user=self.user).outfit, {})

    def test_ledger_has_database_uniqueness_constraint(self):
        PathChestClaim.objects.create(user=self.user, code='unit-1', ink_earned=10)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PathChestClaim.objects.create(user=self.user, code='unit-1', ink_earned=10)

    def test_idempotent_frozen_and_command_seeds_preserve_progress_and_inventory(self):
        self.complete_realm()
        self.claim('realm-1')
        inventory = UserInventoryItem.objects.get(user=self.user, item__code=REALMS[0][1])
        original = (LearningLevel.objects.count(), UserLevelProgress.objects.count(), inventory.pk)
        frozen = import_module('learning.migrations.0007_path_chests_and_rewards')
        self.assertEqual(tuple(frozen.PATH_REWARDS), REALMS)
        for _ in range(2):
            sync_path_rewards(ShopItem)
            frozen.seed_path_rewards(apps, SimpleNamespace(connection=SimpleNamespace(alias='default')))
        self.assertEqual((LearningLevel.objects.count(), UserLevelProgress.objects.count(),
                          UserInventoryItem.objects.get(user=self.user, item__code=REALMS[0][1]).pk), original)
        self.assertEqual(PathChestClaim.objects.filter(user=self.user).count(), 1)
        self.assertEqual(ShopItem.objects.filter(code__in=[r[1] for r in REALMS]).count(), 6)

    def test_effective_preview_matches_first_perfect_and_practice_awards(self):
        level = self.level(1, 1)
        level.xp_reward, level.ink_reward = 43, 50
        level.save()
        first = self.client.get('/api/v1/learning/path/').data['units'][0]['levels'][0]
        self.assertEqual((first['xp_reward'], first['ink_reward']), (43, 50))
        preview = first['reward_preview']
        self.assertEqual(preview, {'xp': 43, 'ink': 10, 'perfect_bonus_xp': 10,
                                   'perfect_bonus_ink': 3, 'is_practice': False})
        answers = {q['id']: _solve(q) for q in level.exercise.questions_data}
        result = self.client.post(f'/api/v1/learning/levels/{level.id}/submit/',
                                  {'answers': answers}, format='json').data
        self.assertEqual((result['xp_earned'], result['ink_earned']),
                         (preview['xp'] + preview['perfect_bonus_xp'], preview['ink'] + preview['perfect_bonus_ink']))
        practice = self.client.get('/api/v1/learning/path/').data['units'][0]['levels'][0]['reward_preview']
        self.assertEqual(practice, {'xp': 5, 'ink': 0, 'perfect_bonus_xp': 0,
                                    'perfect_bonus_ink': 0, 'is_practice': True})
        repeated = self.client.post(f'/api/v1/learning/levels/{level.id}/submit/',
                                    {'answers': answers}, format='json').data
        self.assertEqual((repeated['xp_earned'], repeated['ink_earned']), (practice['xp'], practice['ink']))


class PathChestConcurrencyTests(TransactionTestCase):
    @skipUnlessDBFeature('has_select_for_update')
    def test_simultaneous_claims_pay_once(self):
        # SQLite no implementa bloqueo de filas; esta prueba corre con la base
        # PostgreSQL aislada de config.test_settings, nunca con la compartida.
        call_command('seed_learning_path', verbosity=0)
        user = User.objects.create_user(username='concurrente', email='concurrente@example.com', password='test-pass')
        level = LearningLevel.objects.get(unit__unit_number=1, level_number=3)
        UserLevelProgress.objects.create(user=user, level=level, stars=1, is_completed=True)
        balance = Profile.objects.get(user=user).ink_balance
        barrier = Barrier(2)

        def worker():
            close_old_connections()
            try:
                actor = User.objects.get(pk=user.pk)
                barrier.wait(timeout=10)
                return claim_path_chest(actor, 'unit-1')
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: worker(), range(2)))
        self.assertEqual(sorted(r['ink_earned'] for r in results), [0, 10])
        self.assertEqual(sorted(r['already_claimed'] for r in results), [False, True])
        self.assertEqual(Profile.objects.get(user=user).ink_balance, balance + 10)
        self.assertEqual(PathChestClaim.objects.filter(user=user).count(), 1)
        self.assertEqual(InkTransaction.objects.filter(user=user, concept='path_chest_claim').count(), 1)
