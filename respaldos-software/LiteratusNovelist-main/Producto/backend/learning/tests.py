from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APITestCase
from django.test import SimpleTestCase, TestCase

from learning import games
from learning.content.builder import all_exercises
from learning.models import LearningExercise, LearningLevel, LearningUnit, UserLevelProgress


User = get_user_model()


def _solve(q):
    """La respuesta correcta de una actividad, en el formato que envía el navegador."""
    sol = games.solution(q)
    kind = q['type']
    if kind in games.OPTION_TYPES:
        return sol['option_id']
    return {
        'order_events': lambda: sol['order'],
        'match_pairs': lambda: sol['pairs'],
        'word_scramble': lambda: sol['word'],
        'build_sentence': lambda: sol['sentence'].split(),
        'word_hunt': lambda: sol['indexes'][0],
        'classify': lambda: sol['items'],
        'rapid_true_false': lambda: sol['statements'],
    }[kind]()


class GamesGradingTests(SimpleTestCase):
    def test_match_pairs_gives_partial_credit(self):
        q = {'id': 'm', 'type': 'match_pairs', 'prompt': 'Une', 'pairs': [
            games.make_pair('m', i, left, right) for i, (left, right) in
            enumerate([('A', '1'), ('B', '2'), ('C', '3'), ('D', '4')])]}
        answer = {p['left_id']: p['right_id'] for p in q['pairs']}
        self.assertEqual(games.grade(q, answer), 1.0)
        first, second = q['pairs'][0], q['pairs'][1]
        answer[first['left_id']], answer[second['left_id']] = second['right_id'], first['right_id']
        self.assertEqual(games.grade(q, answer), 0.5)

    def test_scramble_ignores_accents_and_case(self):
        q = {'id': 's', 'type': 'word_scramble', 'prompt': 'Anagrama', 'answer': 'metáfora', 'hint': ''}
        self.assertEqual(games.grade(q, 'METAFORA'), 1.0)
        self.assertEqual(games.grade(q, 'metafor'), 0.0)

    def test_word_hunt_checks_the_tapped_token(self):
        q = {'id': 'w', 'type': 'word_hunt', 'prompt': 'Caza', 'fragment': 'Las ráfagas de viento, fuertes.', 'answer': 'ráfagas'}
        self.assertEqual(games.grade(q, 1), 1.0)
        self.assertEqual(games.grade(q, 0), 0.0)
        self.assertEqual(games.grade(q, 99), 0.0)

    def test_inference_questions_are_graded(self):
        q = {'id': 'i', 'type': 'inference_prediction', 'prompt': '¿?', 'options': [
            {'id': 'a', 'text': 'Sí', 'is_correct': True}, {'id': 'b', 'text': 'No', 'is_correct': False}]}
        self.assertEqual(games.grade(q, 'a'), 1.0)

    def test_public_version_never_reveals_answers(self):
        for _, _, exercise in all_exercises():
            for q in exercise['questions_data']:
                public = games.public_question(q)
                text = str(public)
                self.assertNotIn('is_correct', text)
                self.assertNotIn('category_id', text)
                self.assertNotIn('is_true', text)
                self.assertNotIn('answer_tokens', public)
                if q['type'] == 'order_events':
                    self.assertNotEqual(public['order_items'], q['order_items'])
                if q['type'] == 'build_sentence':
                    self.assertNotEqual(public['tokens'], q['answer_tokens'])


class ContentTests(SimpleTestCase):
    def test_every_level_is_playable(self):
        exercises = list(all_exercises())
        self.assertEqual(len(exercises), 150)
        kinds = set()
        for unit, level, exercise in exercises:
            ids = [q['id'] for q in exercise['questions_data']]
            self.assertEqual(len(ids), len(set(ids)), f"ids repetidos en {unit['unit_number']}.{level['level_number']}")
            self.assertGreaterEqual(len(ids), 5)
            for q in exercise['questions_data']:
                kinds.add(q['type'])
                self.assertTrue(games.validate(q), q['id'])
                self.assertEqual(games.grade(q, _solve(q)), 1.0, q['id'])
        self.assertTrue(games.GAME_TYPES <= kinds, 'todos los juegos aparecen en La Senda')

    def test_options_do_not_give_away_the_answer_by_punctuation(self):
        for _, _, exercise in all_exercises():
            for q in exercise['questions_data']:
                if q['type'] == 'context_vocabulary':
                    endings = {opt['text'].endswith('.') for opt in q['options']}
                    self.assertEqual(len(endings), 1, q['id'])


