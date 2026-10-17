"""Completa el mapa canónico sin actualizar ninguna fila ya existente.

    python manage.py seed_missing_path_units

A diferencia de seed_learning_path, este comando conserva incluso ejercicios
vacíos, títulos, orden, dificultad y recompensas personalizados. No siembra El
Bazar ni escribe progreso. Un conflicto revierte toda la ampliación.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from learning import games
from learning.content.builder import build_fallback_exercise
from learning.content.units import UNITS
from learning.models import LearningExercise, LearningLevel, LearningUnit


class Command(BaseCommand):
    help = 'Crea solo las unidades, niveles y ejercicios faltantes de La Senda; conserva todas las filas existentes.'

    @transaction.atomic
    def handle(self, *args, **options):
        created_units = created_levels = created_exercises = 0
        for unit_data in UNITS:
            unit, created = LearningUnit.objects.get_or_create(
                unit_number=unit_data['unit_number'],
                defaults={key: value for key, value in unit_data.items()
                          if key not in ('unit_number', 'levels', 'theme')},
            )
            created_units += int(created)
            for level_data in unit_data['levels']:
                level, created = LearningLevel.objects.get_or_create(
                    unit=unit, level_number=level_data['level_number'],
                    defaults={key: value for key, value in level_data.items()
                              if key not in ('level_number', 'kind')},
                )
                created_levels += int(created)
                if LearningExercise.objects.filter(level=level).exists():
                    continue
                exercise_data = build_fallback_exercise(level)
                invalid = [question.get('id') for question in exercise_data['questions_data']
                           if not games.validate(question)]
                if invalid:
                    raise ValueError(f'Actividades inválidas en {level}: {invalid}')
                _exercise, created = LearningExercise.objects.get_or_create(level=level, defaults=exercise_data)
                created_exercises += int(created)
        if options['verbosity'] > 0:
            self.stdout.write(self.style.SUCCESS(
                f'La Senda ampliada: {created_units} unidades, {created_levels} niveles y '
                f'{created_exercises} ejercicios creados. Todas las filas existentes se conservaron.'
            ))
