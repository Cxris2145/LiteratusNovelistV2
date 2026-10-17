from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from learning import games
from learning.content.builder import build_exercise
from learning.content.units import UNITS
from learning.models import LearningExercise, LearningLevel, LearningUnit, ShopItem, UserLevelProgress


class SeedMissingPathTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        for unit_data in UNITS[:20]:
            unit = LearningUnit.objects.create(**{
                key: value for key, value in unit_data.items() if key not in ('levels', 'theme')})
            for level_data in unit_data['levels']:
                level = LearningLevel.objects.create(unit=unit, **{
                    key: value for key, value in level_data.items() if key != 'kind'})
                LearningExercise.objects.create(level=level, **build_exercise(unit_data, level_data))
        cls.user = get_user_model().objects.create_user(
            username='progreso-conservado', email='conservado@example.com', password='test-pass')
        unit = LearningUnit.objects.get(unit_number=7)
        unit.title, unit.slug, unit.order, unit.min_user_level = 'Unidad personalizada', 'mi-unidad-personal', 117, 4
        unit.save()
        level = LearningLevel.objects.get(unit=unit, level_number=2)
        level.title, level.description = 'Lectura personalizada', 'Descripción propia'
        level.difficulty, level.required_score, level.order = 'facil', 61, 12
        level.xp_reward, level.ink_reward, level.icon = 23, 47, 'custom-icon'
        level.save()
        exercise = level.exercise
        exercise.title, exercise.content_pages, exercise.questions_data = 'Ejercicio propio', ['Texto propio'], []
        exercise.save()
        UserLevelProgress.objects.create(user=cls.user, level=level, is_completed=True,
                                         stars=2, best_score=91, attempts_count=3)

    def snapshot(self):
        return {
            model: {row['id']: row for row in model.objects.values()}
            for model in (LearningUnit, LearningLevel, LearningExercise, UserLevelProgress, ShopItem)
        }

    def assert_old_rows_unchanged(self, before):
        for model, rows in before.items():
            self.assertEqual({row['id']: row for row in model.objects.filter(id__in=rows).values()}, rows, model.__name__)

    def test_adds_last_ten_units_and_preserves_all_existing_fields_and_ids(self):
        self.assertEqual((LearningUnit.objects.count(), LearningLevel.objects.count(), LearningExercise.objects.count()),
                         (20, 100, 100))
        before = self.snapshot()
        output = StringIO()
        call_command('seed_missing_path_units', stdout=output)
        self.assertIn('10 unidades, 50 niveles y 50 ejercicios creados', output.getvalue())
        self.assertEqual((LearningUnit.objects.count(), LearningLevel.objects.count(), LearningExercise.objects.count()),
                         (30, 150, 150))
        self.assert_old_rows_unchanged(before)
        self.assertEqual(UserLevelProgress.objects.count(), 1)
        self.assertEqual(ShopItem.objects.count(), len(before[ShopItem]))
        new_exercises = LearningExercise.objects.filter(level__unit__unit_number__gt=20)
        for exercise in new_exercises:
            self.assertGreaterEqual(len(exercise.questions_data), 5)
            self.assertTrue(all(games.validate(question) for question in exercise.questions_data))
        complete = self.snapshot()
        output = StringIO()
        call_command('seed_missing_path_units', stdout=output)
        self.assertIn('0 unidades, 0 niveles y 0 ejercicios creados', output.getvalue())
        self.assertEqual(self.snapshot(), complete)

    def test_repairs_missing_exercise_and_level_without_rewriting_empty_existing_exercise(self):
        LearningLevel.objects.filter(unit__unit_number=3, level_number=4).delete()
        LearningExercise.objects.filter(level__unit__unit_number=4, level__level_number=2).delete()
        before = self.snapshot()
        output = StringIO()
        call_command('seed_missing_path_units', stdout=output)
        self.assertIn('10 unidades, 51 niveles y 52 ejercicios creados', output.getvalue())
        self.assert_old_rows_unchanged(before)
        custom = LearningExercise.objects.get(level__unit__unit_number=7, level__level_number=2)
        self.assertEqual(custom.questions_data, [])
        self.assertEqual(custom.title, 'Ejercicio propio')

    def test_invalid_new_exercise_rolls_back_all_insertions(self):
        before = self.snapshot()
        with patch('learning.management.commands.seed_missing_path_units.build_fallback_exercise',
                   return_value={'questions_data': [{'id': 'bad', 'type': 'unknown'}]}):
            with self.assertRaises(ValueError):
                call_command('seed_missing_path_units', verbosity=0)
        self.assertEqual(self.snapshot(), before)