class SeedCommandTests(TestCase):
    def test_seed_creates_the_path_and_keeps_existing_exercises(self):
        call_command('seed_learning_path', verbosity=0)
        self.assertEqual(LearningUnit.objects.count(), 30)
        self.assertEqual(LearningLevel.objects.count(), 150)
        self.assertEqual(LearningExercise.objects.count(), 150)

        level = LearningLevel.objects.get(unit__unit_number=1, level_number=2)
        level.exercise.questions_data = [{'id': 'propia', 'type': 'true_false', 'prompt': '¿?', 'options': [
            {'id': 'true', 'text': 'Verdadero', 'is_correct': True},
            {'id': 'false', 'text': 'Falso', 'is_correct': False}]}]
        level.exercise.save()

        call_command('seed_learning_path', verbosity=0)
        level.exercise.refresh_from_db()
        self.assertEqual(level.exercise.questions_data[0]['id'], 'propia')

        call_command('seed_learning_path', '--overwrite', verbosity=0)
        level.exercise.refresh_from_db()
        self.assertNotEqual(level.exercise.questions_data[0]['id'], 'propia')


class LearningAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_learning_path', verbosity=0)

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='lector', email='lector@example.com', password='clave-segura-123')
        self.client.force_authenticate(self.user)

    def _level(self, unit, number):
        return LearningLevel.objects.get(unit__unit_number=unit, level_number=number)

    def _unlock(self, unit, number):
        """Marca como completado todo lo anterior al nivel (unidades previas incluidas)."""
        for level in LearningLevel.objects.filter(unit__unit_number__lte=unit):
            if level.unit.unit_number < unit or level.level_number < number:
                UserLevelProgress.objects.get_or_create(
                    user=self.user, level=level, defaults={'is_completed': True, 'stars': 1, 'best_score': 80})
        return self._level(unit, number)

    def test_locked_levels_cannot_be_played(self):
        locked = self._level(2, 1)
        self.assertEqual(self.client.get(f'/api/v1/learning/levels/{locked.id}/session/').status_code, 403)
        question = locked.exercise.questions_data[0]
        checked = self.client.post(f'/api/v1/learning/levels/{locked.id}/check/',
                                   {'question_id': question['id'], 'answer': 'a'}, format='json')
        self.assertEqual(checked.status_code, 403)
        self.assertEqual(self.client.get(f'/api/v1/learning/levels/{self._level(1, 1).id}/session/').status_code, 200)

    def test_units_open_in_order(self):
        units = self.client.get('/api/v1/learning/path/').data['units']
        self.assertEqual(len(units), 30)
        self.assertFalse(units[0]['is_locked'])
        self.assertTrue(units[0]['levels'][0]['is_unlocked'])
        self.assertTrue(units[1]['is_locked'])
        self.assertFalse(units[1]['levels'][0]['is_unlocked'])
        self.assertIn({'kind': 'reading', 'label': 'Lectura'}, units[0]['levels'][1]['activities'])

        UserLevelProgress.objects.create(user=self.user, level=self._level(1, 5), is_completed=True, stars=1, best_score=80)
        units = self.client.get('/api/v1/learning/path/').data['units']
        self.assertFalse(units[1]['is_locked'])
        self.assertTrue(units[1]['levels'][0]['is_unlocked'])

    def test_session_hides_answers(self):
        response = self.client.get(f'/api/v1/learning/levels/{self._unlock(3, 3).id}/session/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['pages'], [])
        body = str(response.data['questions'])
        for secret in ('is_correct', 'category_id', 'is_true', 'right_id'):
            self.assertNotIn(secret, body)

    def test_first_checked_answer_is_the_one_that_counts(self):
        level = self._unlock(1, 2)
        self.client.get(f'/api/v1/learning/levels/{level.id}/session/')
        questions = level.exercise.questions_data
        first = questions[0]
        wrong = next(o['id'] for o in first['options'] if not o['is_correct'])

        checked = self.client.post(f'/api/v1/learning/levels/{level.id}/check/',
                                   {'question_id': first['id'], 'answer': wrong}, format='json')
        self.assertEqual(checked.status_code, 200)
        self.assertFalse(checked.data['is_correct'])
        self.assertEqual(checked.data['solution']['option_id'], _solve(first))

        # Tras ver la solución, reenviarla no cambia la nota de esa pregunta.
        answers = {q['id']: _solve(q) for q in questions}
        result = self.client.post(f'/api/v1/learning/levels/{level.id}/submit/',
                                  {'answers': answers, 'duration_seconds': 60}, format='json').data
        self.assertEqual(result['correct_count'], len(questions) - 1)
        self.assertLess(result['score'], 100)

    def test_perfect_game_level_passes_with_three_stars(self):
        level = self._unlock(2, 3)
        self.client.get(f'/api/v1/learning/levels/{level.id}/session/')
        answers = {q['id']: _solve(q) for q in level.exercise.questions_data}
        result = self.client.post(f'/api/v1/learning/levels/{level.id}/submit/',
                                  {'answers': answers, 'duration_seconds': 90}, format='json').data
        self.assertTrue(result['passed'])
        self.assertEqual(result['score'], 100)
        self.assertEqual(result['stars'], 3)


class AIOutputCleaningTests(SimpleTestCase):
    def test_broken_ai_activities_never_reach_the_reader(self):
        from learning.ai_generator import ReadingComprehensionAIGenerator
        raw = [
            {'id': 'q1', 'type': 'single_choice', 'prompt': '¿?', 'options': [
                {'id': 'a', 'text': 'x', 'is_correct': True}, {'id': 'b', 'text': 'y', 'is_correct': False}]},
            {'type': 'match_pairs', 'prompt': 'Une', 'pairs': [
                {'left': 'A', 'right': '1'}, {'left': 'B', 'right': '2'}, {'left': 'C', 'right': '3'}]},
            {'id': 'q3', 'type': 'word_hunt', 'prompt': 'Caza', 'fragment': 'El viento soplaba.', 'answer': 'nieve'},
            {'id': 'q1', 'type': 'word_scramble', 'prompt': 'Anagrama', 'answer': 'luna', 'hint': 'satélite'},
            {'id': 'q5', 'type': 'desconocido', 'prompt': '?'},
        ]
        cleaned = ReadingComprehensionAIGenerator._clean_questions(raw)
        self.assertEqual([q['type'] for q in cleaned], ['single_choice', 'match_pairs', 'word_scramble'])
        self.assertEqual(len({q['id'] for q in cleaned}), 3)
        self.assertTrue(all(games.validate(q) for q in cleaned))


class SkipTestAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_learning_path', verbosity=0)

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='saltador', email='saltador@example.com', password='clave-segura-123')
        self.client.force_authenticate(self.user)

    def _unit(self, number):
        return LearningUnit.objects.get(unit_number=number)

    def _start(self, number):
        return self.client.get(f'/api/v1/learning/units/{self._unit(number).id}/skip/session/')

    def _questions(self, number):
        from learning.services import _skip_key
        return cache.get(_skip_key(self.user, self._unit(number)))['questions']

    def _submit(self, number, answers):
        return self.client.post(f'/api/v1/learning/units/{self._unit(number).id}/skip/submit/',
                                {'answers': answers, 'duration_seconds': 120}, format='json')

    def test_skip_test_is_hard_and_hides_answers(self):
        response = self._start(3)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['required_score'], 90)
        self.assertEqual(response.data['skipped_units'], [1, 2])
        self.assertEqual(len(response.data['questions']), 14)
        for secret in ('is_correct', 'category_id', 'is_true', 'right_id', 'answer_tokens'):
            self.assertNotIn(secret, str(response.data['questions']))
        rapid = [q for q in response.data['questions'] if q['type'] == 'rapid_true_false']
        self.assertTrue(all(q['time_limit_seconds'] == 4 * len(q['statements']) for q in rapid))

    def test_open_units_cannot_be_skipped(self):
        self.assertEqual(self._start(1).status_code, 400)

    def test_each_attempt_is_a_new_exam(self):
        self._start(5)
        first = [q['prompt'] + str(q.get('pairs') or q.get('options') or q.get('statements')) for q in self._questions(5)]
        self._start(5)
        second = [q['prompt'] + str(q.get('pairs') or q.get('options') or q.get('statements')) for q in self._questions(5)]
        self.assertNotEqual(first, second)

    def test_failing_costs_a_heart_and_keeps_the_unit_locked(self):
        self._start(3)
        result = self._submit(3, {}).data
        self.assertFalse(result['passed'])
        self.assertEqual(result['hearts_remaining'], 4)
        units = self.client.get('/api/v1/learning/path/').data['units']
        self.assertTrue(units[2]['is_locked'])

    def test_passing_completes_skipped_units_and_opens_the_target(self):
        played = LearningLevel.objects.get(unit__unit_number=1, level_number=1)
        UserLevelProgress.objects.create(user=self.user, level=played, is_completed=True, stars=3, best_score=100)

        self._start(3)
        answers = {q['id']: _solve(q) for q in self._questions(3)}
        result = self._submit(3, answers).data
        self.assertTrue(result['passed'])
        self.assertEqual(result['unlocked_unit'], 3)
        self.assertEqual(result['xp_earned'], 80)

        done = UserLevelProgress.objects.filter(user=self.user, level__unit__unit_number__in=[1, 2], is_completed=True)
        self.assertEqual(done.count(), 10)
        self.assertEqual(UserLevelProgress.objects.get(user=self.user, level=played).stars, 3)
        units = self.client.get('/api/v1/learning/path/').data['units']
        self.assertFalse(units[2]['is_locked'])
        self.assertTrue(units[2]['levels'][0]['is_unlocked'])
        self.assertTrue(units[3]['is_locked'])

        # La sesión se consume: no se puede volver a enviar la misma prueba.
        self.assertEqual(self._submit(3, answers).status_code, 400)


