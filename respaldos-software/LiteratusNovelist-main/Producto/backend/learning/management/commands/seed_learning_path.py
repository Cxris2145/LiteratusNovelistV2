"""
learning/management/commands/seed_learning_path.py
Puebla La Senda del Lector (30 unidades, 150 niveles con sus ejercicios) y El Bazar.

    python manage.py seed_learning_path              # crea lo que falte
    python manage.py seed_learning_path --overwrite  # además reemplaza los ejercicios existentes

Es idempotente: se puede ejecutar cuantas veces se quiera. Sin --overwrite no toca los
ejercicios que ya existen (por ejemplo, los que generó la IA), solo crea los que faltan.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from learning import games
from learning.content.builder import build_exercise
from learning.content.units import UNITS
from learning.models import LearningUnit, LearningLevel, LearningExercise, ShopItem


SHOP_ITEMS = [
    {
        'code': 'streak_shield',
        'name': 'Protector de Racha (Escudo)',
        'description': 'Preserva tu racha diaria si un día no puedes conectarte a leer o practicar. Se consume automáticamente. Máximo 2 almacenables.',
        'item_type': ShopItem.ItemType.STREAK_SHIELD,
        'cost_ink': 40,
        'icon': 'shield',
        'sort_order': 10,
    },
    {
        'code': 'streak_repair',
        'name': 'Poción Restauradora de Racha',
        'description': 'Restaura una racha rota si entras dentro de las primeras 24 horas tras haberla perdido.',
        'item_type': ShopItem.ItemType.STREAK_REPAIR,
        'cost_ink': 60,
        'icon': 'hourglass_top',
        'sort_order': 20,
    },
    {
        'code': 'hearts_refill',
        'name': 'Poción de Vitalidad (5 Corazones)',
        'description': 'Recarga inmediatamente tus 5 corazones para seguir jugando niveles de comprensión sin esperar la regeneración.',
        'item_type': ShopItem.ItemType.HEARTS_REFILL,
        'cost_ink': 25,
        'icon': 'favorite',
        'sort_order': 30,
    },
    {
        'code': 'frame_gold',
        'name': 'Marco "Papiro Dorado"',
        'description': 'Elegante orla dorada con filigranas clásicas para tu avatar de perfil.',
        'item_type': ShopItem.ItemType.PROFILE_FRAME,
        'cost_ink': 80,
        'icon': 'crop_square',
        'value': 'frame-gold',
        'sort_order': 40,
    },
    {
        'code': 'frame_victorian',
        'name': 'Marco "Noche Victoriana"',
        'description': 'Marco gótico victoriano con reflejos en plata y amatista.',
        'item_type': ShopItem.ItemType.PROFILE_FRAME,
        'cost_ink': 100,
        'icon': 'crop_portrait',
        'value': 'frame-victorian',
        'sort_order': 50,
    },
    {
        'code': 'title_erudite',
        'name': 'Título "Erudito Clásico"',
        'description': 'Distintivo honorífico que se exhibirá junto a tu nombre de usuario en toda la plataforma.',
        'item_type': ShopItem.ItemType.TITLE,
        'cost_ink': 75,
        'icon': 'military_tech',
        'value': 'Erudito Clásico',
        'sort_order': 60,
    },
    {
        'code': 'title_unbroken',
        'name': 'Título "Lector Inquebrantable"',
        'description': 'Para los lectores cuya disciplina ante los libros es inquebrantable.',
        'item_type': ShopItem.ItemType.TITLE,
        'cost_ink': 110,
        'icon': 'local_fire_department',
        'value': 'Lector Inquebrantable',
        'sort_order': 70,
    },
]


class Command(BaseCommand):
    help = 'Puebla las 30 unidades de La Senda del Lector, sus 150 niveles con ejercicios y El Bazar.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--overwrite', action='store_true',
            help='Reemplaza también los ejercicios que ya existen (por defecto solo crea los que faltan).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        overwrite = options['overwrite']
        say = self.stdout.write if options['verbosity'] > 0 else (lambda *args, **kwargs: None)
        say(self.style.NOTICE("Iniciando sembrado de La Senda del Lector..."))
        created_ex = replaced_ex = kept_ex = activities = 0

        # 1. Unidades, niveles y ejercicios
        for u_data in UNITS:
            unit_defaults = {k: v for k, v in u_data.items() if k not in ('levels', 'theme')}
            unit, _ = LearningUnit.objects.update_or_create(
                unit_number=u_data['unit_number'], defaults=unit_defaults)

            for l_data in u_data['levels']:
                level_defaults = {k: v for k, v in l_data.items() if k != 'kind'}
                level, _ = LearningLevel.objects.update_or_create(
                    unit=unit, level_number=l_data['level_number'], defaults=level_defaults)

                existing = LearningExercise.objects.filter(level=level).first()
                if existing and existing.questions_data and not overwrite:
                    kept_ex += 1
                    continue

                exercise = build_exercise(u_data, l_data)
                invalid = [q['id'] for q in exercise['questions_data'] if not games.validate(q)]
                if invalid:
                    raise ValueError(f"Actividades inválidas en {level}: {invalid}")
                LearningExercise.objects.update_or_create(level=level, defaults=exercise)
                activities += len(exercise['questions_data'])
                if existing:
                    replaced_ex += 1
                else:
                    created_ex += 1

            say(self.style.SUCCESS(f"  [OK] {unit.title} ({len(u_data['levels'])} niveles)"))

        say(self.style.SUCCESS(
            f"  Ejercicios: {created_ex} creados, {replaced_ex} reemplazados, {kept_ex} conservados "
            f"({activities} actividades nuevas)."))

        # 2. Sembrar Artículos de El Bazar
        say(self.style.NOTICE("Sembrando artículos de El Bazar..."))
        for s_data in SHOP_ITEMS:
            item, _ = ShopItem.objects.update_or_create(
                code=s_data['code'],
                defaults=s_data
            )
            say(self.style.SUCCESS(f"  [OK] Artículo de Bazar: {item.name} ({item.cost_ink} Tinta)"))

        say(self.style.SUCCESS("\n¡Sembrado de La Senda del Lector y El Bazar completado con éxito!"))
