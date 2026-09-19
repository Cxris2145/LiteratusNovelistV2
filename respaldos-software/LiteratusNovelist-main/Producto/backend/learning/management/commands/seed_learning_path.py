"""
learning/management/commands/seed_learning_path.py
Puebla las Unidades, Niveles, Ejercicios iniciales y Artículos de El Bazar.
"""

from django.core.management.base import BaseCommand
from learning.models import LearningUnit, LearningLevel, LearningExercise, ShopItem
from catalog.models import Book


UNITS = [
    {
        'unit_number': 1,
        'slug': 'unidad-1-comprension-basica',
        'title': 'Unidad 1 — Comprensión Básica',
        'description': 'Identifica la idea principal, detalles explícitos y personajes protagónicos en relatos clásicos.',
        'order': 1,
        'icon': 'menu_book',
        'banner_color': '#3b82f6',
        'min_user_level': 1,
        'levels': [
            {
                'level_number': 1,
                'order': 1,
                'title': 'Nivel 1: Primeras Luces',
                'description': 'Aprende a reconocer el tema central y al protagonista de un relato.',
                'difficulty': 'facil',
                'required_score': 70,
                'xp_reward': 30,
                'ink_reward': 10,
                'is_exam': False,
                'is_chest': False,
                'icon': 'star',
                'exercise': {
                    'title': 'El Principito y el Zorro',
                    'author_name': 'Antoine de Saint-Exupéry',
                    'source_type': 'classic_book',
                    'pages': [
                        "Fue entonces cuando apareció el zorro:\n—Buenos días —dijo el zorro.\n—Buenos días —respondió cortésmente el principito, que se volvió pero no vio nada.\n—Estoy aquí —dijo la voz—, bajo el manzano.\n—¿Quién eres tú? —preguntó el principito—. Eres muy lindo...\n—Soy un zorro —dijo el zorro.\n—Ven a jugar conmigo —le propuso el principito—; ¡estoy tan triste!...",
                        "—No puedo jugar contigo —dijo el zorro—. No estoy domesticado.\n—¡Ah! Perdón —dijo el principito.\nPero después de una breve reflexión, añadió:\n—¿Qué significa 'domesticar'?\n—Es una cosa ya olvidada —dijo el zorro—. Significa 'crear lazos'..."
                    ],
                    'questions': [
                        {
                            'id': 'u1_l1_q1',
                            'type': 'single_choice',
                            'prompt': '¿Por qué el zorro le dice al principito que no puede jugar con él?',
                            'options': [
                                {'id': 'a', 'text': 'Porque tiene miedo a los humanos', 'is_correct': False},
                                {'id': 'b', 'text': 'Porque aún no está domesticado', 'is_correct': True},
                                {'id': 'c', 'text': 'Porque tiene prisa por cazar', 'is_correct': False},
                                {'id': 'd', 'text': 'Porque está enfadado con él', 'is_correct': False}
                            ],
                            'explanation': 'El zorro aclara de inmediato: "No puedo jugar contigo. No estoy domesticado."'
                        },
                        {
                            'id': 'u1_l1_q2',
                            'type': 'character_role',
                            'prompt': '¿Quién inicia la conversación saludando primero?',
                            'options': [
                                {'id': 'a', 'text': 'El principito', 'is_correct': False},
                                {'id': 'b', 'text': 'El zorro', 'is_correct': True},
                                {'id': 'c', 'text': 'El aviador', 'is_correct': False},
                                {'id': 'd', 'text': 'La flor', 'is_correct': False}
                            ],
                            'explanation': 'El texto indica: "Fue entonces cuando apareció el zorro: —Buenos días —dijo el zorro."'
                        },
                        {
                            'id': 'u1_l1_q3',
                            'type': 'context_vocabulary',
                            'prompt': 'Según la explicación del zorro, ¿qué significa la palabra "domesticar"?',
                            'target_word': 'domesticar',
                            'options': [
                                {'id': 'a', 'text': 'Encerrar a un animal en una jaula', 'is_correct': False},
                                {'id': 'b', 'text': 'Crear lazos y vínculos afectivos', 'is_correct': True},
                                {'id': 'c', 'text': 'Enseñar trucos y piruetas', 'is_correct': False},
                                {'id': 'd', 'text': 'Olvidar el pasado salvaje', 'is_correct': False}
                            ],
                            'explanation': 'El zorro define claramente domesticar como "crear lazos".'
                        },
                        {
                            'id': 'u1_l1_q4',
                            'type': 'true_false',
                            'prompt': '¿El principito se sentía alegre y festivo antes de encontrarse con el zorro?',
                            'options': [
                                {'id': 'true', 'text': 'Verdadero', 'is_correct': False},
                                {'id': 'false', 'text': 'Falso', 'is_correct': True}
                            ],
                            'explanation': 'El principito le pide al zorro que juegue con él diciendo expresamente: "¡estoy tan triste!"'
                        }
                    ]
                }
            },
            {
                'level_number': 2,
                'order': 2,
                'title': 'Nivel 2: La Idea Central',
                'description': 'Distingue entre detalles secundarios y el mensaje principal de la obra.',
                'difficulty': 'facil',
                'required_score': 70,
                'xp_reward': 35,
                'ink_reward': 10,
                'is_exam': False,
                'is_chest': False,
                'icon': 'psychology',
            },
            {
                'level_number': 3,
                'order': 3,
                'title': 'Nivel 3: El Cofre del Aprendiz',
                'description': 'Recompensa intermedia por constancia de lectura.',
                'difficulty': 'facil',
                'required_score': 50,
                'xp_reward': 50,
                'ink_reward': 30,
                'is_exam': False,
                'is_chest': True,
                'icon': 'redeem',
            },
            {
                'level_number': 4,
                'order': 4,
                'title': 'Nivel 4: Hechos y Opiniones',
                'description': 'Separa las acciones objetivas de los juicios de valor de los personajes.',
                'difficulty': 'facil',
                'required_score': 75,
                'xp_reward': 40,
                'ink_reward': 15,
                'is_exam': False,
                'is_chest': False,
                'icon': 'auto_stories',
            },
            {
                'level_number': 5,
                'order': 5,
                'title': 'Nivel 5: Prueba de Maestría de Unidad',
                'description': 'Demuestra tu comprensión total de la Unidad 1 para desbloquear la siguiente etapa.',
                'difficulty': 'facil',
                'required_score': 80,
                'xp_reward': 80,
                'ink_reward': 25,
                'is_exam': True,
                'is_chest': False,
                'icon': 'military_tech',
            },
        ]
    },
    {
        'unit_number': 2,
        'slug': 'unidad-2-vocabulario-y-contexto',
        'title': 'Unidad 2 — Vocabulario y Contexto',
        'description': 'Domina el arte de deducir el significado de palabras arcaicas y sofisticadas por su contexto.',
        'order': 2,
        'icon': 'spellcheck',
        'banner_color': '#10b981',
        'min_user_level': 1,
        'levels': [
            {'level_number': 1, 'order': 1, 'title': 'Nivel 1: Sinónimos Pertinentes', 'difficulty': 'facil', 'required_score': 70, 'xp_reward': 35, 'ink_reward': 10, 'is_exam': False, 'is_chest': False, 'icon': 'star'},
            {'level_number': 2, 'order': 2, 'title': 'Nivel 2: Palabras Polisémicas', 'difficulty': 'intermedio', 'required_score': 70, 'xp_reward': 40, 'ink_reward': 15, 'is_exam': False, 'is_chest': False, 'icon': 'psychology'},
            {'level_number': 3, 'order': 3, 'title': 'Nivel 3: Cofre del Léxico', 'difficulty': 'facil', 'required_score': 50, 'xp_reward': 60, 'ink_reward': 35, 'is_exam': False, 'is_chest': True, 'icon': 'redeem'},
            {'level_number': 4, 'order': 4, 'title': 'Nivel 4: Giros Lingüísticos Clásicos', 'difficulty': 'intermedio', 'required_score': 75, 'xp_reward': 45, 'ink_reward': 15, 'is_exam': False, 'is_chest': False, 'icon': 'auto_stories'},
            {'level_number': 5, 'order': 5, 'title': 'Nivel 5: Prueba de Maestría Léxica', 'difficulty': 'intermedio', 'required_score': 80, 'xp_reward': 90, 'ink_reward': 30, 'is_exam': True, 'is_chest': False, 'icon': 'military_tech'},
        ]
    },
    {
        'unit_number': 3,
        'slug': 'unidad-3-personajes-y-motivaciones',
        'title': 'Unidad 3 — Personajes y Motivaciones',
        'description': 'Distingue protagonistas, antagonistas, arquetipos y dilemas morales.',
        'order': 3,
        'icon': 'theater_comedy',
        'banner_color': '#f59e0b',
        'min_user_level': 2,
        'levels': [
            {'level_number': 1, 'order': 1, 'title': 'Nivel 1: El Espejo del Héroe', 'difficulty': 'intermedio', 'required_score': 70, 'xp_reward': 40, 'ink_reward': 15, 'is_exam': False, 'is_chest': False, 'icon': 'star'},
            {'level_number': 2, 'order': 2, 'title': 'Nivel 2: La Sombra del Antagonista', 'difficulty': 'intermedio', 'required_score': 75, 'xp_reward': 45, 'ink_reward': 15, 'is_exam': False, 'is_chest': False, 'icon': 'psychology'},
            {'level_number': 3, 'order': 3, 'title': 'Nivel 3: Cofre de las Máscaras', 'difficulty': 'intermedio', 'required_score': 50, 'xp_reward': 65, 'ink_reward': 40, 'is_exam': False, 'is_chest': True, 'icon': 'redeem'},
            {'level_number': 4, 'order': 4, 'title': 'Nivel 4: Secundarios Inolvidables', 'difficulty': 'intermedio', 'required_score': 75, 'xp_reward': 50, 'ink_reward': 20, 'is_exam': False, 'is_chest': False, 'icon': 'auto_stories'},
            {'level_number': 5, 'order': 5, 'title': 'Nivel 5: Prueba de Maestría de Personajes', 'difficulty': 'intermedio', 'required_score': 80, 'xp_reward': 100, 'ink_reward': 35, 'is_exam': True, 'is_chest': False, 'icon': 'military_tech'},
        ]
    },
    {
        'unit_number': 4,
        'slug': 'unidad-4-secuencia-narrativa',
        'title': 'Unidad 4 — Secuencia Narrativa',
        'description': 'Orden cronológico, analepsis (flashbacks), causa y efecto en la trama.',
        'order': 4,
        'icon': 'schedule',
        'banner_color': '#8b5cf6',
        'min_user_level': 2,
        'levels': [
            {'level_number': 1, 'order': 1, 'title': 'Nivel 1: Antes y Después', 'difficulty': 'intermedio', 'required_score': 70, 'xp_reward': 45, 'ink_reward': 15, 'is_exam': False, 'is_chest': False, 'icon': 'star'},
            {'level_number': 2, 'order': 2, 'title': 'Nivel 2: El Detonante y el Clímax', 'difficulty': 'intermedio', 'required_score': 75, 'xp_reward': 50, 'ink_reward': 15, 'is_exam': False, 'is_chest': False, 'icon': 'psychology'},
            {'level_number': 3, 'order': 3, 'title': 'Nivel 3: Cofre del Cronista', 'difficulty': 'intermedio', 'required_score': 50, 'xp_reward': 70, 'ink_reward': 40, 'is_exam': False, 'is_chest': True, 'icon': 'redeem'},
            {'level_number': 4, 'order': 4, 'title': 'Nivel 4: Causa y Efecto Trágico', 'difficulty': 'dificil', 'required_score': 75, 'xp_reward': 55, 'ink_reward': 20, 'is_exam': False, 'is_chest': False, 'icon': 'auto_stories'},
            {'level_number': 5, 'order': 5, 'title': 'Nivel 5: Prueba de Maestría Narrativa', 'difficulty': 'dificil', 'required_score': 80, 'xp_reward': 110, 'ink_reward': 40, 'is_exam': True, 'is_chest': False, 'icon': 'military_tech'},
        ]
    },
    {
        'unit_number': 5,
        'slug': 'unidad-5-inferencias-y-subtexto',
        'title': 'Unidad 5 — Inferencia y Subtexto',
        'description': 'Lee entre líneas. Deduce emociones no dichas, ironías y desenlaces implícitos.',
        'order': 5,
        'icon': 'visibility',
        'banner_color': '#ec4899',
        'min_user_level': 3,
        'levels': [
            {'level_number': 1, 'order': 1, 'title': 'Nivel 1: Lo que las Palabras Ocultan', 'difficulty': 'dificil', 'required_score': 75, 'xp_reward': 55, 'ink_reward': 20, 'is_exam': False, 'is_chest': False, 'icon': 'star'},
            {'level_number': 2, 'order': 2, 'title': 'Nivel 2: La Mirada del Narrador', 'difficulty': 'dificil', 'required_score': 75, 'xp_reward': 60, 'ink_reward': 20, 'is_exam': False, 'is_chest': False, 'icon': 'psychology'},
            {'level_number': 3, 'order': 3, 'title': 'Nivel 3: Cofre del Subtexto', 'difficulty': 'intermedio', 'required_score': 50, 'xp_reward': 80, 'ink_reward': 45, 'is_exam': False, 'is_chest': True, 'icon': 'redeem'},
            {'level_number': 4, 'order': 4, 'title': 'Nivel 4: Deducción y Desenlaces', 'difficulty': 'dificil', 'required_score': 80, 'xp_reward': 65, 'ink_reward': 25, 'is_exam': False, 'is_chest': False, 'icon': 'auto_stories'},
            {'level_number': 5, 'order': 5, 'title': 'Nivel 5: Prueba de Maestría en Inferencias', 'difficulty': 'dificil', 'required_score': 85, 'xp_reward': 130, 'ink_reward': 50, 'is_exam': True, 'is_chest': False, 'icon': 'military_tech'},
        ]
    },
    {
        'unit_number': 6,
        'slug': 'unidad-6-analisis-critico-y-literario',
        'title': 'Unidad 6 — Análisis Crítico y Literario',
        'description': 'La cumbre de la comprensión: símbolos, crítica social, estilo y contexto histórico.',
        'order': 6,
        'icon': 'history_edu',
        'banner_color': '#eab308',
        'min_user_level': 4,
        'levels': [
            {'level_number': 1, 'order': 1, 'title': 'Nivel 1: Metáforas y Figuras Retóricas', 'difficulty': 'dificil', 'required_score': 75, 'xp_reward': 65, 'ink_reward': 25, 'is_exam': False, 'is_chest': False, 'icon': 'star'},
            {'level_number': 2, 'order': 2, 'title': 'Nivel 2: Simbolismo Universal', 'difficulty': 'dificil', 'required_score': 80, 'xp_reward': 70, 'ink_reward': 25, 'is_exam': False, 'is_chest': False, 'icon': 'psychology'},
            {'level_number': 3, 'order': 3, 'title': 'Nivel 3: Cofre de la Sabiduría', 'difficulty': 'intermedio', 'required_score': 50, 'xp_reward': 100, 'ink_reward': 60, 'is_exam': False, 'is_chest': True, 'icon': 'redeem'},
            {'level_number': 4, 'order': 4, 'title': 'Nivel 4: Tono y Filosofía de Obra', 'difficulty': 'dificil', 'required_score': 80, 'xp_reward': 75, 'ink_reward': 30, 'is_exam': False, 'is_chest': False, 'icon': 'auto_stories'},
            {'level_number': 5, 'order': 5, 'title': 'Nivel 5: Gran Juicio Literario (Examen Final)', 'difficulty': 'dificil', 'required_score': 85, 'xp_reward': 200, 'ink_reward': 100, 'is_exam': True, 'is_chest': False, 'icon': 'workspace_premium'},
        ]
    }
]

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
    help = 'Puebla las 6 Unidades de la Senda del Lector, sus 30 Niveles y los artículos de El Bazar.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Iniciando sembrado de La Senda del Lector..."))

        # 1. Sembrar Unidades y Niveles
        for u_data in UNITS:
            levels_data = u_data.pop('levels', [])
            unit, _ = LearningUnit.objects.update_or_create(
                unit_number=u_data['unit_number'],
                defaults=u_data
            )
            self.stdout.write(self.style.SUCCESS(f"  [OK] Unidad {unit.unit_number}: {unit.title}"))

            for l_data in levels_data:
                exercise_data = l_data.pop('exercise', None)
                level, _ = LearningLevel.objects.update_or_create(
                    unit=unit,
                    level_number=l_data['level_number'],
                    defaults=l_data
                )

                if exercise_data:
                    LearningExercise.objects.update_or_create(
                        level=level,
                        defaults={
                            'title': exercise_data['title'],
                            'author_name': exercise_data['author_name'],
                            'source_type': exercise_data['source_type'],
                            'content_pages': exercise_data['pages'],
                            'questions_data': exercise_data['questions'],
                        }
                    )

        # 2. Sembrar Artículos de El Bazar
        self.stdout.write(self.style.NOTICE("Sembrando artículos de El Bazar..."))
        for s_data in SHOP_ITEMS:
            item, _ = ShopItem.objects.update_or_create(
                code=s_data['code'],
                defaults=s_data
            )
            self.stdout.write(self.style.SUCCESS(f"  [OK] Artículo de Bazar: {item.name} ({item.cost_ink} Tinta)"))

        self.stdout.write(self.style.SUCCESS("\n¡Sembrado de La Senda del Lector y El Bazar completado con éxito!"))