class ShopWearableTests(APITestCase):
    """Ropa de Maguito en El Bazar: se compra una vez, se equipa sola y se puede quitar."""

    def setUp(self):
        from users.models import Profile
        self.user = get_user_model().objects.create_user(
            username='vestidor', email='vestidor@example.com', password='StrongPassword123!')
        Profile.objects.filter(user=self.user).update(ink_balance=1000)
        self.client.force_authenticate(self.user)

    def profile(self):
        from users.models import Profile
        return Profile.objects.get(user=self.user)

    def buy(self, code):
        return self.client.post('/api/v1/learning/shop/buy/', {'item_code': code}, format='json')

    def test_wearables_are_seeded_by_migration(self):
        from learning.models import ShopItem
        wearables = ShopItem.objects.filter(item_type='maguito_wear')

        self.assertEqual(wearables.count(), 14)
        self.assertTrue(wearables.filter(code='wear_head_crown', value='head:crown').exists())

    def test_buying_charges_ink_and_puts_it_on(self):
        response = self.buy('wear_head_crown')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['outfit'], {'head': 'crown'})
        profile = self.profile()
        self.assertEqual(profile.ink_balance, 750)
        self.assertEqual(profile.outfit, {'head': 'crown'})

    def test_cosmetics_cannot_be_bought_twice(self):
        self.buy('wear_face_beard')

        again = self.buy('wear_face_beard')

        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data['error'], 'ALREADY_OWNED')
        self.assertEqual(self.profile().ink_balance, 860)

    def test_equip_requires_owning_and_unequip_restores_default(self):
        not_owned = self.client.post('/api/v1/learning/shop/equip/', {'item_code': 'wear_cape_royal'}, format='json')
        self.assertEqual(not_owned.data['error'], 'NOT_OWNED')

        self.buy('wear_cape_royal')
        self.buy('wear_eyes_monocle')
        removed = self.client.post('/api/v1/learning/shop/unequip/', {'slot': 'cape'}, format='json')
        invalid = self.client.post('/api/v1/learning/shop/unequip/', {'slot': 'tail'}, format='json')

        self.assertEqual(removed.data['outfit'], {'eyes': 'monocle'})
        self.assertEqual(invalid.status_code, 400)

        equipped = self.client.post('/api/v1/learning/shop/equip/', {'item_code': 'wear_cape_royal'}, format='json')
        self.assertEqual(equipped.data['outfit'], {'eyes': 'monocle', 'cape': 'royal'})

    def test_shop_list_marks_owned_and_equipped_with_constant_queries(self):
        self.buy('wear_head_crown')
        self.buy('wear_head_tophat')  # reemplaza a la corona en la cabeza

        with self.assertNumQueries(3):  # inventario, perfil y artículos, sin importar cuántos haya
            items = {i['code']: i for i in self.client.get('/api/v1/learning/shop/').data}

        self.assertTrue(items['wear_head_crown']['is_owned'])
        self.assertFalse(items['wear_head_crown']['is_equipped'])
        self.assertTrue(items['wear_head_tophat']['is_equipped'])
        self.assertFalse(items['wear_face_beard']['is_owned'])
