"""
Logros 2.0: catálogo, disparadores nuevos, premios exclusivos y su uso en El Bazar y La Taberna.
El catálogo lo crean las migraciones (library 0011 y learning 0005), igual que en producción.
"""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Book, Chapter, Edition
from community.services import full_card
from learning.models import LearningExercise, LearningLevel, LearningUnit, ShopItem, UserInventoryItem, UserLevelProgress
from library.achievement_catalog import ACHIEVEMENTS
from library.achievement_engine import _unlock_or_update, evaluate_for_user, reward_activity
from library.models import Achievement, UserAchievement, UserBookmark, UserFavorite, UserHighlight, UserInventory, UserPostIt
from users.models import Profile

User = get_user_model()


class AchievementsV2Tests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lectora', email='lectora@example.com', password='x-pass-123')
        self.profile = Profile.objects.get(user=self.user)
        self.client.force_authenticate(self.user)

    def unlocked(self, code):
        return UserAchievement.objects.filter(
            user=self.user, achievement__code=code, unlocked_at__isnull=False).exists()

    def owns(self, item_code):
        return UserInventoryItem.objects.filter(user=self.user, item__code=item_code, quantity__gt=0).exists()

    def inventory(self):
        book = Book.objects.create(title='El farol', status=Book.StatusChoices.PUBLISHED, is_published=True)
        chapter = Chapter.objects.create(book=book, order=1, title='Uno', content_html='<p>Había una vez.</p>')
        inventory = UserInventory.objects.create(user=self.user, edition=Edition.objects.create(book=book, price=0))
        return inventory, chapter

    # ── Catálogo ──
    def test_migrations_create_the_whole_catalog_with_rarity_and_rewards(self):
        self.assertEqual(Achievement.objects.count(), len(ACHIEVEMENTS))
        summit = Achievement.objects.get(code='senda_summit')
        self.assertEqual(summit.rarity, 'legendary')
        self.assertEqual(summit.reward_item.code, 'frame_summit')
        self.assertFalse(summit.reward_item.is_purchasable)
        self.assertTrue(ShopItem.objects.get(code='frame_parchment').is_purchasable)

    def test_catalog_api_returns_rarity_and_reward(self):
        data = {a['code']: a for a in self.client.get('/api/v1/library/achievements/catalog/').data}
        self.assertEqual(data['night_owl_10']['rarity'], 'rare')
        self.assertEqual(data['night_owl_10']['reward']['item_type'], 'profile_frame')
        self.assertTrue(data['night_owl_10']['reward']['is_exclusive'])
        self.assertIsNone(data['first_chapter']['reward'])

    # ── Disparadores nuevos ──
    def test_passing_a_senda_level_unlocks_senda_first(self):
        unit = LearningUnit.objects.create(unit_number=1, slug='u1', title='Unidad 1', description='', order=1)
        level = LearningLevel.objects.create(unit=unit, level_number=1, order=1, title='Nivel 1', description='')
        UserLevelProgress.objects.create(user=self.user, level=level, stars=3, best_score=100, is_completed=True)
        reward_activity(self.user, 'quiz_passed', reference_id=str(level.id), custom_ink=5, custom_xp=15)
        self.assertTrue(self.unlocked('senda_first'))
        # Era la última (y única) unidad: también La Cumbre, con su marco exclusivo.
        self.assertTrue(self.unlocked('senda_summit'))
        self.assertTrue(self.owns('frame_summit'))

    def test_solving_the_daily_enigma_unlocks_enigma_first(self):
        reward_activity(self.user, 'daily_enigma', custom_ink=15, custom_xp=20)
        self.assertTrue(self.unlocked('enigma_first'))

    def test_first_highlight_unlocks_subrayador(self):
        inventory, chapter = self.inventory()
        UserHighlight.objects.create(inventory=inventory, chapter=chapter, start_word=0, end_word=2, text='Había una')
        self.assertTrue(self.unlocked('highlight_first'))

    def test_the_threshold_in_the_database_is_the_one_that_counts(self):
        Achievement.objects.filter(code='bookmarks_10').update(threshold=1)
        inventory, _ = self.inventory()
        UserBookmark.objects.create(inventory=inventory, position_cfi='{"v":1}')
        self.assertTrue(self.unlocked('bookmarks_10'))

    def test_leveling_up_unlocks_level_5(self):
        reward_activity(self.user, 'quiz_passed', custom_ink=0, custom_xp=1_000_000)
        self.profile.refresh_from_db()
        self.assertGreaterEqual(self.profile.level, 5)
        self.assertTrue(self.unlocked('level_5'))

    def test_owning_five_cosmetics_unlocks_coleccionista(self):
        for item in ShopItem.objects.filter(item_type='profile_frame')[:5]:
            UserInventoryItem.objects.create(user=self.user, item=item)
        evaluate_for_user(self.user, 'collection')
        self.assertTrue(self.unlocked('bazar_5'))

    # ── Premios exclusivos ──
    def test_unlocking_gives_the_exclusive_reward_and_it_can_be_equipped(self):
        _unlock_or_update(self.user, 'night_owl', current=1, threshold=1)
        self.assertTrue(self.owns('title_midnight_owl'))

        response = self.client.post('/api/v1/learning/shop/equip/', {'item_code': 'title_midnight_owl'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.equipped_title, 'Búho de Medianoche')  # el título, no el nombre del artículo

    def test_exclusive_items_are_not_for_sale(self):
        self.profile.ink_balance = 10_000
        self.profile.save(update_fields=['ink_balance'])
        response = self.client.post('/api/v1/learning/shop/buy/', {'item_code': 'frame_laurel'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error'], 'NOT_FOR_SALE')
        self.assertFalse(self.owns('frame_laurel'))

    def test_shop_hides_exclusives_you_do_not_own_but_the_collection_shows_them(self):
        codes = {i['code'] for i in self.client.get('/api/v1/learning/shop/').data}
        self.assertIn('frame_parchment', codes)
        self.assertNotIn('frame_laurel', codes)

        collection = {i['code']: i for i in self.client.get('/api/v1/learning/shop/?scope=collection').data}
        self.assertEqual(collection['frame_laurel']['earned_by']['code'], 'streak_30')
        self.assertFalse(collection['frame_laurel']['is_purchasable'])

        _unlock_or_update(self.user, 'streak_30', current=30, threshold=30)
        codes = {i['code'] for i in self.client.get('/api/v1/learning/shop/').data}
        self.assertIn('frame_laurel', codes)  # ya es tuyo: se puede equipar desde El Bazar

    def test_frame_and_title_can_be_taken_off(self):
        self.profile.equipped_frame, self.profile.equipped_title = 'frame-gold', 'Erudito Clásico'
        self.profile.save(update_fields=['equipped_frame', 'equipped_title'])
        for slot in ('frame', 'title'):
            response = self.client.post('/api/v1/learning/shop/unequip/', {'slot': slot}, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.equipped_frame, self.profile.equipped_title), ('', ''))

    def test_tavern_card_shows_frame_and_title(self):
        self.profile.equipped_frame, self.profile.equipped_title = 'frame-owl', 'Cronista'
        self.profile.save(update_fields=['equipped_frame', 'equipped_title'])
        card = full_card(Profile.objects.select_related('user').get(pk=self.profile.pk), 'self')
        self.assertEqual((card['equipped_frame'], card['equipped_title']), ('frame-owl', 'Cronista'))

    def test_actual_level_submit_unlocks_immediately_and_practice_counts_new_stars(self):
        from django.core.cache import cache
        cache.clear()
        unit = LearningUnit.objects.create(unit_number=1, slug='u1', title='Unidad 1', order=1)
        level = LearningLevel.objects.create(unit=unit, level_number=1, order=1, title='Nivel 1')
        LearningExercise.objects.create(level=level, title='Prueba', questions_data=[{
            'id': 'q1', 'type': 'single_choice', 'prompt': '¿Qué hace un lector?',
            'options': [{'id': 'a', 'text': 'Lee', 'is_correct': True},
                        {'id': 'b', 'text': 'Duerme', 'is_correct': False}],
        }])
        response = self.client.post(f'/api/v1/learning/levels/{level.pk}/submit/',
                                    {'answers': {'q1': 'a'}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['passed'])
        self.assertTrue(self.unlocked('senda_first'))
        self.assertTrue(self.owns('frame_summit'))
        Achievement.objects.filter(code='senda_stars_10').update(threshold=1)
        # La repetición no usa quiz_passed, pero sí debe evaluar las estrellas guardadas.
        self.client.post(f'/api/v1/learning/levels/{level.pk}/submit/', {'answers': {'q1': 'a'}}, format='json')
        self.assertTrue(self.owns('wear_head_laurel'))

    def test_postit_favorite_and_review_triggers(self):
        from catalog.models import Review
        inventory, chapter = self.inventory()
        Achievement.objects.filter(code__in=['postits_10', 'favorites_10']).update(threshold=1)
        UserPostIt.objects.create(inventory=inventory, chapter=chapter, word=0, text='Una nota')
        UserFavorite.objects.create(user=self.user, book=chapter.book)
        review = Review.objects.create(user=self.user, book=chapter.book, comment='Una gran lectura.')
        reward_activity(self.user, 'review_written', reference_id=str(review.pk))
        for code in ['postits_10', 'favorites_10', 'review_first']:
            self.assertTrue(self.unlocked(code), code)

    def test_winning_an_interrogation_gives_its_title_at_the_catalog_threshold(self):
        from ai_engine.models import AIAvatar, BlindInterrogationSession
        inventory, _ = self.inventory()
        avatar = AIAvatar.objects.create(name='Detective', system_prompt='Un personaje.', edition=inventory.edition)
        BlindInterrogationSession.objects.create(user=self.user, avatar=avatar, status='won')
        Achievement.objects.filter(code='interrogation_10').update(threshold=1)
        reward_activity(self.user, 'interrogation_win')
        self.assertTrue(self.unlocked('interrogation_first'))
        self.assertTrue(self.owns('title_detective'))

    def test_reward_is_delivered_once_and_unnotified_is_scoped_to_its_owner(self):
        _unlock_or_update(self.user, 'night_owl', current=1, threshold=1)
        self.profile.refresh_from_db()
        ink, xp = self.profile.ink_balance, self.profile.xp
        _unlock_or_update(self.user, 'night_owl', current=2, threshold=1)
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.ink_balance, self.profile.xp), (ink, xp))
        item = UserInventoryItem.objects.get(user=self.user, item__code='title_midnight_owl')
        self.assertEqual(item.quantity, 1)
        pending = self.client.get('/api/v1/library/achievements/me/unnotified/').data
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]['achievement']['reward']['code'], 'title_midnight_owl')
        other = User.objects.create_user(username='otro', email='otro@example.com', password='x')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get('/api/v1/library/achievements/me/unnotified/').data, [])
        self.assertEqual(self.client.patch(f"/api/v1/library/achievements/me/{pending[0]['id']}/",
                                         {'notified': True}).status_code, 404)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(f"/api/v1/library/achievements/me/{pending[0]['id']}/",
                                         {'notified': True}).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/library/achievements/me/unnotified/').data, [])

    def test_fifth_purchase_returns_balance_including_its_achievement_reward(self):
        for item in ShopItem.objects.filter(item_type='profile_frame', is_purchasable=True).exclude(code='frame_parchment')[:4]:
            UserInventoryItem.objects.create(user=self.user, item=item)
        self.profile.ink_balance = 1000
        self.profile.save(update_fields=['ink_balance'])
        response = self.client.post('/api/v1/learning/shop/buy/', {'item_code': 'frame_parchment'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.unlocked('bazar_5'))
        self.profile.refresh_from_db()
        self.assertEqual(response.data['ink_balance'], self.profile.ink_balance)

    def test_fully_dressed_maguito_unlocks_from_the_equip_endpoint(self):
        codes = ['wear_head_graduate', 'wear_eyes_reading', 'wear_neck_medal', 'wear_cape_midnight']
        # La barba ya estaba en el catálogo anterior (el valor evita depender de su nombre).
        face = ShopItem.objects.get(item_type='maguito_wear', value='face:beard')
        codes.append(face.code)
        for code in codes:
            UserInventoryItem.objects.create(user=self.user, item=ShopItem.objects.get(code=code))
            self.assertEqual(self.client.post('/api/v1/learning/shop/equip/', {'item_code': code}).status_code, 200)
        self.assertTrue(self.unlocked('maguito_full'))

    def test_data_migrations_fix_old_titles_and_deliver_existing_prizes_idempotently(self):
        import importlib
        from django.apps import apps
        cosmetics = importlib.import_module('learning.migrations.0005_cosmetics_v2')
        achievements = importlib.import_module('library.migrations.0011_achievements_v2')
        self.profile.equipped_title = 'Título "Erudito Clásico"'
        self.profile.save(update_fields=['equipped_title'])
        cosmetics.fix_equipped_titles(apps, None)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.equipped_title, 'Erudito Clásico')
        from django.utils import timezone
        UserAchievement.objects.create(user=self.user, achievement=Achievement.objects.get(code='streak_30'),
                                       current_progress=30, unlocked_at=timezone.now())
        for _ in range(2):
            achievements.settle_existing_unlocks(apps, None)
        self.assertEqual(UserInventoryItem.objects.get(user=self.user, item__code='frame_laurel').quantity, 1)
        self.assertEqual(self.client.get('/api/v1/library/achievements/me/unnotified/').data, [])

    def test_a_zero_quantity_cosmetic_cannot_be_equipped(self):
        UserInventoryItem.objects.create(user=self.user, item=ShopItem.objects.get(code='frame_gold'), quantity=0)
        response = self.client.post('/api/v1/learning/shop/equip/', {'item_code': 'frame_gold'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'NOT_OWNED')
